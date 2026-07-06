/**
 * Test fixtures: a synthetic card set and encounter factory exercising the
 * full v1.4 vocabulary without any real content (tests are content-agnostic,
 * like the engine itself).
 */
import type {
  CardDefinition,
  CombatState,
  CombatAction,
  EncounterConfig,
  InfoNugget,
} from '../../src/engine';
import { buildInitialState, reduce } from '../../src/engine';

const base = {
  keywords: [] as CardDefinition['keywords'],
  color: 'Colorless' as const,
  supertype: 'Skill' as const,
  subtype: null,
  effectText: 'test',
};

export const CARDS: Record<string, CardDefinition> = {};
function card(def: Partial<CardDefinition> & { id: string; cost: number }): void {
  CARDS[def.id] = { ...base, name: def.id, effects: [], ...def } as CardDefinition;
}

card({ id: 'ponder', cost: 1, effects: [{ type: 'DRAW_CARDS', value: 1 }] });

// Player-side skills
card({ id: 'p_noop', cost: 1 });
card({ id: 'p_free', cost: 0 });
card({ id: 'p_break', cost: 2, effects: [{ type: 'BREAK_SHIELDS', target: 'opponent', count: 1 }] });
card({ id: 'p_break3', cost: 1, effects: [{ type: 'BREAK_SHIELDS', target: 'opponent', count: 3 }] });
card({ id: 'p_gain_priority', cost: 0, effects: [{ type: 'MODIFY_PRIORITY', value: 3 }] });
card({ id: 'p_expensive', cost: 9 });
card({ id: 'p_draw', cost: 1, effects: [{ type: 'DRAW_CARDS', value: 2 }] });
card({ id: 'p_patience_up', cost: 1, effects: [{ type: 'MODIFY_PATIENCE', value: 3 }] });
card({ id: 'p_patience_down', cost: 1, effects: [{ type: 'MODIFY_PATIENCE', value: -3 }] });
card({ id: 'p_lie', cost: 0, keywords: ['Lie'] });
card({ id: 'p_safety', cost: 1, keywords: ['Safety'] });
card({
  id: 'p_shield_trigger',
  cost: 1,
  keywords: ['Shield Trigger'],
  shieldTriggerEffects: [{ type: 'MODIFY_PATIENCE', value: 2 }],
});
card({
  id: 'p_heavy',
  cost: 2,
  keywords: ['Heavy Hand'],
  effects: [{ type: 'MODIFY_PATIENCE', value: -1 }],
  heavyHandEffects: [{ type: 'MODIFY_PATIENCE', value: -1 }, { type: 'BREAK_SHIELDS', target: 'opponent', count: 1 }],
});
card({
  id: 'p_choose',
  cost: 1,
  effects: [
    { type: 'CHOOSE_NUMBER', min: 1, max: 10 },
    { type: 'MODIFY_PATIENCE', value: 1, scale: { kind: 'CHOSEN_NUMBER' } },
  ],
});
card({
  id: 'p_trap_cancel',
  cost: 2,
  keywords: ['Trap'],
  subtype: 'Trap',
  trapTrigger: { event: 'CARD_STAGED', controllerFilter: 'opponent' },
  effects: [{ type: 'CANCEL_STAGED_CARD' }],
});
card({
  id: 'p_trap_rapport',
  cost: 2,
  keywords: ['Trap', 'Rapport'],
  subtype: 'Trap',
  rapport: { min: 1, max: 10, checked: { kind: 'STAGED_CARD_COST' } },
  trapTrigger: {
    event: 'CARD_STAGED',
    controllerFilter: 'opponent',
    condition: { compare: { lhs: { kind: 'STAGED_CARD_COST' }, op: 'eq', rhs: { kind: 'CHOSEN_NUMBER' } } },
  },
  effects: [{ type: 'CANCEL_STAGED_CARD' }, { type: 'MODIFY_PATIENCE', value: 1, scale: { kind: 'CHOSEN_NUMBER' } }],
});
card({
  id: 'p_trap_on_patience',
  cost: 1,
  keywords: ['Trap'],
  subtype: 'Trap',
  trapTrigger: {
    event: 'PATIENCE_CHANGED',
    condition: { compare: { lhs: { kind: 'EVENT_NEW_VALUE' }, op: 'lt', rhs: { kind: 'CONST', value: 5 } } },
  },
  effects: [{ type: 'MODIFY_PRIORITY', value: 2 }],
});
// NPC trap that responds to PLAYER_TURN_START (a player-owned trap cannot:
// it expires at §4.1 step 4, before the step-9 dispatch).
card({
  id: 'n_trap_pts',
  cost: 1,
  keywords: ['Trap'],
  subtype: 'Trap',
  trapTrigger: { event: 'PLAYER_TURN_START' },
  effects: [
    {
      type: 'APPLY_RESTRICTION',
      restriction: { type: 'PREVENT_DRAW', target: 'opponent', expiry: { boundary: 'PLAYER_TURN_START', occurrences: 1 } },
    },
    { type: 'MODIFY_PATIENCE', value: -1 },
  ],
});
card({
  id: 'p_impression_on_break',
  cost: 2,
  subtype: 'Impression',
  triggeredAbilities: [
    {
      id: 'gain_on_break',
      trigger: { event: 'SHIELD_BROKEN', controllerFilter: 'self' },
      effects: [{ type: 'MODIFY_PRIORITY', value: 1 }],
    },
  ],
});
card({
  id: 'p_token_maker',
  cost: 1,
  effects: [{ type: 'CREATE_TOKEN', tokenDefinitionId: 'tok_chain', count: 1 }],
});
card({
  id: 'p_token_smash',
  cost: 1,
  effects: [{ type: 'DESTROY_TOKENS', count: 2 }],
});
card({
  id: 'p_replacer',
  cost: 1,
  effects: [
    {
      type: 'APPLY_REPLACEMENT',
      originalTokenId: 'tok_chain',
      replacementTokenId: 'tok_boom',
      expiry: { boundary: 'PLAYER_TURN_END', occurrences: 1 },
    },
  ],
});
card({
  id: 'p_scheduler',
  cost: 1,
  effects: [
    {
      type: 'SCHEDULE_EFFECTS',
      effects: [{ type: 'MODIFY_PRIORITY', value: 4 }],
      at: { boundary: 'PLAYER_TURN_START', occurrences: 1 },
    },
  ],
});
card({
  id: 'p_copy',
  cost: 1,
  effects: [{ type: 'COPY_FROM_NPC_DECK', count: 1, patienceCostOverride: { kind: 'CONST', value: 2 } }],
});
card({
  id: 'p_counter_feeder',
  cost: 0,
  effects: [{ type: 'INCREMENT_COUNTERS', counterName: 'devotion', targetDefinitionId: 'n_counter_impression', amount: 2 }],
});

