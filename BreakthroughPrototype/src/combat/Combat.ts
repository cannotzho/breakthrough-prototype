import { useReducer, useEffect, useCallback } from 'react';
import type { CombatState, EncounterConfig } from './types';
import { CARDS, DETECTIVE_PERSONAL_DECK } from '../data/cards';
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

// EXPERIMENTAL (BotM #84): Draw 5 cards (3 personal + 2 world) when regaining priority.
function drawFiveNewCards(state: CombatState): CombatState {
  let s = state;
  for (let i = 0; i < 3; i++) s = drawOnePersonalCard(s);
  for (let i = 0; i < 2; i++) {
    const [card, deck] = drawFromDeck(s.worldDeck);
    if (card) s = { ...s, hand: [...s.hand, card], worldDeck: deck };
  }
  return s;
}

/**
 * Recalculate the phase from priority. When entering defense, increment
 * opponentActionTrigger so the useEffect fires and schedules the opponent's move.
 * When entering attack, clear any active shield immunity (#59).
 *
 * EXPERIMENTAL (BotM #84): On attack→defense, instead of immediately triggering
 * the opponent, pause to let the player choose ≤3 cards for Back of Mind.
 * On defense→attack, draw 5 new cards and clear the BotM tracking set.
 */
function updatePhase(state: CombatState): CombatState {
  const phase: 'attack' | 'defense' = state.priority > 0 ? 'attack' : 'defense';
  if (phase === state.phase) return state; // no change

  let s = { ...state, phase };

  if (phase === 'defense' && !s.awaitingShieldChoice && !s.gameOver) {
    if (s.hand.length === 0) {
      // Nothing to keep — skip picker and trigger opponent immediately
      s = addLog(s, 'No cards in hand — opponent takes the floor.');
      s = { ...s, opponentActionTrigger: s.opponentActionTrigger + 1 };
    } else {
      // EXPERIMENTAL (BotM #84): pause for player to pick ≤3 cards to retain
      s = { ...s, awaitingBackOfMindChoice: true };
      // opponentActionTrigger fires after CONFIRM_BACK_OF_MIND
    }
  }

  if (phase === 'attack') {
    if (s.playerShieldImmune) s = { ...s, playerShieldImmune: false };
    if (!s.gameOver) {
      // EXPERIMENTAL (BotM #84): regaining priority → draw 5 new cards, clear BotM
      s = { ...s, backOfMind: [] };
      s = drawFiveNewCards(s);
      s = addLog(s, 'You regain the initiative — drew 5 new cards.');
    }
  }

  return s;
}

/** Recompute which combination cards have both source cards in the player's hand (#61).
 * Only surfaces combinations whose sources are reachable in this combat's card pool (#83). */
function recomputeCombinations(state: CombatState): CombatState {
  const combatPool = new Set([
    ...state.hand,
    ...state.personalDeck.cards,
    ...state.personalDeck.discard,
    ...state.worldDeck.cards,
    ...state.worldDeck.discard,
  ]);
  const handSet = new Set(state.hand);
  const available: string[] = [];
  for (const id of Object.keys(CARDS)) {
    const card = CARDS[id];
    if (card.combinesFrom) {
      const [a, b] = card.combinesFrom;
      if (combatPool.has(a) && combatPool.has(b) && handSet.has(a) && handSet.has(b)) {
        available.push(id);
      }
    }
  }
  return { ...state, availableCombinations: available };
}

/** Force a re-trigger of the opponent action without changing phase. */
function triggerOpponentAction(state: CombatState): CombatState {
  // EXPERIMENTAL (BotM #84): also gate on awaitingBackOfMindChoice
  if (state.phase === 'defense' && !state.awaitingShieldChoice && !state.awaitingBackOfMindChoice && !state.gameOver) {
    return { ...state, opponentActionTrigger: state.opponentActionTrigger + 1 };
  }
  return state;
}

// ── Initialization ─────────────────────────────────────────────────────────────

type InitArg = { encounter: EncounterConfig; chosenWorldDeck: string[]; preShields?: string[] };

