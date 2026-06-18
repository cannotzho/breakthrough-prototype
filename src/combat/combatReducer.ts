import { CombatState, CombatAction, CardInstance, CardEffect, RelevantCard, SHIELD_PLACEMENT_COST } from './types';
import { applyEffect, priorityRestore, selectEnemyCard, makeInstance, clampPriority } from './effectHandlers';
import { COMBINATIONS } from '../data/combinations';
import { PONDER_DEFINITION } from '../data/devCards';

function computeCost(cost: number, priority: number) {
  const priorityCovered = Math.min(cost, priority);
  const patienceCost = Math.max(0, cost - priority);
  return { priorityCovered, patienceCost };
}

function addLog(state: CombatState, msg: string): CombatState {
  return { ...state, actionLog: [...state.actionLog.slice(-49), msg] };
}

// §4.3 Check State — conditions evaluated top-to-bottom, first match wins (Gap #1, #2, #12)
function checkState(state: CombatState): CombatState {
  // 1. All opponent shields broken → WIN
  if (state.opponentShields.every(s => s.broken)) {
    return addLog({ ...state, phase: 'WIN' }, 'All opponent shields broken — WIN');
  }

  // 2. All player shields broken → LOSE (unless unbreakablePlayerShields)
  if (
    !state.config.unbreakablePlayerShields &&
    state.shieldEverOccupied &&
    state.playerShields.every(s => s === null)
  ) {
    return addLog({ ...state, phase: 'LOSE' }, 'All player shields broken — LOSE');
  }

  // 3. Patience ≤ 0 → LOSE
  if (state.patience <= 0) {
    return addLog({ ...state, phase: 'LOSE' }, 'Patience reached 0 — LOSE');
  }

  // 4. Lie counter exceeded → LOSE (threshold 0 or undefined disables)
  if (
    state.config.lieThreshold != null &&
    state.config.lieThreshold > 0 &&
    state.lieCounter > state.config.lieThreshold
  ) {
    return addLog({ ...state, phase: 'LOSE' }, 'Lie counter exceeded — LOSE');
  }

  // 5. Priority > 0 → cancel staged card → PlayerPending
  if (state.priority > 0) {
    let s = state;
    if (s.stagedEnemyCard) {
      s = addLog(
        { ...s, enemyDiscard: [...s.enemyDiscard, s.stagedEnemyCard], stagedEnemyCard: null },
        'Staged enemy card cancelled → NPC discard'
      );
    }
    return { ...s, phase: 'PlayerPending' };
  }

  // 6. Priority ≤ 0 AND staged card → EnemyPlay
  if (state.stagedEnemyCard) {
    return { ...state, phase: 'EnemyPlay' };
  }

  // 7. Priority ≤ 0, no staged card, hand not empty → BotMSelect
  if (state.playerHand.length > 0) {
    return { ...state, phase: 'BotMSelect' };
  }

  // 8. Priority ≤ 0, no staged card, hand empty → EnemyPending
  return { ...state, phase: 'EnemyPending' };
}

function resolveEffectList(
  state: CombatState,
  effects: CardEffect[],
  card: CardInstance,
  onComplete: (s: CombatState) => CombatState
): CombatState {
  let s = state;
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    const before = { pendingReveal: s.pendingReveal, pendingShieldChoiceSlotIdx: s.pendingShieldChoiceSlotIdx };
    s = applyEffect(s, effect);

    if (s.pendingReveal && s.pendingReveal !== before.pendingReveal) {
      return {
        ...s,
        phase: 'RevealPending',
        pendingEffects: effects.slice(i + 1),
        pendingEffectCard: card,
      };
    }
    if (s.pendingShieldChoiceSlotIdx === -1 && before.pendingShieldChoiceSlotIdx !== -1) {
      return {
        ...s,
        phase: 'PlayerShieldChoice',
        pendingEffects: effects.slice(i + 1),
        pendingEffectCard: card,
      };
    }
  }
  return onComplete(s);
}

