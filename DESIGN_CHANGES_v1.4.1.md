# Proposed changelog — v1.4.1 (drafted for Ken's sign-off)

Per §8 of the brief, design changes go through Ken and receive a v1.4+
changelog entry. The following were decided by Ken in review (2026-07-06) and
are implemented; this file is the draft changelog block for the design doc.

### v1.4.1 — 2026-07-06

- **Two-tier opponent shields restated; card-backed Guard Shields.** Guard
  Shields default to a total of **10** per encounter. The guard tier may
  include **card-backed guards** (cards with Shield Trigger effects, e.g.
  Fan's Solace); the difference up to the total is made up by dummy guards —
  the basic form of Guard Shield. Card guards are authored via
  `npcGuardShieldCardIds` (counted inside `npcGuardShieldCount`) and are
  shuffled into the face-down guard row at setup. When a card-backed guard
  breaks: its Shield Trigger resolves, its card goes to the NPC discard
  (recyclable), nothing is revealed and no Reveal fires. Core Shields
  (locks-and-keys, unchanged) sit behind the guard tier and are reserved for
  Elite/Boss encounters. **Restated:** breaking an opponent Guard Shield —
  dummy or card-backed — never reduces Patience (unlike the NPC breaking the
  player's dummy shields, which costs the shared budget). Guard restoration
  places dummy guards.
- **`CARD_DRAWN` added to the canonical event vocabulary (§5.1).** Dispatched
  once per card drawn, either side; payload: controller, card, and an
  `extraDraw` flag (false only for turn-start refills). Enables per-draw
  reactivity (consumer: Orange's *Mind Tax*).
- **Genuine Enjoyment (Green)** re-authored per Ken: not prevention-with-cost —
  the Impression applies a plain `PREVENT_SHIELD_BREAK` (opponent) linked to
  itself, plus a Patience drain on play. Destroy-below-15 retained.
- **To Truly Know (Green)** clarified per Ken: its secondary effect triggers
  at the start of the player's turn; the trigger checks the count of the
  rapport counters on itself to decide its tier (3+ → break 3 Guards, 5+ → 5,
  10+ → 10). Counters are not consumed.
- **Confirmed:** Find Fallacy fires on the opponent's 3rd card of a turn with
  both effects unconditional. Crippling Fear's lock keeps one-lock-many-keys
  semantics (either passcode knowledge or physical traces suffices).

### Deferred (noted, awaiting design)

- **Devotion-pays-Priority (Lunatic Love rider):** paying Priority costs with
  devotion counters is an *alternate cost* mechanic — needs its own vocabulary
  entry (not portable as a restriction/ability). Implementation later.
- **Cumulative shields-broken counter:** needed for Idol's Favor's original
  "10 total shields broken" transform clause (currently approximated as
  all-Guards-broken). Add a cumulative counter to the §4 vocabulary later.
- **Excluded cards:** `orange_equal_exchange` (needs value-capture at schedule
  time) and `orange_monolithic_ideals` (needs conditional per-turn rate-cap
  restriction types) remain out of the ported set.
- **Mind Tax Heavy Hand variant:** Heavy Hand currently swaps a card's play
  effect list; it cannot change a triggered ability's magnitude. Pending.
