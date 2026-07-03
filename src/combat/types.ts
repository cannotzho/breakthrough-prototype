// ─── Color Identity ────────────────────────────────────────────
export type ColorIdentity = 'Red' | 'Blue' | 'Green' | 'White' | 'Black' | 'Orange' | 'Purple' | 'Colorless';

// ─── Keywords ──────────────────────────────────────────────────
export type Keyword = 'Safety' | 'Assemble' | 'Shield Trigger' | 'Lie' | 'Trap' | 'Rapport' | 'Heavy Hand';

// ─── Effect Conditions ────────────────────────────────────────
export type EffectConditionType =
  | 'NPC_CARDS_PLAYED_GTE'
  | 'FIELD_TOKEN_COUNT_GTE'
  | 'HAS_FIELD_IMPRESSION'
  | 'PATIENCE_LT'
  | 'PATIENCE_GTE'
  | 'NPC_DECK_COST_MATCH_GTE'
  | 'NPC_DECK_COST_MATCH_LT'
  | 'NPC_SHIELDS_BROKEN_GTE';

export interface EffectCondition {
  type: EffectConditionType;
  value?: number;
}

// ─── Effect Scale Sources ──────────────────────────────────────
export type EffectScaleSource =
  | 'PLAYER_CARDS_PLAYED_THIS_TURN'
  | 'CURRENT_PRIORITY'
  | 'PLAYER_SHIELDS_BROKEN_PREV_TURN'
  | 'OPPONENT_MISSING_PATIENCE'
  | 'CHOSEN_NUMBER'
  | 'NPC_DECK_MATCHING_COST_COUNT';

// ─── Card Effects ──────────────────────────────────────────────
export type CardEffectType =
  | 'BREAK_OPPONENT_SHIELD'
  | 'BREAK_OPPONENT_SHIELDS_SCALED'
  | 'MODIFY_PRIORITY'
  | 'MODIFY_PATIENCE'
  | 'DRAW_CARDS'
  | 'PLACE_AS_SHIELD'
  | 'INCREMENT_LIE_COUNTER'
  | 'PLACE_IMPRESSION'
  | 'CREATE_TOKEN'
  | 'DESTROY_SELF'
  | 'TRANSFORM_TOKEN'
  | 'DESTROY_TOKENS'
  | 'APPLY_RESTRICTION'
  | 'DESTROY_IMPRESSION'
  | 'APPLY_REPLACEMENT'
  | 'CHOOSE_NUMBER'
  | 'REVEAL_OPPONENT_DECK_TOP'
  | 'COPY_FROM_NPC_DECK'
  | 'REVEAL_NPC_HAND'
  | 'REVEAL_NPC_DECK_TOP'
  | 'HIDE_NPC_HAND'
  | 'HIDE_NPC_DECK_TOP'
  | 'PLACE_DUMMY_SHIELDS'
  | 'CANCEL_STAGED_ENEMY_CARD'
  | 'INCREMENT_RAPPORT_COUNTERS'
  | 'RAPPORT_SHIELD_BREAK'
  | 'BREAK_PLAYER_SHIELD'
  | 'INTERCEPT_SHIELD_BREAKS'
  | 'SCHEDULE_EFFECTS';

export interface CardEffect {
  type: CardEffectType;
  value?: number;
  scale?: EffectScaleSource;
  tokenDefinitionId?: string;
  transformSourceId?: string;
  transformTargetId?: string;
  transformAll?: boolean;
  transformUpTo?: boolean;
  targetDefinitionId?: string;
  targetInstanceIds?: string[];
  destroyAll?: boolean;
  restrictionType?: RestrictionType;
  restrictionTarget?: CardOwner;
  restrictionDuration?: number;
  condition?: EffectCondition;
  replacementOriginalId?: string;
  replacementTargetId?: string;
  altValue?: number;
  altCondition?: EffectCondition;
  copyFilter?: 'HAS_SHIELD_BREAK';
  copyCount?: number;
  scheduledEffects?: CardEffect[];
  delayTurns?: number;
}

// ─── Game Events (for passive triggered abilities) ───────────
export type GameEventType = 'TOKEN_DESTROYED' | 'TOKEN_CREATED' | 'CARD_PLAYED' | 'SHIELD_BROKEN';

