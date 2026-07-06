/**
 * Breakthrough combat engine — type vocabulary.
 *
 * Implements Breakthrough_Design_v1.4.md exactly, plus the v1.4.1 changes
 * approved by Ken (see DESIGN_CHANGES_v1.4.1.md): two-tier opponent shields
 * with card-backed Guard Shields, and the CARD_DRAWN canonical event.
 *
 * The engine layer is pure and framework-agnostic (v1.4 §15.1): state is
 * plain serializable data, the reducer never mutates its input, and there is
 * no module-level mutable state. No card-ID logic anywhere (§15.2).
 */

// ── Sides, boundaries, phases ────────────────────────────────────────────────

export type Side = 'player' | 'npc';

export const opponentOf = (s: Side): Side => (s === 'player' ? 'npc' : 'player');

/** The four canonical turn boundaries (v1.4 §4). */
export type BoundaryName =
  | 'PLAYER_TURN_START'
  | 'PLAYER_TURN_END'
  | 'NPC_TURN_START'
  | 'NPC_TURN_END';

/**
 * A named-boundary duration (v1.4 §4: durations are never bare integers).
 * `occurrences: 1` means "the next time this boundary happens".
 */
export interface BoundaryRef {
  boundary: BoundaryName;
  occurrences: number;
}

export type Phase =
  | 'Check'
  | 'PlayerPending'
  | 'EnemyPending'
  | 'RevealPending'
  | 'ChooseNumberPending'
  | 'DeckRevealPending'
  | 'BotMSelect'
  | 'Won'
  | 'Lost';

export type LoseReason = 'PATIENCE' | 'LIES' | 'SHIELDS' | null;

// ── Canonical event vocabulary (v1.4 §5.1 + v1.4.1 CARD_DRAWN) ──────────────

export const CANONICAL_EVENTS = [
  'CARD_STAGED',
  'CARD_PLAYED',
  'CARD_RESOLVED',
  'CARD_DRAWN', // v1.4.1 — dispatched per card drawn, either side
  'SHIELD_BROKEN',
  'PATIENCE_CHANGED',
  'PRIORITY_CHANGED',
  'TOKEN_CREATED',
  'TOKEN_DESTROYED',
  'PLAYER_TURN_START',
  'PLAYER_TURN_END',
  'NPC_TURN_START',
  'NPC_TURN_END',
] as const;

export type EngineEventType = (typeof CANONICAL_EVENTS)[number];

export interface EngineEvent {
  type: EngineEventType;
  /** Controller of the action that caused the event, when applicable. */
  controller?: Side;
  /** Card payload for CARD_STAGED / CARD_PLAYED / CARD_RESOLVED. */
  cardInstanceId?: string;
  cardDefId?: string;
  cardCost?: number;
  /** SHIELD_BROKEN payload. */
  shieldSide?: Side;
  shieldType?: 'placeholder' | 'real' | 'core' | 'guard' | 'npcCore';
  breaker?: Side;
  /** PATIENCE_CHANGED / PRIORITY_CHANGED payload. */
  delta?: number;
  newValue?: number;
  side?: Side;
  /** TOKEN_CREATED / TOKEN_DESTROYED payload. */
  tokenDefId?: string;
  /** CARD_DRAWN payload: true when the draw was not a turn-start refill. */
  extraDraw?: boolean;
}

// ── Quantities & conditions ──────────────────────────────────────────────────

/**
 * A quantity is a readable number in combat state, used by scales and
 * conditions. Side references are owner-relative ('self' = the effect's
 * controller) so the same card text works for either side (v1.4 §5.1 filters).
 */
