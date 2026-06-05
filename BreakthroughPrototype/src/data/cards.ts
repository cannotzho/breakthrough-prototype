/**
 * Card database for Breakthrough.
 *
 * Schema for each card entry:
 *   id:         unique camelCase key, used as reference throughout the game
 *   name:       display name shown on the card face
 *   supertype:  'Personal' — detective's own social/investigative abilities
 *               'Information' — world clues, resources, leads
 *   type:       'enchantment' — stays on the field; effects persist each turn
 *               'sorcery'    — played and discarded; one-time effect
 *               'instant'    — playable in either Attack or Defense phase
 *   cost:       how much priority is deducted when the card is played
 *   effectText: human-readable description shown on the card face
 *   flavorText: optional — shown in hover tooltip and inspect overlay (not on card face)
 *   effects:    structured effect data (see CardEffects in types.ts):
 *                 opponentPatience: negative drains opponent patience (good for player)
 *                 priority:         delta applied to the shared priority meter
 *                 breakShield:      breaks the first intact opponent shield
 *                 restoreShield:    repairs the first broken player shield
 *                 drawCards:        draw N extra pairs (1 personal + 1 world each)
 *                 peekShield:       secretly view a random intact opponent shield
 *                 reduceInfoCost:   (enchantment) lower cost of Information cards by N
 *                 drawEachTurn:     (enchantment) draw N extra personal cards per turn
 *   color:      CSS color string for the card's color pip indicator
 *
 * To add a new card: add an entry here and reference its id in encounters.ts.
 */

import type { CardDef } from '../combat/types';