// Counter sub-sequence completion: break outcome + resume Enemy Play (Gap #3)
function completeShieldBreak(state: CombatState): CombatState {
  const cp = state.counterPending;
  if (!cp) return checkState({ ...state, phase: 'Check' });

  let s = state;
  if (cp.hasSafety) {
    s = addLog(s, 'Counter resolved (Safety) — NPC loses 0 Patience, Priority Restore');
  } else {
    s = addLog(s, 'Counter resolved — NPC loses 1 Patience, Priority Restore');
    s = { ...s, patience: s.patience - 1 };
  }
  s = priorityRestore(s);
  s = { ...s, counterPending: null };

  const remaining = cp.savedEffects;
  const card = cp.savedEffectCard;
  if (!card || remaining.length === 0) {
    let final: CombatState = { ...s, phase: 'Check', pendingEffects: [], pendingEffectCard: null };
    if (final.stagedEnemyCard && card && final.stagedEnemyCard.instanceId === card.instanceId) {
      final = { ...final, enemyDiscard: [...final.enemyDiscard, final.stagedEnemyCard], stagedEnemyCard: null };
    }
    return checkState(final);
  }
  return resolveEffectList(s, remaining, card, (resolved) => {
    let final: CombatState = { ...resolved, phase: 'Check', pendingEffects: [], pendingEffectCard: null };
    if (final.stagedEnemyCard && card && final.stagedEnemyCard.instanceId === card.instanceId) {
      final = { ...final, enemyDiscard: [...final.enemyDiscard, final.stagedEnemyCard], stagedEnemyCard: null };
    }
    return checkState(final);
  });
}

// Ponder conversion constants derived from the shared definition (Gap #6)
const PONDER_EFFECTS: CardEffect[] = PONDER_DEFINITION.effects;
const PONDER_COST = PONDER_DEFINITION.cost;

