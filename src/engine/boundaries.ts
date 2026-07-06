/**
 * Turn boundaries (v1.4 §4) and the Check state (v1.4 §6.1).
 *
 * ONE handoff() implements §4.2→§4.3 and §4.4→§4.1 — every boundary step
 * lives in exactly one place (v1.4 §15.3; Brief §7 trap 1). Step ordering is
 * normative: expiry ticks run BEFORE new boundary-triggered effects apply
 * (Brief §7 trap 6 — the Distracting Madness bug class).
 */
import type { BoundaryName, CombatState, Side } from './types';
import {
  HAND_LIMIT,
  dispatchEvent,
  draw,
  destroyPermanent,
  getDef,
  log,
  npcCanAct,
  pushFrame,
  runStack,
} from './core';

// ── Boundary housekeeping helpers (each used by exactly one step set) ────────

/** Step: expire modifiers (Restrictions, Replacements) bound to this boundary. */
function expireModifiers(state: CombatState, boundary: BoundaryName): void {
  const tick = <T extends { expiry?: { boundary: BoundaryName; occurrences: number } }>(items: T[]): T[] =>
    items.filter((item) => {
      if (!item.expiry || item.expiry.boundary !== boundary) return true;
      item.expiry.occurrences -= 1;
      if (item.expiry.occurrences <= 0) {
        return false;
      }
      return true;
    });
  const beforeR = state.restrictions.length;
  state.restrictions = tick(state.restrictions);
  if (state.restrictions.length !== beforeR) log(state, 'expiry', `Restrictions expired at ${boundary}`);
  state.replacements = tick(state.replacements);
}

/** Step: expire the side's untriggered Traps; tick its Impression durations. */
function expireTrapsAndTickImpressions(state: CombatState, side: Side): void {
  const traps = state.field.filter((p) => p.kind === 'trap' && p.owner === side);
  for (const trap of traps) {
    // Untriggered traps expire to owner's discard at owner's Turn Start (§3.6).
    log(state, 'trap-expired', `Trap ${getDef(state, trap.definitionId).name} expires untriggered`);
    destroyPermanent(state, trap.permanentId, 0, { fireLeaveTriggers: false });
  }
  const impressions = state.field.filter((p) => p.kind === 'impression' && p.owner === side && p.turnsRemaining != null);
  for (const imp of impressions) {
    imp.turnsRemaining = (imp.turnsRemaining as number) - 1;
    if (imp.turnsRemaining <= 0) {
      const def = getDef(state, imp.definitionId);
      log(state, 'impression-expired', `Impression ${def.name} expires`);
      destroyPermanent(state, imp.permanentId, 0, {
        fireLeaveTriggers: true,
        toDeck: def.impressionDuration?.returnToDeck ?? false,
      });
    }
  }
}

/** Step: reset the side's per-turn counters (§4 naming convention). */
function resetPerTurnCounters(state: CombatState, side: Side): void {
  state[side].cardsPlayedThisTurn = 0;
  state[side].extraDrawsThisTurn = 0;
  state[side].priorityGainedThisTurn = 0;
  state.abilityFiresThisTurn = {};
  if (side === 'player') {
    // Roll the player's opp-shield counter into its previous-turn mirror (§4.1.5).
    state.oppShieldsBrokenByPlayerPrevTurn = state.oppShieldsBrokenByPlayerThisTurn;
    state.oppShieldsBrokenByPlayerThisTurn = 0;
  } else {
    state.playerShieldsBrokenByNpcThisTurn = 0;
    state.guardsPlacedByNpcThisTurn = 0;
  }
}

/** Step: fire scheduled effects due at this boundary (§9.4). */
function fireScheduledEffects(state: CombatState, boundary: BoundaryName): void {
  const due: typeof state.scheduledEffects = [];
  state.scheduledEffects = state.scheduledEffects.filter((entry) => {
    if (entry.at.boundary !== boundary) return true;
    entry.at.occurrences -= 1;
    if (entry.at.occurrences <= 0) {
      due.push(entry);
      return false;
    }
    return true;
  });
  for (const entry of due) {
    log(state, 'scheduled-fired', `Scheduled effects fire at ${boundary}`);
    pushFrame(state, { kind: 'scheduled', controller: entry.controller, effects: entry.effects, depth: 0 });
  }
  runStack(state);
}

