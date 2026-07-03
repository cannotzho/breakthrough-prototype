import { EncounterConfig, CombatState, DEFAULT_COMBAT_CONFIG, PlayerShieldSlot, CardDefinition } from '../combat/types';
import { makeInstance, shuffle } from '../combat/effectHandlers';
import { DEV_SKILL_CARDS, DEV_ENEMY_CARDS, DEV_TOKEN_DEFINITIONS, FAN_CLUB_PRESIDENT_CARDS } from './devCards';

const DUMMY_SHIELD_DEF: CardDefinition = {
  id: 'dummy_shield',
  name: 'Dummy Shield',
  cost: 0,
  keywords: [],
  effects: [],
  color: 'Colorless',
  supertype: 'Skill',
  subtype: null,
  effectText: 'A basic shield. Costs 1 Patience when broken.',
};

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
  npcDummyShieldSlots: 10,
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
  npcDummyShieldSlots: 10,
  enemyDeckCardIds: ['dev_enemy_dismiss', 'dev_enemy_deflect', 'dev_enemy_deflect'],
};

export const FAN_CLUB_PRESIDENT_ENCOUNTER: EncounterConfig = {
  id: 'fan_club_president',
  displayName: 'The Fan Club President',
  startingPriority: 5,
  defaultRestorePriority: 5,
  priorityMode: 'frame',
  opponentPatience: 15,
  opponentShields: [
    { cardId: 'fcp_fans_solace', isHint: false, broken: false, loreDescription: 'Their devotion gives them comfort even in defeat.' },
    { cardId: 'fcp_moment_of_clarity', isHint: true, broken: false, hintText: 'A crack in their obsession — push harder.', loreDescription: 'For a fleeting moment, they see the truth.' },
    { cardId: 'fcp_crippling_fear', isHint: false, broken: false, loreDescription: 'Fear grips them — they know what they saw.' },
    { cardId: 'fcp_it_wasnt_me', isHint: false, broken: false, loreDescription: 'Desperate denial — they cling to the lie.' },
  ],
  shieldBreakOrder: [0, 1, 2, 3],
  playerDummyShieldSlots: 3,
  allowedCoreShields: [],
  unbreakablePlayerShields: false,
  nuggetOverrides: [],
  traits: [
    { id: 'trait_obsessive', name: 'Obsessive', description: 'Devotion fuels their every action.', discovered: false },
  ],
  retryable: true,
  lieThreshold: 3,
  npcDummyShieldSlots: 5,
  enemyDeckCardIds: [
    'fcp_youre_a_hindrance',
    'fcp_panicked_memories',
    'fcp_im_his',
    'fcp_blind_loyalty',
    'fcp_he_loves_me',
    'fcp_he_really_loves_me',
    'fcp_im_never_alone',
    'fcp_fantasy',
    'fcp_complete_devotion',
    'fcp_his_loyal_fan',
    'fcp_deranged_witness',
    'fcp_my_only_meaning',
    'fcp_and_hes_mine',
    'fcp_impenetrable_insanity',
    'fcp_lunatic_love',
    'fcp_distracting_madness',
    'fcp_unhinged_focus',
    'fcp_youll_never_tear_us_apart',
  ],
  scheduledPlays: [
    { cardId: 'fcp_my_only_meaning', afterTurn: 5 },
  ],
  startingImpressions: ['fcp_idols_favor'],
};

