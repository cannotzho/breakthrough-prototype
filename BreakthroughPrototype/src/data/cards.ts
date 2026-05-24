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
    name: 'Intimidate',
    supertype: 'Personal',
    type: 'sorcery',
    cost: 3,
    effectText: 'Opponent Patience −2, Priority +2',
    effects: { opponentPatience: -2, priority: 2 },
    color: '#e94560',
  },

  streetSmarts: {
    id: 'streetSmarts',
    name: 'Street Smarts',
    supertype: 'Personal',
    type: 'enchantment',
    cost: 2,
    effectText: 'Draw +1 card each turn',
    effects: { drawEachTurn: 1 },
    color: '#00d9ff',
  },

  persuade: {
    id: 'persuade',
    name: 'Persuade',
    supertype: 'Personal',
    type: 'sorcery',
    cost: 4,
    effectText: 'Opponent Patience −3, Priority +2',
    effects: { opponentPatience: -3, priority: 2 },
    color: '#4ecca3',
  },

  logicalAppeal: {
    id: 'logicalAppeal',
    name: 'Logical Appeal',
    supertype: 'Personal',
    type: 'sorcery',
    cost: 3,
    effectText: 'Priority +3',
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
    effects: { peekShield: true },
    color: '#f4d03f',
  },

  // ── World / Information Cards (clues, resources, investigative methods) ──────

  streetInfo: {
    id: 'streetInfo',
    name: 'Street Info',
    supertype: 'Information',
    type: 'sorcery',
    cost: 2,
    effectText: 'Priority +1',
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
    effects: { breakShield: true },
    color: '#e94560',
  },

  ponder: {
    id: 'ponder',
    name: 'Ponder',
    supertype: 'Information',
    type: 'sorcery',
    cost: 1,
    effectText: 'Draw a card',
    effects: { drawCards: 1 },
    color: '#888888',
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
    effects: {},
    color: '#e94560',
  },
};