/** Turn-start Priority formula (v1.4 §3.1). */
function setTurnStartPriority(state: CombatState, side: Side): void {
  const cfg = state.config;
  const debt = state[side].incomingDebt;
  let value = Math.min(cfg.maxPriority, cfg.minTurnStartPriority + debt);
  if (!state.firstTurnOfCombatDone) {
    value += cfg.firstTurnBonusPriority;
    state.firstTurnOfCombatDone = true;
  }
  state[side].incomingDebt = 0; // consumed on use; never banked
  state[side].priority = value;
  log(state, 'turn-start-priority', `${side} priority set to ${value}${debt > 0 ? ` (incl. ${debt} transferred debt)` : ''}`, {
    side,
    value,
    debt,
  });
}

/** Turn-end settlement (v1.4 §3.1 / §4.2.3 / §4.4.3). */
function settlePriority(state: CombatState, side: Side): void {
  const p = state[side].priority;
  if (p < 0) {
    state[opponentOfSide(side)].incomingDebt = -p;
    log(state, 'debt-transfer', `${side} ends at ${p}: ${-p} debt transfers to opponent`, { side, debt: -p });
  } else if (p > 0) {
    state[side].lastUnspentPriority = p; // tracked, no mechanical effect (§15.7)
  }
  state[side].priority = 0;
}

function opponentOfSide(side: Side): Side {
  return side === 'player' ? 'npc' : 'player';
}

/** Impression turn-start effects for the side (§4.1.9 / §4.3.9). */
function fireImpressionTurnStartEffects(state: CombatState, side: Side): void {
  const impressions = state.field
    .filter((p) => p.kind === 'impression' && p.owner === side)
    .sort((a, b) => a.arrivalOrder - b.arrivalOrder);
  for (const imp of impressions) {
    const def = getDef(state, imp.definitionId);
    if (def.turnStartEffects && def.turnStartEffects.length > 0) {
      pushFrame(state, {
        kind: 'turnStartEffects',
        controller: side,
        effects: def.turnStartEffects,
        depth: 0,
        sourcePermanentId: imp.permanentId,
      });
    }
  }
  runStack(state);
}

// ── The four boundaries ──────────────────────────────────────────────────────

function playerTurnStart(state: CombatState): void {
  // §4.1 — steps in listed order (normative).
  state.activeTurn = 'player'; // 1
  state.round += 1;
  log(state, 'boundary', `— Player Turn Start (Round ${state.round}) —`);
  setTurnStartPriority(state, 'player'); // 2
  expireModifiers(state, 'PLAYER_TURN_START'); // 3
  expireTrapsAndTickImpressions(state, 'player'); // 4
  runStack(state); // expiry leave-triggers resolve within step 4
  resetPerTurnCounters(state, 'player'); // 5
  // 6 — BotM cards return to hand, before the draw.
  if (state.backOfMind.length > 0) {
    state.player.hand.push(...state.backOfMind);
    log(state, 'botm-return', `${state.backOfMind.length} Back of Mind card(s) return to hand`);
    state.backOfMind = [];
  }
  // 7 — draw up to handLimit (respecting draw restrictions).
  const need = Math.max(0, HAND_LIMIT - state.player.hand.length);
  draw(state, 'player', need, { turnStart: true });
  fireScheduledEffects(state, 'PLAYER_TURN_START'); // 8
  dispatchEvent(state, { type: 'PLAYER_TURN_START', controller: 'player' }, 0); // 9
  runStack(state);
  fireImpressionTurnStartEffects(state, 'player');
  // 10 → Check (caller).
}

function playerTurnEndSettle(state: CombatState): void {
  // §4.2 step 3 (steps 1–2 — event dispatch and BotM Select — run in the
  // reducer before handoff is invoked, since BotM Select blocks).
  expireModifiers(state, 'PLAYER_TURN_END');
  fireScheduledEffects(state, 'PLAYER_TURN_END');
  settlePriority(state, 'player');
}

function npcTurnStart(state: CombatState): void {
  // §4.3 — steps in listed order.
  state.activeTurn = 'npc'; // 1
  log(state, 'boundary', '— NPC Turn Start —');
  setTurnStartPriority(state, 'npc'); // 2
  expireModifiers(state, 'NPC_TURN_START'); // 3
  expireTrapsAndTickImpressions(state, 'npc'); // 4
  runStack(state); // expiry leave-triggers resolve within step 4
  resetPerTurnCounters(state, 'npc'); // 5
  // 6 — inject due scheduledPlays into the NPC's hand, leftmost (§10).
  const due = state.npcScheduledAside.filter((sp) => state.round > sp.afterTurn);
  state.npcScheduledAside = state.npcScheduledAside.filter((sp) => state.round <= sp.afterTurn);
  for (const sp of due.reverse()) {
    state.npc.hand.unshift(sp.card);
    log(state, 'scheduled-play', `Scheduled card ${getDef(state, sp.card.definitionId).name} injected into NPC hand`);
  }
  // 7 — draw up to npcHandLimit (deck recycles; set-aside cards excluded).
  const need = Math.max(0, state.config.npcHandLimit - state.npc.hand.length);
  draw(state, 'npc', need, { turnStart: true });
  fireScheduledEffects(state, 'NPC_TURN_START'); // 8
  dispatchEvent(state, { type: 'NPC_TURN_START', controller: 'npc' }, 0); // 9
  runStack(state);
  fireImpressionTurnStartEffects(state, 'npc');
  // 10 → Check (caller).
}

