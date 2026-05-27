export type CardSupertype = 'Personal' | 'Information';
export type CardType = 'enchantment' | 'sorcery' | 'instant';

/**
 * Structured card effects. All numeric values are deltas applied to the
 * named stat. Negative opponentPatience means the opponent loses patience
 * (beneficial for the player). Positive priority means the player gains priority.
 */
export interface CardEffects {
  opponentPatience?: number;  // negative = drains opponent patience
  priority?: number;          // positive = increases priority meter
  breakShield?: boolean;      // breaks one opponent shield, revealing linked info
  restoreShield?: boolean;    // repairs one broken player shield
  drawCards?: number;         // draw N extra card pairs (1 personal + 1 world each)
  peekShield?: boolean;       // secretly view a random intact opponent shield
  reduceInfoCost?: number;    // (enchantment) reduce cost of Information cards by N
  drawEachTurn?: number;      // (enchantment) draw N extra personal cards each turn
}

export interface CardDef {
  id: string;
  name: string;
  supertype: CardSupertype;
  type: CardType;
  cost: number;
  effectText: string;
  effects: CardEffects;
  color: string;
}

export interface ShieldSlot {
  broken: boolean;
  linkedCardId?: string; // info card revealed when this shield breaks (opponent shields)
  usedCardId?: string;   // World card ID consumed when this player shield was placed
}

export interface DeckState {
  cards: string[];   // card IDs, draw from front
  discard: string[]; // card IDs waiting to be reshuffled
}

export interface CombatState {
  phase: 'attack' | 'defense';
  priority: number;           // -10 to +10; positive = attack phase
  playerShields: ShieldSlot[];
  oppShields: ShieldSlot[];
  hand: string[];             // card IDs in player hand
  oppHand: string[];          // card IDs in opponent hand
  personalDeck: DeckState;
  worldDeck: DeckState;
  oppDeck: DeckState;
  field: string[];            // enchantment card IDs currently on the field
  logs: string[];
  selectedCardId: string | null;
  awaitingShieldChoice: boolean;  // player must choose which shield to sacrifice
  pendingOppCardId: string | null; // opponent card that triggered shield choice
  gameOver: boolean;
  winner: 'player' | 'opponent' | null;
  oppPatience: number;
  oppMaxPatience: number;
  collectedInfo: string[];    // info card IDs obtained from broken opponent shields
  opponentActionTrigger: number; // increments each time opponent should act
  disposition: Disposition;   // this opponent's vulnerability/resistance profile
  valuableShields: string[];     // card IDs the NPC cares about keeping hidden
  activeDialogue: string | null; // NPC line triggered by a disposition hit; null when idle
  encounterDialogue: { onVulnerable: string[]; onResistant: string[] };
}

/**
 * Describes how an opponent responds to different Personal card approaches.
 * vulnerable: card IDs that deal double patience drain and +1 priority against this opponent.
 * resistant:  card IDs that deal halved patience drain and -1 priority against this opponent.
 */
export interface Disposition {
  vulnerable: string[];
  resistant: string[];
}

export interface EncounterConfig {
  id: string;
  name: string;
  portraitUrl?: string;
  patience: number;
  playerShields: number;
  oppShields: number;
  shieldLinks: string[];   // card IDs linked to each opponent shield slot, in order
  personalDeck: string[];  // card IDs
  // Relevance list: Information cards narratively relevant to this encounter. Cards not on this list are converted to Ponder at combat init.
  worldDeck: string[];
  oppDeck: string[];       // card IDs
  disposition: Disposition;
  valuableShields: string[]; // World card IDs especially meaningful to this NPC
  dialogue: { onVulnerable: string[]; onResistant: string[] };
}

export type AppScreen = 'overworld' | 'combat';