export interface GameEvent {
  type: GameEventType;
  sourceCard?: CardInstance;
}

export interface TriggeredAbility {
  id: string;
  trigger: GameEventType;
  controllerFilter?: CardOwner;
  effects: CardEffect[];
  maxTimesPerPlay?: number;
  maxTimesPerTurn?: number;
}

// ─── Activated Abilities ──────────────────────────────────────
export interface ActivatedAbilityCost {
  priority?: number;
  patience?: number;
  shields?: number;
  discard?: number;
}

export interface ActivatedAbility {
  id: string;
  name: string;
  cost: ActivatedAbilityCost;
  effects: CardEffect[];
}

// ─── Trap Trigger Conditions ──────────────────────────────────
export type TrapTriggerType =
  | 'OPPONENT_PLAYS_CARD'
  | 'OPPONENT_BREAKS_SHIELD'
  | 'PATIENCE_CHANGE'
  | 'PRIORITY_CHANGE'
  | 'COMPOUND_NPC_TURN';

export type TrapTriggerComparator = 'eq' | 'gt' | 'lt' | 'gte' | 'lte';

export interface TrapTriggerCondition {
  triggerType: TrapTriggerType;
  comparator?: TrapTriggerComparator;
  value?: number;
  compoundConditions?: CompoundCondition[];
}

export type CompoundConditionType =
  | 'NPC_EXTRA_DRAWS_GTE'
  | 'NPC_SHIELDS_BROKEN_GTE'
  | 'NPC_PRIORITY_GAINED_GTE';

export interface CompoundCondition {
  type: CompoundConditionType;
  value: number;
}

// ─── Scheduled Effects ───────────────────────────────────────
export interface ScheduledEffect {
  effects: CardEffect[];
  turnsUntilFire: number;
}

// ─── Info Nuggets ──────────────────────────────────────────────
export interface InfoNugget {
  id: string;
  name: string;
  longDescription: string;
  imageUrl?: string;
  defaultCardId?: string;
}

// ─── Deck Types ───────────────────────────────────────────────
export interface DeckCardEntry {
  cardId: string;
  quantity: number;
}

export interface DeckDefinition {
  id: string;
  name: string;
  description: string;
  cards: DeckCardEntry[];
}

// ─── Card Definition ───────────────────────────────────────────
export type CardSupertype = 'Skill' | 'Information';
export type CardSubtype = 'Impression' | 'Trap' | 'Token' | null;

export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  keywords: Keyword[];
  effects: CardEffect[];
  color: ColorIdentity;
  supertype: CardSupertype;
  subtype: CardSubtype;
  effectText?: string;
  longDescription?: string;
  imageUrl?: string;
  nuggetId?: string;
  trapTrigger?: TrapTriggerCondition;
  trapPersistent?: boolean;
  activatedAbilities?: ActivatedAbility[];
  triggeredAbilities?: TriggeredAbility[];
  leavesTriggerEffects?: CardEffect[];
  shieldTriggerEffects?: CardEffect[];
  impressionTurns?: number;
  impressionReturnToDeck?: boolean;
  impressionDestroyBelowPatience?: number;
  heavyHandEffects?: CardEffect[];
  returnToDeck?: boolean;
  /** @deprecated Use effectText/longDescription instead */
  description?: string;
}

export type CardOwner = 'player' | 'npc';

export interface CardInstance {
  instanceId: string;
  definition: CardDefinition;
  owner: CardOwner;
  controller: CardOwner;
  combinedFrom?: CardInstance[];
  patienceCostOverride?: number;
}

export interface CombinationRecipe {
  ingredients: string[];
  result: CardDefinition;
}

// ─── Shield Definitions ────────────────────────────────────────
export interface OpponentShieldSlot {
  cardId: string;
  isHint: boolean;
  hintText?: string;
  broken: boolean;
  loreDescription?: string;
}

export type PlayerShieldType = 'dummy' | 'core';

export interface PlayerShieldSlot {
  card: CardInstance;
  shieldType: PlayerShieldType;
  patienceCostOnBreak: number;
}

export interface CoreShieldDef {
  cardId: string;
  patienceCostOnBreak: number;
}

// ─── Nugget Override (runtime, resolved from encounter_relevant_cards) ──
export interface NuggetOverride {
  nuggetId: string;
  overrideCardDef: CardDefinition;
}