export type Quantity =
  | { kind: 'CONST'; value: number }
  | { kind: 'PATIENCE' }
  | { kind: 'MISSING_PATIENCE' } // starting patience − current (min 0)
  | { kind: 'PRIORITY'; side: 'self' | 'opponent' }
  | { kind: 'ROUND' }
  | { kind: 'LIE_COUNTER' }
  | { kind: 'CARDS_PLAYED_THIS_TURN'; side: 'self' | 'opponent' }
  | { kind: 'EXTRA_DRAWS_THIS_TURN'; side: 'self' | 'opponent' }
  | { kind: 'PRIORITY_GAINED_THIS_TURN'; side: 'self' | 'opponent' }
  | { kind: 'OPP_SHIELDS_BROKEN_BY_PLAYER_THIS_TURN' }
  | { kind: 'OPP_SHIELDS_BROKEN_BY_PLAYER_PREV_TURN' }
  | { kind: 'PLAYER_SHIELDS_BROKEN_BY_NPC_THIS_TURN' }
  | { kind: 'GUARDS_PLACED_BY_NPC_THIS_TURN' }
  | { kind: 'NPC_GUARDS_STANDING' }
  | { kind: 'CHOSEN_NUMBER' }
  | { kind: 'COUNTER'; counterName: string; permanentDefId: string | 'self' }
  | { kind: 'DECK_CARDS_MATCHING_COST'; side: 'self' | 'opponent'; cost: Quantity }
  | { kind: 'SHIELDS_STANDING'; side: 'self' | 'opponent' } // all types
  | { kind: 'STAGED_CARD_COST' }
  | { kind: 'STAGED_CARD_BREAK_COUNT' } // shield-break effects on the staged card
  | { kind: 'EVENT_DELTA' } // current event payload delta
  | { kind: 'EVENT_DELTA_ABS' } // |delta| — e.g. "for every Priority spent"
  | { kind: 'EVENT_NEW_VALUE' }
  | { kind: 'EVENT_CARD_COST' }
  | { kind: 'EVENT_IS_OWN_SHIELD' } // 1 if the event's shieldSide is the subscriber's side
  | { kind: 'EVENT_IS_EXTRA_DRAW' }; // 1 if a CARD_DRAWN event was an extra draw

export type Comparator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq';

export type Condition =
  | { compare: { lhs: Quantity; op: Comparator; rhs: Quantity } }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

// ── Restrictions, replacements, scheduled effects (v1.4 §9) ─────────────────

export const RESTRICTION_TYPES = [
  'PREVENT_SHIELD_BREAK', // target side cannot break shields
  'PREVENT_DRAW',
  'PREVENT_EXTRA_DRAWS',
  'PREVENT_PATIENCE_GAIN',
  'MAX_CARD_COST',
  'INCREASE_CARD_COST',
  'MAX_PLAYS_PER_TURN',
  'MAX_TURN_START_DRAW',
  'PRIORITY_FLOOR',
  'PATIENCE_COST_PER_CARD',
  'BOTM_LIMIT_BONUS', // Blue planning identity (v1.4 §3.11)
] as const;

export type RestrictionType = (typeof RESTRICTION_TYPES)[number];

export interface RestrictionDef {
  type: RestrictionType;
  /** Owner-relative at author time; resolved to an absolute side on apply. */
  target: 'self' | 'opponent' | 'both';
  value?: number;
  conditionThreshold?: number;
  /** Named-boundary expiry; omit for "while linked Impression remains". */
  expiry?: BoundaryRef;
}

export interface ActiveRestriction {
  id: string;
  type: RestrictionType;
  target: Side | 'both';
  value?: number;
  conditionThreshold?: number;
  expiry?: BoundaryRef;
  linkedPermanentId?: string;
}

export interface ActiveReplacement {
  id: string;
  originalTokenId: string;
  replacementTokenId: string;
  expiry?: BoundaryRef;
  linkedPermanentId?: string;
}

export interface ScheduledEffectEntry {
  id: string;
  effects: Effect[];
  controller: Side;
  at: BoundaryRef;
}

// ── Effects ──────────────────────────────────────────────────────────────────

interface EffectBase {
  /** Effect is skipped unless the condition holds at resolution time. */
  condition?: Condition;
  /** Multiplies value/count by the quantity at resolution time (min 0). */
  scale?: Quantity;
}

