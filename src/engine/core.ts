/**
 * Engine core: mutation helpers, event dispatch, shield procedures, the
 * generic effect stack (single suspension mechanism, v1.4 §15.4), and card
 * play sequencing (§6.3 / §6.6).
 *
 * Functions here mutate a working-copy state owned by the reducer. The
 * reducer clones the incoming state first, so the public API stays pure
 * (§6.7 inv. 12 — no module-level mutable state anywhere in this file).
 */
import type {
  CardDefinition,
  CardInstance,
  CombatState,
  Effect,
  EffectFrame,
  EngineEvent,
  Permanent,
  PlayerShieldSlot,
  Side,
} from './types';
import { opponentOf } from './types';
import { evalCondition, evalQuantity, type EvalContext } from './quantities';
import { shuffleWithRng } from './rng';

// Combat constants (v1.2 carry-overs referenced by v1.4; not encounter-tunable).
export const HAND_LIMIT = 5;
export const REAL_SHIELD_PLACEMENT_COST = 2; // v1.4 §3.4
export const TRIGGER_DEPTH_CAP = 20; // v1.4 §5.4
export const BOTM_BASE_LIMIT = 1; // v1.4 §3.11

// ── Small helpers ────────────────────────────────────────────────────────────

export function newId(state: CombatState, prefix: string): string {
  state.nextId += 1;
  return `${prefix}_${state.nextId}`;
}

export function log(state: CombatState, type: string, message: string, data?: Record<string, unknown>): void {
  state.logSeq += 1;
  state.log.push({ seq: state.logSeq, type, message, data });
}

export function getDef(state: CombatState, definitionId: string): CardDefinition {
  const def = state.cards[definitionId] ?? state.tokens[definitionId];
  if (!def) throw new Error(`Unknown card definition "${definitionId}"`);
  return def;
}

export function ponderDef(state: CombatState): CardDefinition {
  const def = state.cards['ponder'];
  if (!def) throw new Error('Ponder definition missing from card registry');
  return def;
}

function shuffleInState<T>(state: CombatState, items: readonly T[]): T[] {
  const r = shuffleWithRng(items, state.rngState);
  state.rngState = r.rngState;
  return r.items;
}

function randomIndex(state: CombatState, length: number): number {
  const r = shuffleWithRng([...Array(length).keys()], state.rngState);
  state.rngState = r.rngState;
  return r.items[0] ?? 0;
}

// ── Restrictions ─────────────────────────────────────────────────────────────

export function restrictionsFor(state: CombatState, side: Side, type: string) {
  return state.restrictions.filter((r) => r.type === type && (r.target === side || r.target === 'both'));
}

export function hasRestriction(state: CombatState, side: Side, type: string): boolean {
  return restrictionsFor(state, side, type).length > 0;
}

export function effectiveBotmLimit(state: CombatState): number {
  const bonus = restrictionsFor(state, 'player', 'BOTM_LIMIT_BONUS').reduce((n, r) => n + (r.value ?? 0), 0);
  return state.backOfMindLimitBase + bonus;
}

export function effectiveCardCost(state: CombatState, side: Side, baseCost: number, heavyHand: boolean): number {
  let cost = heavyHand ? baseCost * 2 : baseCost;
  for (const r of restrictionsFor(state, side, 'INCREASE_CARD_COST')) cost += r.value ?? 0;
  return cost;
}

export function maxPlaysReached(state: CombatState, side: Side): boolean {
  const caps = restrictionsFor(state, side, 'MAX_PLAYS_PER_TURN');
  if (caps.length === 0) return false;
  const cap = Math.min(...caps.map((r) => r.value ?? Infinity));
  return state[side].cardsPlayedThisTurn >= cap;
}

export function costCapViolated(state: CombatState, side: Side, cost: number): boolean {
  const caps = restrictionsFor(state, side, 'MAX_CARD_COST');
  if (caps.length === 0) return false;
  return cost > Math.min(...caps.map((r) => r.value ?? Infinity));
}

// ── Priority & Patience ──────────────────────────────────────────────────────

/**
 * Change a side's Priority meter by delta. PRIORITY_FLOOR restrictions clamp
 * decreases. Dispatches PRIORITY_CHANGED (resolution-time changes only —
 * boundary housekeeping sets the meter directly and does not dispatch).
 */
export function modifyPriority(state: CombatState, side: Side, delta: number, dispatch = true): void {
  if (delta === 0) return;
  let next = state[side].priority + delta;
  if (delta < 0) {
    const floors = restrictionsFor(state, side, 'PRIORITY_FLOOR');
    if (floors.length > 0) {
      const floor = Math.max(...floors.map((r) => r.value ?? -Infinity));
      if (next < floor) next = floor;
    }
  }
  const applied = next - state[side].priority;
  if (applied === 0) return;
  state[side].priority = next;
  if (applied > 0) state[side].priorityGainedThisTurn += applied;
  log(state, 'priority', `${side} priority ${applied > 0 ? '+' : ''}${applied} → ${next}`, { side, delta: applied, newValue: next });
  if (dispatch) {
    dispatchEvent(state, { type: 'PRIORITY_CHANGED', side, delta: applied, newValue: next, controller: side }, 0);
  }
}

/**
 * Change shared Patience (no cap — v1.4 §3.2). `source` is the controller of
 * the causing effect: PREVENT_PATIENCE_GAIN nullifies gains by that side.
 */
export function modifyPatience(state: CombatState, delta: number, source: Side, depth = 0): void {
  if (delta === 0) return;
  if (delta > 0 && hasRestriction(state, source, 'PREVENT_PATIENCE_GAIN')) {
    log(state, 'patience-blocked', `Patience gain by ${source} prevented by restriction`, { delta });
    return;
  }
  state.patience += delta;
  log(state, 'patience', `Patience ${delta > 0 ? '+' : ''}${delta} → ${state.patience}`, {
    delta,
    newValue: state.patience,
    source,
  });
  dispatchEvent(state, { type: 'PATIENCE_CHANGED', delta, newValue: state.patience, controller: source }, depth);
  // Impressions with destroy-below-Patience thresholds (v1.4 §3.8).
  const doomed = state.field.filter(
    (p) =>
      p.kind === 'impression' &&
      getDef(state, p.definitionId).impressionDestroyBelowPatience != null &&
      state.patience < (getDef(state, p.definitionId).impressionDestroyBelowPatience as number),
  );
  for (const p of doomed) destroyPermanent(state, p.permanentId, depth, { fireLeaveTriggers: true });
}

