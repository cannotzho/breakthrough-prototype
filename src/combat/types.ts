// ─── Color Identity ────────────────────────────────────────────
export type ColorIdentity = 'Red' | 'Blue' | 'Green' | 'White' | 'Black' | 'Orange' | 'Purple' | 'Colorless';

// ─── Keywords ──────────────────────────────────────────────────
export type Keyword = 'Interrupt' | 'Safety' | 'Assemble' | 'Counter' | 'Lie';

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

// ─── Card Definition ───────────────────────────────────────────
export type CardSupertype = 'Skill' | 'Information';
export type CardSubtype = 'Impression' | null;

export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  keywords: Keyword[];
  effects: CardEffect[];
  color: ColorIdentity;
  supertype: CardSupertype;
  subtype: CardSubtype;
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

export interface PlayerShieldSlot {
  card: CardInstance;
}

// ─── Relevant Cards ────────────────────────────────────────────
export interface RelevantCard {
  cardId: string;
  effects: CardEffect[];
  effectDescription: string;
  discovered: boolean;
}

// ─── Traits ────────────────────────────────────────────────────
export interface Trait {
  id: string;
  name: string;
  description: string;
  discovered: boolean;
}

// ─── Encounter Config ──────────────────────────────────────────
export interface EncounterConfig {
  id: string;
  displayName: string;
  startingPriority: number;
  defaultRestorePriority: number;
  opponentPatience: number;
  opponentShields: OpponentShieldSlot[];
  shieldBreakOrder?: number[];
  playerShields?: string[];
  unbreakablePlayerShields?: boolean;
  relevantCards: RelevantCard[];
  traits: Trait[];
  retryable: boolean;
  lieThreshold?: number;
  tutorialMode?: boolean;
  scriptedDrawOrder?: string[][];
  scriptedOpponentPlays?: string[];
  enemyDeckCardIds: string[];
  maxPlayerShields?: number;
}

// ─── Combat Config ─────────────────────────────────────────────
export interface CombatConfig {
  handLimit: number;
  backOfMindLimit: number;
  maxPlayerShields: number;
}

export const DEFAULT_COMBAT_CONFIG: CombatConfig = {
  handLimit: 5,
  backOfMindLimit: 1,
  maxPlayerShields: 3,
};

export const SHIELD_PLACEMENT_COST = 2;

// ─── Combat Phase ──────────────────────────────────────────────
export type CombatPhase =
  | 'Check'
  | 'PlayerPending'
  | 'PlayerPlay'
  | 'RevealPending'
  | 'PlayerShieldChoice'
  | 'BotMSelect'
  | 'EnemyPending'
  | 'InterruptCheck'
  | 'Interrupt'
  | 'InterruptPlay'
  | 'EnemyPlay'
  | 'WIN'
  | 'LOSE';

// ─── Combat State ──────────────────────────────────────────────
export interface CounterPendingState {
  hasSafety: boolean;
  savedEffects: CardEffect[];
  savedEffectCard: CardInstance | null;
}

export interface CombatState {
  phase: CombatPhase;
  priority: number;
  patience: number;
  lieCounter: number;

  playerHand: CardInstance[];
  playerDeck: CardInstance[];
  playerDiscard: CardInstance[];
  backOfMind: CardInstance[];

  playerShields: (PlayerShieldSlot | null)[];
  pendingShieldChoiceSlotIdx: number | null;
  shieldEverOccupied: boolean;

  opponentShields: OpponentShieldSlot[];
  pendingReveal: OpponentShieldSlot | null;

  enemyDeck: CardInstance[];
  enemyDiscard: CardInstance[];
  stagedEnemyCard: CardInstance | null;

  fieldImpressions: CardInstance[];

  playedNonRelevantCards: string[];

  config: EncounterConfig;
  combatConfig: CombatConfig;

  pendingEffects: CardEffect[];
  pendingEffectCard: CardInstance | null;
  pendingPlaceAsShield: boolean;
  counterPending: CounterPendingState | null;
  pendingDiscovery: RelevantCard | null;

  actionLog: string[];
}

// ─── Combat Actions ────────────────────────────────────────────
export type CombatAction =
  | { type: 'PLAY_CARD'; cardInstanceId: string }
  | { type: 'PLACE_SHIELD'; cardInstanceId: string; slotIdx: number }
  | { type: 'END_TURN' }
  | { type: 'SELECT_BOTM'; cardInstanceId: string }
  | { type: 'DISMISS_REVEAL' }
  | { type: 'SELECT_SHIELD_SACRIFICE'; slotIdx: number }
  | { type: 'CONFIRM_SHIELD_SACRIFICE' }
  | { type: 'PLAY_INTERRUPT'; cardInstanceId: string }
  | { type: 'PASS_INTERRUPT' }
  | { type: 'CHECK' }
  | { type: 'TRIGGER_ENEMY_ACTION' }
  | { type: 'COMBINE'; cardInstanceIds: [string, string] }
  | { type: 'DISMISS_DISCOVERY' }
  | { type: 'DEV_SET_PRIORITY'; value: number }
  | { type: 'DEV_SET_PATIENCE'; value: number }
  | { type: 'DEV_SET_LIE_COUNTER'; value: number }
  | { type: 'DEV_BREAK_OPPONENT_SHIELD'; idx: number }
  | { type: 'DEV_BREAK_PLAYER_SHIELD'; idx: number }
  | { type: 'DEV_SET_PHASE'; phase: CombatPhase }
  | { type: 'DEV_ADD_CARD_TO_HAND'; card: CardDefinition }
  | { type: 'DEV_SET_ENEMY_CARD'; card: CardDefinition }
  | { type: 'DEV_ADD_RELEVANT_CARD'; card: RelevantCard }
  | { type: 'RESOLVE_ENEMY_CARD' }
  | { type: 'CONFIRM_PLACE_AS_SHIELD'; slotIdx: number }
  | { type: 'RESOLVE_INTERRUPT_CHECK' }
  | { type: 'CONFIRM_BOTM' }
  | { type: 'DEV_RESET'; state: CombatState };