card({
  id: 'p_trap_draw',
  cost: 1,
  keywords: ['Trap'],
  subtype: 'Trap',
  trapTrigger: { event: 'CARD_PLAYED', controllerFilter: 'opponent' },
  effects: [{ type: 'DRAW_CARDS', value: 1 }],
});
card({
  id: 'p_impression_battery',
  cost: 1,
  subtype: 'Impression',
  activatedAbilities: [
    { id: 'surge', name: 'Surge', cost: { patience: 1 }, effects: [{ type: 'MODIFY_PRIORITY', value: 6 }] },
  ],
});

// Information cards
card({ id: 'info_a', cost: 0, supertype: 'Information', nuggetId: 'nug_a' });
card({ id: 'info_b', cost: 0, supertype: 'Information', nuggetId: 'nug_b' });
card({ id: 'info_c', cost: 0, supertype: 'Information', nuggetId: 'nug_c' });

// Core-shield lore cards
card({ id: 'lore_1', cost: 0 });
card({ id: 'lore_2', cost: 0 });

// NPC cards
card({ id: 'n_noop', cost: 1 });
card({ id: 'n_free', cost: 0 });
card({ id: 'n_break', cost: 1, effects: [{ type: 'BREAK_SHIELDS', target: 'opponent', count: 1 }] });
card({ id: 'n_break2', cost: 1, effects: [{ type: 'BREAK_SHIELDS', target: 'opponent', count: 2 }] });
card({ id: 'n_break5', cost: 1, effects: [{ type: 'BREAK_SHIELDS', target: 'opponent', count: 5 }] });
card({ id: 'n_patience_drain', cost: 1, effects: [{ type: 'MODIFY_PATIENCE', value: -2 }] });
card({ id: 'n_guards_up', cost: 1, effects: [{ type: 'PLACE_SHIELDS', target: 'self', count: 2 }] });
card({ id: 'n_self_break', cost: 1, effects: [{ type: 'BREAK_SHIELDS', target: 'self', count: 1 }] });
card({ id: 'n_draw_blocker', cost: 1, effects: [
  {
    type: 'APPLY_RESTRICTION',
    restriction: { type: 'PREVENT_DRAW', target: 'opponent', expiry: { boundary: 'PLAYER_TURN_END', occurrences: 1 } },
  },
] });
card({
  id: 'n_impression_ts',
  cost: 1,
  subtype: 'Impression',
  turnStartEffects: [{ type: 'MODIFY_PATIENCE', value: -1 }],
});
card({
  id: 'n_counter_impression',
  cost: 0,
  subtype: 'Impression',
  thresholds: [
    { counterName: 'devotion', value: 4, consume: true, effects: [{ type: 'BREAK_SHIELDS', target: 'opponent', count: 1 }], checkPoint: 'AFTER_ANY_PLAY' },
  ],
});
card({
  id: 'n_trap_on_play',
  cost: 1,
  keywords: ['Trap'],
  subtype: 'Trap',
  trapTrigger: { event: 'CARD_PLAYED', controllerFilter: 'opponent' },
  effects: [{ type: 'MODIFY_PATIENCE', value: -1 }],
});

