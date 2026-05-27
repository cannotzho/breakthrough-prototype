import { useReducer, useEffect, useCallback } from 'react';
import type { CombatState, EncounterConfig } from './types';
import { CARDS } from '../data/cards';
import {
  shuffle,
  addLog,
  drawFromDeck,
  drawOneCardPair,
  drawOnePersonalCard,
  resolvePlayerEffect,
  resolveOpponentEffect,
} from './effects';

// ── Helpers ────────────────────────────────────────────────────────────────────

const clamp = (v: number) => Math.max(-10, Math.min(10, v));

function checkEndCondition(state: CombatState): CombatState {
  const playerIntact = state.playerShields.filter(s => !s.broken).length;
  const oppIntact = state.oppShields.filter(s => !s.broken).length;

  if (playerIntact === 0) {
    return addLog(
      { ...state, gameOver: true, winner: 'opponent' },
      'All your shields were broken — the conversation is over!',
    );
  }
  if (oppIntact === 0) {
    return addLog(
      { ...state, gameOver: true, winner: 'player' },
      "Opponent's shields all broken — you got the intel!",
    );
  }
  if (state.oppPatience <= 0) {
    return addLog(
      { ...state, gameOver: true, winner: 'opponent' },
      'Opponent lost patience — they shut you out.',
    );
  }
  return state;
}

/**
 * Recalculate the phase from priority. When entering defense, increment
 * opponentActionTrigger so the useEffect fires and schedules the opponent's move.
 */
function updatePhase(state: CombatState): CombatState {
  const phase: 'attack' | 'defense' = state.priority > 0 ? 'attack' : 'defense';
  if (phase === state.phase) return state; // no change

  let s = { ...state, phase };
  if (phase === 'defense' && !s.awaitingShieldChoice && !s.gameOver) {
    s = { ...s, opponentActionTrigger: s.opponentActionTrigger + 1 };
  }
  return s;
}

/** Force a re-trigger of the opponent action without changing phase. */
function triggerOpponentAction(state: CombatState): CombatState {
  if (state.phase === 'defense' && !state.awaitingShieldChoice && !state.gameOver) {
    return { ...state, opponentActionTrigger: state.opponentActionTrigger + 1 };
  }
  return state;
}

// ── Initialization ─────────────────────────────────────────────────────────────

type InitArg = { encounter: EncounterConfig; chosenWorldDeck: string[] };

function initCombat({ encounter, chosenWorldDeck }: InitArg): CombatState {
  // Ponder conversion: any chosen world card not on the encounter's relevance list
  // is swapped to a Ponder for this combat only. Personal cards are never converted.
  const relevanceSet = new Set(encounter.worldDeck);
  const substitutionLogs: string[] = [];
  const convertedWorldDeck = chosenWorldDeck.map(id => {
    if (!relevanceSet.has(id)) {
      const name = CARDS[id]?.name ?? id;
      substitutionLogs.push(`${name} isn't relevant here — converted to Ponder.`);
      return 'ponder';
    }
    return id;
  });

  let state: CombatState = {
    phase: 'attack',
    priority: 5,
    playerShields: Array.from({ length: encounter.playerShields }, () => ({ broken: false })),
    oppShields: encounter.shieldLinks.slice(0, encounter.oppShields).map(link => ({
      broken: false,
      linkedCardId: link,
    })),
    hand: [],
    oppHand: [],
    personalDeck: { cards: shuffle([...encounter.personalDeck]), discard: [] },
    worldDeck: { cards: shuffle([...convertedWorldDeck]), discard: [] },
    oppDeck: { cards: shuffle([...encounter.oppDeck]), discard: [] },
    field: [],
    logs: substitutionLogs,
    selectedCardId: null,
    awaitingShieldChoice: false,
    pendingOppCardId: null,
    gameOver: false,
    winner: null,
    oppPatience: encounter.patience,
    oppMaxPatience: encounter.patience,
    collectedInfo: [],
    opponentActionTrigger: 0,
    disposition: encounter.disposition,
    valuableShields: encounter.valuableShields,
    activeDialogue: null,
    encounterDialogue: encounter.dialogue,
  };

  // Opening hands: 4 card pairs for player, 3 cards for opponent
  for (let i = 0; i < 4; i++) state = drawOneCardPair(state);

  for (let i = 0; i < 3; i++) {
    const [card, deck] = drawFromDeck(state.oppDeck);
    if (card) state = { ...state, oppHand: [...state.oppHand, card], oppDeck: deck };
  }

  return state;
}

