/**
 * The public reducer: `reduce(state, action) → state`.
 *
 * Pure by construction — the incoming state is deep-cloned before any
 * mutation (§6.7 inv. 12). Identical (state, action) inputs yield identical
 * outputs, which is what makes dual playtest byte-identical (Brief §4).
 */
import type { CardInstance, CombatAction, CombatState } from './types';
import {
  REAL_SHIELD_PLACEMENT_COST,
  beginPlay,
  breakOnePlayerShield,
  effectiveBotmLimit,
  effectiveCardCost,
  costCapViolated,
  dispatchEvent,
  finishPlayIfDone,
  getDef,
  log,
  maxPlaysReached,
  modifyPatience,
  modifyPriority,
  newId,
  npcCanAct,
  placeRealShield,
  pushFrame,
  resolveEffectivePlay,
  runStack,
  stageNpcCard,
} from './core';
import { check, handoff } from './boundaries';

class IllegalAction extends Error {}

function assertPhase(state: CombatState, ...phases: CombatState['phase'][]): void {
  if (!phases.includes(state.phase)) {
    throw new IllegalAction(`Action not legal in phase ${state.phase} (expected ${phases.join('/')})`);
  }
}

/** Playability rule (v1.4 §3.1): Priority-spending actions need a positive meter. */
function assertPositivePriority(state: CombatState, side: 'player' | 'npc'): void {
  if (state[side].priority < 1) {
    throw new IllegalAction(`${side} is locked out: Priority must be ≥ 1 to initiate a Priority-spending action`);
  }
}

export function reduce(prev: CombatState, action: CombatAction): CombatState {
  const state = structuredClone(prev);
  try {
    apply(state, action);
  } catch (e) {
    if (e instanceof IllegalAction) {
      // Illegal actions are rejected without state change (log-only clone).
      const rejected = structuredClone(prev);
      log(rejected, 'illegal-action', e.message, { action: action.type });
      return rejected;
    }
    throw e;
  }
  return state;
}