// ─── Nugget Discovery Event (emitted by reducer for side-effect write) ──
export interface NuggetDiscoveryEvent {
  nuggetId: string;
  nuggetName: string;
  effectDescription: string;
}

// ─── Traits ────────────────────────────────────────────────────
export interface Trait {
  id: string;
  name: string;
  description: string;
  discovered: boolean;
}

// ─── Priority Mode ────────────────────────────────────────────
export type PriorityMode = 'frame' | 'classic';

// ─── Encounter Config ──────────────────────────────────────────
export interface EncounterConfig {
  id: string;
  displayName: string;
  startingPriority: number;
  defaultRestorePriority: number;
  priorityMode: PriorityMode;
  opponentPatience: number;
  opponentShields: OpponentShieldSlot[];
  shieldBreakOrder?: number[];
  playerDummyShieldSlots: number;
  allowedCoreShields: CoreShieldDef[];
  unbreakablePlayerShields?: boolean;
  nuggetOverrides: NuggetOverride[];
  traits: Trait[];
  retryable: boolean;
  lieThreshold?: number;
  tutorialMode?: boolean;
  scriptedDrawOrder?: string[][];
  scriptedOpponentPlays?: string[];
  npcDummyShieldSlots: number;
  enemyDeckCardIds: string[];
}

// ─── Combat Config ─────────────────────────────────────────────
export interface CombatConfig {
  handLimit: number;
  backOfMindLimit: number;
}

export const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  handLimit: 5,
  backOfMindLimit: 1,
};

export const SHIELD_PLACEMENT_COST = 2;

export const MAX_TRIGGER_DEPTH = 20;

// ─── Active Restrictions ─────────────────────────────────────
export type RestrictionType =
  | 'PREVENT_SHIELD_BREAK'
  | 'PREVENT_DRAW'
  | 'MAX_CARD_COST'
  | 'INCREASE_CARD_COST'
  | 'PREVENT_PATIENCE_GAIN'
  | 'REPLACE_SHIELD_BREAK_WITH_PATIENCE'
  | 'PRIORITY_PER_EXTRA_DRAW'
  | 'MAX_TURN_START_DRAW'
  | 'MAX_PLAYS_PER_TURN'
  | 'PATIENCE_PER_OPPONENT_CARD'
  | 'PRIORITY_FLOOR'
  | 'PREVENT_NPC_EXTRA_DRAW'
  | 'PRIORITY_PER_DRAW_BLOCKED';

export interface ActiveRestriction {
  id: string;
  restrictionType: RestrictionType;
  target: CardOwner;
  value?: number;
  turnsRemaining: number;
  linkedImpressionId?: string;
}

export interface ActiveReplacement {
  id: string;
  originalTokenId: string;
  replacementTokenId: string;
  turnsRemaining: number;
}

// ─── Combat Phase ──────────────────────────────────────────────
export type CombatPhase =
  | 'Check'
  | 'PlayerPending'
  | 'PlayerPlay'
  | 'RevealPending'
  | 'BotMSelect'
  | 'EnemyPending'
  | 'FieldTriggerCheck'
  | 'EnemyPlay'
  | 'ChooseNumberPending'
  | 'DeckRevealPending'
  | 'WIN'
  | 'LOSE';

// ─── Field Impression (active on the Field) ───────────────────
export interface FieldImpression {
  card: CardInstance;
  counters: number;
  turnsRemaining?: number;
  returnToDeck?: boolean;
  destroyBelowPatience?: number;
}

// ─── Field Trap (active on the Field) ──────────────────────────
export interface FieldTrap {
  card: CardInstance;
  triggerCondition: TrapTriggerCondition;
  playOrder: number;
  turnsRemaining: number;
  persistent?: boolean;
  rapportNumber?: number;
}

// ─── Pending Shield Trigger ────────────────────────────────────
export interface PendingShieldTrigger {
  card: CardInstance;
  breakOrder: number;
}

// ─── Combat State ──────────────────────────────────────────────
export interface CombatState {
  phase: CombatPhase;
  priority: number;
  npcPriority: number;
  patience: number;
  lieCounter: number;

  playerHand: CardInstance[];
  playerDeck: CardInstance[];
  playerDiscard: CardInstance[];
  backOfMind: CardInstance[];