export type Effect = EffectBase &
  (
    | { type: 'MODIFY_PATIENCE'; value: number; altValue?: number; altCondition?: Condition }
    | { type: 'MODIFY_PRIORITY'; value: number; target?: 'self' | 'opponent' }
    | { type: 'DRAW_CARDS'; value: number }
    | {
        /**
         * Break shields owned by `target`. Player→opponent hits Guard Shields
         * only (v1.4 §3.3); NPC→opponent hits the player row leftmost-first;
         * NPC→self hits its own Guards only (§6.6.3); player→self breaks own
         * row leftmost-first.
         */
        type: 'BREAK_SHIELDS';
        target: 'self' | 'opponent';
        count: number;
      }
    | {
        /**
         * Place the side's free shield type: Placeholder Shields (player) or
         * dummy Guard Shields (npc — guard restoration, v1.4 §3.3).
         */
        type: 'PLACE_SHIELDS';
        target: 'self';
        count: number;
      }
    | { type: 'CREATE_TOKEN'; tokenDefinitionId: string; count: number }
    | { type: 'DESTROY_TOKENS'; count: number; tokenDefinitionId?: string } // own, oldest first
    | {
        type: 'TRANSFORM_TOKEN'; // bypasses leave-triggers (v1.4 §3.7)
        fromTokenId: string;
        toTokenId: string;
        count?: number;
        upTo?: boolean;
        all?: boolean;
      }
    | { type: 'DESTROY_SELF' } // the source permanent
    | { type: 'DESTROY_IMPRESSION'; owner: 'self' | 'opponent'; count?: number }
    | { type: 'APPLY_RESTRICTION'; restriction: RestrictionDef }
    | { type: 'APPLY_REPLACEMENT'; originalTokenId: string; replacementTokenId: string; expiry?: BoundaryRef }
    | { type: 'SCHEDULE_EFFECTS'; effects: Effect[]; at: BoundaryRef }
    | { type: 'CHOOSE_NUMBER'; min: number; max: number }
    | {
        type: 'COPY_FROM_NPC_DECK'; // v1.4 §8.5 — copies, never steals
        count: number;
        costEquals?: Quantity;
        withShieldBreak?: boolean;
        patienceCostOverride?: Quantity;
      }
    | { type: 'REVEAL_NPC_HAND' }
    | { type: 'HIDE_NPC_HAND' }
    | { type: 'REVEAL_NPC_DECK_TOP' }
    | { type: 'HIDE_NPC_DECK_TOP' }
    | { type: 'DECK_REVEAL'; side: 'opponent'; count: number } // blocking peek
    | { type: 'CANCEL_STAGED_CARD' } // only meaningful in the CARD_STAGED window
    | { type: 'INCREMENT_COUNTERS'; counterName: string; targetDefinitionId: string | 'self'; amount: number }
    | { type: 'RESHUFFLE_DECK' } // controller's discard shuffles into its deck
  );

// ── Cards ────────────────────────────────────────────────────────────────────

export type CardColor =
  | 'Red'
  | 'Blue'
  | 'Green'
  | 'White'
  | 'Black'
  | 'Orange'
  | 'Purple'
  | 'Colorless';

export type Keyword =
  | 'Safety'
  | 'Assemble'
  | 'Shield Trigger'
  | 'Lie'
  | 'Trap'
  | 'Rapport'
  | 'Heavy Hand';

export interface TriggerCondition {
  event: EngineEventType;
  /** Owner-relative controller filter (v1.4 §5.1). */
  controllerFilter?: 'self' | 'opponent';
  condition?: Condition;
}

export interface TriggeredAbility {
  id: string;
  trigger: TriggerCondition;
  effects: Effect[];
  maxTimesPerPlay?: number;
  maxTimesPerTurn?: number;
}

export interface ActivatedAbilityCost {
  priority?: number;
  patience?: number;
  sacrificeShields?: number; // own, leftmost
  discardCards?: number; // chosen
}

export interface ActivatedAbility {
  id: string;
  name: string;
  cost: ActivatedAbilityCost;
  effects: Effect[];
}

export interface ThresholdDef {
  counterName: string;
  value: number;
  consume: boolean;
  effects: Effect[];
  /** Default AFTER_NPC_PLAY (v1.4 §3.10). */
  checkPoint?: 'AFTER_NPC_PLAY' | 'AFTER_ANY_PLAY';
}

export interface TransformConditionDef {
  condition: Condition;
  intoDefinitionId: string;
}

/** Static amplifier for counter gains (v1.4 §3.10 "amplified by other permanents"). */
export interface CounterAmplifier {
  counterName: string;
  /** Limit to increments targeting this definition id; omit for any target. */
  targetDefinitionId?: string;
  extra: number;
}

export interface RapportConfig {
  min: number;
  max: number;
  /** The quantity the prediction is checked against. */
  checked: Quantity;
}

