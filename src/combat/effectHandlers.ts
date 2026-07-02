import {
  CombatState, CardEffect, CardInstance, CardOwner, CardDefinition, FieldTrap,
  TrapTriggerCondition, TrapTriggerType, GameEvent, MAX_TRIGGER_DEPTH, ActiveRestriction, ActiveReplacement, EffectCondition, EffectScaleSource,
} from './types';

export function clampPriority(value: number): number {
  return Math.max(-10, Math.min(10, value));
}

const TURN_HANDOFF_BONUS = 3;

export function applyTurnHandoffBonus(priority: number, receivingSide: 'player' | 'npc'): number {
  return receivingSide === 'npc'
    ? priority - TURN_HANDOFF_BONUS
    : priority + TURN_HANDOFF_BONUS;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeInstance(definition: CardInstance['definition'], owner: CardOwner = 'player'): CardInstance {
  return { instanceId: crypto.randomUUID(), definition, owner, controller: owner };
}

export function drawCards(state: CombatState, count: number): CombatState {
  let deck = [...state.playerDeck];
  let discard = [...state.playerDiscard];
  let hand = [...state.playerHand];
  const log = [...state.actionLog];

  for (let i = 0; i < count; i++) {
    if (deck.length === 0) {
      if (discard.length === 0) break;
      deck = shuffle([...discard]);
      discard = [];
      log.push('Deck recycled.');
    }
    const [card, ...rest] = deck;
    deck = rest;
    hand = [...hand, card];
  }

  return { ...state, playerDeck: deck, playerDiscard: discard, playerHand: hand, actionLog: log };
}

export function tickRestrictions(state: CombatState): CombatState {
  const updatedR = state.activeRestrictions
    .map(r => ({ ...r, turnsRemaining: r.turnsRemaining - 1 }))
    .filter(r => r.turnsRemaining > 0);
  const expiredR = state.activeRestrictions.length - updatedR.length;

  const updatedRep = state.activeReplacements
    .map(r => ({ ...r, turnsRemaining: r.turnsRemaining - 1 }))
    .filter(r => r.turnsRemaining > 0);
  const expiredRep = state.activeReplacements.length - updatedRep.length;

  let s: CombatState = { ...state, activeRestrictions: updatedR, activeReplacements: updatedRep };
  const totalExpired = expiredR + expiredRep;
  if (totalExpired > 0) s = addLog(s, `${totalExpired} restriction/replacement(s) expired`);
  return s;
}

export function priorityRestore(state: CombatState): CombatState {
  if (state.config.priorityMode !== 'frame') return state;
  const restoredPriority = applyTurnHandoffBonus(state.priority, 'player');
  let s: CombatState = addLog({ ...state, priority: restoredPriority },
    `Priority restore (${state.priority} → ${restoredPriority})`);
  if (s.backOfMind.length > 0) {
    s = { ...s, playerHand: [...s.playerHand, ...s.backOfMind], backOfMind: [] as typeof s.backOfMind };
  }
  const toDraw = Math.max(0, s.combatConfig.handLimit - s.playerHand.length);
  s = drawCards(s, toDraw);
  s = applyEffect(s, { type: 'RAPPORT_SHIELD_BREAK' }, 'player');
  // Turn-based expiry (traps, restrictions) must tick only on a genuine
  // opponent→player handoff — i.e. when the opponent actually took a turn.
  // priorityRestore is ALSO invoked mid-player-turn whenever a player's own
  // MODIFY_PRIORITY effect crosses priority 0 upward (cost is deducted first,
  // dropping priority to ≤0, then the effect pushes it back >0). Ticking expiry
  // there would prematurely burn down traps the player just placed, making them
  // "not persist". Gate on whether the opponent played a card this turn.
  if (state.npcCardsPlayedThisTurn > 0) {
    s = expireTraps(s);
    s = expireImpressions(s);
    s = tickRestrictions(s);
    s = {
      ...s,
      playerCardsPlayedThisTurn: 0,
      playerShieldsBrokenPrevTurn: s.playerShieldsBrokenThisTurn,
      playerShieldsBrokenThisTurn: 0,
      npcShieldsBrokenThisTurn: 0,
      abilitiesFiredThisPlay: [],
      turnAbilityFireCounts: {},
    };
  }
  s = { ...s, npcCardsPlayedThisTurn: 0 };
  return s;
}

export function classicTurnStart(state: CombatState): CombatState {
  let s: CombatState = {
    ...state,
    activeTurn: 'player',
    priority: state.config.startingPriority,
    npcPriority: 0,
  };
  if (s.stagedEnemyCard) {
    s = addLog(
      { ...s, enemyDiscard: [...s.enemyDiscard, s.stagedEnemyCard], stagedEnemyCard: null },
      'Staged enemy card cancelled → NPC discard (Classic turn start)'
    );
  }
  if (s.backOfMind.length > 0) {
    s = { ...s, playerHand: [...s.playerHand, ...s.backOfMind], backOfMind: [] };
  }
  const toDraw = Math.max(0, s.combatConfig.handLimit - s.playerHand.length);
  s = drawCards(s, toDraw);
  s = applyEffect(s, { type: 'RAPPORT_SHIELD_BREAK' }, 'player');
  s = expireTraps(s);
  s = expireImpressions(s);
  s = tickRestrictions(s);
  s = {
    ...s,
    npcCardsPlayedThisTurn: 0,
    playerCardsPlayedThisTurn: 0,
    playerShieldsBrokenPrevTurn: s.playerShieldsBrokenThisTurn,
    playerShieldsBrokenThisTurn: 0,
    npcShieldsBrokenThisTurn: 0,
    abilitiesFiredThisPlay: [],
    turnAbilityFireCounts: {},
  };
  return addLog(s, 'Classic Turn Start — player\'s turn begins');
}

export function npcTurnStart(state: CombatState): CombatState {
  const s: CombatState = {
    ...state,
    activeTurn: 'npc',
    priority: 0,
    npcPriority: state.config.startingPriority,
  };
  return addLog(s, 'NPC Turn Start — opponent\'s turn begins');
}

export function expireTraps(state: CombatState): CombatState {
  if (state.fieldTraps.length === 0) return state;
  const surviving: FieldTrap[] = [];
  const expiredCards: CardInstance[] = [];
  const log = [...state.actionLog];
  for (const t of state.fieldTraps) {
    const remaining = (t.turnsRemaining ?? 1) - 1;
    if (remaining <= 0) {
      expiredCards.push(t.card);
      log.push(`Trap expired: ${t.card.definition.name}`);
    } else {
      surviving.push({ ...t, turnsRemaining: remaining });
    }
  }
  return {
    ...state,
    fieldTraps: surviving,
    playerDiscard: [...state.playerDiscard, ...expiredCards],
    actionLog: log,
  };
}

export function expireImpressions(state: CombatState): CombatState {
  if (state.fieldImpressions.length === 0) return state;
  const surviving: typeof state.fieldImpressions = [];
  const log = [...state.actionLog];
  let s = state;
  for (const fi of state.fieldImpressions) {
    if (fi.turnsRemaining == null) {
      surviving.push(fi);
      continue;
    }
    const remaining = fi.turnsRemaining - 1;
    if (remaining <= 0) {
      if (fi.returnToDeck) {
        s = { ...s, playerDeck: shuffle([...s.playerDeck, fi.card]) };
        log.push(`Impression returned to deck: ${fi.card.definition.name}`);
      } else {
        s = { ...s, playerDiscard: [...s.playerDiscard, fi.card] };
        log.push(`Impression expired: ${fi.card.definition.name}`);
      }
      if (fi.card.definition.leavesTriggerEffects) {
        for (const eff of fi.card.definition.leavesTriggerEffects) {
          s = applyEffect(s, eff, fi.card.controller, fi.card);
        }
      }
    } else {
      surviving.push({ ...fi, turnsRemaining: remaining });
    }
  }
  return { ...s, fieldImpressions: surviving, actionLog: log };
}

export function checkDestroyBelowPatience(state: CombatState): CombatState {
  if (state.fieldImpressions.length === 0) return state;
  const surviving: typeof state.fieldImpressions = [];
  let s = state;
  for (const fi of state.fieldImpressions) {
    if (fi.destroyBelowPatience != null && s.patience < fi.destroyBelowPatience) {
      s = addLog(s, `${fi.card.definition.name} destroyed (patience ${s.patience} < ${fi.destroyBelowPatience})`);
      s = { ...s, playerDiscard: [...s.playerDiscard, fi.card] };
      if (fi.card.definition.leavesTriggerEffects) {
        for (const eff of fi.card.definition.leavesTriggerEffects) {
          s = applyEffect(s, eff, fi.card.controller, fi.card);
        }
      }
    } else {
      surviving.push(fi);
    }
  }
  return { ...s, fieldImpressions: surviving };
}

// ─── Token lifecycle ─────────────────────────────────────────
// removeTokenRaw: removes a token WITHOUT firing leave triggers or events.
// Used by transform effects to avoid triggering "leaves the battlefield."
export function removeTokenRaw(state: CombatState, instanceId: string): CombatState {
  const token = state.fieldTokens.find(t => t.instanceId === instanceId);
  if (!token) return state;
  return {
    ...state,
    fieldTokens: state.fieldTokens.filter(t => t.instanceId !== instanceId),
  };
}

// destroyToken: removes a token AND fires its leave triggers + dispatches
// TOKEN_DESTROYED to passive listeners. All voluntary/forced token removal
// paths should route through this (except transform — use removeTokenRaw).
export function destroyToken(state: CombatState, instanceId: string): CombatState {
  const token = state.fieldTokens.find(t => t.instanceId === instanceId);
  if (!token) return state;

  let s: CombatState = {
    ...state,
    fieldTokens: state.fieldTokens.filter(t => t.instanceId !== instanceId),
  };
  s = addLog(s, `Token destroyed: ${token.definition.name}`);

  const leaveEffects = token.definition.leavesTriggerEffects;
  if (leaveEffects && leaveEffects.length > 0) {
    if (s.triggerDepth < MAX_TRIGGER_DEPTH) {
      s = { ...s, triggerDepth: s.triggerDepth + 1 };
      s = addLog(s, `${token.definition.name} leaves the battlefield`);
      for (let i = 0; i < leaveEffects.length; i++) {
        s = applyEffect(s, leaveEffects[i], token.controller, token);
        if (s.pendingReveal) {
          const remaining = leaveEffects.slice(i + 1);
          if (remaining.length > 0) {
            s = {
              ...s,
              pendingEffects: [...remaining, ...s.pendingEffects],
              pendingEffectCard: s.pendingEffectCard ?? token,
            };
          }
          s = { ...s, triggerDepth: s.triggerDepth - 1 };
          s = dispatchGameEvent(s, { type: 'TOKEN_DESTROYED', sourceCard: token });
          return s;
        }
      }
      s = { ...s, triggerDepth: s.triggerDepth - 1 };
    } else {
      s = addLog(s, `[ERROR] Trigger depth cap — skipping ${token.definition.name} leave trigger`);
    }
  }

  s = dispatchGameEvent(s, { type: 'TOKEN_DESTROYED', sourceCard: token });
  return s;
}

// dispatchGameEvent: scans field impressions and tokens for triggered abilities
// matching the event, then resolves their effects. Uses triggerDepth for
// recursion protection.
// If pendingReveal is already set when an ability would fire, its effects are
// queued in pendingEffects instead so the reveal isn't overwritten.
export function dispatchGameEvent(state: CombatState, event: GameEvent): CombatState {
  let s = state;
  const fieldCards = [...s.fieldImpressions.map(fi => fi.card), ...s.fieldTokens];

  for (const card of fieldCards) {
    const abilities = card.definition.triggeredAbilities;
    if (!abilities || abilities.length === 0) continue;

    for (const ability of abilities) {
      if (ability.trigger !== event.type) continue;

      // Filter by which side triggered the event (fixed: use ability.controllerFilter not card.controller)
      if (ability.controllerFilter && event.sourceCard) {
        if (event.sourceCard.controller !== ability.controllerFilter) continue;
      }

      // maxTimesPerPlay gate
      if (ability.maxTimesPerPlay != null) {
        if (s.abilitiesFiredThisPlay.includes(ability.id)) continue;
        s = { ...s, abilitiesFiredThisPlay: [...s.abilitiesFiredThisPlay, ability.id] };
      }

      // maxTimesPerTurn gate
      if (ability.maxTimesPerTurn != null) {
        const fired = s.turnAbilityFireCounts[ability.id] ?? 0;
        if (fired >= ability.maxTimesPerTurn) continue;
        s = { ...s, turnAbilityFireCounts: { ...s.turnAbilityFireCounts, [ability.id]: fired + 1 } };
      }

      if (s.triggerDepth >= MAX_TRIGGER_DEPTH) {
        s = addLog(s, `[ERROR] Trigger depth cap — skipping ${card.definition.name} trigger`);
        break;
      }

      s = addLog(s, `${card.definition.name} triggered: ${ability.id}`);

      // If pendingReveal is already set, queue the ability's effects rather than
      // executing immediately — prevents overwriting the current shield reveal.
      if (s.pendingReveal) {
        s = {
          ...s,
          pendingEffects: [...ability.effects, ...s.pendingEffects],
          pendingEffectCard: s.pendingEffectCard ?? card,
        };
        continue;
      }

      s = { ...s, triggerDepth: s.triggerDepth + 1 };
      for (const effect of ability.effects) {
        s = applyEffect(s, effect, card.controller, card);
      }
      s = { ...s, triggerDepth: s.triggerDepth - 1 };
    }
  }

  return s;
}

function getNextOpponentShieldIdx(state: CombatState): number {
  const order = state.config.shieldBreakOrder;
  if (order && order.length > 0) {
    for (const idx of order) {
      if (state.opponentShields[idx] && !state.opponentShields[idx].broken) {
        return idx;
      }
    }
  }
  return state.opponentShields.findIndex(s => s && !s.broken);
}

function getLeftmostPlayerShieldIdx(state: CombatState): number {
  return state.playerShields.findIndex(s => s !== null);
}

export interface ShieldBreakResult {
  state: CombatState;
  hadShieldTrigger: boolean;
  triggerCard: CardInstance | null;
  breakOrder: number;
}

let shieldBreakCounter = 0;

export function breakPlayerShieldAutomatic(state: CombatState): ShieldBreakResult {
  const noBreak: ShieldBreakResult = { state, hadShieldTrigger: false, triggerCard: null, breakOrder: 0 };

  if (state.config.unbreakablePlayerShields) return noBreak;
  const idx = getLeftmostPlayerShieldIdx(state);
  if (idx === -1) return noBreak;

  const shield = state.playerShields[idx]!;
  const card = shield.card;
  const hasSafety = card.definition.keywords.includes('Safety');
  const hasShieldTrigger = card.definition.keywords.includes('Shield Trigger');

  let patienceCost: number;
  if (shield.shieldType === 'core') {
    patienceCost = shield.patienceCostOnBreak;
  } else {
    patienceCost = hasSafety ? 0 : 1;
  }

  const newShields = state.playerShields.map((s, i) => i === idx ? null : s);
  const breakOrder = shieldBreakCounter++;

  let s: CombatState = {
    ...state,
    playerShields: newShields,
    patience: state.patience - patienceCost,
    playerDiscard: shield.shieldType === 'dummy'
      ? state.playerDiscard
      : [...state.playerDiscard, card],
  };

  const breakType = shield.shieldType === 'core' ? 'Core' : 'Dummy';
  if (hasSafety && shield.shieldType === 'dummy') {
    s = addLog(s, `${card.definition.name} (${breakType}) broken (Safety) — 0 Patience`);
  } else {
    s = addLog(s, `${card.definition.name} (${breakType}) broken — ${patienceCost} Patience`);
  }

  return {
    state: s,
    hadShieldTrigger: hasShieldTrigger,
    triggerCard: hasShieldTrigger ? card : null,
    breakOrder,
  };
}

function getScaleValue(state: CombatState, source: EffectScaleSource): number {
  switch (source) {
    case 'PLAYER_CARDS_PLAYED_THIS_TURN': return state.playerCardsPlayedThisTurn;
    case 'CURRENT_PRIORITY': return state.priority;
    case 'PLAYER_SHIELDS_BROKEN_PREV_TURN': return state.playerShieldsBrokenPrevTurn;
    case 'OPPONENT_MISSING_PATIENCE': return Math.max(0, state.config.opponentPatience - state.patience);
    case 'CHOSEN_NUMBER': return state.chosenNumber ?? 0;
    case 'NPC_DECK_MATCHING_COST_COUNT': {
      const chosen = state.chosenNumber ?? 0;
      return state.enemyDeck.filter(c => c.definition.cost === chosen).length;
    }
  }
}

function checkCondition(state: CombatState, condition: EffectCondition): boolean {
  switch (condition.type) {
    case 'NPC_CARDS_PLAYED_GTE':
      return state.npcCardsPlayedThisTurn >= (condition.value ?? 1);
    case 'FIELD_TOKEN_COUNT_GTE':
      return state.fieldTokens.length >= (condition.value ?? 1);
    case 'HAS_FIELD_IMPRESSION':
      return state.fieldImpressions.length > 0;
    case 'PATIENCE_LT':
      return state.patience < (condition.value ?? 0);
    case 'PATIENCE_GTE':
      return state.patience >= (condition.value ?? 0);
    case 'NPC_DECK_COST_MATCH_GTE': {
      const chosen = state.chosenNumber ?? 0;
      const matchCount = state.enemyDeck.filter(c => c.definition.cost === chosen).length;
      return matchCount >= (condition.value ?? 1);
    }
    case 'NPC_DECK_COST_MATCH_LT': {
      const chosen = state.chosenNumber ?? 0;
      const matchCount = state.enemyDeck.filter(c => c.definition.cost === chosen).length;
      return matchCount < (condition.value ?? 1);
    }
    case 'NPC_SHIELDS_BROKEN_GTE':
      return state.npcShieldsBrokenThisTurn >= (condition.value ?? 1);
    default:
      return true;
  }
}

export function applyEffect(state: CombatState, effectRaw: CardEffect, controller: CardOwner = 'player', sourceCard?: CardInstance): CombatState {
  if (effectRaw.condition && !checkCondition(state, effectRaw.condition)) {
    return addLog(state, `Condition not met: ${effectRaw.condition.type} (skipped ${effectRaw.type})`);
  }
  const effect = (effectRaw.altCondition && effectRaw.altValue !== undefined && checkCondition(state, effectRaw.altCondition))
    ? { ...effectRaw, value: effectRaw.altValue }
    : effectRaw;
  switch (effect.type) {
    case 'MODIFY_PRIORITY': {
      const priorityDelta = effect.scale
        ? (effect.value ?? 1) * getScaleValue(state, effect.scale)
        : (effect.value ?? 0);
      if (state.config.priorityMode === 'frame') {
        const oldPriority = state.priority;
        const newPriority = clampPriority(state.priority + priorityDelta);
        let s: CombatState = { ...state, priority: newPriority };
        if (oldPriority <= 0 && newPriority > 0) {
          s = priorityRestore(s);
        }
        return s;
      } else {
        // Classic mode: modify the player's priority meter; does NOT flip activeTurn
        return { ...state, priority: Math.max(0, state.priority + priorityDelta) };
      }
    }
    case 'MODIFY_PATIENCE': {
      let delta = effect.scale
        ? (effect.value ?? 1) * getScaleValue(state, effect.scale)
        : (effect.value ?? 0);
      if (delta > 0 && state.activeRestrictions.some(r => r.restrictionType === 'PREVENT_PATIENCE_GAIN')) {
        return addLog(state, `Patience gain blocked by active restriction (PREVENT_PATIENCE_GAIN)`);
      }
      let s = state;
      if (delta < 0) {
        const sensitiveTrait = s.config.traits.find(
          t => t.id === 'sensitive' || t.name.toLowerCase() === 'sensitive'
        );
        if (sensitiveTrait) {
          delta -= 1;
          if (!sensitiveTrait.discovered) {
            const updatedTraits = s.config.traits.map(t =>
              t === sensitiveTrait ? { ...t, discovered: true } : t
            );
            s = { ...s, config: { ...s.config, traits: updatedTraits } };
          }
        }
      }
      return checkDestroyBelowPatience({ ...s, patience: s.patience + delta });
    }
    case 'DRAW_CARDS': {
      const drawBlocked = state.activeRestrictions.some(
        r => r.restrictionType === 'PREVENT_DRAW' && r.target === controller
      );
      if (drawBlocked) return addLog(state, `Draw prevented by active restriction`);
      const count = effect.value ?? 1;
      return drawCards(state, count);
    }
    case 'INCREMENT_LIE_COUNTER':
      return { ...state, lieCounter: state.lieCounter + 1 };
    case 'BREAK_OPPONENT_SHIELD': {
      const blocked = state.activeRestrictions.some(
        r => r.restrictionType === 'PREVENT_SHIELD_BREAK' && r.target === controller
      );
      if (blocked) return addLog(state, `Shield break prevented by active restriction`);
      const targetSide = controller === 'player' ? 'npc' : 'player';
      if (targetSide === 'npc') {
        const idx = getNextOpponentShieldIdx(state);
        if (idx === -1) return state;
        const newShields = state.opponentShields.map((s, i) =>
          i === idx ? { ...s, broken: true } : s
        );
        let s: CombatState = {
          ...state,
          opponentShields: newShields,
          pendingReveal: newShields[idx],
          playerShieldsBrokenThisTurn: state.playerShieldsBrokenThisTurn + 1,
          npcShieldsBrokenThisTurn: state.npcShieldsBrokenThisTurn + 1,
        };
        s = dispatchGameEvent(s, { type: 'SHIELD_BROKEN', sourceCard });
        return s;
      } else {
        const genuineEnjoyment = state.fieldImpressions.find(
          fi => fi.card.definition.id === 'green_genuine_enjoyment'
        );
        if (genuineEnjoyment) {
          const cost = 5;
          let s = checkDestroyBelowPatience({ ...state, patience: state.patience - cost });
          return addLog(s, `Shield break replaced by Genuine Enjoyment: lost ${cost} Patience instead`);
        }
        const result = breakPlayerShieldAutomatic(state);
        let s = result.state;
        if (result.hadShieldTrigger && result.triggerCard) {
          s = {
            ...s,
            pendingShieldTriggers: [
              ...s.pendingShieldTriggers,
              { card: result.triggerCard, breakOrder: result.breakOrder },
            ],
          };
        }
        return s;
      }
    }
    case 'BREAK_OPPONENT_SHIELDS_SCALED': {
      const n = effect.scale ? getScaleValue(state, effect.scale) : (effect.value ?? 0);
      if (n <= 0) return addLog(state, `${effect.scale ?? 'scale'}: 0 — no shields to break`);
      let s = state;
      for (let i = 0; i < n; i++) {
        const prevReveal = s.pendingReveal;
        s = applyEffect(s, { type: 'BREAK_OPPONENT_SHIELD' }, controller, sourceCard);
        if (s.pendingReveal !== prevReveal) {
          const remaining = n - 1 - i;
          if (remaining > 0) {
            s = {
              ...s,
              pendingEffects: [
                ...Array(remaining).fill({ type: 'BREAK_OPPONENT_SHIELD' }),
                ...s.pendingEffects,
              ],
              pendingEffectCard: s.pendingEffectCard ?? sourceCard ?? null,
            };
          }
          return s;
        }
      }
      return s;
    }
    case 'PLACE_AS_SHIELD':
      return { ...state, pendingPlaceAsShield: true };
    case 'PLACE_IMPRESSION':
      return state;
    case 'CREATE_TOKEN': {
      let tokenId = effect.tokenDefinitionId;
      const replacement = state.activeReplacements.find(r => r.originalTokenId === tokenId);
      if (replacement) {
        tokenId = replacement.replacementTokenId;
      }
      const tokenDef = tokenId ? state.tokenRegistry[tokenId] : undefined;
      if (!tokenDef) {
        return addLog(state, `[ERROR] CREATE_TOKEN: no token definition found for "${tokenId}"`);
      }
      if (replacement) {
        state = addLog(state, `Replacement: ${effect.tokenDefinitionId} → ${tokenDef.name}`);
      }
      const count = effect.value ?? 1;
      const newTokens: CardInstance[] = [];
      for (let i = 0; i < count; i++) {
        newTokens.push(makeInstance(tokenDef, controller));
      }
      let s = addLog(
        { ...state, fieldTokens: [...state.fieldTokens, ...newTokens] },
        `Created ${count}× ${tokenDef.name} token${count > 1 ? 's' : ''} on the field`
      );
      for (const token of newTokens) {
        s = dispatchGameEvent(s, { type: 'TOKEN_CREATED', sourceCard: token });
      }
      return s;
    }
    case 'DESTROY_SELF': {
      if (!sourceCard) return addLog(state, '[ERROR] DESTROY_SELF: no source card');
      if (state.fieldTokens.some(t => t.instanceId === sourceCard.instanceId)) {
        return destroyToken(state, sourceCard.instanceId);
      }
      if (state.fieldImpressions.some(fi => fi.card.instanceId === sourceCard.instanceId)) {
        let s: CombatState = {
          ...state,
          fieldImpressions: state.fieldImpressions.filter(fi => fi.card.instanceId !== sourceCard.instanceId),
          playerDiscard: [...state.playerDiscard, sourceCard],
        };
        return addLog(s, `${sourceCard.definition.name} destroyed itself`);
      }
      return addLog(state, `[ERROR] DESTROY_SELF: ${sourceCard.definition.name} not on field`);
    }
    case 'TRANSFORM_TOKEN': {
      const { transformSourceId, transformTargetId, transformAll, transformUpTo } = effect;
      if (!transformSourceId || !transformTargetId) {
        return addLog(state, '[ERROR] TRANSFORM_TOKEN: missing source or target definition ID');
      }
      const targetDef = state.tokenRegistry[transformTargetId];
      if (!targetDef) {
        return addLog(state, `[ERROR] TRANSFORM_TOKEN: no token definition for "${transformTargetId}"`);
      }

      const candidates = state.fieldTokens.filter(
        t => t.definition.id === transformSourceId && t.controller === controller
      );
      if (candidates.length === 0) {
        return addLog(state, `TRANSFORM_TOKEN: no ${transformSourceId} tokens to transform`);
      }

      const maxCount = transformAll ? candidates.length : (effect.value ?? 1);
      const count = transformUpTo
        ? Math.min(maxCount, candidates.length)
        : Math.min(maxCount, candidates.length);
      const toTransform = candidates.slice(0, count);
      const toTransformIds = new Set(toTransform.map(t => t.instanceId));

      const newTokens: CardInstance[] = toTransform.map(
        () => makeInstance(targetDef, controller)
      );

      let replaceIdx = 0;
      const updatedTokens = state.fieldTokens.map(t => {
        if (toTransformIds.has(t.instanceId)) {
          return newTokens[replaceIdx++];
        }
        return t;
      });

      let s: CombatState = {
        ...state,
        fieldTokens: updatedTokens,
      };
      s = addLog(s, `Transformed ${toTransform.length}× ${transformSourceId} → ${targetDef.name}`);

      for (const token of newTokens) {
        s = dispatchGameEvent(s, { type: 'TOKEN_CREATED', sourceCard: token });
      }
      return s;
    }
    case 'APPLY_RESTRICTION': {
      const { restrictionType, restrictionTarget, restrictionDuration } = effect;
      if (!restrictionType) return addLog(state, '[ERROR] APPLY_RESTRICTION: missing restrictionType');
      const target = restrictionTarget ?? (controller === 'player' ? 'npc' : 'player');
      const restriction: ActiveRestriction = {
        id: crypto.randomUUID(),
        restrictionType,
        target,
        value: effect.value,
        turnsRemaining: restrictionDuration ?? 1,
      };
      return addLog(
        { ...state, activeRestrictions: [...state.activeRestrictions, restriction] },
        `Restriction applied: ${restrictionType} on ${target} (${restriction.turnsRemaining} turn${restriction.turnsRemaining !== 1 ? 's' : ''})`
      );
    }
    case 'DESTROY_IMPRESSION': {
      const impressions = state.fieldImpressions.filter(fi => fi.card.controller === controller);
      if (impressions.length === 0) return addLog(state, `No impressions to destroy`);
      const target = impressions[0];
      return addLog(
        { ...state, fieldImpressions: state.fieldImpressions.filter(fi => fi.card.instanceId !== target.card.instanceId) },
        `Destroyed impression: ${target.card.definition.name}`
      );
    }
    case 'APPLY_REPLACEMENT': {
      const { replacementOriginalId, replacementTargetId, restrictionDuration } = effect;
      if (!replacementOriginalId || !replacementTargetId) {
        return addLog(state, '[ERROR] APPLY_REPLACEMENT: missing originalId or targetId');
      }
      const rep: ActiveReplacement = {
        id: crypto.randomUUID(),
        originalTokenId: replacementOriginalId,
        replacementTokenId: replacementTargetId,
        turnsRemaining: restrictionDuration ?? 1,
      };
      return addLog(
        { ...state, activeReplacements: [...state.activeReplacements, rep] },
        `Replacement active: ${replacementOriginalId} → ${replacementTargetId} (${rep.turnsRemaining} turn${rep.turnsRemaining !== 1 ? 's' : ''})`
      );
    }
    case 'CHOOSE_NUMBER': {
      const min = effect.value ?? 1;
      const max = effect.altValue ?? 10;
      return { ...state, pendingNumberChoice: { min, max } };
    }
    case 'REVEAL_NPC_HAND':
      return { ...state, npcHandRevealed: true };
    case 'HIDE_NPC_HAND':
      return { ...state, npcHandRevealed: false };
    case 'REVEAL_NPC_DECK_TOP': {
      const count = effect.value ?? 1;
      const revealed = state.enemyDeck.slice(0, count);
      if (revealed.length === 0) return addLog(state, 'NPC deck is empty — nothing to reveal');
      return { ...state, pendingDeckReveal: revealed, npcDeckTopRevealed: true };
    }
    case 'HIDE_NPC_DECK_TOP':
      return { ...state, npcDeckTopRevealed: false };
    case 'REVEAL_OPPONENT_DECK_TOP': {
      const count = effect.value ?? 1;
      const revealed = state.enemyDeck.slice(0, count);
      if (revealed.length === 0) return addLog(state, 'NPC deck is empty — nothing to reveal');
      return { ...state, pendingDeckReveal: revealed };
    }
    case 'COPY_FROM_NPC_DECK': {
      const count = effect.copyCount ?? 1;
      const chosen = state.chosenNumber;
      let candidates = [...state.enemyDeck];
      if (chosen != null) {
        candidates = candidates.filter(c => c.definition.cost === chosen);
      }
      if (effect.copyFilter === 'HAS_SHIELD_BREAK') {
        candidates = candidates.filter(c =>
          c.definition.effects.some(e => e.type === 'BREAK_OPPONENT_SHIELD' || e.type === 'BREAK_OPPONENT_SHIELDS_SCALED')
        );
      }
      if (candidates.length === 0) return addLog(state, 'No matching NPC cards to copy');
      const copied = candidates.slice(0, count);
      const newCards = copied.map(c => {
        const inst = makeInstance(c.definition, 'player');
        const costOverride = c.definition.cost;
        return { ...inst, patienceCostOverride: costOverride };
      });
      let s = addLog(
        { ...state, playerHand: [...state.playerHand, ...newCards] },
        `Copied ${newCards.length} card(s) from NPC deck: ${newCards.map(c => c.definition.name).join(', ')}`
      );
      return applyEffect(s, { type: 'INCREMENT_RAPPORT_COUNTERS' }, controller, sourceCard);
    }
    case 'PLACE_DUMMY_SHIELDS': {
      const count = effect.value ?? 1;
      const dummyDef: CardDefinition = {
        id: 'dummy_shield', name: 'Dummy Shield', cost: 0, keywords: [],
        effects: [], color: 'Colorless', supertype: 'Skill', subtype: null,
      };
      const newShields = state.playerShields.map((slot, _i) => slot);
      let placed = 0;
      for (let i = 0; i < newShields.length && placed < count; i++) {
        if (newShields[i] === null) {
          newShields[i] = {
            card: makeInstance(dummyDef, 'player'),
            shieldType: 'dummy' as const,
            patienceCostOnBreak: 1,
          };
          placed++;
        }
      }
      if (placed === 0) return addLog(state, 'No empty shield slots available');
      return addLog(
        { ...state, playerShields: newShields, shieldsEverPlaced: state.shieldsEverPlaced + placed },
        `Placed ${placed} dummy shield(s)`
      );
    }
    case 'DESTROY_TOKENS': {
      const { targetDefinitionId, targetInstanceIds, destroyAll } = effect;

      let targets: CardInstance[];
      if (targetInstanceIds && targetInstanceIds.length > 0) {
        targets = state.fieldTokens.filter(t => targetInstanceIds.includes(t.instanceId));
      } else {
        const candidates = state.fieldTokens.filter(
          t => t.controller === controller &&
            (!targetDefinitionId || t.definition.id === targetDefinitionId)
        );
        const count = destroyAll ? candidates.length : Math.min(effect.value ?? 1, candidates.length);
        targets = candidates.slice(0, count);
      }

      if (targets.length === 0) {
        return addLog(state, `DESTROY_TOKENS: no matching tokens to destroy`);
      }

      let s = state;
      for (let i = 0; i < targets.length; i++) {
        s = destroyToken(s, targets[i].instanceId);
        if (s.pendingReveal) {
          const remainingIds = targets.slice(i + 1).map(t => t.instanceId);
          if (remainingIds.length > 0) {
            s = {
              ...s,
              pendingEffects: [
                { type: 'DESTROY_TOKENS', targetInstanceIds: remainingIds },
                ...s.pendingEffects,
              ],
              pendingEffectCard: s.pendingEffectCard ?? sourceCard ?? null,
            };
          }
          return s;
        }
      }
      s = addLog(s, `Destroyed ${targets.length} token(s)`);
      return s;
    }
    case 'CANCEL_STAGED_ENEMY_CARD': {
      if (!state.stagedEnemyCard) return addLog(state, 'No staged enemy card to cancel');
      const cancelled = state.stagedEnemyCard;
      return addLog(
        { ...state, stagedEnemyCard: null, enemyDiscard: [...state.enemyDiscard, cancelled] },
        `Cancelled NPC card: ${cancelled.definition.name}`
      );
    }
    case 'INCREMENT_RAPPORT_COUNTERS': {
      const updated = state.fieldImpressions.map(fi =>
        fi.card.definition.id === 'green_to_truly_know'
          ? { ...fi, counters: fi.counters + 1 }
          : fi
      );
      const changed = updated.some((fi, i) => fi !== state.fieldImpressions[i]);
      if (!changed) return state;
      return addLog({ ...state, fieldImpressions: updated },
        `Rapport success — To Truly Know counters incremented`);
    }
    case 'RAPPORT_SHIELD_BREAK': {
      const toTrulyKnow = state.fieldImpressions.find(fi => fi.card.definition.id === 'green_to_truly_know');
      if (!toTrulyKnow) return state;
      const c = toTrulyKnow.counters;
      if (c < 3) return state;
      let breakCount: number;
      if (c >= 10) {
        breakCount = state.opponentShields.filter(s => !s.broken).length;
      } else if (c >= 5) {
        breakCount = 5;
      } else {
        breakCount = 3;
      }
      let s = state;
      for (let i = 0; i < breakCount; i++) {
        s = applyEffect(s, { type: 'BREAK_OPPONENT_SHIELD' }, 'player');
        if (s.pendingReveal) break;
      }
      return s;
    }
    default:
      return state;
  }
}

export function selectEnemyCard(state: CombatState): CombatState {
  let deck = state.enemyDeck;
  let discard = state.enemyDiscard;
  const log = [...state.actionLog];

  if (deck.length === 0) {
    if (discard.length === 0) {
      if (state.config.priorityMode === 'frame') {
        const restored = priorityRestore(state);
        return { ...restored, phase: 'Check' };
      } else {
        return { ...state, npcPriority: 0, phase: 'Check', actionLog: [...log, 'NPC deck empty — NPC priority zeroed.'] };
      }
    }
    deck = shuffle([...discard]);
    discard = [];
    log.push('NPC deck recycled.');
  }

  const [card, ...rest] = deck;
  return { ...state, stagedEnemyCard: card, enemyDeck: rest, enemyDiscard: discard, actionLog: log, phase: 'FieldTriggerCheck' };
}

export function evaluateTrapCondition(
  condition: TrapTriggerCondition,
  event: TrapTriggerType,
  eventValue?: number
): boolean {
  if (condition.triggerType !== event) return false;
  if (condition.comparator == null || condition.value == null || eventValue == null) {
    return true;
  }
  switch (condition.comparator) {
    case 'eq': return eventValue === condition.value;
    case 'gt': return eventValue > condition.value;
    case 'lt': return eventValue < condition.value;
    case 'gte': return eventValue >= condition.value;
    case 'lte': return eventValue <= condition.value;
    default: return false;
  }
}

export function resolveFieldTriggerCheck(state: CombatState, event?: TrapTriggerType): CombatState {
  let s = state;

  if (s.triggerDepth >= MAX_TRIGGER_DEPTH) {
    return addLog(s, `[ERROR] Trigger depth cap (${MAX_TRIGGER_DEPTH}) reached — halting resolution`);
  }

  const triggeredTraps: FieldTrap[] = event
    ? s.fieldTraps.filter(trap => {
        if (!evaluateTrapCondition(trap.triggerCondition, event)) return false;
        if (trap.rapportNumber != null && s.stagedEnemyCard) {
          return s.stagedEnemyCard.definition.cost === trap.rapportNumber;
        }
        return true;
      })
    : [];

  const sortedTraps = [...triggeredTraps].sort((a, b) => a.playOrder - b.playOrder);

  for (const trap of sortedTraps) {
    if (s.triggerDepth >= MAX_TRIGGER_DEPTH) {
      s = addLog(s, `[ERROR] Trigger depth cap reached during trap resolution`);
      break;
    }

    const allSkipped = trap.card.definition.effects.every(e =>
      e.condition && !checkCondition(s, e.condition)
    );
    if (allSkipped) continue;

    s = addLog(s, `Trap triggered: ${trap.card.definition.name}`);
    s = { ...s, triggerDepth: s.triggerDepth + 1 };
    for (const effect of trap.card.definition.effects) {
      s = applyEffect(s, effect, trap.card.controller, trap.card);
    }
    if (trap.persistent) {
      // Persistent traps stay on the field. Temporarily hide this trap during the
      // recursive call so it can't fire again in the same resolution cycle.
      s = { ...s, fieldTraps: s.fieldTraps.filter(t => t !== trap) };
      s = resolveFieldTriggerCheck(s, event);
      s = { ...s, triggerDepth: s.triggerDepth - 1 };
      s = { ...s, fieldTraps: [...s.fieldTraps, trap] };
    } else {
      s = {
        ...s,
        fieldTraps: s.fieldTraps.filter(t => t !== trap),
        playerDiscard: [...s.playerDiscard, trap.card],
      };
      s = resolveFieldTriggerCheck(s, event);
      s = { ...s, triggerDepth: s.triggerDepth - 1 };
    }
  }

  const triggers = [...s.pendingShieldTriggers].sort((a, b) => a.breakOrder - b.breakOrder);
  s = { ...s, pendingShieldTriggers: [] };

  for (const trigger of triggers) {
    if (s.triggerDepth >= MAX_TRIGGER_DEPTH) {
      s = addLog(s, `[ERROR] Trigger depth cap reached during Shield Trigger resolution`);
      break;
    }
    s = addLog(s, `Shield Trigger: ${trigger.card.definition.name}`);
    s = { ...s, triggerDepth: s.triggerDepth + 1 };
    const shieldEffects = trigger.card.definition.shieldTriggerEffects ?? trigger.card.definition.effects;
    for (const effect of shieldEffects) {
      s = applyEffect(s, effect, trigger.card.controller, trigger.card);
      if (s.pendingReveal) break;
    }
    s = resolveFieldTriggerCheck(s, event);
    s = { ...s, triggerDepth: s.triggerDepth - 1 };
  }

  return s;
}

export function addLog(state: CombatState, msg: string): CombatState {
  return { ...state, actionLog: [...state.actionLog.slice(-49), msg] };
}