// ── Drawing ──────────────────────────────────────────────────────────────────

export interface DrawOptions {
  turnStart?: boolean;
}

/** Draw with deck recycle (v1.4 §3.12). Returns cards actually drawn. */
export function draw(state: CombatState, side: Side, count: number, opts: DrawOptions = {}): number {
  if (count <= 0) return 0;
  if (hasRestriction(state, side, 'PREVENT_DRAW')) {
    log(state, 'draw-blocked', `${side} draw prevented by restriction`);
    return 0;
  }
  let n = count;
  if (opts.turnStart) {
    const caps = restrictionsFor(state, side, 'MAX_TURN_START_DRAW');
    if (caps.length > 0) n = Math.min(n, Math.min(...caps.map((r) => r.value ?? Infinity)));
  } else if (hasRestriction(state, side, 'PREVENT_EXTRA_DRAWS')) {
    log(state, 'draw-blocked', `${side} extra draw prevented by restriction`);
    return 0;
  }
  let drawn = 0;
  for (let i = 0; i < n; i++) {
    if (state[side].deck.length === 0 && state[side].discard.length > 0) {
      state[side].deck = shuffleInState(state, state[side].discard);
      state[side].discard = [];
      log(state, 'recycle', `${side} deck recycled from discard`);
    }
    const card = state[side].deck.shift();
    if (!card) break; // both piles empty: draw stops short, no side effect (§3.12)
    state[side].hand.push(card);
    drawn += 1;
  }
  if (!opts.turnStart) state[side].extraDrawsThisTurn += drawn;
  if (drawn > 0) log(state, 'draw', `${side} drew ${drawn} card(s)`, { side, count: drawn });
  return drawn;
}

// ── Frames & event dispatch ──────────────────────────────────────────────────

export function pushFrame(
  state: CombatState,
  partial: Omit<EffectFrame, 'frameId' | 'index'>,
): EffectFrame {
  const frame: EffectFrame = { ...partial, frameId: newId(state, 'frame'), index: 0 };
  if (frame.depth > TRIGGER_DEPTH_CAP) {
    // Fail-safe, not a gameplay limit (v1.4 §5.4): halt and log an error.
    state.resolutionHalted = true;
    log(state, 'error', `Trigger depth cap (${TRIGGER_DEPTH_CAP}) reached — resolution halted`, { kind: partial.kind });
    return frame;
  }
  state.effectStack.push(frame);
  return frame;
}

function matchesControllerFilter(
  filter: 'self' | 'opponent' | undefined,
  owner: Side,
  event: EngineEvent,
): boolean {
  if (!filter) return true;
  if (event.controller == null) return false;
  return filter === 'self' ? event.controller === owner : event.controller === opponentOf(owner);
}

/**
 * Canonical event dispatch — the single integration point for Traps, Shield
 * Triggers, and triggered abilities (v1.4 §15.5). Matching traps fire first
 * (play order), then triggered abilities (Field arrival order); the caller
 * interleaves Shield Trigger frames where §5.4 requires. Nested triggers
 * resolve immediately as sub-steps via the stack (depth-capped).
 */
export function dispatchEvent(state: CombatState, event: EngineEvent, depth: number): void {
  log(state, 'event', `event ${event.type}`, { ...event });

  const traps: { perm: Permanent; effects: Effect[] }[] = [];
  const abilities: { perm: Permanent; abilityKey: string; effects: Effect[]; chosen?: number }[] = [];

  const ordered = [...state.field].sort((a, b) => a.arrivalOrder - b.arrivalOrder);
  for (const perm of ordered) {
    const def = getDef(state, perm.definitionId);
    if (perm.kind === 'trap' && def.trapTrigger && def.trapTrigger.event === event.type) {
      if (perm.firedThisResolution) continue;
      if (!matchesControllerFilter(def.trapTrigger.controllerFilter, perm.owner, event)) continue;
      const ctx: EvalContext = {
        controller: perm.owner,
        event,
        chosenNumber: perm.rapportPrediction ?? null,
        sourcePermanentId: perm.permanentId,
      };
      if (def.trapTrigger.condition && !evalCondition(def.trapTrigger.condition, state, ctx)) continue;
      traps.push({ perm, effects: def.effects });
    }
    if (perm.kind !== 'trap') {
      for (const ab of def.triggeredAbilities ?? []) {
        if (ab.trigger.event !== event.type) continue;
        if (!matchesControllerFilter(ab.trigger.controllerFilter, perm.owner, event)) continue;
        const key = `${perm.permanentId}:${ab.id}`;
        if (ab.maxTimesPerPlay != null && (state.abilityFiresThisPlay[key] ?? 0) >= ab.maxTimesPerPlay) continue;
        if (ab.maxTimesPerTurn != null && (state.abilityFiresThisTurn[key] ?? 0) >= ab.maxTimesPerTurn) continue;
        const ctx: EvalContext = {
          controller: perm.owner,
          event,
          chosenNumber: perm.rapportPrediction ?? null,
          sourcePermanentId: perm.permanentId,
        };
        if (ab.trigger.condition && !evalCondition(ab.trigger.condition, state, ctx)) continue;
        state.abilityFiresThisPlay[key] = (state.abilityFiresThisPlay[key] ?? 0) + 1;
        state.abilityFiresThisTurn[key] = (state.abilityFiresThisTurn[key] ?? 0) + 1;
        abilities.push({ perm, abilityKey: key, effects: ab.effects, chosen: perm.rapportPrediction });
      }
    }
  }

  // LIFO stack: push abilities first (reverse order), then traps (reverse
  // order) so traps pop first, oldest-first within each class (v1.4 §5.4).
  for (let i = abilities.length - 1; i >= 0; i--) {
    const a = abilities[i];
    pushFrame(state, {
      kind: 'ability',
      controller: a.perm.owner,
      effects: a.effects,
      depth: depth + 1,
      sourcePermanentId: a.perm.permanentId,
      chosenNumber: a.chosen ?? null,
    });
  }
  for (let i = traps.length - 1; i >= 0; i--) {
    const t = traps[i];
    t.perm.firedThisResolution = true;
    log(state, 'trap-fired', `Trap ${getDef(state, t.perm.definitionId).name} fires`, {
      permanentId: t.perm.permanentId,
      event: event.type,
    });
    pushFrame(state, {
      kind: 'trap',
      controller: t.perm.owner,
      effects: t.effects,
      depth: depth + 1,
      sourcePermanentId: t.perm.permanentId,
      chosenNumber: t.perm.rapportPrediction ?? null,
    });
  }
}

