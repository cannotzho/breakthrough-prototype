// ─── Color Identity ────────────────────────────────────────────
export type ColorIdentity = 'Red' | 'Blue' | 'Green' | 'White' | 'Black' | 'Orange' | 'Purple' | 'Colorless';

// ─── Keywords ──────────────────────────────────────────────────
export type Keyword = 'Safety' | 'Assemble' | 'Shield Trigger' | 'Lie' | 'Trap';

// ─── Card Effects ──────────────────────────────────────────────
export type CardEffectType =
  | 'BREAK_OPPONENT_SHIELD'
  | 'BREAK_PLAYER_SHIELD'
  | 'MODIFY_PRIORITY'
  | 'MODIFY_PATIENCE'
  | 'DRAW_CARDS'
  | 'PLACE_AS_SHIELD'
  | 'INCREMENT_LIE_COUNTER'
  | 'PLACE_IMPRESSION';

export interface CardEffect {
  type: CardEffectType;
  value?: number;
}

// ─── Trap Trigger Conditions ──────────────────────────────────
export type TrapTriggerType =
  | 'OPPONENT_PLAYS_CARD'
  | 'OPPONENT_BREAKS_SHIELD'
  | 'PATIENCE_CHANGE'
  | 'PRIORITY_CHANGE';

export type TrapTriggerComparator = 'eq' | 'gt' | 'lt' | 'gte' | 'lte';

export interface TrapTriggerCondition {
  triggerType: TrapTriggerType;
  comparator?: TrapTriggerComparator;
  value?: number;
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
export type CardSubtype = 'Impression' | 'Trap' | null;

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
  /** @deprecated Use effectText/longDescription instead */
  description?: string;
}

export interface CardInstance {
  instanceId: string;
  definition: CardDefinition;
  combinedFrom?: CardInstance[];
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
  | 'WIN'
  | 'LOSE';

// ─── Field Trap (active on the Field) ──────────────────────────
export interface FieldTrap {
  card: CardInstance;
  triggerCondition: TrapTriggerCondition;
  playOrder: number;
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

  fieldImpressions: CardInstance[];
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

  manualEnemyMode: boolean;

  actionLog: string[];
}

// ─── Combat Actions ────────────────────────────────────────────
export type CombatAction =
  | { type: 'PLAY_CARD'; cardInstanceId: string }
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
  | { type: 'DEV_RESET'; state: CombatState }
  | { type: 'DEV_SET_MANUAL_ENEMY'; enabled: boolean }
  | { type: 'DEV_PICK_ENEMY_FROM_DECK'; instanceId: string };
