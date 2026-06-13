import type { CombatState, CombatAction, EncounterConfig, CombatConfig } from './types';
import { CARDS, DETECTIVE_PERSONAL_DECK } from '../data/cards';
import { COMBINATIONS } from '../data/combinations';
import {
  shuffle,
  addLog,
  drawFromDeck,
  drawTwoCards,
  drawOneCard,
  computeCardCost,
  resolvePlayerEffect,
  resolveOpponentEffect,
  resolveCardDef,
  breakOppShieldAt,
} from './effects';

// ── Defaults ───────────────────────────────────────────────────────────────────

export const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  drawOnPriority: 3,          // was 5 before #88
  startingCards: 4,           // was 8 before #88
  maxPlayerShields: 0,        // 0 = no cap
  drawPerPlay: 1,             // was hardcoded 2 (one pair) before #91
  priorityOnShieldBreak: 1,   // was hardcoded 1/5 (plain/valuable) before #91
  animDelay: 1,               // 1× = normal speed; 0 = instant; 2 = slow-motion (#96)
};

// ── Helpers ────────────────────────────────────────────────────────────────────

const clamp = (v: number) => Math.max(-10, Math.min(10, v));

export function checkEndCondition(state: CombatState): CombatState {
  const playerIntact = state.playerShields.filter(s => !s.broken).length;
  const oppIntact = state.oppShields.filter(s => !s.broken).length;

  // Only trigger on shield loss when the player actually has shields to lose.
  // Encounters with playerShields:0 (e.g. tutorial) should not instantly end.
  if (state.playerShields.length > 0 && playerIntact === 0) {
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

// Draw N cards from the combined deck when regaining priority (BotM #84). N from combatConfig (#88).
function drawOnRegainingPriority(state: CombatState): CombatState {
  let s = state;
  const n = s.combatConfig.drawOnPriority;
  for (let i = 0; i < n; i++) {
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
 * On defense→attack, draw N new cards and clear the BotM tracking set.
 */
export function updatePhase(state: CombatState): CombatState {
  const phase: 'attack' | 'defense' = state.priority > 0 ? 'attack' : 'defense';
  if (phase === state.phase) return state; // no change

  let s = { ...state, phase };

  if (phase === 'defense' && !s.awaitingShieldChoice && !s.gameOver) {
    if (s.hand.length === 0) {
      // Nothing to keep — skip picker and trigger opponent (player must still ack)
      s = addLog(s, 'No cards in hand — opponent takes the floor.');
      s = { ...s, opponentActionTrigger: s.opponentActionTrigger + 1, awaitingOpponentAck: true };
    } else {
      // EXPERIMENTAL (BotM #84): pause for player to pick ≤3 cards to retain
      s = { ...s, awaitingBackOfMindChoice: true };
      // opponentActionTrigger fires after CONFIRM_BACK_OF_MIND
    }
  }

  if (phase === 'attack') {
    if (s.playerShieldImmune) s = { ...s, playerShieldImmune: false };
    // Clear the opponent-ack flag whenever priority returns to the player
    s = { ...s, awaitingOpponentAck: false };
    if (!s.gameOver) {
      // Regaining priority → draw N new cards, clear BotM (BotM #84, N tunable via #88)
      s = { ...s, backOfMind: [] };
      s = drawOnRegainingPriority(s);
      s = addLog(s, `You regain the initiative — drew ${s.combatConfig.drawOnPriority} new cards.`);
    }
  }

  return s;
}

/** Recompute which combination result cards have both ingredients in the player's hand.
 * Only surfaces combinations whose ingredients are reachable in this combat's card pool. */
export function recomputeCombinations(state: CombatState): CombatState {
  const combatPool = new Set([
    ...state.hand,
    ...state.worldDeck.cards,
    ...state.worldDeck.discard,
  ]);
  const handSet = new Set(state.hand);
  const available: string[] = [];
  for (const recipe of COMBINATIONS) {
    const [a, b] = recipe.ingredients;
    if (combatPool.has(a) && combatPool.has(b) && handSet.has(a) && handSet.has(b)) {
      available.push(recipe.result);
    }
  }
  return { ...state, availableCombinations: available };
}

/** Force a re-trigger of the opponent action without changing phase. Requires player ack before timer fires. */
export function triggerOpponentAction(state: CombatState): CombatState {
  if (state.phase === 'defense' && !state.awaitingShieldChoice && !state.awaitingBackOfMindChoice && !state.gameOver) {
    return { ...state, opponentActionTrigger: state.opponentActionTrigger + 1, awaitingOpponentAck: true };
  }
  return state;
}

// ── Initialization ─────────────────────────────────────────────────────────────

export type InitArg = { encounter: EncounterConfig; chosenWorldDeck: string[]; preShields?: string[]; config?: Partial<CombatConfig>; personalDeck?: string[] };

export function initCombat({ encounter, chosenWorldDeck, preShields = [], config, personalDeck }: InitArg): CombatState {
  const combatConfig: CombatConfig = { ...DEFAULT_COMBAT_CONFIG, ...encounter.initialCombatConfig, ...config };
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

  // Merge personal + world cards into a single combined draw pile.
  // If scriptedDrawOrder is provided, those cards are placed at the front of the deck
  // (ensuring the tutorial sees specific cards drawn first), with the rest shuffled after.
  const allPersonal = [...(personalDeck ?? DETECTIVE_PERSONAL_DECK), ...(encounter.personalDeck ?? [])];
  let combinedCards: string[];
  if (encounter.scriptedDrawOrder && encounter.scriptedDrawOrder.length > 0) {
    const scripted = encounter.scriptedDrawOrder;
    // Remove scripted cards from the unordered pool (one copy each), then append remainder shuffled
    const unordered = [...allPersonal, ...convertedWorldDeck];
    const remaining = [...unordered];
    const frontCards: string[] = [];
    for (const sc of scripted) {
      const idx = remaining.indexOf(sc);
      if (idx !== -1) {
        frontCards.push(sc);
        remaining.splice(idx, 1);
      }
    }
    combinedCards = [...frontCards, ...shuffle(remaining)];
  } else {
    combinedCards = shuffle([...allPersonal, ...convertedWorldDeck]);
  }

  // #100 — understood cards: personal deck cards start understood (detective knows their own techniques);
  // world/info cards start as ??? until played. Also seeds from bt_understood_cards overworld pre-flags.
  const personalCardSet = new Set([
    ...(personalDeck ?? DETECTIVE_PERSONAL_DECK),
    ...(encounter.personalDeck ?? []),
  ]);
  const preUnderstood: string[] = (() => {
    try { return JSON.parse(localStorage.getItem('bt_understood_cards') ?? '[]') as string[]; }
    catch { return []; }
  })();
  const understoodCards = new Set<string>([
    ...personalCardSet,
    ...preUnderstood,
    ...(encounter.preUnderstoodCards ?? []),
  ]);
  const cardOverrides: Record<string, import('./types').CardOverride> = encounter.cardOverrides ?? {};

  // Tutorial: scripted opponent play queue
  const tutorialScriptedOppQueue: string[] = encounter.scriptedOpponentPlays ? [...encounter.scriptedOpponentPlays] : [];

  // Starting priority and phase
  const initialPriority = encounter.initialPriority ?? 5;
  const initialPhase: 'attack' | 'defense' = initialPriority > 0 ? 'attack' : 'defense';

  let state: CombatState = {
    phase: initialPhase,
    priority: initialPriority,
    tutorialMode: encounter.tutorialMode ?? false,
    tutorialScriptedOppQueue,
    playerShields: playerShieldsInit,
    oppShields: encounter.shieldLinks.slice(0, encounter.oppShields).map((link, i) => {
      const req = encounter.shieldRequirements?.[i];
      return { broken: false, linkedCardId: link, ...(req ? { requiresCardId: req } : {}) };
    }),
    hand: [],
    oppHand: [],
    worldDeck: { cards: combinedCards, discard: [] },
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
    // If the encounter starts in defense phase, immediately queue the first opponent action.
    opponentActionTrigger: initialPhase === 'defense' ? 1 : 0,
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
    // BotM #84
    backOfMind: [],
    awaitingBackOfMindChoice: false,
    // For encounters starting in defense, pause with awaitingOpponentAck so tutorial tooltip shows first.
    awaitingOpponentAck: encounter.initialAwaitingOpponentAck ?? false,
    pendingShieldBreakLine: null,
    combatConfig,
    // #99
    awaitingOppShieldBreakChoice: false,
    pendingBreakCardId: null,
    // #100
    understoodCards,
    cardOverrides,
  };

  // Opening hand: combatConfig.startingCards from combined deck (#88 — was 8, default now 4)
  for (let i = 0; i < combatConfig.startingCards; i++) {
    const [card, deck] = drawFromDeck(state.worldDeck);
    if (card) state = { ...state, hand: [...state.hand, card], worldDeck: deck };
  }

  for (let i = 0; i < 3; i++) {
    const [card, deck] = drawFromDeck(state.oppDeck);
    if (card) state = { ...state, oppHand: [...state.oppHand, card], oppDeck: deck };
  }

  return recomputeCombinations(state);
}

// ── Reducer ────────────────────────────────────────────────────────────────────

export function combatReducer(state: CombatState, action: CombatAction): CombatState {
  if (action.type === 'RESET') {
    // Preserve dev combatConfig across resets (#88)
    return initCombat({ encounter: action.encounter, chosenWorldDeck: action.chosenWorldDeck, preShields: action.preShields, personalDeck: action.personalDeck, config: state.combatConfig });
  }
  if (action.type === 'UPDATE_CONFIG') {
    return { ...state, combatConfig: { ...state.combatConfig, ...action.config } };
  }
  if (action.type === 'UNDERSTAND_CARD') {
    if (state.understoodCards.has(action.cardId)) return state;
    return { ...state, understoodCards: new Set([...state.understoodCards, action.cardId]) };
  }
  if (state.gameOver && action.type !== 'OPPONENT_ACT') return state;

  switch (action.type) {

    case 'SELECT_CARD': {
      if (state.awaitingShieldChoice) return state;
      const newSelected = state.selectedCardId === action.cardId ? null : action.cardId;
      return { ...state, selectedCardId: newSelected };
    }

    case 'PLAY_CARD': {
      if (state.awaitingShieldChoice || state.awaitingOppShieldBreakChoice) return state;
      // #100: use encounter-specific card definition for effect resolution
      const card = resolveCardDef(action.cardId, state.cardOverrides) ?? CARDS[action.cardId];
      if (!card || !state.hand.includes(action.cardId)) return state;

      if (state.phase === 'defense' && card.type !== 'instant' && !card.effects.isInterrupt) {
        return addLog(state, 'Only Interrupt cards can be played in Defense Phase!');
      }
      // EXPERIMENTAL (BotM #84): during defense, only Back of Mind cards are playable
      if (state.phase === 'defense' && !state.backOfMind.includes(action.cardId)) {
        return addLog(state, 'Only Back of Mind cards can be played during the opponent\'s turn!');
      }

      const actualCost = computeCardCost(action.cardId, state.field);

      // Interrupt cards bypass the priority cost requirement and are played for free
      if (!card.effects.isInterrupt && state.priority < actualCost) {
        return addLog(state, 'Not enough Priority to play this card!');
      }

      // Remove only the first occurrence (hand can contain duplicate card IDs)
      const handAfterPlay = [...state.hand];
      const removeIdx = handAfterPlay.indexOf(action.cardId);
      if (removeIdx !== -1) handAfterPlay.splice(removeIdx, 1);

      let s: CombatState = {
        ...state,
        hand: handAfterPlay,
        priority: card.effects.isInterrupt ? state.priority : clamp(state.priority - actualCost),
        selectedCardId: null,
        activeDialogue: null,
        // #100: playing a card reveals its effect text for the rest of this encounter
        understoodCards: state.understoodCards.has(action.cardId)
          ? state.understoodCards
          : new Set([...state.understoodCards, action.cardId]),
      };

      s = addLog(s, `You played [${card.name}]`);
      // Increment play count before resolvePlayerEffect so autoBreakAfterPlays can check it (#60)
      s = { ...s, cardPlayCounts: { ...s.cardPlayCounts, [action.cardId]: (s.cardPlayCounts[action.cardId] ?? 0) + 1 } };

      // #99 — deterministic breakShield: pause so the player can choose which shield to target
      const hasIntactOppShields = s.oppShields.some(sh => !sh.broken);
      if (card.effects.breakShield && hasIntactOppShields) {
        s = resolvePlayerEffect(s, card, { skipBreak: true });
        // Card not disposed yet — disposal handled in CHOOSE_OPP_SHIELD based on whether break succeeds
        if (state.phase !== 'defense') {
          const drawN = s.combatConfig.drawPerPlay;
          for (let i = 0; i < drawN; i++) {
            const [drawn, deck] = drawFromDeck(s.worldDeck);
            if (drawn) s = { ...s, hand: [...s.hand, drawn], worldDeck: deck };
          }
          if (s.field.includes('streetSmarts')) {
            const extra = CARDS['streetSmarts']?.effects.drawEachTurn ?? 0;
            for (let i = 0; i < extra; i++) s = drawOneCard(s);
          }
        }
        s = { ...s, awaitingOppShieldBreakChoice: true, pendingBreakCardId: action.cardId };
        return recomputeCombinations(s);
      }

      const intactBefore = s.oppShields.filter(sh => !sh.broken).length;
      s = resolvePlayerEffect(s, card);
      // Detect any shield break (breakShieldChance, shieldBreakPatience, autoBreakAfterPlays)
      const shieldWasBroken = s.oppShields.filter(sh => !sh.broken).length < intactBefore;

      // When a shield is broken, queue the dramatic reveal dialog and a pending NPC reaction line.
      if (shieldWasBroken) {
        const newlyBrokenIdx = s.oppShields.findIndex((sh, i) => sh.broken && !state.oppShields[i].broken);
        const linkedId = newlyBrokenIdx !== -1 ? s.oppShields[newlyBrokenIdx].linkedCardId : undefined;
        if (linkedId) {
          s = { ...s, revealedShieldCard: linkedId };
          // #100: shield-linked info card becomes understood so its text shows if drawn later
          if (!s.understoodCards.has(linkedId)) {
            s = { ...s, understoodCards: new Set([...s.understoodCards, linkedId]) };
          }
        }
        // Queue NPC shield-break reaction to show after reveal is dismissed (#88)
        const breakLines = s.encounterDialogue.onShieldBreak;
        if (breakLines && breakLines.length > 0) {
          const brokenCount = s.oppShields.filter(sh => sh.broken).length;
          const lineIdx = Math.min(brokenCount - 1, breakLines.length - 1);
          s = { ...s, pendingShieldBreakLine: breakLines[lineIdx] };
        }
      }

      // Place enchantments on field; Information shield-breakers consumed entirely;
      // all other played cards return to the combined worldDeck discard pile.
      if (card.type === 'enchantment') {
        s = { ...s, field: [...s.field, action.cardId] };
      } else if (shieldWasBroken && card.supertype === 'Information') {
        // Information shield-breakers consumed — removed from game entirely
      } else {
        s = { ...s, worldDeck: { ...s.worldDeck, discard: [...s.worldDeck.discard, action.cardId] } };
      }

      // EXPERIMENTAL (BotM #84): skip draw during defense — player gets N new cards on regaining priority
      if (state.phase !== 'defense') {
        // drawPerPlay cards auto-drawn after playing a card (#91); 0 = no auto-draw
        const drawN = s.combatConfig.drawPerPlay;
        for (let i = 0; i < drawN; i++) {
          const [drawn, deck] = drawFromDeck(s.worldDeck);
          if (drawn) s = { ...s, hand: [...s.hand, drawn], worldDeck: deck };
        }
        // Street Smarts bonus: draw one extra card per enchantment copy on field
        if (s.field.includes('streetSmarts')) {
          const extra = CARDS['streetSmarts']?.effects.drawEachTurn ?? 0;
          for (let i = 0; i < extra; i++) s = drawOneCard(s);
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

    // #99 — player confirms which opponent shield to break
    case 'CHOOSE_OPP_SHIELD': {
      if (!state.awaitingOppShieldBreakChoice || state.pendingBreakCardId === null) return state;
      const { index } = action;
      if (index < 0 || index >= state.oppShields.length || state.oppShields[index].broken) return state;

      const pendingCardId = state.pendingBreakCardId;
      const pendingCard = resolveCardDef(pendingCardId, state.cardOverrides) ?? CARDS[pendingCardId];

      let s: CombatState = { ...state, awaitingOppShieldBreakChoice: false, pendingBreakCardId: null };
      s = breakOppShieldAt(s, index, '');
      const shieldWasBroken = !state.oppShields[index].broken && s.oppShields[index].broken;

      if (shieldWasBroken) {
        const linkedId = s.oppShields[index].linkedCardId;
        if (linkedId) {
          s = { ...s, revealedShieldCard: linkedId };
          if (!s.understoodCards.has(linkedId)) {
            s = { ...s, understoodCards: new Set([...s.understoodCards, linkedId]) };
          }
        }
        const breakLines = s.encounterDialogue.onShieldBreak;
        if (breakLines && breakLines.length > 0) {
          const brokenCount = s.oppShields.filter(sh => sh.broken).length;
          const lineIdx = Math.min(brokenCount - 1, breakLines.length - 1);
          s = { ...s, pendingShieldBreakLine: breakLines[lineIdx] };
        }
      }

      // Dispose pending card: Information shield-breakers are consumed; others go to discard
      if (pendingCard && shieldWasBroken && pendingCard.supertype === 'Information') {
        // consumed — stays out of game
      } else if (pendingCardId) {
        s = { ...s, worldDeck: { ...s.worldDeck, discard: [...s.worldDeck.discard, pendingCardId] } };
      }

      s = checkEndCondition(s);
      if (s.gameOver) s = { ...s, revealedShieldCard: null };
      if (!s.gameOver) s = updatePhase(s);
      s = recomputeCombinations(s);
      return s;
    }

    case 'END_TURN': {
      if (state.awaitingShieldChoice || state.phase !== 'attack') return state;
      let s: CombatState = { ...state, priority: 0, selectedCardId: null, activeDialogue: null };
      s = addLog(s, 'You passed your turn.');
      s = drawTwoCards(s);
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
        // Check max shield cap before adding a new slot (0 = no cap, #88)
        const maxShields = s.combatConfig.maxPlayerShields;
        if (maxShields > 0 && s.playerShields.length >= maxShields) {
          return addLog(s, `Can't place more shields — already at maximum (${maxShields}).`);
        }
        s = { ...s, playerShields: [...s.playerShields, { broken: false, usedCardId: consumedCardId }] };
      }

      s = { ...s, priority: clamp(s.priority - 2) };
      s = addLog(s, 'Placed a Shield (−2 Priority).');
      s = drawTwoCards(s);
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
      const isEffective = brokenSlot.usedCardId !== undefined &&
                          (CARDS[brokenSlot.usedCardId]?.effects.effectiveShield ?? false);

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

      // Tiered break bonuses: effective shield → +5 priority, no patience change;
      // valuable shield → +4 over base + opponent patience surges; plain → base only (#91)
      const shieldBreakPriority = s.combatConfig.priorityOnShieldBreak;
      if (isEffective) {
        const cardName = CARDS[brokenSlot.usedCardId!]?.name ?? brokenSlot.usedCardId!;
        s = addLog(s, `${cardName} absorbed the attack — Effective Shield! (+5 Priority)`);
        s = { ...s, priority: clamp(5) };
      } else if (isValuable) {
        const cardName = CARDS[brokenSlot.usedCardId!]?.name ?? brokenSlot.usedCardId!;
        s = addLog(s, `Opponent finds ${cardName} behind the shield — their patience surges!`);
        s = { ...s, oppPatience: Math.min(s.oppMaxPatience, s.oppPatience + 2), priority: clamp(shieldBreakPriority + 4) };
      } else {
        s = addLog(s, 'Opponent breaks the shield — but it means little to them.');
        s = { ...s, oppPatience: Math.max(0, s.oppPatience - 1), priority: shieldBreakPriority };
      }

      s = checkEndCondition(s);
      if (!s.gameOver) s = updatePhase(s);
      s = recomputeCombinations(s);
      return s;
    }

    case 'OPPONENT_ACT': {
      if (state.gameOver || state.awaitingShieldChoice || state.phase !== 'defense') return state;

      let s = { ...state, awaitingOpponentAck: false }; // clear ack gate when action actually fires

      // Tutorial: consume the next scripted card from the queue, if any
      let scriptedCardId: string | undefined;
      if (s.tutorialScriptedOppQueue.length > 0) {
        [scriptedCardId, ...s.tutorialScriptedOppQueue] = s.tutorialScriptedOppQueue;
        s = { ...s, tutorialScriptedOppQueue: s.tutorialScriptedOppQueue };
      }

      const resolvedSpecificCardId = scriptedCardId ?? action.specificCardId;

      // Refill opponent hand from deck, reshuffling discard pile if needed
      // Only refill from deck if no specific card is being requested
      if (!resolvedSpecificCardId && s.oppHand.length === 0) {
        const [drawn, newDeck] = drawFromDeck(s.oppDeck);
        if (drawn) {
          s = { ...s, oppHand: [drawn], oppDeck: newDeck };
          s = addLog(s, 'Opponent reshuffles their deck.');
        }
      }

      if (s.oppHand.length === 0 && !resolvedSpecificCardId) {
        // Opponent has no cards — immediately return priority to the player (#101)
        s = addLog(s, 'Opponent has nothing to say — you regain the initiative.');
        s = { ...s, priority: 1 };
        s = checkEndCondition(s);
        if (!s.gameOver) s = updatePhase(s);
        s = recomputeCombinations(s);
        return s;
      }

      // Playtest or tutorial scripted card: play a specific card from hand; otherwise play from front
      let playedId: string;
      let restHand: string[];
      if (resolvedSpecificCardId && s.oppHand.includes(resolvedSpecificCardId)) {
        playedId = resolvedSpecificCardId;
        const idx = s.oppHand.indexOf(resolvedSpecificCardId);
        restHand = [...s.oppHand.slice(0, idx), ...s.oppHand.slice(idx + 1)];
      } else if (resolvedSpecificCardId && !s.oppHand.includes(resolvedSpecificCardId)) {
        // Tutorial scripted card not in hand — play it directly as a virtual play
        playedId = resolvedSpecificCardId;
        restHand = [...s.oppHand];
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

      // breakOwnShields: opponent voluntarily breaks all their own remaining shields (e.g. Sign Off)
      if (playedCard.effects.breakOwnShields) {
        const newOppShields = s.oppShields.map(sh => {
          if (sh.broken) return sh;
          if (sh.linkedCardId) {
            s = { ...s, collectedInfo: [...s.collectedInfo, sh.linkedCardId] };
          }
          return { ...sh, broken: true };
        });
        s = { ...s, oppShields: newOppShields };
        s = addLog(s, 'Opponent breaks all their own shields!');
        // Discard and draw
        const deckWithDiscard = { ...s.oppDeck, discard: [...s.oppDeck.discard, playedId] };
        const [drawn, finalDeck] = drawFromDeck(deckWithDiscard);
        s = { ...s, oppDeck: finalDeck };
        if (drawn) s = { ...s, oppHand: [...s.oppHand, drawn] };
        s = checkEndCondition(s);
        if (!s.gameOver) s = updatePhase(s);
        s = recomputeCombinations(s);
        return s;
      }

      // Shield-break requires player to choose which shield to sacrifice
      if (playedCard.effects.breakShield) {
        const intactShields = s.playerShields.filter(sh => !sh.broken);
        // Shields with requiresCardId can only be broken by that specific card (#101)
        const validTargets = intactShields.filter(sh => !sh.requiresCardId || sh.requiresCardId === playedId);

        // targetEffectiveShield: prefer a player shield backed by an effectiveShield card
        const effectiveTargets = validTargets.filter(sh => sh.usedCardId && CARDS[sh.usedCardId]?.effects.effectiveShield);

        if (!s.playerShieldImmune && intactShields.length > 0 && validTargets.length > 0) {
          // If the card targets effective shields and one exists, auto-select it; otherwise normal choice
          if (playedCard.effects.targetEffectiveShield && effectiveTargets.length > 0) {
            // Find the index of the first effective shield in playerShields
            const effectiveIdx = s.playerShields.findIndex(
              sh => !sh.broken && sh.usedCardId && CARDS[sh.usedCardId]?.effects.effectiveShield,
            );
            if (effectiveIdx !== -1) {
              return { ...s, awaitingShieldChoice: true, pendingOppCardId: playedId,
                // Pre-select effective shield so UI can highlight it
              };
            }
          }
          // Normal case — ask player to choose which shield to sacrifice
          return { ...s, awaitingShieldChoice: true, pendingOppCardId: playedId };
        }

        if (s.playerShieldImmune || (intactShields.length > 0 && validTargets.length === 0)) {
          // Blocked: shields are immune or none match the card requirement — return priority to player (#101)
          const blockMsg = s.playerShieldImmune
            ? "Opponent's attack was deflected — you keep the initiative!"
            : "Opponent's attack was blocked — shields resist this approach!";
          s = addLog(s, blockMsg);
          const blockedDeck = { ...s.oppDeck, discard: [...s.oppDeck.discard, playedId] };
          const [blockedDrawn, blockedFinalDeck] = drawFromDeck(blockedDeck);
          s = { ...s, oppDeck: blockedFinalDeck };
          if (blockedDrawn) s = { ...s, oppHand: [...s.oppHand, blockedDrawn] };
          s = { ...s, priority: 1 };
          s = checkEndCondition(s);
          if (!s.gameOver) s = updatePhase(s);
          s = recomputeCombinations(s);
          return s;
        }

        // intactShields.length === 0: no shields to attack, fall through to standard action cost
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

      // Discard everything not kept into the combined worldDeck pile
      const worldDiscard = [...state.worldDeck.discard, ...handCopy.filter(id => CARDS[id])];

      let s: CombatState = {
        ...state,
        hand: newHand,
        backOfMind: newHand,
        awaitingBackOfMindChoice: false,
        worldDeck: { ...state.worldDeck, discard: worldDiscard },
      };

      const kept = newHand.length;
      s = addLog(s, `Hand discarded — ${kept} card${kept !== 1 ? 's' : ''} kept in Back of Mind.`);
      s = { ...s, opponentActionTrigger: s.opponentActionTrigger + 1, awaitingOpponentAck: true };
      s = recomputeCombinations(s);
      return s;
    }

    case 'ACKNOWLEDGE_OPPONENT': {
      if (!state.awaitingOpponentAck) return state;
      return { ...state, awaitingOpponentAck: false };
    }

    case 'COMBINE_CARDS': {
      // No combining during defense (BotM cards can't be combined mid-opponent-turn)
      if (state.phase === 'defense') return addLog(state, 'Cannot combine cards during the opponent\'s turn.');

      const { ingredient1, ingredient2 } = action;
      if (!state.hand.includes(ingredient1) || !state.hand.includes(ingredient2)) return state;

      // Find matching recipe (ingredients are unordered)
      const recipe = COMBINATIONS.find(r =>
        (r.ingredients[0] === ingredient1 && r.ingredients[1] === ingredient2) ||
        (r.ingredients[0] === ingredient2 && r.ingredients[1] === ingredient1)
      );

      if (!recipe) {
        return addLog(state, "These cards can't be combined.");
      }

      const resultCard = CARDS[recipe.result];
      const newHand = [...state.hand];
      newHand.splice(newHand.indexOf(ingredient1), 1);
      newHand.splice(newHand.indexOf(ingredient2), 1);
      newHand.push(recipe.result);

      let s = addLog(state, `Combined [${CARDS[ingredient1]?.name ?? ingredient1}] + [${CARDS[ingredient2]?.name ?? ingredient2}] → [${resultCard?.name ?? recipe.result}]`);
      s = addLog(s, `Combined into ${resultCard?.name ?? recipe.result}.`);
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
      // Show NPC shield-break reaction after the reveal is dismissed (#88)
      if (s.pendingShieldBreakLine) {
        s = { ...s, activeDialogue: s.pendingShieldBreakLine, pendingShieldBreakLine: null };
      }
      // Re-trigger opponent action if combat should resume in defense phase.
      if (!s.gameOver && s.phase === 'defense' && !s.awaitingShieldChoice) {
        s = triggerOpponentAction(s);
      }
      return s;
    }
  }
}