// ── Permanents: create / destroy / transform ────────────────────────────────

export function addPermanent(
  state: CombatState,
  kind: Permanent['kind'],
  definitionId: string,
  owner: Side,
  extra: Partial<Permanent> = {},
): Permanent {
  const def = getDef(state, definitionId);
  state.nextArrivalOrder += 1;
  const perm: Permanent = {
    permanentId: extra.permanentId ?? newId(state, 'perm'),
    kind,
    definitionId,
    owner,
    arrivalOrder: state.nextArrivalOrder,
    counters: {},
    ...extra,
  };
  if (kind === 'impression' && def.impressionDuration) {
    perm.turnsRemaining = def.impressionDuration.turns;
  }
  state.field.push(perm);
  log(state, 'permanent-added', `${kind} ${def.name} enters the Field (${owner})`, {
    permanentId: perm.permanentId,
    definitionId,
    owner,
    kind,
  });
  return perm;
}

export function createToken(state: CombatState, tokenDefinitionId: string, owner: Side, depth: number): void {
  // Replacements checked at creation (v1.4 §9.3); transform effects bypass.
  let defId = tokenDefinitionId;
  const repl = state.replacements.find((r) => r.originalTokenId === defId);
  if (repl) {
    log(state, 'replacement', `Token creation replaced: ${defId} → ${repl.replacementTokenId}`);
    defId = repl.replacementTokenId;
  }
  addPermanent(state, 'token', defId, owner);
  dispatchEvent(state, { type: 'TOKEN_CREATED', tokenDefId: defId, controller: owner }, depth);
}

export interface DestroyOptions {
  fireLeaveTriggers?: boolean;
  toDeck?: boolean;
}

export function destroyPermanent(
  state: CombatState,
  permanentId: string,
  depth: number,
  opts: DestroyOptions = { fireLeaveTriggers: true },
): void {
  const idx = state.field.findIndex((p) => p.permanentId === permanentId);
  if (idx === -1) return;
  const perm = state.field[idx];
  const def = getDef(state, perm.definitionId);
  state.field.splice(idx, 1);

  // Restrictions/replacements linked to this permanent leave with it (§3.8).
  state.restrictions = state.restrictions.filter((r) => r.linkedPermanentId !== permanentId);
  state.replacements = state.replacements.filter((r) => r.linkedPermanentId !== permanentId);

  log(state, 'permanent-removed', `${perm.kind} ${def.name} leaves the Field`, {
    permanentId,
    definitionId: perm.definitionId,
  });

  // Card behind an Impression/Trap goes to its owner's discard (or deck).
  if (perm.cardInstanceId) {
    const card: CardInstance = { instanceId: perm.cardInstanceId, definitionId: perm.definitionId, owner: perm.owner };
    if (opts.toDeck) {
      state[perm.owner].deck = shuffleInState(state, [...state[perm.owner].deck, card]);
    } else {
      state[perm.owner].discard.push(card);
    }
  }

  if (opts.fireLeaveTriggers && def.leaveTriggerEffects && def.leaveTriggerEffects.length > 0) {
    pushFrame(state, {
      kind: 'leaveTrigger',
      controller: perm.owner,
      effects: def.leaveTriggerEffects,
      depth: depth + 1,
      sourcePermanentId: permanentId,
      chosenNumber: perm.rapportPrediction ?? null,
    });
  }
  if (perm.kind === 'token') {
    dispatchEvent(state, { type: 'TOKEN_DESTROYED', tokenDefId: perm.definitionId, controller: perm.owner }, depth);
  }
}

/** TRANSFORM bypasses leave-triggers (v1.4 §3.7 / §3.10). */
export function transformPermanent(state: CombatState, permanentId: string, intoDefinitionId: string): void {
  const perm = state.field.find((p) => p.permanentId === permanentId);
  if (!perm) return;
  const from = getDef(state, perm.definitionId).name;
  perm.definitionId = intoDefinitionId;
  log(state, 'transform', `${from} transforms into ${getDef(state, intoDefinitionId).name}`, {
    permanentId,
    intoDefinitionId,
  });
}

// ── Shields ──────────────────────────────────────────────────────────────────

function armShieldLossIfNeeded(state: CombatState): void {
  if (!state.shieldLossArmed && state.playerShields.length > 0) {
    state.shieldLossArmed = true; // v1.4 §3.4: arms on first non-empty row
    log(state, 'shield-loss-armed', 'Player shield-loss condition armed');
  }
}

export function placePlaceholderShields(state: CombatState, count: number): void {
  for (let i = 0; i < count; i++) {
    state.playerShields.push({
      slotId: newId(state, 'shield'),
      shieldType: 'placeholder',
      patienceCostOnBreak: 1,
    });
  }
  if (count > 0) log(state, 'shields-placed', `${count} Placeholder Shield(s) placed`, { count });
  armShieldLossIfNeeded(state);
}

export function placeGuardShields(state: CombatState, count: number): void {
  if (count <= 0) return;
  state.npcGuardsStanding += count;
  state.guardsPlacedByNpcThisTurn += count;
  log(state, 'guards-placed', `NPC places ${count} Guard Shield(s) (${state.npcGuardsStanding} standing)`, { count });
}

/**
 * Break one player shield: leftmost eligible — Dummy Shields (placeholders +
 * real cards) before Core Shields (v1.4 §3.4). Returns what broke, or null.
 */