export const TOKENS: Record<string, CardDefinition> = {
  tok_chain: {
    ...base,
    id: 'tok_chain',
    name: 'tok_chain',
    cost: 0,
    subtype: 'Token',
    effects: [],
    leaveTriggerEffects: [{ type: 'DRAW_CARDS', value: 1 }],
  },
  tok_boom: {
    ...base,
    id: 'tok_boom',
    name: 'tok_boom',
    cost: 0,
    subtype: 'Token',
    effects: [],
    leaveTriggerEffects: [{ type: 'BREAK_SHIELDS', target: 'opponent', count: 1 }],
  },
};
// Token defs must also be resolvable through the card registry used by getDef.
for (const t of Object.values(TOKENS)) CARDS[t.id] = t;

export const NUGGETS: Record<string, InfoNugget> = {
  nug_a: { id: 'nug_a', name: 'Nugget A', description: 'a' },
  nug_b: { id: 'nug_b', name: 'Nugget B', description: 'b' },
  nug_c: { id: 'nug_c', name: 'Nugget C', description: 'c' },
};

export function makeEncounter(overrides: Partial<EncounterConfig> = {}): EncounterConfig {
  return {
    id: 'test',
    displayName: 'Test Encounter',
    minTurnStartPriority: 3,
    firstTurnBonusPriority: 2,
    maxPriority: 10,
    startingSide: 'player',
    opponentPatience: 10,
    npcGuardShieldCount: 2,
    opponentShields: [
      { cardId: 'lore_1', isHint: false, loreDescription: 'lore one', keyNuggetIds: ['nug_a'] },
      { cardId: 'lore_2', isHint: true, hintText: 'hint', loreDescription: 'lore two', keyNuggetIds: ['nug_b'] },
    ],
    npcHandLimit: 5,
    playerDummyShieldSlots: 3,
    allowedCoreShields: [],
    nuggetOverrides: [
      { nuggetId: 'nug_a', cost: 1, effects: [{ type: 'DRAW_CARDS', value: 1 }], effectText: 'draw 1' },
      { nuggetId: 'nug_b', cost: 0, effects: [], effectText: 'nothing' },
    ],
    traits: [],
    enemyDeckCardIds: ['n_noop', 'n_noop', 'n_noop', 'n_noop', 'n_noop', 'n_noop'],
    lieThreshold: 2,
    ...overrides,
  };
}

export interface StartOptions {
  config?: Partial<EncounterConfig>;
  deck?: string[];
  collection?: string[];
  seed?: number;
  persistent?: Parameters<typeof buildInitialState>[0]['persistent'];
}

export function start(opts: StartOptions = {}): CombatState {
  return buildInitialState({
    config: makeEncounter(opts.config),
    cards: CARDS,
    tokens: TOKENS,
    nuggets: NUGGETS,
    playerDeckCardIds: opts.deck ?? Array(12).fill('p_noop'),
    collectionCardIds: opts.collection ?? [],
    seed: opts.seed ?? 42,
    persistent: opts.persistent,
  });
}

/** Play the hand card with the given definition id (must be in hand). */
export function playCard(state: CombatState, defId: string, heavyHand = false): CombatState {
  const idx = state.player.hand.findIndex((c) => c.definitionId === defId);
  if (idx === -1) throw new Error(`${defId} not in hand: ${state.player.hand.map((c) => c.definitionId).join(',')}`);
  return reduce(state, { type: 'PLAY_CARD', handIndex: idx, heavyHand });
}

export function act(state: CombatState, action: CombatAction): CombatState {
  return reduce(state, action);
}

/** End the player turn, auto-completing BotM with an empty keep. */
export function endTurn(state: CombatState): CombatState {
  let s = reduce(state, { type: 'END_TURN' });
  if (s.phase === 'BotMSelect') s = reduce(s, { type: 'BOTM_SELECT', keepHandIndices: [] });
  return s;
}

/** Run the whole NPC turn via ADVANCE until control returns to the player or the game ends. */
export function runNpcTurn(state: CombatState): CombatState {
  let s = state;
  let guard = 0;
  while (s.phase === 'EnemyPending') {
    if (++guard > 50) throw new Error('NPC turn did not terminate');
    s = reduce(s, { type: 'ADVANCE' });
    while (s.pendingBlock?.type === 'reveal' || s.pendingBlock?.type === 'deckReveal') {
      s = reduce(s, { type: 'ACKNOWLEDGE' });
    }
  }
  return s;
}