function initCombat({ encounter, chosenWorldDeck, preShields = [] }: InitArg): CombatState {
  // Remove pre-selected shield cards from the world deck (one removal per shield card)
  const deckWithoutShields = [...chosenWorldDeck];
  const validPreShields: string[] = [];
  for (const shieldId of preShields.slice(0, encounter.playerShields)) {
    const idx = deckWithoutShields.indexOf(shieldId);
    if (idx !== -1) {
      deckWithoutShields.splice(idx, 1);
      validPreShields.push(shieldId);
    }
  }

  // Ponder conversion: any chosen world card not on the encounter's relevance list
  // is swapped to a Ponder for this combat only. Personal cards are never converted.
  const relevanceSet = new Set(encounter.worldDeck);
  const substitutionLogs: string[] = [];
  const convertedWorldDeck = deckWithoutShields.map(id => {
    if (!relevanceSet.has(id)) {
      const name = CARDS[id]?.name ?? id;
      substitutionLogs.push(`${name} isn't relevant here — converted to Ponder.`);
      return 'ponder';
    }
    return id;
  });

  // Build playerShields: pre-placed first, then empty slots up to encounter limit
  const playerShieldsInit: import('./types').ShieldSlot[] = [];
  for (let i = 0; i < encounter.playerShields; i++) {
    if (i < validPreShields.length) {
      playerShieldsInit.push({ broken: false, usedCardId: validPreShields[i] });
    } else {
      playerShieldsInit.push({ broken: false });
    }
  }

  let state: CombatState = {
    phase: 'attack',
    priority: 5,
    playerShields: playerShieldsInit,
    oppShields: encounter.shieldLinks.slice(0, encounter.oppShields).map((link, i) => {
      const req = encounter.shieldRequirements?.[i];
      return { broken: false, linkedCardId: link, ...(req ? { requiresCardId: req } : {}) };
    }),
    hand: [],
    oppHand: [],
    personalDeck: { cards: shuffle([...DETECTIVE_PERSONAL_DECK, ...(encounter.personalDeck ?? [])]), discard: [] },
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
    revealedShieldCard: null,
    cardBreakChances: {},
    fearless: encounter.fearless ?? false,
    playerShieldImmune: false,
    cardPlayCounts: {},
    availableCombinations: [],
    // EXPERIMENTAL (BotM #84)
    backOfMind: [],
    awaitingBackOfMindChoice: false,
  };

  // Opening hands: 4 card pairs for player, 3 cards for opponent
  for (let i = 0; i < 4; i++) state = drawOneCardPair(state);

  for (let i = 0; i < 3; i++) {
    const [card, deck] = drawFromDeck(state.oppDeck);
    if (card) state = { ...state, oppHand: [...state.oppHand, card], oppDeck: deck };
  }

  return recomputeCombinations(state);
}

// ── Reducer ────────────────────────────────────────────────────────────────────

type CombatAction =
  | { type: 'SELECT_CARD'; cardId: string }
  | { type: 'PLAY_CARD'; cardId: string }
  | { type: 'PLACE_SHIELD' }
  | { type: 'END_TURN' }
  | { type: 'CHOOSE_SHIELD_TO_BREAK'; index: number }
  | { type: 'OPPONENT_ACT'; specificCardId?: string }
  | { type: 'OPPONENT_END_TURN' }
  | { type: 'DISMISS_DIALOGUE' }
  | { type: 'DISMISS_REVEAL' }
  | { type: 'COMBINE_CARDS'; cardId: string } // #61
  | { type: 'CONFIRM_BACK_OF_MIND'; keptIds: string[] } // EXPERIMENTAL (BotM #84)
  | { type: 'RESET'; encounter: EncounterConfig; chosenWorldDeck: string[]; preShields?: string[] };