export function breakOnePlayerShield(state: CombatState, breaker: Side, depth: number): PlayerShieldSlot | null {
  if (hasRestriction(state, breaker, 'PREVENT_SHIELD_BREAK')) {
    log(state, 'break-prevented', `Shield break by ${breaker} prevented by restriction`);
    return null;
  }
  if (state.config.unbreakablePlayerShields && breaker === 'npc') {
    log(state, 'break-prevented', 'Player shields are unbreakable in this encounter');
    return null;
  }
  const dummyIdx = state.playerShields.findIndex((s) => s.shieldType !== 'core');
  const idx = dummyIdx !== -1 ? dummyIdx : state.playerShields.length > 0 ? 0 : -1;
  if (idx === -1) return null;
  const slot = state.playerShields[idx];
  state.playerShields.splice(idx, 1);

  const def = slot.cardDefinitionId ? getDef(state, slot.cardDefinitionId) : null;
  const safety = def?.keywords.includes('Safety') ?? false;
  const patienceCost = slot.shieldType === 'core' ? slot.patienceCostOnBreak : safety ? 0 : slot.patienceCostOnBreak;

  if (breaker === 'npc') state.playerShieldsBrokenByNpcThisTurn += 1;
  log(state, 'shield-broken', `Player ${slot.shieldType} shield broken by ${breaker}`, {
    shieldType: slot.shieldType,
    cardDefinitionId: slot.cardDefinitionId,
    safety,
  });

  // Order (v1.4 §5.4): traps → this shield's Shield Trigger → abilities →
  // break outcome. LIFO push: outcome first, then the shield trigger, then
  // dispatch (which pushes abilities then traps on top → traps pop first).
  pushFrame(state, {
    kind: 'breakOutcome',
    controller: breaker,
    effects: [],
    depth: depth + 1,
    breakOutcome: {
      side: 'player',
      shieldType: slot.shieldType,
      patienceCost,
      cardInstanceId: slot.cardInstanceId,
      cardDefinitionId: slot.cardDefinitionId,
      safety,
    },
  });
  if (def?.keywords.includes('Shield Trigger')) {
    const effects = def.shieldTriggerEffects ?? def.effects;
    if (effects.length > 0) {
      pushFrame(state, {
        kind: 'shieldTrigger',
        controller: 'player',
        effects,
        depth: depth + 1,
      });
    }
  }
  dispatchEvent(
    state,
    { type: 'SHIELD_BROKEN', shieldSide: 'player', shieldType: slot.shieldType, breaker, controller: breaker },
    depth,
  );
  return slot;
}

/** Break one NPC Guard Shield (generic break effects hit Guards only, §3.3). */
export function breakOneNpcGuard(state: CombatState, breaker: Side, depth: number): boolean {
  if (hasRestriction(state, breaker, 'PREVENT_SHIELD_BREAK')) {
    log(state, 'break-prevented', `Shield break by ${breaker} prevented by restriction`);
    return false;
  }
  if (state.npcGuardsStanding <= 0) {
    log(state, 'break-fizzle', 'No Guard Shields standing — generic break fizzles (v1.4 §3.3)');
    return false;
  }
  state.npcGuardsStanding -= 1;
  if (breaker === 'player') state.oppShieldsBrokenByPlayerThisTurn += 1;
  log(state, 'shield-broken', `NPC Guard Shield broken by ${breaker} (${state.npcGuardsStanding} standing)`, {
    shieldType: 'guard',
    breaker,
  });
  dispatchEvent(
    state,
    { type: 'SHIELD_BROKEN', shieldSide: 'npc', shieldType: 'guard', breaker, controller: breaker },
    depth,
  );
  return true;
}

/**
 * Lock-and-keys core shield break (v1.4 §3.3 / §6.3 step 4). Caller has
 * already verified guards are down and the key matches. Sets Reveal Pending.
 */
export function breakNpcCoreShield(state: CombatState, shieldIndex: number, depth: number): void {
  const shield = state.npcCoreShields[shieldIndex];
  if (!shield || shield.broken) return;
  shield.broken = true;
  state.oppShieldsBrokenByPlayerThisTurn += 1;
  log(state, 'shield-broken', `NPC Core Shield broken (key played): ${shield.cardId}`, {
    shieldType: 'npcCore',
    cardId: shield.cardId,
    isHint: shield.isHint,
  });

  // Shield Trigger on NPC Information Shields (v1.4 §3.5).
  const def = state.cards[shield.cardId];
  if (def?.keywords.includes('Shield Trigger')) {
    const effects = def.shieldTriggerEffects ?? def.effects;
    if (effects.length > 0) {
      pushFrame(state, { kind: 'shieldTrigger', controller: 'npc', effects, depth: depth + 1 });
    }
  }
  dispatchEvent(
    state,
    { type: 'SHIELD_BROKEN', shieldSide: 'npc', shieldType: 'npcCore', breaker: 'player', controller: 'player' },
    depth,
  );

  // Reveal Pending fires with the shield's lore; non-Hint shields add their
  // card to the Collection (persistence layer reads gainedCardIds).
  if (!shield.isHint) state.gainedCardIds.push(shield.cardId);
  state.pendingBlock = {
    type: 'reveal',
    lore: shield.loreDescription,
    isHint: shield.isHint,
    hintText: shield.hintText,
    gainedCardId: shield.isHint ? undefined : shield.cardId,
    shieldCardId: shield.cardId,
  };
}

/** Multi-break helper honouring §6.7 inv. 7: never more than one Core per effect. */
export function breakPlayerShields(state: CombatState, count: number, breaker: Side, depth: number): void {
  let coresBroken = 0;
  for (let i = 0; i < count; i++) {
    const dummyLeft = state.playerShields.some((s) => s.shieldType !== 'core');
    if (!dummyLeft && coresBroken >= 1) {
      log(state, 'break-capped', 'Core single-break invariant: further breaks from this effect stop (§6.7.7)');
      break;
    }
    const broken = breakOnePlayerShield(state, breaker, depth);
    if (!broken) break;
    if (broken.shieldType === 'core') coresBroken += 1;
  }
}

// ── Real-card shield placement (player action, §3.4) ─────────────────────────

export function placeRealShield(state: CombatState, handIndex: number): void {
  const card = state.player.hand[handIndex];
  if (!card) throw new Error('No such hand card');
  state.player.hand.splice(handIndex, 1);
  state.playerShields.push({
    slotId: newId(state, 'shield'),
    shieldType: 'real',
    cardInstanceId: card.instanceId,
    cardDefinitionId: card.definitionId,
    patienceCostOnBreak: 1,
  });
  armShieldLossIfNeeded(state);
  log(state, 'shields-placed', `Real-card shield placed: ${getDef(state, card.definitionId).name}`);
}

