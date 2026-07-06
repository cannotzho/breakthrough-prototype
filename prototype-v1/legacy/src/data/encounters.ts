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

  // ── Tutorial 1 — Priority and Opponent Shields ──────────────────────────────
  tutorial1: {
    id: 'tutorial1',
    name: 'Tutorial 1',
    patience: 10,
    playerShields: 0,
    unbreakablePlayerShields: true,
    oppShields: 2,
    shieldLinks: ['feignIgnorance', 'theRustyTap'],
    // Starting hand (startingCards: 3): intimidate, ponder, dominate
    // After intimidate (drawPerPlay:1): ponder filler
    // After ponder (drawCards:1 + drawPerPlay:1): two ponder fillers
    worldDeck: [
      'intimidate', 'ponder', 'dominate',
      'ponder', 'ponder', 'ponder',
    ],
    scriptedDrawOrder: [
      'intimidate', 'ponder', 'dominate',
      'ponder', 'ponder', 'ponder',
    ],
    scriptedOpponentPlays: [],
    personalDeck: [],
    oppDeck: ['ponder'],
    disposition: { vulnerable: [], resistant: [] },
    valuableShields: [],
    fearless: false,
    tutorialMode: true,
    initialCombatConfig: { startingCards: 3, drawPerPlay: 1, drawOnPriority: 3 },
    cardOverrides: {
      intimidate: {
        effectText: 'Cost 2 opponent patience to force open a shield. No effect on fearless opponents.',
        effects: { shieldBreakPatience: 2 },
      },
    },
    dialogue: {
      onVulnerable: [],
      onResistant: [],
      onShieldBreak: [
        "Oi — what the hell…",
        "…aight. Fine. I'll talk.",
      ],
    },
  },

  // ── Tutorial 2 — Interrupts, BotM, and Patience ─────────────────────────────
  tutorial2: {
    id: 'tutorial2',
    name: 'Tutorial 2',
    patience: 10,
    playerShields: 0,
    unbreakablePlayerShields: true,
    oppShields: 2,
    shieldLinks: ['feignIgnorance', 'sampleBloodVial'],
    // Starting hand (startingCards: 3): dominate, slap, ponder
    // After dominate (drawPerPlay:1): ponder
    // After ponder (drawCards:1 + drawPerPlay:1): ponder x2
    // After Slap restores priority (drawOnPriority:3): whiteDeerPD, ponder, ponder
    worldDeck: [
      'dominate', 'slap', 'ponder',
      'ponder', 'ponder', 'ponder',
      'whiteDeerPD', 'ponder', 'ponder',
    ],
    scriptedDrawOrder: [
      'dominate', 'slap', 'ponder',
      'ponder', 'ponder', 'ponder',
      'whiteDeerPD', 'ponder', 'ponder',
    ],
    scriptedOpponentPlays: ['grovelling'],
    personalDeck: [],
    oppDeck: ['grovelling'],
    disposition: { vulnerable: [], resistant: [] },
    valuableShields: [],
    fearless: false,
    tutorialMode: true,
    initialCombatConfig: { startingCards: 3, drawPerPlay: 1, drawOnPriority: 3 },
    dialogue: {
      onVulnerable: [],
      onResistant: [],
      onShieldBreak: [
        "You're relentless, you know that?",
        "…aight. Aight. I'll talk.",
      ],
    },
  },

  // ── Tutorial 3 — Defensive Shields ──────────────────────────────────────────
  tutorial3: {
    id: 'tutorial3',
    name: 'Tutorial 3',
    patience: 10,
    playerShields: 3,
    oppShields: 2,
    shieldLinks: ['whiteLie', 'whiteLie'],
    // No tutorialPreShields — player selects shields via ShieldSelector.
    // scriptedDrawOrder front-loads whiteLie so if player picks whiteLie x3 as shields,
    // those are removed from the deck and whiteDeerPD lands in the opening hand.
    worldDeck: ['whiteLie', 'whiteLie', 'whiteLie', 'whiteDeerPD', 'ponder', 'ponder'],
    scriptedDrawOrder: ['whiteLie', 'whiteLie', 'whiteLie', 'whiteDeerPD', 'ponder', 'ponder'],
    scriptedOpponentPlays: ['howsWork', 'worriedAboutMyBoy', 'signOff'],
    personalDeck: [],
    oppDeck: ['howsWork', 'worriedAboutMyBoy', 'signOff'],
    disposition: { vulnerable: [], resistant: [] },
    valuableShields: [],
    fearless: false,
    tutorialMode: true,
    initialPriority: -5,
    initialAwaitingOpponentAck: true,
    preUnderstoodCards: ['whiteDeerPD'],
    initialCombatConfig: { startingCards: 3, drawPerPlay: 0, drawOnPriority: 2, priorityOnShieldBreak: 3 },
    cardOverrides: {
      whiteDeerPD: {
        effectText: 'Break a Shield. Effective Shield (+5 Priority on break, no Patience loss).',
      },
    },
    dialogue: {
      onVulnerable: [],
      onResistant: [],
      onShieldBreak: [
        "That one landed.",
        "I know something's going on.",
      ],
    },
  },

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
      // Placeholder lines — flag for Ken to review (#88)
      onShieldBreak: [
        "Oi — the hell you think you're doin'?",
        "You're pokin' at things you don't understand, mate.",
        '…alright. Alright. I\'ll talk.',
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
    // maryannInsightReluctance is encounter-specific — available from turn 1 to build pressure on Shield 1.
    // maryannInsightObligation stays out until Shield 1 breaks (locked mechanic pending #64).
    personalDeck: ['maryannInsightReluctance'],
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
      // Placeholder lines — flag for Ken to review (#88)
      onShieldBreak: [
        'My. You\'re more thorough than I anticipated.',
        'I see you\'ve done your homework, detective.',
        '…I suppose there\'s no point denying it further.',
      ],
    },
  },
};