export function combatReducer(state: CombatState, action: CombatAction): CombatState {
  switch (action.type) {

    case 'CHECK':
      return checkState(state);

    // ── Player actions ────────────────────────────────────────
    case 'PLAY_CARD': {
      if (state.phase !== 'PlayerPending') return state;
      const card = state.playerHand.find(c => c.instanceId === action.cardInstanceId);
      if (!card) return state;

      // Information Card handling (Gap #6)
      let effectiveCost = card.definition.cost;
      let effectiveEffects = card.definition.effects;
      let isNonRelevantConversion = false;
      let discoveryCard: RelevantCard | null = null;

      if (card.definition.supertype === 'Information') {
        const relevantCard = state.config.relevantCards.find(rc => rc.cardId === card.definition.id);
        if (relevantCard) {
          effectiveEffects = relevantCard.effects;
          if (!relevantCard.discovered) {
            discoveryCard = { ...relevantCard, discovered: true };
          }
        } else {
          effectiveCost = PONDER_COST;
          effectiveEffects = PONDER_EFFECTS;
          isNonRelevantConversion = true;
        }
      }

      const cost = effectiveCost;
      const { priorityCovered, patienceCost } = computeCost(cost, state.priority);

      let s: CombatState = {
        ...state,
        priority: clampPriority(state.priority - priorityCovered),
        patience: state.patience - patienceCost,
        playerHand: state.playerHand.filter(c => c.instanceId !== action.cardInstanceId),
        pendingEffects: [],
        pendingEffectCard: null,
      };

      if (isNonRelevantConversion) {
        s = {
          ...s,
          playedNonRelevantCards: [...s.playedNonRelevantCards, card.definition.id],
        };
        s = addLog(s, `Played ${card.definition.name} (non-relevant) → Ponder (cost ${PONDER_COST}, draw 1)`);
      } else {
        s = addLog(s, `Played ${card.definition.name} (cost ${cost}${patienceCost > 0 ? `, −${patienceCost} Patience` : ''})`);
      }

      if (discoveryCard) {
        const updatedRelevantCards = s.config.relevantCards.map(rc =>
          rc.cardId === card.definition.id ? discoveryCard! : rc
        );
        s = {
          ...s,
          config: { ...s.config, relevantCards: updatedRelevantCards },
          pendingDiscovery: discoveryCard,
        };
        s = addLog(s, `Discovered: ${discoveryCard.effectDescription}`);
      }

      if (card.definition.keywords.includes('Lie')) {
        s = { ...s, lieCounter: s.lieCounter + 1 };
      }

      const discardCard: CardInstance = isNonRelevantConversion
        ? { ...card, definition: PONDER_DEFINITION }
        : card;

      return resolveEffectList(s, effectiveEffects, card, (resolved) => {
        if (resolved.pendingPlaceAsShield) {
          return addLog(
            { ...resolved, pendingEffectCard: card, pendingEffects: [], phase: 'PlayerPending' },
            `${card.definition.name}: choose a shield slot to place it in`
          );
        }
        const isImpression = card.definition.subtype === 'Impression';
        const isCombined = !!card.combinedFrom;
        let discardAdditions: CardInstance[];
        if (isCombined) {
          discardAdditions = card.combinedFrom!;
        } else {
          discardAdditions = isImpression ? [] : [discardCard];
        }
        return checkState({
          ...resolved,
          playerDiscard: [...resolved.playerDiscard, ...discardAdditions],
          fieldImpressions: isImpression ? [...resolved.fieldImpressions, card] : resolved.fieldImpressions,
          pendingEffects: [],
          pendingEffectCard: null,
          phase: 'Check',
        });
      });
    }

    case 'CONFIRM_PLACE_AS_SHIELD': {
      if (!state.pendingPlaceAsShield || !state.pendingEffectCard) return state;
      const card = state.pendingEffectCard;
      if (action.slotIdx >= state.playerShields.length || state.playerShields[action.slotIdx] !== null) return state;
      const newShields = [...state.playerShields];
      newShields[action.slotIdx] = { card };
      let s: CombatState = {
        ...state,
        playerShields: newShields,
        pendingPlaceAsShield: false,
        pendingEffectCard: null,
        pendingEffects: [],
        shieldEverOccupied: true,
      };
      s = addLog(s, `${card.definition.name} placed as shield in slot ${action.slotIdx} (via effect)`);
      return checkState({ ...s, phase: 'Check' });
    }

    case 'PLACE_SHIELD': {
      if (state.phase !== 'PlayerPending') return state;
      const card = state.playerHand.find(c => c.instanceId === action.cardInstanceId);
      if (!card || action.slotIdx >= state.playerShields.length) return state;
      if (state.playerShields[action.slotIdx] !== null) return state;

      const { priorityCovered, patienceCost } = computeCost(SHIELD_PLACEMENT_COST, state.priority);

      const newShields = [...state.playerShields];
      newShields[action.slotIdx] = { card };

      let s: CombatState = {
        ...state,
        priority: clampPriority(state.priority - priorityCovered),
        patience: state.patience - patienceCost,
        playerHand: state.playerHand.filter(c => c.instanceId !== action.cardInstanceId),
        playerShields: newShields,
        shieldEverOccupied: true,
      };
      s = addLog(s, `${card.definition.name} placed as shield in slot ${action.slotIdx} (cost ${SHIELD_PLACEMENT_COST} priority)`);
      return checkState({ ...s, phase: 'Check' });
    }

    case 'END_TURN': {
      if (state.phase !== 'PlayerPending') return state;
      return checkState(addLog({ ...state, priority: 0 }, 'Player ended turn'));
    }

    // ── BotM Select ───────────────────────────────────────────
    case 'SELECT_BOTM': {
      if (state.phase !== 'BotMSelect') return state;
      const card = state.playerHand.find(c => c.instanceId === action.cardInstanceId);
      if (!card) return state;
      const alreadySelected = state.backOfMind.some(c => c.instanceId === action.cardInstanceId);
      if (alreadySelected) {
        return addLog(
          { ...state, backOfMind: state.backOfMind.filter(c => c.instanceId !== action.cardInstanceId) },
          `${card.definition.name} deselected from Back of Mind`
        );
      }
      if (state.backOfMind.length >= state.combatConfig.backOfMindLimit) return state;
      return addLog(
        { ...state, backOfMind: [...state.backOfMind, card] },
        `${card.definition.name} selected for Back of Mind`
      );
    }

    case 'CONFIRM_BOTM': {
      if (state.phase !== 'BotMSelect') return state;
      const selectedIds = new Set(state.backOfMind.map(c => c.instanceId));
      const rest = state.playerHand.filter(c => !selectedIds.has(c.instanceId));
      let s: CombatState = {
        ...state,
        playerHand: [],
        playerDiscard: [...state.playerDiscard, ...rest],
        phase: 'EnemyPending',
      };
      if (state.backOfMind.length === 0) {
        s = addLog(s, 'Back of Mind: passed (no cards kept)');
      } else {
        s = addLog(s, `Back of Mind: ${state.backOfMind.map(c => c.definition.name).join(', ')}`);
      }
      return selectEnemyCard(s);
    }

    // ── Reveal Pending ────────────────────────────────────────
    case 'DISMISS_REVEAL': {
      if (state.phase !== 'RevealPending') return state;
      let s: CombatState = { ...state, pendingReveal: null };
      const remainingEffects = state.pendingEffects;
      const card = state.pendingEffectCard;

      // If we're in a Counter sub-sequence, route completion through completeShieldBreak (Gap #3)
      if (state.counterPending) {
        if (!card || remainingEffects.length === 0) {
          return completeShieldBreak(addLog(s, 'Reveal dismissed'));
        }
        return resolveEffectList(s, remainingEffects, card, (resolved) => {
          return completeShieldBreak(resolved);
        });
      }

      if (!card || remainingEffects.length === 0) {
        let final: CombatState = { ...s, phase: 'Check', pendingEffects: [], pendingEffectCard: null };
        // Enemy card cleanup (Gap #11)
        if (final.stagedEnemyCard && card && final.stagedEnemyCard.instanceId === card.instanceId) {
          final = { ...final, enemyDiscard: [...final.enemyDiscard, final.stagedEnemyCard], stagedEnemyCard: null };
        }
        return checkState(addLog(final, 'Reveal dismissed'));
      }
      return resolveEffectList(s, remainingEffects, card, (resolved) => {
        let final: CombatState = { ...resolved, phase: 'Check', pendingEffects: [], pendingEffectCard: null };
        // Enemy card cleanup (Gap #11)
        if (final.stagedEnemyCard && card && final.stagedEnemyCard.instanceId === card.instanceId) {
          final = { ...final, enemyDiscard: [...final.enemyDiscard, final.stagedEnemyCard], stagedEnemyCard: null };
        }
        return checkState(final);
      });
    }

    // ── Player Shield Choice ──────────────────────────────────
    case 'SELECT_SHIELD_SACRIFICE': {
      if (state.phase !== 'PlayerShieldChoice') return state;
      if (state.playerShields[action.slotIdx] === null) return state;
      return { ...state, pendingShieldChoiceSlotIdx: action.slotIdx };
    }

    case 'CONFIRM_SHIELD_SACRIFICE': {
      if (state.phase !== 'PlayerShieldChoice') return state;
      const idx = state.pendingShieldChoiceSlotIdx;
      if (idx === null || idx === -1 || !state.playerShields[idx]) return state;
      const sacrificed = state.playerShields[idx]!.card;
      const hasSafety = sacrificed.definition.keywords.includes('Safety');
      const hasCounter = sacrificed.definition.keywords.includes('Counter');

      let s: CombatState = {
        ...state,
        playerShields: state.playerShields.map((slot, i) => i === idx ? null : slot),
        pendingShieldChoiceSlotIdx: null,
      };

      // Counter keyword: resolve printed effects as sub-sequence before break outcome (Gap #3)
      if (hasCounter) {
        s = {
          ...s,
          counterPending: {
            hasSafety,
            savedEffects: state.pendingEffects,
            savedEffectCard: state.pendingEffectCard,
          },
        };
        s = addLog(s, `Counter triggered: resolving ${sacrificed.definition.name}'s effects`);
        return resolveEffectList(s, sacrificed.definition.effects, sacrificed, (resolved) => {
          return completeShieldBreak(resolved);
        });
      }

      // Non-Counter: immediate break outcome
      if (hasSafety) {
        s = addLog(s, `${sacrificed.definition.name} broken (Safety) — NPC loses 0 Patience, Priority Restore`);
      } else {
        s = addLog(s, `${sacrificed.definition.name} broken — NPC loses 1 Patience, Priority Restore`);
        s = { ...s, patience: s.patience - 1 };
      }

      s = priorityRestore(s);

      const remaining = s.pendingEffects;
      const card = s.pendingEffectCard;
      if (!card || remaining.length === 0) {
        let final: CombatState = { ...s, phase: 'Check', pendingEffects: [], pendingEffectCard: null };
        if (final.stagedEnemyCard && card && final.stagedEnemyCard.instanceId === card.instanceId) {
          final = { ...final, enemyDiscard: [...final.enemyDiscard, final.stagedEnemyCard], stagedEnemyCard: null };
        }
        return checkState(final);
      }
      return resolveEffectList(s, remaining, card, (resolved) => {
        let final: CombatState = { ...resolved, phase: 'Check', pendingEffects: [], pendingEffectCard: null };
        if (final.stagedEnemyCard && card && final.stagedEnemyCard.instanceId === card.instanceId) {
          final = { ...final, enemyDiscard: [...final.enemyDiscard, final.stagedEnemyCard], stagedEnemyCard: null };
        }
        return checkState(final);
      });
    }

    // ── Enemy Pending ─────────────────────────────────────────
    case 'TRIGGER_ENEMY_ACTION': {
      if (state.phase !== 'EnemyPending') return state;
      return selectEnemyCard(state);
    }

    // ── Interrupt ─────────────────────────────────────────────
    case 'PLAY_INTERRUPT': {
      if (state.phase !== 'Interrupt') return state;
      const card =
        state.backOfMind.find(c => c.instanceId === action.cardInstanceId) ??
        state.playerHand.find(c => c.instanceId === action.cardInstanceId);
      if (!card || !card.definition.keywords.includes('Interrupt')) return state;

      let s: CombatState = {
        ...state,
        backOfMind: state.backOfMind.filter(c => c.instanceId !== action.cardInstanceId),
        playerHand: state.playerHand.filter(c => c.instanceId !== action.cardInstanceId),
        pendingEffects: [],
        pendingEffectCard: null,
        phase: 'InterruptPlay',
      };
      s = addLog(s, `Interrupt played: ${card.definition.name}`);

      return resolveEffectList(s, card.definition.effects, card, (resolved) => {
        const finalState: CombatState = {
          ...resolved,
          playerDiscard: [...resolved.playerDiscard, card],
          phase: 'Check',
          pendingEffects: [],
          pendingEffectCard: null,
        };
        return checkState(finalState);
      });
    }

    case 'PASS_INTERRUPT': {
      if (state.phase !== 'Interrupt') return state;
      return addLog({ ...state, phase: 'EnemyPlay' }, 'Player passed interrupt');
    }

    // ── Interrupt Check ───────────────────────────────────────
    case 'RESOLVE_INTERRUPT_CHECK': {
      if (state.phase !== 'InterruptCheck') return state;
      const hasInterrupt =
        state.backOfMind.some(c => c.definition.keywords.includes('Interrupt')) ||
        state.playerHand.some(c => c.definition.keywords.includes('Interrupt'));
      return addLog(
        { ...state, phase: hasInterrupt ? 'Interrupt' : 'EnemyPlay' },
        hasInterrupt ? 'Interrupt available' : 'No interrupts — Enemy Play'
      );
    }

    // ── Combination / Assemble (Gap #7) ───────────────────────
    case 'COMBINE': {
      if (state.phase !== 'PlayerPending') return state;
      const [idA, idB] = action.cardInstanceIds;
      const cardA = state.playerHand.find(c => c.instanceId === idA);
      const cardB = state.playerHand.find(c => c.instanceId === idB);
      if (!cardA || !cardB) return state;
      if (!cardA.definition.keywords.includes('Assemble') || !cardB.definition.keywords.includes('Assemble')) {
        return addLog(state, 'Combine failed: both cards must have Assemble');
      }

      const recipe = COMBINATIONS.find(r => {
        const ids = [cardA.definition.id, cardB.definition.id].sort();
        const ingredients = [...r.ingredients].sort();
        return ids.length === ingredients.length && ids.every((id, i) => id === ingredients[i]);
      });

      if (!recipe) {
        return addLog(state, `Combine failed: no recipe for ${cardA.definition.name} + ${cardB.definition.name}`);
      }

      const combinedInstance: CardInstance = {
        instanceId: crypto.randomUUID(),
        definition: recipe.result,
        combinedFrom: [cardA, cardB],
      };
      const newHand = state.playerHand
        .filter(c => c.instanceId !== idA && c.instanceId !== idB)
        .concat(combinedInstance);

      return addLog(
        { ...state, playerHand: newHand },
        `Combined ${cardA.definition.name} + ${cardB.definition.name} → ${recipe.result.name}`
      );
    }

    // ── Discovery dismiss (Gap #6) ────────────────────────────
    case 'DISMISS_DISCOVERY': {
      return { ...state, pendingDiscovery: null };
    }

    // ── Dev Actions ───────────────────────────────────────────
    case 'DEV_SET_PRIORITY':
      return addLog({ ...state, priority: clampPriority(action.value) }, `[DEV] Priority → ${action.value}`);

    case 'DEV_SET_PATIENCE':
      return addLog({ ...state, patience: action.value }, `[DEV] Patience → ${action.value}`);

    case 'DEV_SET_LIE_COUNTER':
      return addLog({ ...state, lieCounter: action.value }, `[DEV] Lie Counter → ${action.value}`);

    case 'DEV_BREAK_OPPONENT_SHIELD': {
      const shields = state.opponentShields.map((s, i) =>
        i === action.idx ? { ...s, broken: true } : s
      );
      return addLog({ ...state, opponentShields: shields }, `[DEV] Broke opponent shield ${action.idx}`);
    }

    case 'DEV_BREAK_PLAYER_SHIELD': {
      const shields = state.playerShields.map((s, i) =>
        i === action.idx ? null : s
      );
      return addLog({ ...state, playerShields: shields }, `[DEV] Broke player shield ${action.idx}`);
    }

    case 'DEV_SET_PHASE':
      return addLog({ ...state, phase: action.phase }, `[DEV] Phase → ${action.phase}`);

    case 'DEV_ADD_CARD_TO_HAND': {
      const instance: CardInstance = makeInstance(action.card);
      return addLog(
        { ...state, playerHand: [...state.playerHand, instance] },
        `[DEV] Added ${action.card.name} to hand`
      );
    }

    case 'DEV_SET_ENEMY_CARD': {
      const instance: CardInstance = makeInstance(action.card);
      return addLog({ ...state, stagedEnemyCard: instance }, `[DEV] Staged enemy card → ${action.card.name}`);
    }

    // ── Enemy Card Resolution (Gap #11: effects resolve before discard) ─
    case 'RESOLVE_ENEMY_CARD': {
      if (state.phase !== 'EnemyPlay' || !state.stagedEnemyCard) return state;
      const card = state.stagedEnemyCard;
      let s: CombatState = addLog(state, `NPC played ${card.definition.name}`);
      return resolveEffectList(s, card.definition.effects, card, (resolved) => {
        return checkState({
          ...resolved,
          stagedEnemyCard: null,
          enemyDiscard: [...resolved.enemyDiscard, card],
          phase: 'Check',
          pendingEffects: [],
          pendingEffectCard: null,
        });
      });
    }

    case 'DEV_ADD_RELEVANT_CARD': {
      const rc: RelevantCard = action.card;
      const config = {
        ...state.config,
        relevantCards: [...state.config.relevantCards, rc],
      };
      return addLog({ ...state, config }, `[DEV] Added relevant card ${rc.cardId}`);
    }

    case 'DEV_RESET':
      return action.state;

    default:
      return state;
  }
}