// ── Effect execution ─────────────────────────────────────────────────────────

function scaled(state: CombatState, base: number, effect: Effect, ctx: EvalContext): number {
  if (!effect.scale) return base;
  const factor = Math.max(0, evalQuantity(effect.scale, state, ctx));
  return base * factor;
}

function frameContext(state: CombatState, frame: EffectFrame): EvalContext {
  return {
    controller: frame.controller,
    chosenNumber: frame.chosenNumber ?? state.pendingPlay?.chosenNumber ?? null,
    sourcePermanentId: frame.sourcePermanentId,
  };
}

export function executeEffect(state: CombatState, effect: Effect, frame: EffectFrame): void {
  const ctx = frameContext(state, frame);
  const controller = frame.controller;
  const depth = frame.depth;

  if (effect.condition && !evalCondition(effect.condition, state, ctx)) return;

  switch (effect.type) {
    case 'MODIFY_PATIENCE': {
      let value = effect.value;
      if (effect.altValue != null && effect.altCondition && evalCondition(effect.altCondition, state, ctx)) {
        value = effect.altValue;
      }
      modifyPatience(state, scaled(state, value, effect, ctx), controller, depth);
      break;
    }
    case 'MODIFY_PRIORITY': {
      const side = effect.target === 'opponent' ? opponentOf(controller) : controller;
      modifyPriority(state, side, scaled(state, effect.value, effect, ctx));
      break;
    }
    case 'DRAW_CARDS':
      draw(state, controller, scaled(state, effect.value, effect, ctx));
      break;
    case 'BREAK_SHIELDS': {
      const count = scaled(state, effect.count, effect, ctx);
      const targetSide = effect.target === 'self' ? controller : opponentOf(controller);
      if (targetSide === 'player') {
        breakPlayerShields(state, count, controller, depth);
      } else {
        // NPC-owned shields: guards only, from either side (§3.3 / §6.6.3).
        for (let i = 0; i < count; i++) {
          if (!breakOneNpcGuard(state, controller, depth)) break;
        }
      }
      break;
    }
    case 'PLACE_SHIELDS': {
      const count = scaled(state, effect.count, effect, ctx);
      if (controller === 'player') placePlaceholderShields(state, count);
      else placeGuardShields(state, count);
      break;
    }
    case 'CREATE_TOKEN': {
      const count = scaled(state, effect.count, effect, ctx);
      for (let i = 0; i < count; i++) createToken(state, effect.tokenDefinitionId, controller, depth);
      break;
    }
    case 'DESTROY_TOKENS': {
      const count = scaled(state, effect.count, effect, ctx);
      const own = state.field
        .filter(
          (p) =>
            p.kind === 'token' &&
            p.owner === controller &&
            (!effect.tokenDefinitionId || p.definitionId === effect.tokenDefinitionId),
        )
        .sort((a, b) => a.arrivalOrder - b.arrivalOrder);
      for (const perm of own.slice(0, count)) destroyPermanent(state, perm.permanentId, depth);
      break;
    }
    case 'TRANSFORM_TOKEN': {
      const matching = state.field
        .filter((p) => p.kind === 'token' && p.owner === controller && p.definitionId === effect.fromTokenId)
        .sort((a, b) => a.arrivalOrder - b.arrivalOrder);
      const n = effect.all ? matching.length : Math.min(effect.count ?? 1, matching.length);
      for (const perm of matching.slice(0, n)) transformPermanent(state, perm.permanentId, effect.toTokenId);
      break;
    }
    case 'DESTROY_SELF':
      if (frame.sourcePermanentId) destroyPermanent(state, frame.sourcePermanentId, depth);
      break;
    case 'DESTROY_IMPRESSION': {
      const owner = effect.owner === 'self' ? controller : opponentOf(controller);
      const count = effect.count ?? 1;
      const targets = state.field
        .filter((p) => p.kind === 'impression' && p.owner === owner)
        .sort((a, b) => a.arrivalOrder - b.arrivalOrder)
        .slice(0, count);
      for (const t of targets) destroyPermanent(state, t.permanentId, depth);
      break;
    }
    case 'APPLY_RESTRICTION': {
      const r = effect.restriction;
      const target = r.target === 'both' ? 'both' : r.target === 'self' ? controller : opponentOf(controller);
      const linked =
        frame.kind === 'play' && state.pendingPlay?.destination === 'field-impression'
          ? state.pendingPlay.reservedPermanentId
          : frame.sourcePermanentId && state.field.some((p) => p.permanentId === frame.sourcePermanentId && p.kind === 'impression')
            ? frame.sourcePermanentId
            : undefined;
      state.restrictions.push({
        id: newId(state, 'restr'),
        type: r.type,
        target,
        value: r.value,
        conditionThreshold: r.conditionThreshold,
        expiry: r.expiry ? { ...r.expiry } : undefined,
        linkedPermanentId: linked,
      });
      log(state, 'restriction', `Restriction ${r.type} applied to ${target}`, { type: r.type, target, value: r.value });
      break;
    }
    case 'APPLY_REPLACEMENT': {
      const linked =
        frame.kind === 'play' && state.pendingPlay?.destination === 'field-impression'
          ? state.pendingPlay.reservedPermanentId
          : undefined;
      state.replacements.push({
        id: newId(state, 'repl'),
        originalTokenId: effect.originalTokenId,
        replacementTokenId: effect.replacementTokenId,
        expiry: effect.expiry ? { ...effect.expiry } : undefined,
        linkedPermanentId: linked,
      });
      log(state, 'replacement', `Replacement ${effect.originalTokenId} → ${effect.replacementTokenId} active`);
      break;
    }
    case 'SCHEDULE_EFFECTS':
      state.scheduledEffects.push({
        id: newId(state, 'sched'),
        effects: effect.effects,
        controller,
        at: { ...effect.at },
      });
      log(state, 'scheduled', `Effects scheduled for ${effect.at.boundary} (+${effect.at.occurrences})`);
      break;
    case 'CHOOSE_NUMBER':
      state.pendingBlock = { type: 'chooseNumber', min: effect.min, max: effect.max, frameId: frame.frameId };
      break;
    case 'COPY_FROM_NPC_DECK': {
      const wantCost = effect.costEquals != null ? evalQuantity(effect.costEquals, state, ctx) : null;
      const candidates = state.npc.deck.filter((c) => {
        const def = getDef(state, c.definitionId);
        if (wantCost != null && def.cost !== wantCost) return false;
        if (effect.withShieldBreak && !def.effects.some((e) => e.type === 'BREAK_SHIELDS' && e.target === 'opponent'))
          return false;
        return true;
      });
      const copies = Math.max(0, scaled(state, effect.count, effect, ctx));
      const override =
        effect.patienceCostOverride != null ? evalQuantity(effect.patienceCostOverride, state, ctx) : undefined;
      for (let i = 0; i < copies && candidates.length > 0; i++) {
        const pick = candidates[randomIndex(state, candidates.length)];
        state.player.hand.push({
          instanceId: newId(state, 'card'),
          definitionId: pick.definitionId,
          owner: 'player',
          patienceCostOverride: override,
        });
        log(state, 'copy', `Copied ${getDef(state, pick.definitionId).name} from NPC deck`, {
          definitionId: pick.definitionId,
          patienceCostOverride: override,
        });
      }
      break;
    }
    case 'REVEAL_NPC_HAND':
      state.npcHandRevealed = true;
      log(state, 'reveal-hand', 'NPC hand revealed');
      break;
    case 'HIDE_NPC_HAND':
      state.npcHandRevealed = false;
      log(state, 'reveal-hand', 'NPC hand hidden');
      break;
    case 'REVEAL_NPC_DECK_TOP':
      state.npcDeckTopRevealed = true;
      break;
    case 'HIDE_NPC_DECK_TOP':
      state.npcDeckTopRevealed = false;
      break;
    case 'DECK_REVEAL': {
      const side = opponentOf(controller);
      const cards = state[side].deck.slice(0, effect.count).map((c) => c.definitionId);
      state.pendingBlock = { type: 'deckReveal', cardDefIds: cards };
      break;
    }
    case 'CANCEL_STAGED_CARD':
      if (state.stagedCard && !state.stagedCancelled) {
        state.stagedCancelled = true;
        log(state, 'cancel', `Staged card ${getDef(state, state.stagedCard.definitionId).name} cancelled`, {
          definitionId: state.stagedCard.definitionId,
        });
      }
      break;
    case 'INCREMENT_COUNTERS': {
      let amount = scaled(state, effect.amount, effect, ctx);
      if (amount <= 0) break;
      // Static amplifiers on other permanents (v1.4 §3.10).
      for (const p of state.field) {
        for (const amp of getDef(state, p.definitionId).counterAmplifiers ?? []) {
          if (amp.counterName !== effect.counterName) continue;
          if (amp.targetDefinitionId && effect.targetDefinitionId !== 'self' && amp.targetDefinitionId !== effect.targetDefinitionId)
            continue;
          amount += amp.extra;
        }
      }
      const targets =
        effect.targetDefinitionId === 'self'
          ? state.field.filter((p) => p.permanentId === frame.sourcePermanentId)
          : state.field.filter((p) => p.definitionId === effect.targetDefinitionId);
      for (const t of targets) {
        t.counters[effect.counterName] = (t.counters[effect.counterName] ?? 0) + amount;
        log(state, 'counters', `+${amount} ${effect.counterName} on ${getDef(state, t.definitionId).name} (${t.counters[effect.counterName]})`, {
          permanentId: t.permanentId,
          counterName: effect.counterName,
          total: t.counters[effect.counterName],
        });
      }
      break;
    }
    case 'RESHUFFLE_DECK': {
      const s = state[controller];
      s.deck = shuffleInState(state, [...s.deck, ...s.discard]);
      s.discard = [];
      log(state, 'recycle', `${controller} discard reshuffled into deck`);
      break;
    }
  }
}

