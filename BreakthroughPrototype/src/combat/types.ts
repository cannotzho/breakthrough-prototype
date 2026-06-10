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
  drawCards?: number;         // draw N card pairs from the combined deck (2 cards per pair)
  peekShield?: boolean;       // secretly view a random intact opponent shield
  reduceInfoCost?: number;    // (enchantment) reduce cost of Information cards by N
  drawEachTurn?: number;      // (enchantment) draw N extra personal cards each turn
  // #57 — probabilistic shield break (chance increases on failure, resets on success)
  breakShieldChance?: number;
  breakShieldChanceIncrement?: number;
  // #58 — patience-cost shield break (costs opponent patience; no effect on fearless opponents)
  shieldBreakPatience?: number;
  // #59 — priority surrender + shield immunity
  surrenderPriority?: boolean;
  shieldImmunityUntilPriority?: boolean;
  playerPatience?: number;    // restore N broken player shields
  // #60 — auto-break after N cumulative plays of this card
  autoBreakAfterPlays?: number;
  // #79 — can be played by the player even during the opponent's phase (negative priority)
  isInstant?: boolean;
}

export interface CardDef {
  id: string;
  name: string;
  supertype: CardSupertype;
  type: CardType;
  cost: number;
  effectText: string;
  flavorText?: string;
  effects: CardEffects;
  color: string;
  combinesFrom?: [string, string]; // informational annotation only — authoritative recipes are in src/data/combinations.ts
}

/** Per-encounter override applied on top of the base CardDef. */
export interface CardOverride {
  effects?: Partial<CardEffects>;
  effectText?: string;
}

export interface ShieldSlot {
  broken: boolean;
  linkedCardId?: string;  // info card revealed when this shield breaks (opponent shields)
  usedCardId?: string;    // World card ID consumed when this player shield was placed
  requiresCardId?: string; // if set, only a card with this ID can break this shield
  isDummyShield?: boolean; // shield created by a restore effect (smallTalk card); not returned to deck on break
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
  encounterDialogue: { onVulnerable: string[]; onResistant: string[]; onShieldBreak?: string[] };
  revealedShieldCard: string | null; // card ID shown in dramatic reveal dialog when player breaks opponent shield
  cardBreakChances: Record<string, number>;  // #57 — current break chance per card ID this encounter
  fearless: boolean;                          // #58 — opponent immune to patience-cost shield breaks
  playerShieldImmune: boolean;                // #59 — opponent cannot break player shields
  cardPlayCounts: Record<string, number>;     // #60 — cumulative play count per card ID this encounter
  availableCombinations: string[];            // #61 — combination card IDs whose sources are both in hand
  // EXPERIMENTAL (BotM #84) ─────────────────────────────────────────────────
  backOfMind: string[];              // card IDs kept through priority loss (subset of hand)
  awaitingBackOfMindChoice: boolean; // player must pick ≤3 cards before hand discards
  awaitingOpponentAck: boolean;      // player must click "Pass" before each opponent action fires
  pendingShieldBreakLine: string | null; // NPC reaction queued to show after reveal modal dismisses
  combatConfig: CombatConfig;        // tunable params (dev tools)
  // #99 — player chooses which opponent shield to break before confirming
  awaitingOppShieldBreakChoice: boolean; // player must click an opponent shield then confirm
  pendingBreakCardId: string | null;     // card that triggered the break choice
  // #100 — card effects hidden until understood
  understoodCards: Set<string>;          // card IDs whose effect text is visible this encounter
  cardOverrides: Record<string, CardOverride>; // encounter-specific card definition patches
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
  isMinorCharacter?: boolean;
  shieldLinks: string[];         // card IDs linked to each opponent shield slot, in order
  shieldRequirements?: string[]; // parallel to shieldLinks — card ID required to break each slot (empty string = no requirement)
  // Relevance list: Information cards narratively relevant to this encounter. Cards not on this list are converted to Ponder at combat init.
  worldDeck: string[];
  // Encounter-specific Personal cards added to the player's deck for this combat only (in addition to DETECTIVE_PERSONAL_DECK).
  personalDeck?: string[];
  oppDeck: string[];       // card IDs
  disposition: Disposition;
  valuableShields: string[]; // World card IDs especially meaningful to this NPC
  dialogue: { onVulnerable: string[]; onResistant: string[]; onShieldBreak?: string[] };
  fearless?: boolean; // #58 — patience-cost shield break cards have no effect against this opponent
  cardOverrides?: Record<string, CardOverride>; // #100 — per-card effect/text patches for this encounter
}

export type CombatAction =
  | { type: 'SELECT_CARD'; cardId: string }
  | { type: 'PLAY_CARD'; cardId: string }
  | { type: 'PLACE_SHIELD' }
  | { type: 'END_TURN' }
  | { type: 'CHOOSE_SHIELD_TO_BREAK'; index: number }
  | { type: 'CHOOSE_OPP_SHIELD'; index: number }
  | { type: 'OPPONENT_ACT'; specificCardId?: string }
  | { type: 'OPPONENT_END_TURN' }
  | { type: 'DISMISS_DIALOGUE' }
  | { type: 'DISMISS_REVEAL' }
  | { type: 'COMBINE_CARDS'; ingredient1: string; ingredient2: string }
  | { type: 'CONFIRM_BACK_OF_MIND'; keptIds: string[] }
  | { type: 'ACKNOWLEDGE_OPPONENT' }
  | { type: 'UNDERSTAND_CARD'; cardId: string }
  | { type: 'RESET'; encounter: EncounterConfig; chosenWorldDeck: string[]; preShields?: string[]; personalDeck?: string[] }
  | { type: 'UPDATE_CONFIG'; config: Partial<CombatConfig> };

export type AppScreen = 'overworld' | 'combat';

export interface CombatConfig {
  drawOnPriority: number;        // cards drawn on regaining priority (default 3)
  startingCards: number;         // cards in opening hand (default 4, applies on reset)
  maxPlayerShields: number;      // 0 = no cap
  drawPerPlay: number;           // cards auto-drawn after playing a card (default 1; 0 = no auto-draw)
  priorityOnShieldBreak: number; // priority restored to player when their shield is broken (default 1; valuable break adds 4 more)
  animDelay: number;             // animation speed multiplier (0 = instant, 1 = normal, 2 = slow-motion)
}