export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  color: CardColor;
  supertype: 'Skill' | 'Information';
  subtype: 'Impression' | 'Trap' | 'Token' | null;
  keywords: Keyword[];
  effects: Effect[];
  effectText: string;
  longDescription?: string;

  shieldTriggerEffects?: Effect[];
  heavyHandEffects?: Effect[];

  trapTrigger?: TriggerCondition;
  trapPersistent?: boolean;

  triggeredAbilities?: TriggeredAbility[];
  activatedAbilities?: ActivatedAbility[];

  /** Tokens & Impressions: fire when the permanent is destroyed (not transformed). */
  leaveTriggerEffects?: Effect[];
  /** Impressions: fire at the owner's Turn Start (v1.4 §3.8). */
  turnStartEffects?: Effect[];

  thresholds?: ThresholdDef[];
  transformCondition?: TransformConditionDef;
  counterAmplifiers?: CounterAmplifier[];

  impressionDuration?: { turns: number; returnToDeck?: boolean };
  impressionDestroyBelowPatience?: number;

  rapport?: RapportConfig;

  /** Information Cards only (v1.4 §3.9). */
  nuggetId?: string;

  /** After play, shuffle into its owner's deck instead of discarding. */
  returnToDeck?: boolean;
}

export interface CardInstance {
  instanceId: string;
  definitionId: string;
  owner: Side;
  /** Set for player-hand copies created by COPY_FROM_NPC_DECK (v1.4 §8.5). */
  patienceCostOverride?: number;
  /**
   * Assemble result (v1.4 §11): the combined card is virtual; its components
   * are discarded (recyclable) when the combined card's play completes.
   */
  components?: CardInstance[];
}

// ── Info nuggets (v1.4 §3.9) ─────────────────────────────────────────────────

export interface InfoNugget {
  id: string;
  name: string;
  description: string;
}

export interface NuggetOverride {
  nuggetId: string;
  /** The card behaviour nugget cards use in this encounter. */
  cost: number;
  effects: Effect[];
  effectText: string;
}

// ── Encounter configuration (v1.4 §7 + v1.4.1 guard cards) ──────────────────

export interface NpcCoreShieldDef {
  cardId: string;
  isHint: boolean;
  hintText?: string;
  loreDescription: string;
  keyNuggetIds: string[]; // ≥ 1, validated
}

export interface CoreShieldDef {
  cardId: string;
  patienceCostOnBreak: number;
}

export interface Trait {
  id: string;
  name: string;
  description: string;
}

export interface ScheduledPlayDef {
  cardId: string;
  afterTurn: number; // injected at NPC Turn Start of rounds > afterTurn
}

export interface EncounterConfig {
  id: string;
  displayName: string;
  minTurnStartPriority: number; // default 3
  firstTurnBonusPriority: number; // default 2
  maxPriority: number; // default 10
  startingSide: Side; // default 'player'
  opponentPatience: number;
  /**
   * Total Guard Shields (default 10 — v1.4.1). Card-backed guards from
   * `npcGuardShieldCardIds` count toward this total; the difference is made
   * up by dummy guards. Breaking an opponent Guard never costs Patience.
   */
  npcGuardShieldCount: number;
  /** Card-backed Guard Shields (Shield Trigger carriers), shuffled into the row. */
  npcGuardShieldCardIds?: string[];
  opponentShields: NpcCoreShieldDef[];
  npcHandLimit: number; // default 5
  playerDummyShieldSlots: number; // required
  allowedCoreShields: CoreShieldDef[]; // required (empty allowed)
  unbreakablePlayerShields?: boolean;
  nuggetOverrides: NuggetOverride[];
  traits: Trait[];
  enemyDeckCardIds: string[];
  scheduledPlays?: ScheduledPlayDef[];
  startingImpressions?: string[];
  lieThreshold?: number; // 0/omitted disables
  retryable?: boolean;
  tutorialMode?: boolean;
  scriptedDrawOrder?: string[];
  scriptedOpponentPlays?: string[];
  playedNonRelevantCards?: string[];
}

export const ENCOUNTER_DEFAULTS = {
  minTurnStartPriority: 3,
  firstTurnBonusPriority: 2,
  maxPriority: 10,
  startingSide: 'player' as Side,
  npcHandLimit: 5,
  npcGuardShieldCount: 10, // v1.4.1
} as const;

