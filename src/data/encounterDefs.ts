import { EncounterConfig, CombatState, DEFAULT_COMBAT_CONFIG } from '../combat/types';
import { makeInstance, shuffle } from '../combat/effectHandlers';
import { DEV_SKILL_CARDS, DEV_ENEMY_CARDS } from './devCards';

export const TEST_ENCOUNTER: EncounterConfig = {
  id: 'test_encounter',
  displayName: 'The Informant',
  startingPriority: 5,
  defaultRestorePriority: 5,
  opponentPatience: 10,
  opponentShields: [
    { cardId: 'shield_a', isHint: false, broken: false, loreDescription: 'They looked away when you mentioned the warehouse.' },
    { cardId: 'shield_b', isHint: true, broken: false, hintText: 'They seem nervous about something.', loreDescription: 'A hint: your subject is hiding something personal, not professional.' },
    { cardId: 'shield_c', isHint: false, broken: false, loreDescription: 'The real secret: they witnessed the incident but are afraid to speak.' },
  ],
  shieldBreakOrder: [0, 1, 2],
  playerShields: [],
  unbreakablePlayerShields: false,
  relevantCards: [],
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
  const playerInstances = shuffledPlayer.map(def => makeInstance(def));
  const initialHand = playerInstances.slice(0, DEFAULT_COMBAT_CONFIG.handLimit);
  const initialDeck = playerInstances.slice(DEFAULT_COMBAT_CONFIG.handLimit);

  const enemyInstances = config.enemyDeckCardIds.map(id => {
    const def = allEnemyDefs.find(c => c.id === id) ?? allEnemyDefs[0];
    return makeInstance(def);
  });

  return {
    phase: 'Check',
    priority: config.startingPriority,
    patience: config.opponentPatience,
    lieCounter: 0,
    playerHand: initialHand,
    playerDeck: initialDeck,
    playerDiscard: [],
    backOfMind: [],
    playerShields: Array(DEFAULT_COMBAT_CONFIG.maxPlayerShields).fill(null),
    pendingShieldChoiceSlotIdx: null,
    opponentShields: config.opponentShields.map(s => ({ ...s })),
    pendingReveal: null,
    enemyDeck: enemyInstances,
    enemyDiscard: [],
    stagedEnemyCard: null,
    fieldImpressions: [],
    playedNonRelevantCards: [],
    config,
    combatConfig: DEFAULT_COMBAT_CONFIG,
    pendingEffects: [],
    pendingEffectCard: null,
    pendingPlaceAsShield: false,
    actionLog: ['Encounter started.'],
  };
}
