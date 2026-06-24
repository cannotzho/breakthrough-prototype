import { EncounterConfig, CombatState, DEFAULT_COMBAT_CONFIG, PlayerShieldSlot } from '../combat/types';
import { makeInstance, shuffle } from '../combat/effectHandlers';
import { DEV_SKILL_CARDS, DEV_ENEMY_CARDS, DEV_TOKEN_DEFINITIONS } from './devCards';

export const TEST_ENCOUNTER: EncounterConfig = {
  id: 'test_encounter',
  displayName: 'The Informant',
  startingPriority: 5,
  defaultRestorePriority: 5,
  priorityMode: 'frame',
  opponentPatience: 10,
  opponentShields: [
    { cardId: 'shield_a', isHint: false, broken: false, loreDescription: 'They looked away when you mentioned the warehouse.' },
    { cardId: 'shield_b', isHint: true, broken: false, hintText: 'They seem nervous about something.', loreDescription: 'A hint: your subject is hiding something personal, not professional.' },
    { cardId: 'shield_c', isHint: false, broken: false, loreDescription: 'The real secret: they witnessed the incident but are afraid to speak.' },
  ],
  shieldBreakOrder: [0, 1, 2],
  playerDummyShieldSlots: 3,
  allowedCoreShields: [],
  unbreakablePlayerShields: false,
  nuggetOverrides: [],
  traits: [
    { id: 'trait_nervous', name: 'Nervous', description: 'Cards with Intimidate have no effect.', discovered: false },
  ],
  retryable: true,
  lieThreshold: 3,
  enemyDeckCardIds: ['dev_enemy_dismiss', 'dev_enemy_deflect', 'dev_enemy_deflect'],
};

export const CLASSIC_TEST_ENCOUNTER: EncounterConfig = {
  id: 'classic_test_encounter',
  displayName: 'The Informant (Classic)',
  startingPriority: 5,
  defaultRestorePriority: 5,
  priorityMode: 'classic',
  opponentPatience: 10,
  opponentShields: [
    { cardId: 'shield_a', isHint: false, broken: false, loreDescription: 'They looked away when you mentioned the warehouse.' },
    { cardId: 'shield_b', isHint: true, broken: false, hintText: 'They seem nervous about something.', loreDescription: 'A hint: your subject is hiding something personal, not professional.' },
    { cardId: 'shield_c', isHint: false, broken: false, loreDescription: 'The real secret: they witnessed the incident but are afraid to speak.' },
  ],
  shieldBreakOrder: [0, 1, 2],
  playerDummyShieldSlots: 3,
  allowedCoreShields: [],
  unbreakablePlayerShields: false,
  nuggetOverrides: [],
  traits: [
    { id: 'trait_nervous', name: 'Nervous', description: 'Cards with Intimidate have no effect.', discovered: false },
  ],
  retryable: true,
  lieThreshold: 3,
  enemyDeckCardIds: ['dev_enemy_dismiss', 'dev_enemy_deflect', 'dev_enemy_deflect'],
};

export function buildInitialCombatState(config: EncounterConfig): CombatState {
  const allEnemyDefs = [...DEV_ENEMY_CARDS];

  const playerDeckDefs = [...DEV_SKILL_CARDS, ...DEV_SKILL_CARDS];
  const shuffledPlayer = shuffle([...playerDeckDefs]);
  const playerInstances = shuffledPlayer.map(def => makeInstance(def, 'player'));
  const initialHand = playerInstances.slice(0, DEFAULT_COMBAT_CONFIG.handLimit);
  const initialDeck = playerInstances.slice(DEFAULT_COMBAT_CONFIG.handLimit);

  const enemyInstances = config.enemyDeckCardIds.map(id => {
    const def = allEnemyDefs.find(c => c.id === id) ?? allEnemyDefs[0];
    return makeInstance(def, 'npc');
  });

  // Build shield slots: dummy slots first, then core shields
  const dummySlots: (PlayerShieldSlot | null)[] = Array(config.playerDummyShieldSlots).fill(null);

  // Core shields are auto-placed if the player's collection contains the required cards
  // For now, since there's no collection system, core shields from allowedCoreShields
  // would be auto-placed if matching cards exist in the deck
  const coreSlots: (PlayerShieldSlot | null)[] = [];
  // (Core shield auto-placement will be implemented when the collection system is ready)

  const shieldSlots = [...dummySlots, ...coreSlots];

  return {
    phase: 'Check',
    priority: config.startingPriority,
    npcPriority: config.priorityMode === 'classic' ? config.startingPriority : 0,
    patience: config.opponentPatience,
    lieCounter: 0,
    playerHand: initialHand,
    playerDeck: initialDeck,
    playerDiscard: [],
    backOfMind: [],
    playerShields: shieldSlots,
    shieldsEverPlaced: 0,
    opponentShields: config.opponentShields.map(s => ({ ...s })),
    pendingReveal: null,
    enemyDeck: enemyInstances,
    enemyDiscard: [],
    stagedEnemyCard: null,
    fieldImpressions: [],
    fieldTokens: [],
    fieldTraps: [],
    trapPlayCounter: 0,
    playedNonRelevantCards: [],
    config,
    combatConfig: DEFAULT_COMBAT_CONFIG,
    pendingEffects: [],
    pendingEffectCard: null,
    pendingPlaceAsShield: false,
    pendingShieldTriggers: [],
    triggerDepth: 0,
    pendingDiscovery: null,
    discoveredNuggetIds: [],
    activeTurn: 'player',
    manualEnemyMode: false,
    tokenRegistry: { ...DEV_TOKEN_DEFINITIONS },
    actionLog: ['Encounter started.'],
  };
}