// ── Thresholds & transform conditions (v1.4 §3.10) ──────────────────────────

export function runThresholdChecks(state: CombatState, afterController: Side, depth: number): void {
  const ordered = [...state.field].sort((a, b) => a.arrivalOrder - b.arrivalOrder);
  for (const perm of ordered) {
    if (!state.field.includes(perm)) continue; // may have transformed/left
    const def = getDef(state, perm.definitionId);
    for (const th of def.thresholds ?? []) {
      const point = th.checkPoint ?? 'AFTER_NPC_PLAY';
      if (point === 'AFTER_NPC_PLAY' && afterController !== 'npc') continue;
      if ((perm.counters[th.counterName] ?? 0) >= th.value) {
        if (th.consume) {
          perm.counters[th.counterName] = (perm.counters[th.counterName] ?? 0) - th.value;
        }
        log(state, 'threshold', `Threshold fires on ${def.name} (${th.counterName} ≥ ${th.value})`, {
          permanentId: perm.permanentId,
        });
        pushFrame(state, {
          kind: 'threshold',
          controller: perm.owner,
          effects: th.effects,
          depth: depth + 1,
          sourcePermanentId: perm.permanentId,
        });
      }
    }
    if (def.transformCondition) {
      const ctx: EvalContext = { controller: perm.owner, sourcePermanentId: perm.permanentId };
      if (evalCondition(def.transformCondition.condition, state, ctx)) {
        transformPermanent(state, perm.permanentId, def.transformCondition.intoDefinitionId);
      }
    }
  }
}

// ── The run loop ─────────────────────────────────────────────────────────────

function popFrame(state: CombatState): void {
  const frame = state.effectStack.pop();
  if (!frame) return;
  if (frame.kind === 'trap' && frame.sourcePermanentId) {
    const perm = state.field.find((p) => p.permanentId === frame.sourcePermanentId);
    if (perm) {
      const def = getDef(state, perm.definitionId);
      if (!def.trapPersistent) {
        // Fired traps move to their owner's discard (v1.4 §3.6).
        destroyPermanent(state, perm.permanentId, frame.depth, { fireLeaveTriggers: false });
      }
    }
  }
}

function applyBreakOutcome(state: CombatState, frame: EffectFrame): void {
  const o = frame.breakOutcome;
  if (!o) return;
  if (o.patienceCost > 0) modifyPatience(state, -o.patienceCost, frame.controller, frame.depth);
  // Real-card and Core shields discard their card; Placeholders were never
  // real cards and are removed from the game (v1.4 §3.4; Brief §7 trap 7).
  if (o.cardInstanceId && o.cardDefinitionId) {
    state.player.discard.push({
      instanceId: o.cardInstanceId,
      definitionId: o.cardDefinitionId,
      owner: 'player',
    });
    log(state, 'shield-card-discarded', `Broken shield card ${getDef(state, o.cardDefinitionId).name} → player discard`);
  }
}

