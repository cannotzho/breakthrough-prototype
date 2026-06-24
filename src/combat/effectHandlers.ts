import {
  CombatState, CardEffect, CardInstance, CardOwner, FieldTrap,
  TrapTriggerCondition, TrapTriggerType, GameEvent, MAX_TRIGGER_DEPTH, ActiveRestriction,
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
  const updated = state.activeRestrictions
    .map(r => ({ ...r, turnsRemaining: r.turnsRemaining - 1 }))
    .filter(r => r.turnsRemaining > 0);
  const expired = state.activeRestrictions.length - updated.length;
  let s: CombatState = { ...state, activeRestrictions: updated };
  if (expired > 0) s = addLog(s, `${expired} restriction(s) expired`);
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
  s = expireTraps(s);
  s = tickRestrictions(s);
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
  s = expireTraps(s);
  s = tickRestrictions(s);
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
  const expired = state.fieldTraps;
  const expiredCards = expired.map(t => t.card);
  const log = [...state.actionLog];
  for (const t of expired) {
    log.push(`Trap expired: ${t.card.definition.name}`);
  }
  return {
    ...state,
    fieldTraps: [],
    playerDiscard: [...state.playerDiscard, ...expiredCards],
    actionLog: log,
  };
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
export function dispatchGameEvent(state: CombatState, event: GameEvent): CombatState {
  let s = state;
  const fieldCards = [...s.fieldImpressions, ...s.fieldTokens];

  for (const card of fieldCards) {
    const abilities = card.definition.triggeredAbilities;
    if (!abilities || abilities.length === 0) continue;

    for (const ability of abilities) {
      if (ability.trigger !== event.type) continue;

      if (ability.controllerFilter && event.sourceCard) {
        if (event.sourceCard.controller !== card.controller) continue;
      }

      if (s.triggerDepth >= MAX_TRIGGER_DEPTH) {
        s = addLog(s, `[ERROR] Trigger depth cap — skipping ${card.definition.name} trigger`);
        break;
      }

      s = { ...s, triggerDepth: s.triggerDepth + 1 };
      s = addLog(s, `${card.definition.name} triggered: ${ability.id}`);
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
    playerDiscard: [...state.playerDiscard, card],
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

export function applyEffect(state: CombatState, effect: CardEffect, controller: CardOwner = 'player', sourceCard?: CardInstance): CombatState {
  switch (effect.type) {
    case 'MODIFY_PRIORITY': {
      if (state.config.priorityMode === 'frame') {
        const oldPriority = state.priority;
        const newPriority = clampPriority(state.priority + (effect.value ?? 0));
        let s: CombatState = { ...state, priority: newPriority };
        if (oldPriority <= 0 && newPriority > 0) {
          s = priorityRestore(s);
        }
        return s;
      } else {
        // Classic mode: modify the player's priority meter; does NOT flip activeTurn
        return { ...state, priority: Math.max(0, state.priority + (effect.value ?? 0)) };
      }
    }
    case 'MODIFY_PATIENCE': {
      let delta = effect.value ?? 0;
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
      return { ...s, patience: s.patience + delta };
    }
    case 'DRAW_CARDS': {
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
        return {
          ...state,
          opponentShields: newShields,
          pendingReveal: newShields[idx],
        };
      } else {
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
    case 'PLACE_AS_SHIELD':
      return { ...state, pendingPlaceAsShield: true };
    case 'PLACE_IMPRESSION':
      return state;
    case 'CREATE_TOKEN': {
      const tokenDef = effect.tokenDefinitionId
        ? state.tokenRegistry[effect.tokenDefinitionId]
        : undefined;
      if (!tokenDef) {
        return addLog(state, `[ERROR] CREATE_TOKEN: no token definition found for "${effect.tokenDefinitionId}"`);
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
      if (state.fieldImpressions.some(c => c.instanceId === sourceCard.instanceId)) {
        let s: CombatState = {
          ...state,
          fieldImpressions: state.fieldImpressions.filter(c => c.instanceId !== sourceCard.instanceId),
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

      let s = state;
      for (const token of toTransform) {
        s = removeTokenRaw(s, token.instanceId);
      }

      const newTokens: CardInstance[] = toTransform.map(
        () => makeInstance(targetDef, controller)
      );
      s = {
        ...s,
        fieldTokens: [...s.fieldTokens, ...newTokens],
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

export function resolveFieldTriggerCheck(state: CombatState): CombatState {
  let s = state;

  if (s.triggerDepth >= MAX_TRIGGER_DEPTH) {
    return addLog(s, `[ERROR] Trigger depth cap (${MAX_TRIGGER_DEPTH}) reached — halting resolution`);
  }

  const triggeredTraps: FieldTrap[] = s.fieldTraps.filter(trap =>
    evaluateTrapCondition(trap.triggerCondition, 'OPPONENT_PLAYS_CARD')
  );

  const sortedTraps = [...triggeredTraps].sort((a, b) => a.playOrder - b.playOrder);

  for (const trap of sortedTraps) {
    if (s.triggerDepth >= MAX_TRIGGER_DEPTH) {
      s = addLog(s, `[ERROR] Trigger depth cap reached during trap resolution`);
      break;
    }
    s = addLog(s, `Trap triggered: ${trap.card.definition.name}`);
    s = { ...s, triggerDepth: s.triggerDepth + 1 };
    for (const effect of trap.card.definition.effects) {
      s = applyEffect(s, effect, trap.card.controller, trap.card);
    }
    s = {
      ...s,
      fieldTraps: s.fieldTraps.filter(t => t !== trap),
      playerDiscard: [...s.playerDiscard, trap.card],
    };
    s = resolveFieldTriggerCheck(s);
    s = { ...s, triggerDepth: s.triggerDepth - 1 };
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
    for (const effect of trigger.card.definition.effects) {
      s = applyEffect(s, effect, trigger.card.controller, trigger.card);
      if (s.pendingReveal) break;
    }
    s = resolveFieldTriggerCheck(s);
    s = { ...s, triggerDepth: s.triggerDepth - 1 };
  }

  return s;
}

export function addLog(state: CombatState, msg: string): CombatState {
  return { ...state, actionLog: [...state.actionLog.slice(-49), msg] };
}