// ── Reducer ────────────────────────────────────────────────────────────────────

type CombatAction =
  | { type: 'SELECT_CARD'; cardId: string }
  | { type: 'PLAY_CARD'; cardId: string }
  | { type: 'PLACE_SHIELD' }
  | { type: 'END_TURN' }
  | { type: 'CHOOSE_SHIELD_TO_BREAK'; index: number }
  | { type: 'OPPONENT_ACT' }
  | { type: 'DISMISS_DIALOGUE' }
  | { type: 'RESET'; encounter: EncounterConfig; chosenWorldDeck: string[] };

function combatReducer(state: CombatState, action: CombatAction): CombatState {
  if (action.type === 'RESET') {
    return initCombat({ encounter: action.encounter, chosenWorldDeck: action.chosenWorldDeck });
  }
  if (state.gameOver && action.type !== 'OPPONENT_ACT') return state;

  switch (action.type) {

    case 'SELECT_CARD': {
      if (state.awaitingShieldChoice) return state;
      const newSelected = state.selectedCardId === action.cardId ? null : action.cardId;
      return { ...state, selectedCardId: newSelected };
    }

    case 'PLAY_CARD': {
      if (state.awaitingShieldChoice) return state;
      const card = CARDS[action.cardId];
      if (!card || !state.hand.includes(action.cardId)) return state;

      if (state.phase === 'defense' && card.type !== 'instant') {
        return addLog(state, 'Only Instant cards can be played in Defense Phase!');
      }

      // Cost reduction from Vampire Network enchantment
      const vnActive = state.field.includes('vampireNetwork');
      const reduction = vnActive && card.supertype === 'Information'
        ? (CARDS['vampireNetwork']?.effects.reduceInfoCost ?? 0) : 0;
      const actualCost = Math.max(0, card.cost - reduction);

      if (state.priority < actualCost) {
        return addLog(state, 'Not enough Priority to play this card!');
      }

      // Remove only the first occurrence (hand can contain duplicate card IDs)
      const handAfterPlay = [...state.hand];
      const removeIdx = handAfterPlay.indexOf(action.cardId);
      if (removeIdx !== -1) handAfterPlay.splice(removeIdx, 1);

      let s: CombatState = {
        ...state,
        hand: handAfterPlay,
        priority: clamp(state.priority - actualCost),
        selectedCardId: null,
        activeDialogue: null,
      };

      s = addLog(s, `You played [${card.name}]`);
      const intactBefore = s.oppShields.filter(sh => !sh.broken).length;
      s = resolvePlayerEffect(s, card);
      const shieldWasBroken = card.effects.breakShield &&
        s.oppShields.filter(sh => !sh.broken).length < intactBefore;

      // Place enchantments on field; shield-breakers that land are consumed entirely;
      // all others discard to the appropriate deck
      if (card.type === 'enchantment') {
        s = { ...s, field: [...s.field, action.cardId] };
      } else if (shieldWasBroken) {
        // Card consumed — removed from the game, not sent to any discard pile
      } else if (card.supertype === 'Personal') {
        s = { ...s, personalDeck: { ...s.personalDeck, discard: [...s.personalDeck.discard, action.cardId] } };
      } else {
        s = { ...s, worldDeck: { ...s.worldDeck, discard: [...s.worldDeck.discard, action.cardId] } };
      }

      // End-of-turn draw: always draw one pair
      s = drawOneCardPair(s);

      // Street Smarts bonus: draw one extra personal card per enchantment copy on field
      if (s.field.includes('streetSmarts')) {
        const extra = CARDS['streetSmarts']?.effects.drawEachTurn ?? 0;
        for (let i = 0; i < extra; i++) s = drawOnePersonalCard(s);
      }

      s = checkEndCondition(s);
      if (!s.gameOver) s = updatePhase(s);

      // If still in defense phase after player plays, re-trigger opponent
      if (!s.gameOver && s.phase === 'defense' && s.phase === state.phase) {
        s = triggerOpponentAction(s);
      }

      return s;
    }

    case 'END_TURN': {
      if (state.awaitingShieldChoice || state.phase !== 'attack') return state;
      let s: CombatState = { ...state, priority: 0, selectedCardId: null, activeDialogue: null };
      s = addLog(s, 'You passed your turn.');
      s = drawOneCardPair(s);
      s = checkEndCondition(s);
      if (!s.gameOver) s = updatePhase(s);
      return s;
    }

    case 'PLACE_SHIELD': {
      if (state.awaitingShieldChoice || state.phase !== 'attack') return state;

      let s: CombatState = { ...state, activeDialogue: null };

      // Consume a World card from hand as shield material if available
      const worldIdx = s.hand.findIndex(id => CARDS[id]?.supertype === 'Information');
      let consumedCardId: string | undefined;
      if (worldIdx !== -1) {
        consumedCardId = s.hand[worldIdx];
        s = { ...s, hand: s.hand.filter((_, i) => i !== worldIdx) };
        s = { ...s, worldDeck: { ...s.worldDeck, discard: [...s.worldDeck.discard, consumedCardId] } };
      }

      // Repair an existing broken slot or add a new one; store which card was used
      const brokenIdx = s.playerShields.findIndex(sh => sh.broken);
      if (brokenIdx !== -1) {
        const newShields = [...s.playerShields];
        newShields[brokenIdx] = { ...newShields[brokenIdx], broken: false, usedCardId: consumedCardId };
        s = { ...s, playerShields: newShields };
      } else {
        s = { ...s, playerShields: [...s.playerShields, { broken: false, usedCardId: consumedCardId }] };
      }

      s = { ...s, priority: clamp(s.priority - 2) };
      s = addLog(s, 'Placed a Shield (−2 Priority).');
      s = drawOneCardPair(s);
      s = checkEndCondition(s);
      if (!s.gameOver) s = updatePhase(s);
      return s;
    }

    case 'CHOOSE_SHIELD_TO_BREAK': {
      if (!state.awaitingShieldChoice) return state;
      const { index } = action;
      if (index < 0 || index >= state.playerShields.length || state.playerShields[index].broken) return state;

      let s = state;
      const brokenSlot = s.playerShields[index];
      const isValuable = brokenSlot.usedCardId !== undefined &&
                         s.valuableShields.includes(brokenSlot.usedCardId);

      const newShields = [...s.playerShields];
      newShields[index] = { ...newShields[index], broken: true };
      s = { ...s, playerShields: newShields, awaitingShieldChoice: false };
      s = addLog(s, `Your Shield #${index + 1} was broken!`);

      // Discard the pending opponent card and draw a replacement
      if (s.pendingOppCardId) {
        const deckWithDiscard = {
          ...s.oppDeck,
          discard: [...s.oppDeck.discard, s.pendingOppCardId],
        };
        const [drawn, finalDeck] = drawFromDeck(deckWithDiscard);
        s = { ...s, oppDeck: finalDeck, pendingOppCardId: null };
        if (drawn) s = { ...s, oppHand: [...s.oppHand, drawn] };
      }

      // Tiered break bonuses: valuable shield → NPC surges, plain shield → NPC barely notices
      if (isValuable) {
        const cardName = CARDS[brokenSlot.usedCardId!]?.name ?? brokenSlot.usedCardId!;
        s = addLog(s, `Opponent finds ${cardName} behind the shield — their patience surges!`);
        s = { ...s, oppPatience: Math.min(s.oppMaxPatience, s.oppPatience + 2), priority: 5 };
      } else {
        s = addLog(s, 'Opponent breaks the shield — but it means little to them.');
        s = { ...s, oppPatience: Math.max(0, s.oppPatience - 1), priority: 1 };
      }

      s = checkEndCondition(s);
      if (!s.gameOver) s = updatePhase(s);
      return s;
    }

    case 'OPPONENT_ACT': {
      if (state.gameOver || state.awaitingShieldChoice || state.phase !== 'defense') return state;

      let s = state;

      // Refill opponent hand from deck, reshuffling discard pile if needed
      if (s.oppHand.length === 0) {
        const [drawn, newDeck] = drawFromDeck(s.oppDeck);
        if (drawn) {
          s = { ...s, oppHand: [drawn], oppDeck: newDeck };
          s = addLog(s, 'Opponent reshuffles their deck.');
        }
      }

      if (s.oppHand.length === 0) {
        // Opponent truly has nothing — nudge priority toward attack and loop until positive
        s = addLog(s, 'Opponent has nothing to say…');
        s = { ...s, priority: clamp(s.priority + 1) };
        s = checkEndCondition(s);
        if (!s.gameOver) {
          s = updatePhase(s);
          if (s.phase === 'defense') s = triggerOpponentAction(s);
        }
        return s;
      }

      const [playedId, ...restHand] = s.oppHand;
      s = { ...s, oppHand: restHand };
      const playedCard = CARDS[playedId];

      if (!playedCard) {
        s = { ...s, priority: clamp(s.priority - 3) };
        s = checkEndCondition(s);
        if (!s.gameOver) {
          s = updatePhase(s);
          if (s.phase === 'defense') s = triggerOpponentAction(s);
        }
        return s;
      }

      s = addLog(s, `Opponent plays [${playedCard.name}]`);

      // Shield-break requires player to choose which shield to sacrifice
      if (playedCard.effects.breakShield) {
        const hasIntact = s.playerShields.some(sh => !sh.broken);
        if (hasIntact) {
          return { ...s, awaitingShieldChoice: true, pendingOppCardId: playedId };
        }
        // No intact shields — still log and continue
        s = addLog(s, 'No shields to break.');
      }

      // Apply other opponent card effects
      s = resolveOpponentEffect(s, playedCard);

      // Discard the played card and draw a replacement
      const deckWithDiscard = { ...s.oppDeck, discard: [...s.oppDeck.discard, playedId] };
      const [drawn, finalDeck] = drawFromDeck(deckWithDiscard);
      s = { ...s, oppDeck: finalDeck };
      if (drawn) s = { ...s, oppHand: [...s.oppHand, drawn] };

      // Opponent's action always costs the player 3 priority
      s = { ...s, priority: clamp(s.priority - 3) };
      s = checkEndCondition(s);
      if (!s.gameOver) {
        s = updatePhase(s);
        if (s.phase === 'defense') s = triggerOpponentAction(s);
      }
      return s;
    }

    case 'DISMISS_DIALOGUE': {
      return { ...state, activeDialogue: null };
    }
  }
}

