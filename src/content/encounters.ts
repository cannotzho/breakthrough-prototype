/**
 * Encounters, redesigned for v1.4 lock-and-keys + the v1.4.1 two-tier shield
 * clarification (Ken): Guard Shields total 10 by default and may include
 * card-backed shield-trigger guards; Core Shields (locks) sit behind them on
 * Elite/Boss encounters.
 *
 * Key-nugget assignments are Ken-approved working values, pending a later
 * design revision pass (marked DRAFT).
 */
import type { EncounterConfig } from '../engine';

/** The Informant — standard encounter: 10 dummy guards, three locks. */
export const TEST_ENCOUNTER: EncounterConfig = {
  id: 'test_encounter',
  displayName: 'The Informant',
  minTurnStartPriority: 3,
  firstTurnBonusPriority: 2,
  maxPriority: 10,
  startingSide: 'player',
  opponentPatience: 10,
  npcGuardShieldCount: 10, // v1.4.1 default total
  opponentShields: [
    {
      cardId: 'info_warehouse_logs',
      isHint: false,
      loreDescription: 'They looked away when you mentioned the warehouse.',
      keyNuggetIds: ['warehouse_activity'], // DRAFT (approved as working values)
    },
    {
      cardId: 'hint_informant_personal',
      isHint: true,
      hintText: 'They seem nervous about something.',
      loreDescription: 'A hint: your subject is hiding something personal, not professional.',
      keyNuggetIds: ['personal_troubles'], // DRAFT
    },
    {
      cardId: 'info_incident_report',
      isHint: false,
      loreDescription: 'The real secret: they witnessed the incident but are afraid to speak.',
      keyNuggetIds: ['witnessed_incident', 'personal_troubles'], // DRAFT — one lock, two keys
    },
  ],
  npcHandLimit: 5,
  playerDummyShieldSlots: 3,
  allowedCoreShields: [],
  nuggetOverrides: [
    {
      nuggetId: 'warehouse_activity',
      cost: 1,
      effects: [{ type: 'MODIFY_PATIENCE', value: -2 }, { type: 'DRAW_CARDS', value: 1 }],
      effectText: 'Pay 2 Patience. Draw a card. (Confronting them with the logs rattles them.)',
    },
    {
      nuggetId: 'personal_troubles',
      cost: 0,
      effects: [{ type: 'MODIFY_PATIENCE', value: 2 }],
      effectText: 'Restore 2 Patience. (Showing you understand their situation calms them.)',
    },
    {
      nuggetId: 'witnessed_incident',
      cost: 2,
      effects: [{ type: 'BREAK_SHIELDS', target: 'opponent', count: 1 }],
      effectText: 'Break 1 Guard Shield. (The report leaves them nowhere to hide.)',
    },
  ],
  traits: [
    { id: 'trait_nervous', name: 'Nervous', description: 'Cards with Intimidate have no effect.' },
  ],
  retryable: true,
  lieThreshold: 3,
  enemyDeckCardIds: ['dev_enemy_dismiss', 'dev_enemy_deflect', 'dev_enemy_deflect'],
};

/**
 * The Fan Club President — Elite encounter (v1.4.1): 10 Guards, two of them
 * card-backed shield-trigger guards; three Core Shield locks behind them.
 */
export const FAN_CLUB_PRESIDENT_ENCOUNTER: EncounterConfig = {
  id: 'fan_club_president',
  displayName: 'The Fan Club President',
  minTurnStartPriority: 3,
  firstTurnBonusPriority: 2,
  maxPriority: 10,
  startingSide: 'player',
  opponentPatience: 15,
  npcGuardShieldCount: 10, // total; 8 dummies + the two card guards below
  npcGuardShieldCardIds: ['fcp_fans_solace', 'fcp_panicked_memories'],
  opponentShields: [
    {
      cardId: 'fcp_moment_of_clarity',
      isHint: true,
      hintText: 'A crack in their obsession — push harder.',
      loreDescription: 'For a fleeting moment, they see the truth.',
      keyNuggetIds: ['fcp_idol_schedule'], // DRAFT
    },
    {
      cardId: 'fcp_crippling_fear',
      isHint: false,
      loreDescription: 'Fear grips them — they know what they saw.',
      // One lock, two possible keys (§3.3 — either suffices, per Ken).
      keyNuggetIds: ['fcp_passcode_knowledge', 'fcp_physical_traces'],
    },
    {
      cardId: 'fcp_it_wasnt_me',
      isHint: false,
      loreDescription: 'Desperate denial — they cling to the lie.',
      keyNuggetIds: ['fcp_witness_statements'], // DRAFT
    },
  ],
  npcHandLimit: 5,
  playerDummyShieldSlots: 3,
  allowedCoreShields: [],
  nuggetOverrides: [
    {
      nuggetId: 'fcp_fan_letters',
      cost: 1,
      effects: [{ type: 'MODIFY_PATIENCE', value: 3 }],
      effectText: 'Restore 3 Patience. (Handling the letters gently earns a sliver of trust.)',
    },
    {
      nuggetId: 'fcp_idol_schedule',
      cost: 1,
      effects: [{ type: 'DRAW_CARDS', value: 2 }],
      effectText: 'Draw 2 cards. (The annotations tell you exactly what to ask next.)',
    },
    {
      nuggetId: 'fcp_passcode_knowledge',
      cost: 2,
      effects: [{ type: 'MODIFY_PATIENCE', value: -3 }, { type: 'BREAK_SHIELDS', target: 'opponent', count: 1 }],
      effectText: 'Pay 3 Patience. Break 1 Guard Shield. (Reciting the code shakes them badly.)',
    },
    {
      nuggetId: 'fcp_physical_traces',
      cost: 2,
      effects: [{ type: 'BREAK_SHIELDS', target: 'opponent', count: 1 }],
      effectText: 'Break 1 Guard Shield. (The evidence is impossible to wave away.)',
    },
    {
      nuggetId: 'fcp_witness_statements',
      cost: 1,
      effects: [{ type: 'MODIFY_PATIENCE', value: -2 }, { type: 'DRAW_CARDS', value: 1 }],
      effectText: 'Pay 2 Patience. Draw a card. (Three accounts, one name. They flinch.)',
    },
  ],
  traits: [
    { id: 'trait_obsessive', name: 'Obsessive', description: 'Devotion fuels their every action.' },
  ],
  retryable: true,
  lieThreshold: 3,
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
  scheduledPlays: [{ cardId: 'fcp_my_only_meaning', afterTurn: 5 }],
  startingImpressions: ['fcp_idols_favor'],
};

export const ENCOUNTERS: Record<string, EncounterConfig> = {
  [TEST_ENCOUNTER.id]: TEST_ENCOUNTER,
  [FAN_CLUB_PRESIDENT_ENCOUNTER.id]: FAN_CLUB_PRESIDENT_ENCOUNTER,
};
