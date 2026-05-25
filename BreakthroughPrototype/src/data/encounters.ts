import type { EncounterConfig } from '../combat/types';

/**
 * Encounter definitions. Each encounter specifies:
 *   - Starting patience for the opponent
 *   - How many shields each side starts with
 *   - shieldLinks: the info card ID revealed when each opponent shield breaks (in order)
 *   - personalDeck: the player's Personal card pool for this encounter
 *   - worldDeck: relevance list — Information cards narratively relevant to this encounter;
 *                cards the player brings that are NOT on this list are converted to Ponder at combat init
 *   - oppDeck: the opponent's deck
 *
 * Card IDs reference entries in src/data/cards.ts.
 */
export const ENCOUNTERS: Record<string, EncounterConfig> = {
  gutterfang: {
    id: 'gutterfang',
    name: 'Gutterfang',
    patience: 5,
    playerShields: 3,
    oppShields: 3,
    shieldLinks: ['gutterfangSource', 'nobleIdentity', 'illegalVials'],
    personalDeck: ['intimidate', 'streetSmarts', 'persuade', 'probe', 'composure'],
    worldDeck: [
      'streetInfo', 'bloodTrail', 'vampireNetwork', 'nobleConnection',
      'streetInfo', 'bloodTrail', 'ponder',
      'theRustyTap', 'bloodTradeSuspicion', 'beastManAssault', 'whiteDeerDepartment',
    ],
    oppDeck: ['bloodTrail', 'streetInfo', 'streetInfo', 'bloodTrail', 'streetInfo'],
    // Street thug — responds to shows of force, unmoved by reason or compassion
    disposition: {
      vulnerable: ['intimidate', 'threaten'],
      resistant: ['logicalAppeal', 'empathy'],
    },
    valuableShields: ['bloodTrail', 'streetInfo', 'theRustyTap'],
    dialogue: {
      onVulnerable: [
        '…aight, aight. Back off.',
        "Ugh, you don't quit, do ya.",
        "Fine. What d'ya wanna know?",
      ],
      onResistant: [
        "Don't gimme that sob story.",
        "Logic? Out here? You're a joke.",
        'Save the speech, detective.',
      ],
    },
  },

  maryann: {
    id: 'maryann',
    name: 'Mary-Ann Mariposa',
    patience: 8,
    playerShields: 3,
    oppShields: 3,
    shieldLinks: ['maryannNotebook', 'maryannVials', 'maryannMastermind'],
    personalDeck: [
      'logicalAppeal', 'empathy', 'threaten', 'offerHelp',
      'probe', 'composure', 'persuade',
    ],
    worldDeck: [
      'collegeRecords', 'bloodAnalysis', 'loanLedger', 'distributionNet',
      'collegeRecords', 'bloodAnalysis', 'ponder', 'ponder',
      'mariposafamily', 'redMoonDescends', 'nobleVampireHouses', 'beastManAssault', 'bloodTradeSuspicion',
    ],
    oppDeck: [
      'bloodTrail', 'loanLedger', 'bloodTrail',
      'distributionNet', 'collegeRecords', 'bloodAnalysis',
    ],
    // Calculating businesswoman — responds to reason and empathy, not brute intimidation
    disposition: {
      vulnerable: ['persuade', 'logicalAppeal', 'empathy', 'offerHelp'],
      resistant: ['intimidate', 'threaten'],
    },
    valuableShields: ['loanLedger', 'distributionNet', 'bloodAnalysis'],
    dialogue: {
      onVulnerable: [
        '…I suppose you make a fair point.',
        "You're more perceptive than I gave you credit for.",
        "That's… not an unreasonable position.",
      ],
      onResistant: [
        'Intimidation? Really? How tiresome.',
        "I've dealt with far worse than you, detective.",
        'Threats are so… inelegant.',
      ],
    },
  },
};