function combatReducer(state: CombatState, action: CombatAction): CombatState {
  if (action.type === 'RESET') {
    return initCombat({ encounter: action.encounter, chosenWorldDeck: action.chosenWorldDeck, preShields: action.preShields });
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

      if (state.phase === 'defense' && card.type !== 'instant' && !card.effects.isInstant) {
        return addLog(state, 'Only Instant cards can be played in Defense Phase!');
      }
      // EXPERIMENTAL (BotM #84): during defense, only Back of Mind cards are playable
      if (state.phase === 'defense' && !state.backOfMind.includes(action.cardId)) {
        return addLog(state, 'Only Back of Mind cards can be played during the opponent\'s turn!');
      }

      // Cost reduction from Vampire Network enchantment
      const vnActive = state.field.includes('vampireNetwork');
      const reduction = vnActive && card.supertype === 'Information'
        ? (CARDS['vampireNetwork']?.effects.reduceInfoCost ?? 0) : 0;
      const actualCost = Math.max(0, card.cost - reduction);

      // Instant cards bypass the priority cost requirement and are played for free
      if (!card.effects.isInstant && state.priority < actualCost) {
        return addLog(state, 'Not enough Priority to play this card!');
      }

      // Remove only the first occurrence (hand can contain duplicate card IDs)
      const handAfterPlay = [...state.hand];
      const removeIdx = handAfterPlay.indexOf(action.cardId);
      if (removeIdx !== -1) handAfterPlay.splice(removeIdx, 1);

      let s: CombatState = {
        ...state,
        hand: handAfterPlay,
        priority: card.effects.isInstant ? state.priority : clamp(state.priority - actualCost),
        selectedCardId: null,
        activeDialogue: null,
      };

      s = addLog(s, `You played [${card.name}]`);
      const intactBefore = s.oppShields.filter(sh => !sh.broken).length;
      // Increment play count before resolvePlayerEffect so autoBreakAfterPlays can check it (#60)
      s = { ...s, cardPlayCounts: { ...s.cardPlayCounts, [action.cardId]: (s.cardPlayCounts[action.cardId] ?? 0) + 1 } };
      s = resolvePlayerEffect(s, card);
      // Detect any shield break (breakShield, breakShieldChance, shieldBreakPatience, autoBreakAfterPlays)
      const shieldWasBroken = s.oppShields.filter(sh => !sh.broken).length < intactBefore;

      // When a shield is broken, queue the dramatic reveal dialog for its linked info card.
      if (shieldWasBroken) {
        const newlyBrokenIdx = s.oppShields.findIndex((sh, i) => sh.broken && !state.oppShields[i].broken);
        const linkedId = newlyBrokenIdx !== -1 ? s.oppShields[newlyBrokenIdx].linkedCardId : undefined;
        if (linkedId) s = { ...s, revealedShieldCard: linkedId };
      }

      // Place enchantments on field; Information shield-breakers are consumed entirely;
      // Personal shield-breakers (for minor characters) return to discard as normal.
      if (card.type === 'enchantment') {
        s = { ...s, field: [...s.field, action.cardId] };
      } else if (shieldWasBroken && card.supertype === 'Information') {
        // Information shield-breakers consumed — removed from game, not sent to any discard pile
      } else if (card.supertype === 'Personal') {
        s = { ...s, personalDeck: { ...s.personalDeck, discard: [...s.personalDeck.discard, action.cardId] } };
      } else {
        s = { ...s, worldDeck: { ...s.worldDeck, discard: [...s.worldDeck.discard, action.cardId] } };
      }

      // EXPERIMENTAL (BotM #84): skip draw during defense — player gets 5 new cards on regaining priority
      if (state.phase !== 'defense') {
        s = drawOneCardPair(s);
        // Street Smarts bonus: draw one extra personal card per enchantment copy on field
        if (s.field.includes('streetSmarts')) {
          const extra = CARDS['streetSmarts']?.effects.drawEachTurn ?? 0;
          for (let i = 0; i < extra; i++) s = drawOnePersonalCard(s);
        }
      }

      s = checkEndCondition(s);
      // Win screen takes priority over the reveal dialog on the final shield break.
      if (s.gameOver) s = { ...s, revealedShieldCard: null };
      if (!s.gameOver) s = updatePhase(s);

      // If still in defense phase after player plays, re-trigger opponent
      if (!s.gameOver && s.phase === 'defense' && s.phase === state.phase) {
        s = triggerOpponentAction(s);
      }

      s = recomputeCombinations(s);
      return s;
    }

    case 'END_TURN': {
      if (state.awaitingShieldChoice || state.phase !== 'attack') return state;
      let s: CombatState = { ...state, priority: 0, selectedCardId: null, activeDialogue: null };
      s = addLog(s, 'You passed your turn.');
      s = drawOneCardPair(s);
      s = checkEndCondition(s);
      if (!s.gameOver) s = updatePhase(s);
      s = recomputeCombinations(s);
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
      s = recomputeCombinations(s);
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
      s = recomputeCombinations(s);
      return s;
    }

    case 'OPPONENT_ACT': {
      if (state.gameOver || state.awaitingShieldChoice || state.phase !== 'defense') return state;

      let s = state;

      // Refill opponent hand from deck, reshuffling discard pile if needed
      // Only refill from deck if no specific card is being requested
      if (!action.specificCardId && s.oppHand.length === 0) {
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
        s = recomputeCombinations(s);
        return s;
      }

      // Playtest: a specific card from the hand can be chosen; otherwise play from front
      let playedId: string;
      let restHand: string[];
      if (action.specificCardId && s.oppHand.includes(action.specificCardId)) {
        playedId = action.specificCardId;
        const idx = s.oppHand.indexOf(action.specificCardId);
        restHand = [...s.oppHand.slice(0, idx), ...s.oppHand.slice(idx + 1)];
      } else {
        [playedId, ...restHand] = s.oppHand;
      }
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
        if (s.playerShieldImmune) {
          s = addLog(s, 'Opponent cannot break your shields right now.');
        } else {
          const hasIntact = s.playerShields.some(sh => !sh.broken);
          if (hasIntact) {
            return { ...s, awaitingShieldChoice: true, pendingOppCardId: playedId };
          }
          s = addLog(s, 'No shields to break.');
        }
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
      s = recomputeCombinations(s);
      return s;
    }

    case 'OPPONENT_END_TURN': {
      if (state.gameOver || state.phase !== 'defense') return state;
      let s = addLog(state, 'Opponent passes their turn.');
      s = { ...s, priority: clamp(s.priority + 1) };
      s = checkEndCondition(s);
      if (!s.gameOver) s = updatePhase(s);
      s = recomputeCombinations(s);
      return s;
    }

    // EXPERIMENTAL (BotM #84): confirm which ≤3 cards to keep; discard the rest; trigger opponent
    case 'CONFIRM_BACK_OF_MIND': {
      if (!state.awaitingBackOfMindChoice) return state;

      // Only keep cards that are actually in hand (guard against stale IDs), clamp to 3
      const validKept = action.keptIds.filter(id => state.hand.includes(id)).slice(0, 3);
      const keptSet = new Set<string>();
      const newHand: string[] = [];
      const handCopy = [...state.hand];

      for (const kid of validKept) {
        const idx = handCopy.indexOf(kid);
        if (idx !== -1 && !keptSet.has(kid)) {
          newHand.push(kid);
          keptSet.add(kid);
          handCopy.splice(idx, 1);
        }
      }

      // Discard everything not kept, sorted into personal/world discard piles
      let personalDiscard = [...state.personalDeck.discard];
      let worldDiscard = [...state.worldDeck.discard];
      for (const cardId of handCopy) {
        const card = CARDS[cardId];
        if (!card) continue;
        if (card.supertype === 'Personal') personalDiscard.push(cardId);
        else worldDiscard.push(cardId);
      }

      let s: CombatState = {
        ...state,
        hand: newHand,
        backOfMind: newHand,
        awaitingBackOfMindChoice: false,
        personalDeck: { ...state.personalDeck, discard: personalDiscard },
        worldDeck: { ...state.worldDeck, discard: worldDiscard },
      };

      const kept = newHand.length;
      s = addLog(s, `Hand discarded — ${kept} card${kept !== 1 ? 's' : ''} kept in Back of Mind.`);
      s = { ...s, opponentActionTrigger: s.opponentActionTrigger + 1 };
      s = recomputeCombinations(s);
      return s;
    }

    case 'COMBINE_CARDS': {
      // EXPERIMENTAL (BotM #84): no combining during defense (BotM cards can't be combined mid-opponent-turn)
      if (state.phase === 'defense') return addLog(state, 'Cannot combine cards during the opponent\'s turn.');
      const combCard = CARDS[action.cardId];
      if (!combCard?.combinesFrom) return state;
      const [src1, src2] = combCard.combinesFrom;
      if (!state.hand.includes(src1) || !state.hand.includes(src2)) return state;

      const newHand = [...state.hand];
      newHand.splice(newHand.indexOf(src1), 1);
      newHand.splice(newHand.indexOf(src2), 1);
      newHand.push(action.cardId);

      let s = addLog(state, `Combined [${CARDS[src1]?.name ?? src1}] + [${CARDS[src2]?.name ?? src2}] → [${combCard.name}]`);
      s = { ...s, hand: newHand };
      s = recomputeCombinations(s);
      s = checkEndCondition(s);
      return s;
    }

    case 'DISMISS_DIALOGUE': {
      return { ...state, activeDialogue: null };
    }

    case 'DISMISS_REVEAL': {
      let s: CombatState = { ...state, revealedShieldCard: null };
      // Re-trigger opponent action if combat should resume in defense phase.
      if (!s.gameOver && s.phase === 'defense' && !s.awaitingShieldChoice) {
        s = triggerOpponentAction(s);
      }
      return s;
    }
  }
}