export function buildInitialCombatState(
  config: EncounterConfig,
  playerDeckDefs?: CardDefinition[],
): CombatState {
  const allEnemyDefs = [...DEV_ENEMY_CARDS, ...FAN_CLUB_PRESIDENT_CARDS];
  const allDefsLookup = [...allEnemyDefs, ...Object.values(DEV_TOKEN_DEFINITIONS)];

  const resolvedPlayerDeck = playerDeckDefs ?? [...DEV_SKILL_CARDS, ...DEV_SKILL_CARDS];
  const shuffledPlayer = shuffle([...resolvedPlayerDeck]);
  const playerInstances = shuffledPlayer.map(def => makeInstance(def, 'player'));
  const initialHand = playerInstances.slice(0, DEFAULT_COMBAT_CONFIG.handLimit);
  const initialDeck = playerInstances.slice(DEFAULT_COMBAT_CONFIG.handLimit);

  const enemyInstances = config.enemyDeckCardIds.map(id => {
    const def = allDefsLookup.find(c => c.id === id) ?? allEnemyDefs[0];
    return makeInstance(def, 'npc');
  });

  // Build shield slots: dummy slots auto-filled, then core shields
  const dummySlots: PlayerShieldSlot[] = Array.from(
    { length: config.playerDummyShieldSlots },
    () => ({
      card: makeInstance(DUMMY_SHIELD_DEF, 'player'),
      shieldType: 'dummy' as const,
      patienceCostOnBreak: 1,
    }),
  );

  const coreSlots: (PlayerShieldSlot | null)[] = [];

  const shieldSlots: (PlayerShieldSlot | null)[] = [...dummySlots, ...coreSlots];

  const npcDummyCount = config.npcDummyShieldSlots ?? 10;
  const adjustedConfig = npcDummyCount > 0 && config.shieldBreakOrder
    ? {
        ...config,
        shieldBreakOrder: [
          ...Array.from({ length: npcDummyCount }, (_, i) => i),
          ...config.shieldBreakOrder.map(idx => idx + npcDummyCount),
        ],
      }
    : config;

  return {
    phase: 'Check',
    priority: adjustedConfig.startingPriority,
    npcPriority: adjustedConfig.priorityMode === 'classic' ? adjustedConfig.startingPriority : 0,
    patience: adjustedConfig.opponentPatience,
    lieCounter: 0,
    playerHand: initialHand,
    playerDeck: initialDeck,
    playerDiscard: [],
    backOfMind: [],
    playerShields: shieldSlots,
    shieldsEverPlaced: dummySlots.length,
    opponentShields: [
      ...Array.from({ length: npcDummyCount }, (_, i) => ({
        cardId: `npc_dummy_${i}`,
        isHint: false,
        broken: false,
      })),
      ...adjustedConfig.opponentShields.map(s => ({ ...s })),
    ],
    pendingReveal: null,
    enemyDeck: enemyInstances,
    enemyDiscard: [],
    stagedEnemyCard: null,
    fieldImpressions: (config.startingImpressions ?? []).map(id => {
      const def = allDefsLookup.find(c => c.id === id);
      if (!def) return null;
      return { card: makeInstance(def, 'npc'), counters: 0 };
    }).filter((fi): fi is NonNullable<typeof fi> => fi !== null),
    fieldTokens: [],
    fieldTraps: [],
    trapPlayCounter: 0,
    playedNonRelevantCards: [],
    config: adjustedConfig,
    combatConfig: DEFAULT_COMBAT_CONFIG,
    pendingEffects: [],
    pendingEffectCard: null,
    pendingPlaceAsShield: false,
    pendingShieldTriggers: [],
    triggerDepth: 0,
    pendingDiscovery: null,
    discoveredNuggetIds: [],
    pendingNumberChoice: null,
    chosenNumber: null,
    pendingDeckReveal: null,
    npcHandRevealed: false,
    npcDeckTopRevealed: false,
    npcShieldsBrokenThisTurn: 0,
    activeTurn: 'player',
    activeRestrictions: [],
    activeReplacements: [],
    npcCardsPlayedThisTurn: 0,
    npcExtraDrawsThisTurn: 0,
    npcPriorityGainedThisTurn: 0,
    playerCardsPlayedThisTurn: 0,
    playerShieldsBrokenThisTurn: 0,
    playerShieldsBrokenPrevTurn: 0,
    playerShieldsBrokenByNpcThisTurn: 0,
    patienceLostByNpcThisTurn: 0,
    npcShieldsPlacedThisTurn: 0,
    abilitiesFiredThisPlay: [],
    turnAbilityFireCounts: {},
    scheduledEffects: [],
    turnNumber: 1,
    manualEnemyMode: false,
    tokenRegistry: {
      ...DEV_TOKEN_DEFINITIONS,
      ...Object.fromEntries(
        config.opponentShields
          .map(s => allDefsLookup.find(c => c.id === s.cardId))
          .filter((d): d is CardDefinition => d != null)
          .map(d => [d.id, d])
      ),
    },
    actionLog: ['Encounter started.'],
  };
}
