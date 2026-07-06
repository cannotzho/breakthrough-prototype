/**
 * Initial combat state construction. Validates config (v1.4 §15.5), seeds the
 * RNG, auto-fills Placeholder Shields (§3.4), sets aside scheduled plays
 * (§10), and runs the starting side's Turn Start boundary.
 */
import type {
  CardDefinition,
  CardInstance,
  CombatState,
  CombinationRecipe,
  EncounterConfig,
  InfoNugget,
  Side,
} from './types';
import { BOTM_BASE_LIMIT, log, newId, placePlaceholderShields, addPermanent, runStack } from './core';
import { shuffleWithRng } from './rng';
import { assertValid, validateCard, validateEncounter } from './validation';
import { check, startFirstTurn } from './boundaries';

export interface SetupInput {
  config: EncounterConfig;
  cards: Record<string, CardDefinition>;
  tokens: Record<string, CardDefinition>;
  nuggets: Record<string, InfoNugget>;
  /** The player's Conversation Deck as definition ids. */
  playerDeckCardIds: string[];
  /** The player's Collection (for Core Shield auto-placement, §3.4.3). */
  collectionCardIds: string[];
  /** Global Assemble recipes (v1.4 §11). */
  recipes?: CombinationRecipe[];
  seed: number;
  /** Persisted cross-session state (v1.4 §12). */
  persistent?: {
    discoveredNuggetIds?: string[];
    playedNonRelevantCards?: string[];
    discoveredTraitIds?: string[];
    /** Persistent opponent-core-shield breaks for retryable encounters. */
    brokenCoreShieldCardIds?: string[];
  };
}

export function buildInitialState(input: SetupInput): CombatState {
  const { config, cards, tokens, nuggets } = input;

  const issues = [
    ...validateEncounter(config, cards, nuggets),
    ...Object.values(cards).flatMap(validateCard),
  ];
  assertValid(issues);

  const state: CombatState = {
    schemaVersion: 1,
    phase: 'Check',
    result: null,
    loseReason: null,
    rngState: input.seed | 0,
    round: 0,
    activeTurn: config.startingSide,
    firstTurnOfCombatDone: false,
    patience: config.opponentPatience,
    startingPatience: config.opponentPatience,
    lieCounter: 0,
    player: emptySide(),
    npc: emptySide(),
    backOfMind: [],
    backOfMindLimitBase: BOTM_BASE_LIMIT,
    playerShields: [],
    shieldLossArmed: false,
    npcGuardsStanding: config.npcGuardShieldCount,
    npcCoreShields: config.opponentShields.map((s) => ({
      ...s,
      broken: (config.retryable && input.persistent?.brokenCoreShieldCardIds?.includes(s.cardId)) ?? false,
    })),
    field: [],
    nextArrivalOrder: 0,
    restrictions: [],
    replacements: [],
    scheduledEffects: [],
    npcScheduledAside: [],
    stagedCard: null,
    stagedCancelled: false,
    turnEndPending: false,
    gainedCardIds: [],
    effectStack: [],
    pendingPlay: null,
    pendingBlock: null,
    resolutionHalted: false,
    oppShieldsBrokenByPlayerThisTurn: 0,
    oppShieldsBrokenByPlayerPrevTurn: 0,
    playerShieldsBrokenByNpcThisTurn: 0,
    guardsPlacedByNpcThisTurn: 0,
    abilityFiresThisPlay: {},
    abilityFiresThisTurn: {},
    npcHandRevealed: false,
    npcDeckTopRevealed: false,
    discoveredNuggetIds: [...(input.persistent?.discoveredNuggetIds ?? [])],
    playedNonRelevantCards: [
      ...(input.persistent?.playedNonRelevantCards ?? config.playedNonRelevantCards ?? []),
    ],
    discoveredTraitIds: [...(input.persistent?.discoveredTraitIds ?? [])],
    config,
    cards,
    tokens,
    nuggets,
    recipes: input.recipes ?? [],
    nextId: 0,
    logSeq: 0,
    log: [],
  };

  log(state, 'setup', `Encounter started: ${config.displayName}`, { encounterId: config.id, seed: input.seed });

  // Player deck: scripted order (tutorial) or seeded shuffle.
  const playerCards: CardInstance[] = (config.scriptedDrawOrder ?? input.playerDeckCardIds).map((id) => ({
    instanceId: newId(state, 'card'),
    definitionId: id,
    owner: 'player' as Side,
  }));
  if (config.scriptedDrawOrder) {
    state.player.deck = playerCards;
  } else {
    const r = shuffleWithRng(playerCards, state.rngState);
    state.rngState = r.rngState;
    state.player.deck = r.items;
  }

  // NPC deck: scheduled plays are set aside — excluded from draws (§10).
  const scheduledIds = new Set<string>();
  const aside: { card: CardInstance; afterTurn: number }[] = [];
  const deckIds: string[] = [];
  for (const id of config.enemyDeckCardIds) {
    const sp = (config.scheduledPlays ?? []).find((p) => p.cardId === id && !scheduledIds.has(id));
    if (sp) {
      scheduledIds.add(id);
      aside.push({ card: { instanceId: newId(state, 'card'), definitionId: id, owner: 'npc' }, afterTurn: sp.afterTurn });
    } else {
      deckIds.push(id);
    }
  }
  const npcCards: CardInstance[] = deckIds.map((id) => ({
    instanceId: newId(state, 'card'),
    definitionId: id,
    owner: 'npc' as Side,
  }));
  if (config.scriptedOpponentPlays) {
    const order = [...config.scriptedOpponentPlays];
    const rank = (id: string) => {
      const i = order.indexOf(id);
      return i === -1 ? Number.MAX_SAFE_INTEGER : i; // unlisted cards go last
    };
    npcCards.sort((a, b) => rank(a.definitionId) - rank(b.definitionId));
    state.npc.deck = npcCards;
  } else {
    const r = shuffleWithRng(npcCards, state.rngState);
    state.rngState = r.rngState;
    state.npc.deck = r.items;
  }
  state.npcScheduledAside = aside;

  // Player shields: placeholders auto-fill all dummy slots (§3.4.1)…
  placePlaceholderShields(state, config.playerDummyShieldSlots);
  // …then Core Shields auto-place from the Collection (§3.4.3, no substitution).
  for (const coreDef of config.allowedCoreShields) {
    if (!input.collectionCardIds.includes(coreDef.cardId)) continue;
    state.playerShields.push({
      slotId: newId(state, 'shield'),
      shieldType: 'core',
      cardInstanceId: newId(state, 'card'),
      cardDefinitionId: coreDef.cardId,
      patienceCostOnBreak: coreDef.patienceCostOnBreak,
    });
  }
  if (state.playerShields.length > 0) state.shieldLossArmed = true;

  // Starting Impressions (NPC-owned, §3.8/§7).
  for (const id of config.startingImpressions ?? []) {
    addPermanent(state, 'impression', id, 'npc', { cardInstanceId: newId(state, 'card') });
  }

  startFirstTurn(state);
  runStack(state);
  check(state);
  return state;
}

function emptySide() {
  return {
    priority: 0,
    incomingDebt: 0,
    lastUnspentPriority: 0,
    deck: [],
    hand: [],
    discard: [],
    cardsPlayedThisTurn: 0,
    extraDrawsThisTurn: 0,
    priorityGainedThisTurn: 0,
  };
}