/**
 * Run the effect stack until it suspends (pendingBlock), halts, or empties.
 * When it empties with an in-flight play, the play's completion steps run
 * (§6.3.4–6 / §6.6.4–5) — always, on every path (Brief §7 trap 2).
 */
export function runStack(state: CombatState): void {
  let guard = 0;
  while (!state.pendingBlock && !state.resolutionHalted) {
    if (++guard > 10000) {
      state.resolutionHalted = true;
      log(state, 'error', 'Resolution guard tripped (10000 iterations) — halted');
      return;
    }
    const frame = state.effectStack[state.effectStack.length - 1];
    if (frame) {
      if (frame.kind === 'breakOutcome') {
        state.effectStack.pop();
        applyBreakOutcome(state, frame);
        continue;
      }
      if (frame.index >= frame.effects.length) {
        popFrame(state);
        continue;
      }
      const effect = frame.effects[frame.index];
      frame.index += 1;
      executeEffect(state, effect, frame);
      continue;
    }
    // Stack empty: advance play completion if a play is in flight.
    if (
      state.pendingPlay &&
      !(state.pendingPlay.lockCheckDone && state.pendingPlay.moved && state.pendingPlay.resolvedDispatched && state.pendingPlay.thresholdsDone)
    ) {
      advancePlayCompletion(state);
      continue;
    }
    break;
  }
  if (state.effectStack.length === 0 && !state.pendingBlock) {
    // Resolution cycle complete: persistent traps may arm again (§3.6).
    for (const p of state.field) p.firedThisResolution = false;
  }
}

// ── Card play sequencing ─────────────────────────────────────────────────────

export interface EffectivePlay {
  def: CardDefinition;
  effects: Effect[];
  cost: number;
  convertedToPonder: boolean;
  discoveredNuggetId: string | null;
}

/**
 * Resolve the effective definition for a play: nugget override / Ponder
 * conversion for Information Cards (v1.4 §3.9), Heavy Hand doubling handled
 * by the caller via effectiveCardCost.
 */
export function resolveEffectivePlay(state: CombatState, card: CardInstance, heavyHand: boolean): EffectivePlay {
  const printed = getDef(state, card.definitionId);
  if (printed.supertype === 'Information') {
    const override = state.config.nuggetOverrides.find((o) => o.nuggetId === printed.nuggetId);
    if (override) {
      const discovered = printed.nuggetId != null && !state.discoveredNuggetIds.includes(printed.nuggetId);
      return {
        def: printed,
        effects: override.effects,
        cost: override.cost,
        convertedToPonder: false,
        discoveredNuggetId: discovered ? (printed.nuggetId as string) : null,
      };
    }
    const ponder = ponderDef(state);
    return { def: printed, effects: ponder.effects, cost: ponder.cost, convertedToPonder: true, discoveredNuggetId: null };
  }
  const effects = heavyHand && printed.heavyHandEffects ? printed.heavyHandEffects : printed.effects;
  return { def: printed, effects, cost: printed.cost, convertedToPonder: false, discoveredNuggetId: null };
}

export function playDestination(
  def: CardDefinition,
  convertedToPonder: boolean,
): 'discard' | 'field-impression' | 'field-trap' | 'deck' {
  if (convertedToPonder) return 'discard';
  if (def.subtype === 'Impression') return 'field-impression';
  if (def.subtype === 'Trap') return 'field-trap';
  if (def.returnToDeck) return 'deck';
  return 'discard';
}

/**
 * Begin a card play (either side) — §6.3 steps 0–3 / §6.6 steps 1–3. Costs
 * are step 0 and never repeat (§6.7 inv. 6). Caller validates playability.
 */
export function beginPlay(state: CombatState, controller: Side, card: CardInstance, heavyHand: boolean): void {
  const eff = resolveEffectivePlay(state, card, heavyHand);
  const cost = effectiveCardCost(state, controller, eff.cost, heavyHand);

  // Step 0/1: deduct full cost — meter may go negative, no floor except
  // PRIORITY_FLOOR restrictions, no Patience spill (v1.4 §3.1/§3.2).
  modifyPriority(state, controller, -cost);
  state[controller].cardsPlayedThisTurn += 1;
  state.abilityFiresThisPlay = {};

  // Per-card patience costs from restrictions (v1.4 §9.1).
  for (const r of restrictionsFor(state, controller, 'PATIENCE_COST_PER_CARD')) {
    modifyPatience(state, -(r.value ?? 0), controller);
  }
  // Copied-card patience rider (v1.4 §8.5).
  if (card.patienceCostOverride != null && card.patienceCostOverride > 0) {
    modifyPatience(state, -card.patienceCostOverride, controller);
  }

  const destination = playDestination(eff.def, eff.convertedToPonder);
  state.pendingPlay = {
    cardInstanceId: card.instanceId,
    definitionId: eff.def.id,
    controller,
    heavyHand,
    destination,
    reservedPermanentId:
      destination === 'field-impression' || destination === 'field-trap' ? newId(state, 'perm') : undefined,
    components: card.components,
    lockCheckDone: controller === 'npc', // lock check is a player-play step (§6.3.4)
    moved: false,
    resolvedDispatched: false,
    thresholdsDone: false,
    chosenNumber: null,
  };

  log(state, 'play', `${controller} plays ${eff.def.name}${heavyHand ? ' (Heavy Hand)' : ''}${eff.convertedToPonder ? ' → Ponder' : ''}`, {
    definitionId: eff.def.id,
    controller,
    cost,
    heavyHand,
    convertedToPonder: eff.convertedToPonder,
  });

  if (eff.convertedToPonder && eff.def.nuggetId && !state.playedNonRelevantCards.includes(eff.def.id)) {
    state.playedNonRelevantCards.push(eff.def.id);
  }
  if (eff.discoveredNuggetId) {
    state.discoveredNuggetIds.push(eff.discoveredNuggetId);
    log(state, 'discovery', `Nugget discovered: ${eff.discoveredNuggetId}`, { nuggetId: eff.discoveredNuggetId });
  }

  // Step 2: dispatch CARD_PLAYED; apply Lie keyword (v1.4 §6.3.2).
  if (eff.def.keywords.includes('Lie') && !eff.convertedToPonder) {
    state.lieCounter += 1;
    log(state, 'lie', `Lie Counter → ${state.lieCounter}`);
  }
  dispatchEvent(
    state,
    {
      type: 'CARD_PLAYED',
      controller,
      cardInstanceId: card.instanceId,
      cardDefId: eff.def.id,
      cardCost: cost,
    },
    0,
  );

  // Step 3: the play's effect list. Traps defer their printed effects (§3.6).
  const playEffects = destination === 'field-trap' ? [] : eff.effects;
  const frame = pushFrame(state, {
    kind: 'play',
    controller,
    effects: playEffects,
    depth: 0,
    playCardInstanceId: card.instanceId,
    chosenNumber: null,
  });

  // Rapport prediction is chosen at play time — including for Traps, whose
  // printed effects are deferred (v1.4 §8.3).
  if (eff.def.rapport && !eff.convertedToPonder) {
    state.pendingBlock = { type: 'chooseNumber', min: eff.def.rapport.min, max: eff.def.rapport.max, frameId: frame.frameId };
  }
}

