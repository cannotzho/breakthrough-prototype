import {
  CombatState, CardEffect, CardInstance, FieldTrap,
  TrapTriggerCondition, TrapTriggerType, MAX_TRIGGER_DEPTH,
} from './types';

export function clampPriority(value: number): number {
  return Math.max(-10, Math.min(10, value));
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeInstance(definition: CardInstance['definition']): CardInstance {
  return { instanceId: crypto.randomUUID(), definition };
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

export function priorityRestore(state: CombatState): CombatState {
  if (state.config.priorityMode !== 'frame') return state;
  const restored = { ...state, priority: clampPriority(state.config.defaultRestorePriority) };
  const withBotM = restored.backOfMind.length > 0
    ? { ...restored, playerHand: [...restored.playerHand, ...restored.backOfMind], backOfMind: [] as typeof restored.backOfMind }
    : restored;
  const toDraw = Math.max(0, withBotM.combatConfig.handLimit - withBotM.playerHand.length);
  let s = drawCards(withBotM, toDraw);
  s = expireTraps(s);
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

export function applyEffect(state: CombatState, effect: CardEffect): CombatState {
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
    }
    case 'BREAK_PLAYER_SHIELD': {
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
    case 'PLACE_AS_SHIELD':
      return { ...state, pendingPlaceAsShield: true };
    case 'PLACE_IMPRESSION':
      return state;
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
      s = applyEffect(s, effect);
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
      s = applyEffect(s, effect);
      if (s.pendingReveal) break;
    }
    s = resolveFieldTriggerCheck(s);
    s = { ...s, triggerDepth: s.triggerDepth - 1 };
  }

  return s;
}

function addLog(state: CombatState, msg: string): CombatState {
  return { ...state, actionLog: [...state.actionLog.slice(-49), msg] };
}