  playerShields: (PlayerShieldSlot | null)[];
  shieldsEverPlaced: number;

  opponentShields: OpponentShieldSlot[];
  pendingReveal: OpponentShieldSlot | null;

  enemyDeck: CardInstance[];
  enemyDiscard: CardInstance[];
  stagedEnemyCard: CardInstance | null;

  fieldImpressions: FieldImpression[];
  fieldTokens: CardInstance[];
  fieldTraps: FieldTrap[];
  trapPlayCounter: number;

  playedNonRelevantCards: string[];

  config: EncounterConfig;
  combatConfig: CombatConfig;

  pendingEffects: CardEffect[];
  pendingEffectCard: CardInstance | null;
  pendingPlaceAsShield: boolean;
  pendingShieldTriggers: PendingShieldTrigger[];
  triggerDepth: number;
  pendingDiscovery: NuggetDiscoveryEvent | null;
  discoveredNuggetIds: string[];

  pendingNumberChoice: { min: number; max: number } | null;
  chosenNumber: number | null;
  pendingDeckReveal: CardInstance[] | null;
  npcHandRevealed: boolean;
  npcDeckTopRevealed: boolean;
  npcShieldsBrokenThisTurn: number;

  activeTurn: 'player' | 'npc';
  activeRestrictions: ActiveRestriction[];
  activeReplacements: ActiveReplacement[];
  npcCardsPlayedThisTurn: number;
  npcExtraDrawsThisTurn: number;
  npcPriorityGainedThisTurn: number;
  playerCardsPlayedThisTurn: number;
  playerShieldsBrokenThisTurn: number;
  playerShieldsBrokenPrevTurn: number;
  abilitiesFiredThisPlay: string[];
  turnAbilityFireCounts: Record<string, number>;

  scheduledEffects: ScheduledEffect[];

  manualEnemyMode: boolean;

  tokenRegistry: Record<string, CardDefinition>;

  actionLog: string[];
}

// ─── Combat Actions ────────────────────────────────────────────
export type CombatAction =
  | { type: 'PLAY_CARD'; cardInstanceId: string; heavyHand?: boolean }
  | { type: 'PLACE_SHIELD'; cardInstanceId: string; slotIdx: number }
  | { type: 'RESEQUENCE_SHIELDS'; newOrder: number[] }
  | { type: 'END_TURN' }
  | { type: 'SELECT_BOTM'; cardInstanceId: string }
  | { type: 'DISMISS_REVEAL' }
  | { type: 'CHECK' }
  | { type: 'TRIGGER_ENEMY_ACTION' }
  | { type: 'COMBINE'; cardInstanceIds: [string, string] }
  | { type: 'DISMISS_DISCOVERY' }
  | { type: 'RESOLVE_FIELD_TRIGGERS' }
  | { type: 'DEV_SET_PRIORITY'; value: number }
  | { type: 'DEV_SET_PATIENCE'; value: number }
  | { type: 'DEV_SET_LIE_COUNTER'; value: number }
  | { type: 'DEV_BREAK_OPPONENT_SHIELD'; idx: number }
  | { type: 'DEV_BREAK_PLAYER_SHIELD'; idx: number }
  | { type: 'DEV_SET_PHASE'; phase: CombatPhase }
  | { type: 'DEV_ADD_CARD_TO_HAND'; card: CardDefinition }
  | { type: 'DEV_SET_ENEMY_CARD'; card: CardDefinition }
  | { type: 'DEV_ADD_NUGGET_OVERRIDE'; override: NuggetOverride }
  | { type: 'RESOLVE_ENEMY_CARD' }
  | { type: 'CONFIRM_PLACE_AS_SHIELD'; slotIdx: number }
  | { type: 'CONFIRM_BOTM' }
  | { type: 'ACTIVATE_ABILITY'; cardInstanceId: string; abilityId: string; discardCardIds?: string[] }
  | { type: 'DESTROY_TOKEN'; instanceId: string }
  | { type: 'DEV_RESET'; state: CombatState }
  | { type: 'DEV_SET_MANUAL_ENEMY'; enabled: boolean }
  | { type: 'DEV_PICK_ENEMY_FROM_DECK'; instanceId: string }
  | { type: 'RESOLVE_NUMBER_CHOICE'; value: number }
  | { type: 'DISMISS_DECK_REVEAL' };