function advancePlayCompletion(state: CombatState): void {
  const pp = state.pendingPlay;
  if (!pp) return;

  // §6.3 step 4 — lock check (player Information Card keys, guards down).
  if (!pp.lockCheckDone) {
    pp.lockCheckDone = true;
    const def = getDef(state, pp.definitionId);
    if (def.supertype === 'Information' && def.nuggetId && state.npcGuardsStanding === 0) {
      const idx = state.npcCoreShields.findIndex((s) => !s.broken && s.keyNuggetIds.includes(def.nuggetId as string));
      if (idx !== -1) {
        breakNpcCoreShield(state, idx, 0);
        return; // suspends on Reveal Pending; completion resumes after ACK
      }
    }
    return;
  }

  // §6.3 step 5 / §6.6 step 4 — move the card to its destination. Runs on
  // every path, including resumption after a Reveal (Brief §7 trap 2).
  if (!pp.moved) {
    pp.moved = true;
    const side = pp.controller;
    const card: CardInstance = { instanceId: pp.cardInstanceId, definitionId: pp.definitionId, owner: side };
    const printed = getDef(state, pp.definitionId);
    // Assemble results are virtual: their components discard instead (§11).
    const components = pp.components;
    switch (pp.destination) {
      case 'discard':
        if (components && components.length > 0) state[side].discard.push(...components);
        else state[side].discard.push(card);
        break;
      case 'deck':
        state[side].deck = shuffleInState(state, [
          ...state[side].deck,
          ...(components && components.length > 0 ? components : [card]),
        ]);
        break;
      case 'field-impression':
        addPermanent(state, 'impression', printed.id, side, {
          permanentId: pp.reservedPermanentId,
          cardInstanceId: card.instanceId,
          rapportPrediction: pp.chosenNumber ?? undefined,
        });
        break;
      case 'field-trap':
        addPermanent(state, 'trap', printed.id, side, {
          permanentId: pp.reservedPermanentId,
          cardInstanceId: card.instanceId,
          rapportPrediction: pp.chosenNumber ?? undefined,
        });
        break;
      case 'removed':
        break;
    }
    return;
  }

  // §6.3 step 6 / §6.6 step 5 — CARD_RESOLVED + trigger resolution.
  if (!pp.resolvedDispatched) {
    pp.resolvedDispatched = true;
    const def = getDef(state, pp.definitionId);
    dispatchEvent(
      state,
      { type: 'CARD_RESOLVED', controller: pp.controller, cardInstanceId: pp.cardInstanceId, cardDefId: def.id, cardCost: def.cost },
      0,
    );
    return;
  }

  // §6.6 step 5 — threshold checks (v1.4 §3.10).
  if (!pp.thresholdsDone) {
    pp.thresholdsDone = true;
    runThresholdChecks(state, pp.controller, 0);
    return;
  }
}

/** True when the in-flight play (if any) has fully completed. */
export function playFullyResolved(state: CombatState): boolean {
  const pp = state.pendingPlay;
  if (!pp) return true;
  return (
    pp.lockCheckDone &&
    pp.moved &&
    pp.resolvedDispatched &&
    pp.thresholdsDone &&
    state.effectStack.length === 0 &&
    !state.pendingBlock
  );
}

export function finishPlayIfDone(state: CombatState): void {
  if (state.pendingPlay && playFullyResolved(state)) {
    state.pendingPlay = null;
  }
}

// ── NPC staging (v1.4 §6.6 / §3.6) ──────────────────────────────────────────

/**
 * Stage an NPC hand card: CARD_STAGED fires before any cost or effect —
 * cancel traps live in this window. Returns true if the card survived.
 */
export function stageNpcCard(state: CombatState, handIndex: number): boolean {
  const card = state.npc.hand[handIndex];
  if (!card) throw new Error('No such NPC hand card');
  state.npc.hand.splice(handIndex, 1);
  state.stagedCard = card;
  state.stagedCancelled = false;
  const def = getDef(state, card.definitionId);
  log(state, 'staged', `NPC stages ${def.name}`, { definitionId: card.definitionId });

  dispatchEvent(
    state,
    { type: 'CARD_STAGED', controller: 'npc', cardInstanceId: card.instanceId, cardDefId: def.id, cardCost: def.cost },
    0,
  );
  runStack(state);

  if (state.pendingBlock) return true; // caller re-enters after unblock (rare: trap with CHOOSE_NUMBER)

  if (state.stagedCancelled) {
    // Cancelled: to NPC discard exactly once; resolution never begins (§6.7.5).
    state.npc.discard.push(card);
    state.stagedCard = null;
    state.stagedCancelled = false;
    log(state, 'cancelled', `${def.name} was cancelled — its resolution never begins`);
    return false;
  }
  return true;
}

/** NPC can act: positive Priority, non-empty hand, play caps not reached (§4.4/§10). */
export function npcCanAct(state: CombatState): boolean {
  return state.npc.priority >= 1 && state.npc.hand.length > 0 && !maxPlaysReached(state, 'npc');
}