function apply(state: CombatState, action: CombatAction): void {
  // Blocking sub-states freeze all combat state (v1.4 §6.4/§6.7.1): only the
  // matching resume action is accepted while a block is pending.
  if (state.pendingBlock && action.type !== 'ACKNOWLEDGE' && action.type !== 'CHOOSE_NUMBER') {
    throw new IllegalAction(`Combat is suspended on ${state.pendingBlock.type} — acknowledge it first`);
  }
  if (state.result) {
    throw new IllegalAction('The encounter has ended');
  }
  switch (action.type) {
    case 'PLAY_CARD': {
      assertPhase(state, 'PlayerPending');
      assertPositivePriority(state, 'player');
      const card = state.player.hand[action.handIndex];
      if (!card) throw new IllegalAction('No such hand card');
      const def = getDef(state, card.definitionId);
      const heavyHand = action.heavyHand === true;
      if (heavyHand && !def.keywords.includes('Heavy Hand')) {
        throw new IllegalAction('Card has no Heavy Hand mode');
      }
      if (maxPlaysReached(state, 'player')) throw new IllegalAction('Max plays per turn reached');
      const eff = resolveEffectivePlay(state, card, heavyHand);
      const cost = effectiveCardCost(state, 'player', eff.cost, heavyHand);
      if (costCapViolated(state, 'player', cost)) throw new IllegalAction('Cost exceeds MAX_CARD_COST restriction');

      state.player.hand.splice(action.handIndex, 1);
      beginPlay(state, 'player', card, heavyHand);
      runStack(state);
      finishPlayIfDone(state);
      check(state);
      return;
    }

    case 'PLACE_SHIELD': {
      // Placement-only sequence (v1.4 §6.2): fixed 2 Priority, printed
      // effects do not resolve.
      assertPhase(state, 'PlayerPending');
      assertPositivePriority(state, 'player');
      if (!state.player.hand[action.handIndex]) throw new IllegalAction('No such hand card');
      modifyPriority(state, 'player', -REAL_SHIELD_PLACEMENT_COST);
      placeRealShield(state, action.handIndex);
      runStack(state); // PRIORITY_CHANGED may have armed subscribers
      check(state);
      return;
    }

    case 'ACTIVATE_ABILITY': {
      // v1.4 §5.3 — controller's turn only.
      assertPhase(state, 'PlayerPending', 'EnemyPending');
      const perm = state.field.find((p) => p.permanentId === action.permanentId);
      if (!perm) throw new IllegalAction('No such permanent');
      if (perm.owner !== state.activeTurn) throw new IllegalAction('Not this permanent controller’s turn');
      const def = getDef(state, perm.definitionId);
      const ability = (def.activatedAbilities ?? []).find((a) => a.id === action.abilityId);
      if (!ability) throw new IllegalAction('No such ability');
      const side = perm.owner;

      if (ability.cost.priority != null && ability.cost.priority > 0) {
        assertPositivePriority(state, side); // unusable at ≤ 0 (§5.3)
      }
      if (ability.cost.patience != null && state.patience - ability.cost.patience <= 0) {
        throw new IllegalAction('Cannot pay Patience cost that would reach ≤ 0');
      }
      const sac = ability.cost.sacrificeShields ?? 0;
      if (side === 'player' && sac > state.playerShields.length) {
        throw new IllegalAction('Not enough shields to sacrifice');
      }
      const discards = action.discardIndices ?? [];
      if ((ability.cost.discardCards ?? 0) !== discards.length) {
        throw new IllegalAction('Must choose exactly the required discards');
      }

      // Pay costs (step 0; never repeats).
      if (ability.cost.priority) modifyPriority(state, side, -ability.cost.priority);
      if (ability.cost.patience) modifyPatience(state, -ability.cost.patience, side);
      for (let i = 0; i < sac; i++) {
        if (side === 'player') breakOnePlayerShield(state, side, 0);
      }
      if (discards.length > 0) {
        const sorted = [...discards].sort((a, b) => b - a);
        for (const idx of sorted) {
          const c = state[side].hand[idx];
          if (!c) throw new IllegalAction('Bad discard index');
          state[side].hand.splice(idx, 1);
          state[side].discard.push(c);
        }
      }
      log(state, 'ability', `${side} activates ${ability.name} on ${def.name}`);
      pushFrame(state, {
        kind: 'activated',
        controller: side,
        effects: ability.effects,
        depth: 0,
        sourcePermanentId: perm.permanentId,
        chosenNumber: perm.rapportPrediction ?? null,
      });
      runStack(state);
      finishPlayIfDone(state);
      check(state);
      return;
    }

    case 'COMBINE': {
      // v1.4 §11 — exactly two Assemble cards, recipe-based, free, no state
      // transition. Failed combinations leave the hand unchanged.
      assertPhase(state, 'PlayerPending');
      const a = state.player.hand[action.handIndexA];
      const b = state.player.hand[action.handIndexB];
      if (!a || !b || action.handIndexA === action.handIndexB) throw new IllegalAction('Bad combine indices');
      const defA = getDef(state, a.definitionId);
      const defB = getDef(state, b.definitionId);
      if (!defA.keywords.includes('Assemble') || !defB.keywords.includes('Assemble')) {
        throw new IllegalAction('Both cards must have Assemble');
      }
      const recipe = state.recipes.find(
        (r) =>
          (r.ingredients[0] === a.definitionId && r.ingredients[1] === b.definitionId) ||
          (r.ingredients[0] === b.definitionId && r.ingredients[1] === a.definitionId),
      );
      if (!recipe) {
        log(state, 'combine-failed', `No recipe for ${defA.name} + ${defB.name} — hand unchanged`);
        return;
      }
      const [hi, lo] = [Math.max(action.handIndexA, action.handIndexB), Math.min(action.handIndexA, action.handIndexB)];
      state.player.hand.splice(hi, 1);
      state.player.hand.splice(lo, 1);
      const combined: CardInstance = {
        instanceId: newId(state, 'card'),
        definitionId: recipe.resultCardId,
        owner: 'player',
        components: [a, b],
      };
      state.player.hand.push(combined);
      log(state, 'combine', `${defA.name} + ${defB.name} → ${getDef(state, recipe.resultCardId).name}`);
      return;
    }

    case 'RESEQUENCE_SHIELDS': {
      // Free action, own turn, no state transition (v1.4 §3.4/§6.2).
      assertPhase(state, 'PlayerPending');
      const n = state.playerShields.length;
      const order = action.order;
      if (order.length !== n || [...order].sort((x, y) => x - y).some((v, i) => v !== i)) {
        throw new IllegalAction('Order must be a permutation of current slots');
      }
      state.playerShields = order.map((i) => state.playerShields[i]);
      log(state, 'resequence', 'Player resequenced shield row');
      return;
    }

    case 'END_TURN': {
      // §4.2 step 1 — the player's explicit acknowledgement; legal at any
      // Priority value (no automatic handoff, §3.1).
      assertPhase(state, 'PlayerPending');
      state.turnEndPending = true;
      dispatchEvent(state, { type: 'PLAYER_TURN_END', controller: 'player' }, 0);
      runStack(state);
      if (state.pendingBlock) return; // resume via ACK/CHOOSE, then continue below
      continueEndTurn(state);
      return;
    }

    case 'BOTM_SELECT': {
      // §4.2 step 2 — fires ONLY from Player Turn End (§6.5).
      assertPhase(state, 'BotMSelect');
      const limit = effectiveBotmLimit(state);
      const keep = [...new Set(action.keepHandIndices)];
      if (keep.length > limit) throw new IllegalAction(`Back of Mind limit is ${limit}`);
      if (keep.some((i) => !state.player.hand[i])) throw new IllegalAction('Bad hand index');
      const kept: CardInstance[] = [];
      const rest: CardInstance[] = [];
      state.player.hand.forEach((c, i) => (keep.includes(i) ? kept : rest).push(c));
      state.backOfMind = kept;
      state.player.discard.push(...rest);
      state.player.hand = [];
      log(state, 'botm', `Kept ${kept.length} card(s) in Back of Mind; discarded ${rest.length}`);
      state.turnEndPending = false;
      handoff(state, 'player'); // §4.2.3 → §4.3
      check(state);
      return;
    }

    case 'ACKNOWLEDGE': {
      if (!state.pendingBlock || (state.pendingBlock.type !== 'reveal' && state.pendingBlock.type !== 'deckReveal')) {
        throw new IllegalAction('Nothing to acknowledge');
      }
      state.pendingBlock = null;
      resumeAfterUnblock(state);
      return;
    }

    case 'CHOOSE_NUMBER': {
      if (!state.pendingBlock || state.pendingBlock.type !== 'chooseNumber') {
        throw new IllegalAction('No number choice pending');
      }
      const { min, max, frameId } = state.pendingBlock;
      if (action.value < min || action.value > max) throw new IllegalAction(`Choose between ${min} and ${max}`);
      const frame = state.effectStack.find((f) => f.frameId === frameId);
      if (frame) frame.chosenNumber = action.value;
      if (state.pendingPlay) state.pendingPlay.chosenNumber = action.value;
      log(state, 'choose-number', `Number chosen: ${action.value}`);
      state.pendingBlock = null;
      resumeAfterUnblock(state);
      return;
    }

    case 'ADVANCE': {
      // Drive the NPC turn one play (auto policy: leftmost hand card, §10).
      assertPhase(state, 'EnemyPending');
      npcStep(state, 0);
      return;
    }

    case 'NPC_PLAY_CARD': {
      // Manual enemy / dual playtest: human choice replaces the leftmost-play
      // policy; all other transitions identical (v1.4 §10, Brief §4).
      assertPhase(state, 'EnemyPending');
      if (!state.npc.hand[action.handIndex]) throw new IllegalAction('No such NPC hand card');
      npcStep(state, action.handIndex);
      return;
    }

    case 'NPC_END_TURN': {
      // The NPC turn ends automatically (§4.4); an explicit end is only a
      // no-op safety for manual mode when the NPC genuinely cannot act.
      assertPhase(state, 'EnemyPending');
      if (npcCanAct(state)) throw new IllegalAction('NPC can still act — its turn ends automatically (§4.4)');
      check(state);
      return;
    }
  }
}