export const CARDS: Record<string, CardDef> = {

  // ── Personal Cards (Detective's own social abilities) ───────────────────────

  intimidate: {
    id: 'intimidate',
    name: "Intimidate",
    supertype: 'Personal',
    type: 'sorcery',
    cost: 0,
    effectText: "Cost 3 opponent patience to force open a shield. No effect on fearless opponents.",
    flavorText: "Fear is a door. Push hard enough and it swings open.",
    effects: {
      shieldBreakPatience: 3,
    },
    color: '#e94560',
  },

  streetSmarts: {
    id: 'streetSmarts',
    name: 'Street Smarts',
    supertype: 'Personal',
    type: 'enchantment',
    cost: 2,
    effectText: 'Draw +1 card each turn',
    flavorText: "The city teaches you things no school will. You just have to be willing to get your knuckles dirty.",
    effects: { drawEachTurn: 1 },
    color: '#00d9ff',
  },

  persuade: {
    id: 'persuade',
    name: 'Persuade',
    supertype: 'Personal',
    type: 'sorcery',
    cost: 4,
    effectText: 'Opponent Patience −3, Priority +2. 25% chance to break a shield (+5% per failed attempt).',
    flavorText: "Everyone has a reason to help. You just have to find the right angle.",
    effects: { opponentPatience: -3, priority: 2, breakShieldChance: 0.25, breakShieldChanceIncrement: 0.05 },
    color: '#4ecca3',
  },

  logicalAppeal: {
    id: 'logicalAppeal',
    name: 'Logical Appeal',
    supertype: 'Personal',
    type: 'sorcery',
    cost: 3,
    effectText: 'Priority +3',
    flavorText: "The evidence speaks. You just arrange it so they can't look away.",
    effects: { priority: 3 },
    color: '#00d9ff',
  },

  empathy: {
    id: 'empathy',
    name: 'Empathy',
    supertype: 'Personal',
    type: 'instant',
    cost: 2,
    effectText: 'Restore 1 Shield',
    flavorText: "Sometimes the best armor is a kind word and the patience to mean it.",
    effects: { restoreShield: true },
    color: '#4ecca3',
  },

  threaten: {
    id: 'threaten',
    name: 'Threaten',
    supertype: 'Personal',
    type: 'sorcery',
    cost: 5,
    effectText: 'Opponent Patience −4',
    flavorText: "I don't bluff. They learn that the hard way.",
    effects: { opponentPatience: -4 },
    color: '#e94560',
  },

  offerHelp: {
    id: 'offerHelp',
    name: 'Offer Help',
    supertype: 'Personal',
    type: 'sorcery',
    cost: 3,
    effectText: 'Opponent Patience −2, Priority +2',
    flavorText: "A hand extended is harder to refuse than a fist. Not easier — just harder.",
    effects: { opponentPatience: -2, priority: 2 },
    color: '#4ecca3',
  },

  composure: {
    id: 'composure',
    name: 'Composure',
    supertype: 'Personal',
    type: 'instant',
    cost: 1,
    effectText: 'Priority +2',
    flavorText: "Read the room. Breathe. The advantage is yours if you hold steady.",
    effects: { priority: 2 },
    color: '#00d9ff',
  },

  probe: {
    id: 'probe',
    name: 'Probe',
    supertype: 'Personal',
    type: 'sorcery',
    cost: 2,
    effectText: 'Peek at one opponent Shield',
    flavorText: "There's always a crack in the facade. You just have to know where to look.",
    effects: { peekShield: true },
    color: '#f4d03f',
  },

  empathize: {
    id: 'empathize',
    name: 'Empathize',
    supertype: 'Personal',
    type: 'sorcery',
    cost: 2,
    effectText: 'Restore 2 Shields. Surrender priority. Your shields are immune until your next turn.',
    flavorText: "Sometimes slowing down is the fastest way to break through.",
    effects: { playerPatience: 2, surrenderPriority: true, shieldImmunityUntilPriority: true },
    color: '#4ecca3',
  },

  maryannInsight: {
    id: 'maryannInsight',
    name: "Insight: Mary-Ann",
    supertype: 'Personal',
    type: 'sorcery',
    cost: 1,
    effectText: 'Draw a card. After 3 plays this encounter: automatically break a shield.',
    flavorText: "She keeps turning away. But every time you ask, she hesitates a little longer.",
    effects: { drawCards: 1, autoBreakAfterPlays: 3 },
    color: '#f4d03f',
  },

  // ── Mary-Ann encounter-specific Personal cards ───────────────────────────────

  maryannInsightReluctance: {
    id: 'maryannInsightReluctance',
    name: "She Doesn't Want This",
    supertype: 'Personal',
    type: 'sorcery',
    cost: 1,
    effectText: 'Draw a card. After 3 plays this encounter: automatically break a shield.',
    flavorText: "Every time you push, she looks away faster. But you're getting through.",
    effects: { drawCards: 1, autoBreakAfterPlays: 3 },
    color: '#f4d03f',
  },

  maryannInsightObligation: {
    id: 'maryannInsightObligation',
    name: "Tied to Her House",
    supertype: 'Personal',
    type: 'sorcery',
    cost: 1,
    effectText: 'Draw a card. Opponent Patience −1.',
    flavorText: "She didn't choose this life. But she stayed in it anyway. That's the crack.",
    effects: { drawCards: 1, opponentPatience: -1 },
    color: '#f4d03f',
  },

  promiseCard: {
    id: 'promiseCard',
    name: 'A Better Way Out',
    supertype: 'Personal',
    type: 'sorcery',
    cost: 0,
    effectText: 'Break a shield. (Combination: She Doesn\'t Want This + Persuade)',
    flavorText: "You put everything on the line. She believes you.",
    effects: { breakShield: true },
    combinesFrom: ['maryannInsightReluctance', 'persuade'],
    color: '#4ecca3',
  },
  // TODO (#64): add promiseCardObligation combining ['maryannInsightObligation', 'persuade'] once the Shield-2 locked mechanic is implemented

  // ── World / Information Cards (clues, resources, investigative methods) ──────

  streetInfo: {
    id: 'streetInfo',
    name: 'Street Info',
    supertype: 'Information',
    type: 'sorcery',
    cost: 2,
    effectText: 'Priority +1',
    flavorText: "Half-truth overheard at a corner. Worth less than the air it traveled on — unless it's the half that matters.",
    effects: { priority: 1 },
    color: '#f4d03f',
  },

  bloodTrail: {
    id: 'bloodTrail',
    name: 'Blood Trail',
    supertype: 'Information',
    type: 'sorcery',
    cost: 3,
    effectText: 'Break a Shield',
    flavorText: "Fresh enough to follow. Old enough to mean someone cleaned up in a hurry.",
    effects: { breakShield: true },
    color: '#e94560',
  },

  vampireNetwork: {
    id: 'vampireNetwork',
    name: 'Vampire Network',
    supertype: 'Information',
    type: 'enchantment',
    cost: 2,
    effectText: 'Information cards cost 1 less',
    flavorText: "Old blood, old grudges, old debts. They talk among themselves. So do I.",
    effects: { reduceInfoCost: 1 },
    color: '#00d9ff',
  },

  nobleConnection: {
    id: 'nobleConnection',
    name: 'Noble Connection',
    supertype: 'Information',
    type: 'sorcery',
    cost: 4,
    effectText: 'Break a Shield',
    flavorText: "Drop the right name in the right room. Doors open that weren't there a moment ago.",
    effects: { breakShield: true },
    color: '#e94560',
  },

  collegeRecords: {
    id: 'collegeRecords',
    name: 'College Records',
    supertype: 'Information',
    type: 'sorcery',
    cost: 2,
    effectText: 'Priority +2',
    flavorText: "Paper trails outlast memories. They're also harder to bribe.",
    effects: { priority: 2 },
    color: '#00d9ff',
  },

  bloodAnalysis: {
    id: 'bloodAnalysis',
    name: 'Blood Analysis',
    supertype: 'Information',
    type: 'sorcery',
    cost: 3,
    effectText: 'Opponent Patience −1',
    flavorText: "The lab work doesn't care who's paying your fees.",
    effects: { opponentPatience: -1 },
    color: '#e94560',
  },

  loanLedger: {
    id: 'loanLedger',
    name: 'Loan Ledger',
    supertype: 'Information',
    type: 'sorcery',
    cost: 3,
    effectText: 'Break a Shield',
    flavorText: "Rumours that the Mariposa noble family has taken a large loan from The Moneylending Fellas.",
    effects: { breakShield: true },
    color: '#e94560',
  },

  distributionNet: {
    id: 'distributionNet',
    name: 'Distribution Net',
    supertype: 'Information',
    type: 'sorcery',
    cost: 4,
    effectText: 'Break a Shield',
    flavorText: "Confirms the Mariposas are in debt and repayments are accelerating rapidly. The math points to an active income source.",
    effects: { breakShield: true },
    color: '#e94560',
  },

  larkgroveLead: {
    id: 'larkgroveLead',
    name: 'Larkgrove College Lead',
    supertype: 'Information',
    type: 'sorcery',
    cost: 2,
    effectText: 'Priority +2',
    flavorText: "A name overheard at the bar: someone at Larkgrove Women's College, moving quietly. The name Mariposa came up twice.",
    effects: { priority: 2 },
    color: '#4070e0',
  },

  beastManSponsors: {
    id: 'beastManSponsors',
    name: 'Hired by the Sponsors',
    supertype: 'Information',
    type: 'sorcery',
    cost: 2,
    effectText: 'Opponent Patience −1, Priority +1.',
    flavorText: "You know who brought her here. So does she. The silence between you says everything.",
    effects: { opponentPatience: -1, priority: 1 },
    color: '#f4d03f',
  },

  ponder: {
    id: 'ponder',
    name: 'Ponder',
    supertype: 'Information',
    type: 'sorcery',
    cost: 1,
    effectText: 'Draw a card',
    flavorText: "Some leads need time to breathe before they turn into something useful.",
    effects: { drawCards: 1 },
    color: '#888888',
  },

  // ── Starter Compendium Cards (player's background knowledge at game start) ───

  beastManAssault: {
    id: 'beastManAssault',
    name: 'Beast-Man Assault',
    supertype: 'Information',
    type: 'sorcery',
    cost: 1,
    effectText: 'Priority +1',
    flavorText: 'A renowned beast-man was grievously injured. Sponsors have commissioned a full investigation.',
    effects: { priority: 1 },
    color: '#f4d03f',
  },

  bloodTradeSuspicion: {
    id: 'bloodTradeSuspicion',
    name: 'Blood Trade Suspicion',
    supertype: 'Information',
    type: 'sorcery',
    cost: 1,
    effectText: 'Priority +1',
    flavorText: 'The injury is believed connected to an illegal blood substance trade operating in this district.',
    effects: { priority: 1 },
    color: '#e94560',
  },

  theRustyTap: {
    id: 'theRustyTap',
    name: 'The Rusty Tap',
    supertype: 'Information',
    type: 'sorcery',
    cost: 2,
    effectText: 'Break a Shield',
    flavorText: "A pub identified as a known distribution hub for illegal blood product. Half the regulars don't remember a face they haven't seen before.",
    effects: { breakShield: true },
    color: '#e94560',
  },

  whiteDeerDepartment: {
    id: 'whiteDeerDepartment',
    name: 'White Deer Department',
    supertype: 'Information',
    type: 'instant',
    cost: 1,
    effectText: 'Priority +1',
    flavorText: 'The official law enforcement body. They bend the rules when it suits them — so do I.',
    effects: { priority: 1 },
    color: '#00d9ff',
  },

  nobleVampireHouses: {
    id: 'nobleVampireHouses',
    name: 'Noble Vampire Houses',
    supertype: 'Information',
    type: 'sorcery',
    cost: 1,
    effectText: 'Draw a card',
    flavorText: "Vampire noble families hold significant social and financial power. Knowing who's who is half the battle.",
    effects: { drawCards: 1 },
    color: '#f4d03f',
  },

  redMoonDescends: {
    id: 'redMoonDescends',
    name: 'Red Moon Descends',
    supertype: 'Information',
    type: 'sorcery',
    cost: 2,
    effectText: 'Opponent Patience −1, Priority +1',
    flavorText: 'A recently outed vampire supremacist cult. Kara Mariposa fled before the collapse — survival over ideology.',
    effects: { opponentPatience: -1, priority: 1 },
    color: '#e94560',
  },

  mariposafamily: {
    id: 'mariposafamily',
    name: 'Mariposa Family',
    supertype: 'Information',
    type: 'sorcery',
    cost: 1,
    effectText: 'Draw a card',
    flavorText: 'A publicly known but disgraced vampire noble house. Their current situation is deliberately unclear.',
    effects: { drawCards: 1 },
    color: '#f4d03f',
  },

  // ── Hidden Info Cards (revealed when opponent shields are broken) ────────────
  // Cost 0, no gameplay effects — they represent evidence obtained.

  gutterfangSource: {
    id: 'gutterfangSource',
    name: 'Blood Dealer Source',
    supertype: 'Information',
    type: 'sorcery',
    cost: 0,
    effectText: 'OBTAINED: Gutterfang named his noble supplier',
    flavorText: "He'd been protecting that name for months. It slipped out like water through cracked stone.",
    effects: {},
    color: '#e94560',
  },

  nobleIdentity: {
    id: 'nobleIdentity',
    name: 'Noble Identity',
    supertype: 'Information',
    type: 'sorcery',
    cost: 0,
    effectText: 'OBTAINED: Supplier is a vampire noble',
    flavorText: "A vampire noble. Of course. There's always a vampire noble at the end of these things.",
    effects: {},
    color: '#e94560',
  },

  illegalVials: {
    id: 'illegalVials',
    name: 'Illegal Blood Vials',
    supertype: 'Information',
    type: 'sorcery',
    cost: 0,
    effectText: 'OBTAINED: Illegal blood product found on the scene',
    flavorText: "Still sealed. Someone expected a delivery that never arrived.",
    effects: {},
    color: '#e94560',
  },

  debtSource: {
    id: 'debtSource',
    name: 'Debt Source',
    supertype: 'Information',
    type: 'sorcery',
    cost: 0,
    effectText: 'OBTAINED: Mariposa debt repaid through illicit gains',
    flavorText: "The Mariposa fortune rebuilt on blood money. The ledger doesn't lie.",
    effects: {},
    color: '#e94560',
  },

  transactionLog: {
    id: 'transactionLog',
    name: 'Transaction Log',
    supertype: 'Information',
    type: 'sorcery',
    cost: 0,
    effectText: 'OBTAINED: A ledger of all blood dealings',
    flavorText: "Every deal, every name, every date — all of it written down like it was something to be proud of.",
    effects: {},
    color: '#e94560',
  },

  maryannNotebook: {
    id: 'maryannNotebook',
    name: 'Transaction Notebook',
    supertype: 'Information',
    type: 'sorcery',
    cost: 0,
    effectText: 'OBTAINED: Notebook records all her transactions',
    flavorText: "Her handwriting. Meticulous. This is how she kept everyone beneath her in line.",
    effects: {},
    color: '#e94560',
  },

  maryannConfession: {
    id: 'maryannConfession',
    name: 'The Blood Vials',
    supertype: 'Information',
    type: 'sorcery',
    cost: 0,
    effectText: 'OBTAINED: She confesses — the vials were hers all along.',
    flavorText: "She finally shows you. Her hands barely shake. That's the worst part.",
    effects: {},
    color: '#e94560',
  },

  maryannVials: {
    id: 'maryannVials',
    name: 'Blood Vials on Person',
    supertype: 'Information',
    type: 'sorcery',
    cost: 0,
    effectText: 'OBTAINED: She is carrying blood vials',
    flavorText: "Freshly sealed. She was mid-run when I found her.",
    effects: {},
    color: '#e94560',
  },

  maryannMastermind: {
    id: 'maryannMastermind',
    name: 'Mastermind Revealed',
    supertype: 'Information',
    type: 'sorcery',
    cost: 0,
    effectText: 'OBTAINED: Mary-Ann Mariposa is the network mastermind',
    flavorText: "Everything pointed here. I just needed to follow the thread long enough.",
    effects: {},
    color: '#e94560',
  },
};

/** Card IDs the player owns at the start of a fresh game. */
export const STARTER_COMPENDIUM: string[] = [
  'beastManAssault',
  'bloodTradeSuspicion',
  'theRustyTap',
  'whiteDeerDepartment',
  'nobleVampireHouses',
  'redMoonDescends',
  'mariposafamily',
];

/** Personal cards the detective always has available, regardless of encounter. */
export const DETECTIVE_PERSONAL_DECK: string[] = [
  'intimidate', 'streetSmarts', 'persuade', 'logicalAppeal',
  'empathy', 'empathize', 'threaten', 'offerHelp', 'composure', 'probe',
  'maryannInsightReluctance',
  // TODO (#64): maryannInsightObligation should only enter the deck after Shield 1 breaks (locked mechanic not yet implemented)
  'maryannInsightObligation',
];
