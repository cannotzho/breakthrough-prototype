import { CombatState, CardEffect, CardInstance } from './types';

export function applyEffect(state: CombatState, effect: CardEffect): CombatState {
  switch (effect.type) {
    case 'MODIFY_PRIORITY':
      return { ...state, priority: state.priority + (effect.value ?? 0) };
    case 'MODIFY_PATIENCE':
      return { ...state, patience: state.patience + (effect.value ?? 0) };
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
      const hasShields = state.playerShields.some(s => s !== null);
      if (!hasShields || state.config.unbreakablePlayerShields) return state;
      return { ...state, pendingShieldChoiceSlotIdx: -1 };
    }
    case 'PLACE_AS_SHIELD':
      return { ...state, pendingPlaceAsShield: true };
    case 'PLACE_IMPRESSION':
      // Routing to field vs. discard is handled by the subtype check in PLAY_CARD,
      // not via this effect type. This is intentionally a no-op.
      return state;
    default:
      return state;
  }
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

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function priorityRestore(state: CombatState): CombatState {
  const restored = { ...state, priority: state.config.defaultRestorePriority };
  const withBotM = restored.backOfMind.length > 0
    ? { ...restored, playerHand: [...restored.playerHand, ...restored.backOfMind], backOfMind: [] as typeof restored.backOfMind }
    : restored;
  const toDraw = Math.max(0, withBotM.combatConfig.handLimit - withBotM.playerHand.length);
  return drawCards(withBotM, toDraw);
}

export function selectEnemyCard(state: CombatState): CombatState {
  if (state.enemyDeck.length === 0) {
    const restored = priorityRestore(state);
    return { ...restored, phase: 'Check' };
  }
  const [card, ...rest] = state.enemyDeck;
  return { ...state, stagedEnemyCard: card, enemyDeck: rest, phase: 'InterruptCheck' };
}

export function makeInstance(definition: CardInstance['definition']): CardInstance {
  return { instanceId: crypto.randomUUID(), definition };
}