// ── Combat state ─────────────────────────────────────────────────────────────

export type PlayerShieldType = 'placeholder' | 'real' | 'core';

export interface PlayerShieldSlot {
  slotId: string;
  shieldType: PlayerShieldType;
  /** Absent for placeholders (they are synthetic, not cards — v1.4 §3.4). */
  cardInstanceId?: string;
  cardDefinitionId?: string;
  patienceCostOnBreak: number;
}

/** One standing opponent Guard Shield; card-backed guards carry a cardId. */
export interface NpcGuard {
  guardId: string;
  cardId?: string;
}

export interface NpcCoreShieldState extends NpcCoreShieldDef {
  broken: boolean;
}

export type PermanentKind = 'impression' | 'token' | 'trap';

export interface Permanent {
  permanentId: string;
  kind: PermanentKind;
  definitionId: string;
  owner: Side;
  arrivalOrder: number;
  counters: Record<string, number>;
  /** The card instance behind an Impression/Trap (goes to discard on leave). */
  cardInstanceId?: string;
  /** Rapport prediction chosen when the card was played (v1.4 §8.3). */
  rapportPrediction?: number;
  /** Trap bookkeeping: cannot re-fire within one resolution cycle (§3.6). */
  firedThisResolution?: boolean;
  /** Impression duration bookkeeping (owner turns remaining). */
  turnsRemaining?: number;
}

export interface SideState {
  priority: number;
  /** Debt owed TO this side by the opponent (consumed at this side's turn start). */
  incomingDebt: number;
  lastUnspentPriority: number; // tracked, unused (v1.4 §15.7)
  deck: CardInstance[];
  hand: CardInstance[];
  discard: CardInstance[];
  // per-turn counters (§4 naming convention)
  cardsPlayedThisTurn: number;
  extraDrawsThisTurn: number;
  priorityGainedThisTurn: number;
}

// ── Effect stack (single generic suspension mechanism, v1.4 §15.4) ──────────

export type FrameKind =
  | 'play' // a card play's effect list
  | 'trap'
  | 'shieldTrigger'
  | 'ability'
  | 'leaveTrigger'
  | 'turnStartEffects'
  | 'scheduled'
  | 'threshold'
  | 'activated'
  | 'breakOutcome';

export interface EffectFrame {
  frameId: string;
  kind: FrameKind;
  controller: Side;
  effects: Effect[];
  index: number;
  depth: number;
  /** Source permanent (for DESTROY_SELF / COUNTER 'self' refs). */
  sourcePermanentId?: string;
  /** The play this frame belongs to, when kind === 'play'. */
  playCardInstanceId?: string;
  /** Chosen number for this frame's Rapport / CHOOSE_NUMBER context. */
  chosenNumber?: number | null;
  /** breakOutcome payload. */
  breakOutcome?: {
    side: Side;
    shieldType: PlayerShieldType | 'guard' | 'npcCore';
    patienceCost: number;
    cardInstanceId?: string;
    cardDefinitionId?: string;
    safety?: boolean;
  };
}

/**
 * Completion bookkeeping for an in-flight card play (v1.4 §6.3 / §6.6).
 * Sequences suspend and resume — never restart (§6.7 inv. 6); every step flag
 * below is checked so the completion path always runs exactly once, on every
 * path including resumption after a Reveal (§6.6.4 / Brief §7 trap 2).
 */
export interface PendingPlay {
  cardInstanceId: string;
  definitionId: string; // effective definition (after nugget resolution)
  controller: Side;
  heavyHand: boolean;
  /** Destination when the play completes — always runs (§6.6.4). */
  destination: 'discard' | 'field-impression' | 'field-trap' | 'deck' | 'removed';
  /** Pre-allocated permanent id for field destinations (restriction linking). */
  reservedPermanentId?: string;
  /** Assemble components carried by a virtual combined card (v1.4 §11). */
  components?: CardInstance[];
  /** Steps already performed (suspension-safe; sequences never restart). */
  lockCheckDone: boolean;
  moved: boolean;
  resolvedDispatched: boolean;
  thresholdsDone: boolean;
  chosenNumber: number | null;
}