/** Stage + resolve one NPC play (§6.6). Shared by auto and manual paths. */
function npcStep(state: CombatState, handIndex: number): void {
  if (!npcCanAct(state)) {
    check(state); // routes to NPC Turn End
    return;
  }
  const survived = stageNpcCard(state, handIndex);
  if (state.pendingBlock) return; // rare: trap suspension inside staged window
  if (!survived) {
    check(state); // cancelled: skip directly to Check (§6.6)
    return;
  }
  const card = state.stagedCard as CardInstance;
  state.stagedCard = null;
  beginPlay(state, 'npc', card, false);
  runStack(state);
  finishPlayIfDone(state);
  check(state);
}

/** Continue an END_TURN once the event window has fully resolved. */
function continueEndTurn(state: CombatState): void {
  if (state.player.hand.length > 0) {
    state.phase = 'BotMSelect'; // §4.2.2 (blocking)
    return;
  }
  state.turnEndPending = false;
  handoff(state, 'player');
  check(state);
}

/** Single resume path for all blocking sub-states (one suspension mechanism). */
function resumeAfterUnblock(state: CombatState): void {
  runStack(state);
  if (state.pendingBlock) return;

  // A cancelled staged card that suspended mid-window still discards once.
  if (state.stagedCard && state.stagedCancelled && !state.pendingPlay) {
    state.npc.discard.push(state.stagedCard);
    log(state, 'cancelled', 'Staged card cancelled — moved to NPC discard');
    state.stagedCard = null;
    state.stagedCancelled = false;
    check(state);
    return;
  }
  // Staged card that survived a suspension window: resolve its play now.
  if (state.stagedCard && !state.pendingPlay && state.activeTurn === 'npc') {
    const card = state.stagedCard;
    state.stagedCard = null;
    beginPlay(state, 'npc', card, false);
    runStack(state);
    if (state.pendingBlock) return;
  }
  finishPlayIfDone(state);
  if (state.pendingBlock) return;
  if (state.turnEndPending && state.activeTurn === 'player' && !state.pendingPlay && state.effectStack.length === 0) {
    continueEndTurn(state);
    return;
  }
  check(state);
}