// ── Public hook ────────────────────────────────────────────────────────────────

export function useCombat(encounter: EncounterConfig, chosenWorldDeck: string[], preShields: string[] = [], playtestMode = false) {
  const [state, dispatch] = useReducer(combatReducer, { encounter, chosenWorldDeck, preShields }, initCombat);

  // Schedule opponent action whenever the trigger counter changes (disabled in playtest mode).
  // Also paused while the shield reveal dialog is open, or while awaiting BotM choice (#84).
  useEffect(() => {
    if (playtestMode) return;
    // EXPERIMENTAL (BotM #84): also pause during back-of-mind choice
    if (state.gameOver || state.awaitingShieldChoice || state.awaitingBackOfMindChoice || state.phase !== 'defense') return;
    if (state.revealedShieldCard) return;
    const timer = setTimeout(() => dispatch({ type: 'OPPONENT_ACT' }), 1200);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.opponentActionTrigger, playtestMode]);

  const selectCard = useCallback((cardId: string) => dispatch({ type: 'SELECT_CARD', cardId }), []);
  const playCard = useCallback((cardId: string) => dispatch({ type: 'PLAY_CARD', cardId }), []);
  const placeShield = useCallback(() => dispatch({ type: 'PLACE_SHIELD' }), []);
  const endTurn = useCallback(() => dispatch({ type: 'END_TURN' }), []);
  const chooseShieldToBreak = useCallback((index: number) => dispatch({ type: 'CHOOSE_SHIELD_TO_BREAK', index }), []);
  const dismissDialogue = useCallback(() => dispatch({ type: 'DISMISS_DIALOGUE' }), []);
  const dismissReveal = useCallback(() => dispatch({ type: 'DISMISS_REVEAL' }), []);
  const resetCombat = useCallback(
    () => dispatch({ type: 'RESET', encounter, chosenWorldDeck, preShields }),
    [encounter, chosenWorldDeck, preShields],
  );
  const opponentAct = useCallback(
    (specificCardId?: string) => dispatch({ type: 'OPPONENT_ACT', specificCardId }),
    [],
  );
  const opponentEndTurn = useCallback(
    () => dispatch({ type: 'OPPONENT_END_TURN' }),
    [],
  );

  const combineCards = useCallback(
    (cardId: string) => dispatch({ type: 'COMBINE_CARDS', cardId }),
    [],
  );

  // EXPERIMENTAL (BotM #84)
  const confirmBackOfMind = useCallback(
    (keptIds: string[]) => dispatch({ type: 'CONFIRM_BACK_OF_MIND', keptIds }),
    [],
  );

  return { state, selectCard, playCard, placeShield, endTurn, chooseShieldToBreak, dismissDialogue, dismissReveal, resetCombat, opponentAct, opponentEndTurn, combineCards, confirmBackOfMind };
}