export type PendingBlock =
  | {
      type: 'reveal';
      lore: string;
      isHint: boolean;
      hintText?: string;
      gainedCardId?: string;
      shieldCardId: string;
    }
  | { type: 'chooseNumber'; min: number; max: number; frameId: string }
  | { type: 'deckReveal'; cardDefIds: string[] }
  | null;

export interface LogEntry {
  seq: number;
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface CombatState {
  schemaVersion: 1;
  phase: Phase;
  result: 'WIN' | 'LOSE' | null;
  loseReason: LoseReason;

  /** Seeded PRNG state — all randomness flows through this (determinism). */
  rngState: number;

  round: number;
  activeTurn: Side;
  firstTurnOfCombatDone: boolean;

  patience: number;
  startingPatience: number;
  lieCounter: number;

  player: SideState;
  npc: SideState;

  backOfMind: CardInstance[];
  backOfMindLimitBase: number;

  playerShields: PlayerShieldSlot[];
  shieldLossArmed: boolean;

  /** Standing Guard Shields, in break order (leftmost breaks first). */
  npcGuards: NpcGuard[];
  /** Invariant: always equals npcGuards.length (kept for quantities/UI). */
  npcGuardsStanding: number;
  npcCoreShields: NpcCoreShieldState[];

  field: Permanent[];
  nextArrivalOrder: number;

  restrictions: ActiveRestriction[];
  replacements: ActiveReplacement[];
  scheduledEffects: ScheduledEffectEntry[];

  /** NPC scheduled plays set aside from its deck (v1.4 §10). */
  npcScheduledAside: { card: CardInstance; afterTurn: number }[];

  stagedCard: CardInstance | null;
  stagedCancelled: boolean;

  /** End Turn in progress but suspended by a blocking sub-state. */
  turnEndPending: boolean;

  /** Cards gained from broken NPC Core Shields (persistence reads these). */
  gainedCardIds: string[];

  effectStack: EffectFrame[];
  pendingPlay: PendingPlay | null;
  pendingBlock: PendingBlock;
  /** Set when the trigger depth cap (20) was hit — fail-safe halt (v1.4 §5.4). */
  resolutionHalted: boolean;

  // per-turn counters not owned by a side record (§4 naming convention)
  oppShieldsBrokenByPlayerThisTurn: number;
  oppShieldsBrokenByPlayerPrevTurn: number;
  playerShieldsBrokenByNpcThisTurn: number;
  guardsPlacedByNpcThisTurn: number;

  /** Ability fire-count bookkeeping: permanentId+abilityId → count. */
  abilityFiresThisPlay: Record<string, number>;
  abilityFiresThisTurn: Record<string, number>;

  npcHandRevealed: boolean;
  npcDeckTopRevealed: boolean;

  discoveredNuggetIds: string[];
  playedNonRelevantCards: string[];
  discoveredTraitIds: string[];

  /** Immutable inputs. */
  config: EncounterConfig;
  cards: Record<string, CardDefinition>;
  tokens: Record<string, CardDefinition>;
  nuggets: Record<string, InfoNugget>;
  recipes: CombinationRecipe[];

  nextId: number;
  logSeq: number;
  log: LogEntry[];
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type CombatAction =
  | { type: 'PLAY_CARD'; handIndex: number; heavyHand?: boolean }
  | { type: 'PLACE_SHIELD'; handIndex: number }
  | { type: 'ACTIVATE_ABILITY'; permanentId: string; abilityId: string; discardIndices?: number[] }
  | { type: 'COMBINE'; handIndexA: number; handIndexB: number }
  | { type: 'RESEQUENCE_SHIELDS'; order: number[] }
  | { type: 'END_TURN' }
  | { type: 'BOTM_SELECT'; keepHandIndices: number[] }
  | { type: 'ACKNOWLEDGE' } // reveal / deck-reveal acknowledgement
  | { type: 'CHOOSE_NUMBER'; value: number }
  | { type: 'ADVANCE' } // drive the NPC turn one step (auto policy: leftmost)
  | { type: 'NPC_PLAY_CARD'; handIndex: number } // manual enemy / dual playtest
  | { type: 'NPC_END_TURN' }; // manual enemy: explicit pass (only when no legal play)

export interface CombinationRecipe {
  ingredients: [string, string];
  resultCardId: string;
}