function npcTurnEnd(state: CombatState): void {
  // §4.4 — automatic.
  log(state, 'boundary', '— NPC Turn End —');
  dispatchEvent(state, { type: 'NPC_TURN_END', controller: 'npc' }, 0); // 1
  runStack(state);
  expireModifiers(state, 'NPC_TURN_END');
  fireScheduledEffects(state, 'NPC_TURN_END');
  // 2 — discard the NPC's remaining hand (no NPC Back of Mind).
  if (state.npc.hand.length > 0) {
    state.npc.discard.push(...state.npc.hand);
    log(state, 'npc-discard-hand', `NPC discards ${state.npc.hand.length} remaining hand card(s)`);
    state.npc.hand = [];
  }
  settlePriority(state, 'npc'); // 3
  // 4 → Player Turn Start (via handoff caller).
}

/**
 * THE handoff procedure (v1.4 §15.3). 'playerEnd' implements §4.2→§4.3;
 * 'npcEnd' implements §4.4→§4.1. All boundary steps live here or in the
 * step functions above — nowhere else (Brief §7 trap 1).
 */
export function handoff(state: CombatState, ending: Side): void {
  if (ending === 'player') {
    playerTurnEndSettle(state);
    npcTurnStart(state);
  } else {
    npcTurnEnd(state);
    playerTurnStart(state);
  }
}

/** Entry boundary for the very first turn of combat. */
export function startFirstTurn(state: CombatState): void {
  if (state.config.startingSide === 'npc') {
    // Round 0 NPC opener (v1.4 §2 "Round").
    npcTurnStart(state);
  } else {
    playerTurnStart(state);
  }
}

// ── Check (v1.4 §6.1) — the routing hub; never blocks ───────────────────────

export function check(state: CombatState): void {
  if (state.pendingBlock || state.resolutionHalted) return; // blocked states route on resume
  if (state.result) return;

  // 1 — WIN before loss (§6.7 inv. 4).
  const coresLeft = state.npcCoreShields.some((s) => !s.broken);
  const totalConfigured = state.config.npcGuardShieldCount + state.config.opponentShields.length;
  if (totalConfigured > 0 && state.npcGuardsStanding === 0 && !coresLeft) {
    state.result = 'WIN';
    state.phase = 'Won';
    log(state, 'result', 'All opponent shields broken — WIN');
    return;
  }
  // 2 — shield-loss (armed only; skipped when unbreakable).
  if (
    state.shieldLossArmed &&
    !state.config.unbreakablePlayerShields &&
    state.playerShields.length === 0
  ) {
    state.result = 'LOSE';
    state.loseReason = 'SHIELDS';
    state.phase = 'Lost';
    log(state, 'result', 'Player shield row empty — LOSE');
    return;
  }
  // 3 — Patience.
  if (state.patience <= 0) {
    state.result = 'LOSE';
    state.loseReason = 'PATIENCE';
    state.phase = 'Lost';
    log(state, 'result', 'Patience exhausted — LOSE');
    return;
  }
  // 4 — Lie Counter.
  if ((state.config.lieThreshold ?? 0) > 0 && state.lieCounter > (state.config.lieThreshold as number)) {
    state.result = 'LOSE';
    state.loseReason = 'LIES';
    state.phase = 'Lost';
    log(state, 'result', 'Lie threshold exceeded — LOSE');
    return;
  }
  // 5 — player turn: always Player Pending, regardless of Priority (§3.1).
  if (state.activeTurn === 'player') {
    state.phase = 'PlayerPending';
    return;
  }
  // 6/7/8 — NPC turn routing.
  if (state.stagedCard) {
    state.phase = 'EnemyPending'; // staged card resolves via ADVANCE
    return;
  }
  if (npcCanAct(state)) {
    state.phase = 'EnemyPending';
    return;
  }
  // 8 — NPC Turn End → Player Turn Start → Check.
  handoff(state, 'npc');
  check(state);
}