// ── Public hook ────────────────────────────────────────────────────────────────

export function useCombat(encounter: EncounterConfig, chosenWorldDeck: string[]) {
  const [state, dispatch] = useReducer(combatReducer, { encounter, chosenWorldDeck }, initCombat);

  // Schedule opponent action whenever the trigger counter changes
  useEffect(() => {
    if (state.gameOver || state.awaitingShieldChoice || state.phase !== 'defense') return;
    const timer = setTimeout(() => dispatch({ type: 'OPPONENT_ACT' }), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.opponentActionTrigger]);

  const selectCard = useCallback((cardId: string) => dispatch({ type: 'SELECT_CARD', cardId }), []);
  const playCard = useCallback((cardId: string) => dispatch({ type: 'PLAY_CARD', cardId }), []);
  const placeShield = useCallback(() => dispatch({ type: 'PLACE_SHIELD' }), []);
  const endTurn = useCallback(() => dispatch({ type: 'END_TURN' }), []);
  const chooseShieldToBreak = useCallback((index: number) => dispatch({ type: 'CHOOSE_SHIELD_TO_BREAK', index }), []);
  const dismissDialogue = useCallback(() => dispatch({ type: 'DISMISS_DIALOGUE' }), []);
  const resetCombat = useCallback(
    () => dispatch({ type: 'RESET', encounter, chosenWorldDeck }),
    [encounter, chosenWorldDeck],
  );

  return { state, selectCard, playCard, placeShield, endTurn, chooseShieldToBreak, dismissDialogue, resetCombat };
}
