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
    patience: 8, // raised from 5 — doubled patience drain on vulnerable hits was too punishing for tutorial
    playerShields: 3,
    oppShields: 3,
    shieldLinks: ['gutterfangSource', 'nobleIdentity', 'illegalVials'],
    worldDeck: [
      'streetInfo', 'bloodTrail', 'vampireNetwork', // TODO: designer review — vampireNetwork is a strategic utility; fits The Rusty Tap underworld but is not street-level narrative evidence
      'nobleConnection', // TODO: player obtains this FROM this encounter (not a starter card); kept for replay-encounter compatibility, but premature on first play
      'streetInfo', 'bloodTrail', 'ponder',
      'theRustyTap', 'bloodTradeSuspicion', 'beastManAssault', 'whiteDeerDepartment',
      'nobleVampireHouses', // starter compendium card — background knowledge of noble vampire families
      'redMoonDescends', 'mariposafamily', // cult and noble house behind the blood trade — relevant context when pressing Gutterfang on his supplier
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
    // Shield 1: auto-breaks after maryannInsightReluctance played 3×, or break normally
    // Shield 2: TODO (#64) — should unlock only after Shield 1 breaks (locked mechanic not yet implemented)
    // Shield 3: breaks ONLY via the promiseCard combination
    shieldLinks: ['maryannInsightReluctance', 'maryannInsightObligation', 'maryannConfession'],
    shieldRequirements: ['', '', 'promiseCard'],
    fearless: true,
    worldDeck: [
      'loanLedger', 'distributionNet', 'bloodAnalysis', 'collegeRecords',
      'loanLedger', 'distributionNet', 'bloodAnalysis', 'collegeRecords',
      'beastManSponsors', 'beastManSponsors',
      'ponder', 'ponder',
      'mariposafamily', 'redMoonDescends', 'nobleVampireHouses', 'beastManAssault', 'bloodTradeSuspicion',
      'whiteDeerDepartment', // starter card — detective's PD connection underwrites the promise to waive the debt
      'theRustyTap', // starter card — she runs distribution out of The Rusty Tap; directly relevant
      'nobleConnection', // obtained post-Gutterfang — what led the investigation to noble vampire families
      'larkgroveLead', // acquired at second Rusty Tap visit — the lead to Larkgrove where she is found
    ],
    oppDeck: [
      'bloodTrail', 'loanLedger', 'bloodTrail',
      'distributionNet', 'collegeRecords', 'bloodAnalysis',
    ],
    // Calculating businesswoman — responds to reason and empathy, immune to intimidation (fearless)
    disposition: {
      vulnerable: ['persuade', 'logicalAppeal', 'empathy', 'offerHelp'],
      resistant: ['intimidate', 'threaten'],
    },
    valuableShields: ['loanLedger', 'distributionNet', 'bloodAnalysis', 'beastManSponsors'],
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
