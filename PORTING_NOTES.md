# Content Porting Notes (Brief §6)

Status of the re-expression from `prototype-v1` data into the v1.4 vocabulary,
updated after Ken's design review (2026-07-06). Implemented design changes are
drafted as changelog entries in `DESIGN_CHANGES_v1.4.1.md`.

## Ported cleanly

- Ponder, dev cards, dev enemy cards.
- Blue starter (16/16) — tokens, replacements, traps re-authored onto canonical events.
- Red starter (16/16) — scaled effects use engine quantities; `Vindication` uses the
  §4-named `oppShieldsBrokenByPlayerPrevTurn` (the old ambiguous counter is gone).
- Green starter (17/17) — Rapport is real prediction config; Disarming Word and
  Sensitive Deflection sit on canonical events and genuinely cancel (tested);
  **Genuine Enjoyment** and **To Truly Know** implemented per Ken's v1.4.1 rulings.
- Orange starter (13/15) — **Mind Tax** now reacts per extra draw via the new
  `CARD_DRAWN` event; `equal_exchange` and `monolithic_ideals` remain excluded
  (Ken-approved).
- FCP set (22/22) — devotion is generic counters/thresholds/amplifiers on
  `fcp_idols_favor`; the engine has no knowledge of any FCP card (verified by
  the no-card-ID lint).
- Mistimed `END_OF_PLAYER_TURN` traps re-authored per printed intent (Brief §6.4).

## Encounter shape (v1.4.1, per Ken)

Two tiers: **Guard Shields** (total 10 by default; card-backed shield-trigger
guards + dummy fill; opponent guard breaks never cost Patience) and **Core
Shields** (locks with key nuggets; Elite/Boss encounters).

- **The Informant** — 10 dummy guards; 3 locks (warehouse / personal-hint /
  witnessed). Key assignments approved as working values, revision pass later.
- **Fan Club President** — 10 guards incl. `fcp_fans_solace` +
  `fcp_panicked_memories` as card guards; 3 locks (clarity-hint ←
  idol_schedule; crippling_fear ← passcode OR traces; it_wasnt_me ←
  witness_statements). Approved as working values.

## Deferred (Ken, 2026-07-06)

1. **Devotion as alternate Priority cost** (Lunatic Love rider) — needs an
   alternate-cost mechanic; implement later.
2. **Cumulative shields-broken counter** — for Idol's Favor's "10 total
   shields broken" transform clause; currently approximated as
   all-Guards-broken. Implement later.
3. **`orange_equal_exchange`**, **`orange_monolithic_ideals`** — excluded.
4. **Mind Tax Heavy Hand variant** — Heavy Hand can't scale a triggered
   ability yet.

## Patience asymmetry audit (Brief §6.7, v1.4 §3.2)

- All player-card text uses cost framing ("Pay N Patience"); NPC cards "Drain".
- Red's low-Patience scalers keep their risk/reward framing as deliberate
  exceptions.
- **Copy-inversion (v1.4 §16.7)** remains open: `green_empathy` /
  `green_shared_perspective` can copy NPC Patience-drain cards which are dead
  weight or self-harm in the player's hand. Engine plays copies as printed
  until the §8.5 inversion rule is decided.
- `red_ultimatum` / `red_intimidating_presence` drain the shared budget on
  opponent plays — ported as printed (Red recklessness), flagged for a
  possible redesign.

## Supabase

Old rows discarded (Ken-approved). Fresh v1.4 schema in `supabase/schema.sql`;
`src/content/` is the seed source ("Seed Supabase" in Dev Tools).
