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

  // ── Tutorial Encounter 1 ────────────────────────────────────────────────────
  pettyCriminal: {
    id: 'pettyCriminal',
    name: 'Petty Criminal',
    patience: 10,        // raised from 6: intimidate−2 + slap−4 = 6 total drain; need headroom so patience never hits 0 before whiteDeerPD wins
    playerShields: 0,    // no player shields in this encounter (spec: simplified UI)
    oppShields: 3,
    shieldLinks: ['feignIgnorance', 'theRustyTap', 'sampleBloodVial'],
    // Draw positions (with drawCards:1 fixed to draw exactly 1 + drawPerPlay:1):
    //   [0-2] initial deal: intimidate, slap, ponder
    //   [3]   after intimidate drawPerPlay:    dominate
    //   [4]   after ponder drawOneCard effect: ponder (filler — ponder in discard triggers step advance)
    //   [5]   after ponder drawPerPlay:        ponder (filler)
    //   [6]   after dominate drawPerPlay:      ponder (filler, discarded in BotM)
    //   [7-8] drawOnPriority=3 after Slap:    whiteDeerPD, ponder
    //   (9th draw reshuffles the discard pile — random, doesn't matter)
    worldDeck: [
      'intimidate', 'slap', 'ponder', 'dominate',
      'ponder', 'ponder', 'ponder', 'whiteDeerPD', 'ponder',
    ],
    scriptedDrawOrder: [
      'intimidate', 'slap', 'ponder', 'dominate',
      'ponder', 'ponder', 'ponder', 'whiteDeerPD', 'ponder',
    ],
    scriptedOpponentPlays: ['grovelling'],
    personalDeck: [],   // override: no standard detective deck — hand is fully scripted
    oppDeck: ['grovelling'],   // single-card deck so oppHand[0] is always grovelling (correct staged card)
    disposition: { vulnerable: [], resistant: [] },
    valuableShields: [],
    fearless: false,
    tutorialMode: true,
    initialCombatConfig: { startingCards: 3, drawPerPlay: 1, drawOnPriority: 3 },
    // Intimidate costs 2 patience (not the default 3) so tutorial numbers match spec.
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
        "You're relentless, you know that?",
        "…aight. Aight. I'll talk.",
      ],
    },
  },

  // ── Tutorial Encounter 2 ────────────────────────────────────────────────────
  mumPhoneCall: {
    id: 'mumPhoneCall',
    name: "Mum's Phone Call",
    patience: 10,
    playerShields: 3,   // player starts with 3 White Lie shields (pre-placed via tutorialPreShields)
    oppShields: 2,      // mum has 2 shields — broken by Sign Off when she's satisfied
    shieldLinks: ['whiteLie', 'whiteLie'],  // placeholder links (Sign Off breaks them voluntarily)
    tutorialPreShields: ['whiteLie', 'whiteLie', 'whiteLie'],
    worldDeck: ['whiteLie', 'whiteLie', 'whiteLie', 'whiteDeerPD', 'ponder', 'ponder'],
    scriptedDrawOrder: ['whiteLie', 'whiteLie', 'whiteLie', 'whiteDeerPD', 'ponder', 'ponder'],
    scriptedOpponentPlays: ['howsWork', 'worriedAboutMyBoy', 'signOff'],
    personalDeck: [],
    oppDeck: ['howsWork', 'worriedAboutMyBoy', 'signOff'],
    disposition: { vulnerable: [], resistant: [] },
    valuableShields: [],
    fearless: false,
    tutorialMode: true,
    // Starts in negative priority so the opponent acts first.
    initialPriority: -5,
    // Pause before first opponent action so the tutorial tooltip shows.
    initialAwaitingOpponentAck: true,
    // White Deer PD is already understood: its effect in this encounter is known.
    preUnderstoodCards: ['whiteDeerPD'],
    initialCombatConfig: { startingCards: 3, drawPerPlay: 0, drawOnPriority: 2, priorityOnShieldBreak: 3 },
    cardOverrides: {
      whiteDeerPD: {
        effectText: 'Effective Shield (+5 Priority on break, no Patience loss). The badge carries weight with her.',
      },
    },
    dialogue: {
      onVulnerable: [],
      onResistant: [],
      onShieldBreak: [
        "Oh don't tell me you're keeping secrets again…",
        "You never could lie to your mum.",
        "I know something's going on, love.",
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
