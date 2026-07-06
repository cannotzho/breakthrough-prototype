# CLAUDE.md — Breakthrough (v1.4 rebuild)

This is the from-scratch rebuild of **Breakthrough**, a detective card game.
The rules authority is **`Breakthrough_Design_v1.4.md`**; scope and porting
rules are in **`Rebuild_Brief.md`**. Where anything conflicts, v1.4 wins.
Ken Zho is the design authority — design changes go through him and receive a
v1.4+ changelog entry. `PORTING_NOTES.md` tracks open ask-Ken items.

`prototype-v1/` is the retired prototype. Only its data files
(`src/data/devCards.ts`, `encounterDefs.ts`, `combinations.ts`) and Supabase
files (`supabase/schema.sql`, `src/lib/supabaseClient.ts`) may be read, as
content reference. **Never read its engine, screens, components, stores, or
old design docs** (Brief §2).

## Stack

Vite + React 19 + TypeScript. Chosen because: the engine is framework-agnostic
pure TS by directive (v1.4 §15.1), so the framework only owns presentation;
React + Motion (`motion/react`) is the strongest option for sequential,
never-silent DOM animation over form-heavy dev tooling (canvas engines would
fight the CRUD screens); Zustand for the thin UI bridge; Supabase JS +
Realtime for persistence and dual playtest; Vitest for the engine suite.
Determinism comes from a seeded PRNG stored *inside* combat state — identical
(seed, action sequence) ⇒ byte-identical states, which is the whole
dual-playtest sync model.

## Commands

- `npm run dev` — Vite dev server
- `npm test` — engine test suite (94 tests: §6.7 invariants, §4 boundary
  ordering, debt-transfer arithmetic, lock-and-keys incl. guard restoration,
  trap cancellation, all 12 Brief §7 known traps, content sanity + winnability)
- `npm run lint:no-card-ids` — greps the engine for card-ID literals (§15.2)
- `npm run build` — typecheck + production build

## Architecture

```
src/engine/     PURE. No React, no Supabase, no module-level state, no card IDs
                (one permitted content id: 'ponder', the designed fallback).
  types.ts        full v1.4 vocabulary (events, effects, restrictions, config)
  quantities.ts   evalQuantity/evalCondition — all scales & conditions
  rng.ts          mulberry32; RNG state lives in CombatState
  core.ts         effect stack (ONE suspension mechanism §15.4), event dispatch
                  (ONE integration point §15.5), shield procedures, play
                  sequencing §6.3/§6.6, thresholds §3.10
  boundaries.ts   ONE handoff() §15.3 — all §4 boundary steps live here only;
                  check() §6.1 (win before loss)
  reducer.ts      public reduce(state, action) — clones input, rejects illegal
                  actions without state change
  setup.ts        buildInitialState (validates, seeds, placeholders, set-asides)
  validation.ts   authoring-time checks (canonical events only, keyless locks…)
src/content/    Ported card/encounter data (Brief §6 re-expression). Data only.
src/net/        supabaseClient, persistence (content CRUD + §12 progress),
                realtime (dual playtest host-authority protocol)
src/stores/     gameStore — driver concerns only (history, session, manual mode)
src/ui/         title / combat / playtest screens, styles
src/devtools/   card editor, encounter builder, nugget manager, deck builder,
                in-combat DevPanel (inspector, dev actions, manual enemy mode)
tests/engine/   the suite; fixtures are synthetic (content-agnostic engine)
```

### Engine invariants the code enforces (do not regress)

- Two independent Priority meters; overspend unbounded; debt transfers at turn
  end, clamped at the *receiver's* turn start (§3.1). No auto turn handoff.
- Turn-start formula only — there is no "restore priority" anywhere (§3.1,
  Brief §7.3).
- All timed mechanics live in exactly one §4 boundary step; expiry ticks run
  before boundary-triggered effects apply (Brief §7.6).
- Generic break effects hit Guard Shields only; NPC Core Shields break solely
  via key nuggets while zero Guards stand; Guards are restorable (§3.3).
- Effect sequences suspend and resume, never restart; play completion (move
  card → CARD_RESOLVED → thresholds) always runs, including after a Reveal
  (§6.7.6, Brief §7.2).
- Cancelled staged cards discard exactly once and never begin resolution
  (§3.6, Brief §7.4).
- BotM Select fires only from Player Turn End (§6.5, Brief §7.8).
- The reducer is pure; encounter config is immutable input (§6.7.12).

### Dev tooling notes (Brief §5)

- **Manual enemy mode** (Dev Panel in combat): a human stages the NPC's play
  from its hand via `NPC_PLAY_CARD` — identical state transitions to the
  automatic leftmost policy (tested byte-identical in `purity.test.ts`).
- **Dual playtest** (`#/playtest`): host shares a 5-letter code; guest drives
  the NPC side. Host is the authority: it validates guest requests through the
  reducer and broadcasts the applied action sequence; both clients replay the
  same actions over the same seeded initial state. NPC turn end remains
  automatic (§4.4). Dev-panel patches are disabled during sessions (they'd
  break determinism).
- **Encounter builder** launches a playtest directly; all editors run the
  engine's authoring validation before save.

### Persistence (Brief §3)

Fresh schema in `supabase/schema.sql` (old v1.2 tables dropped — Ken approved
discarding old rows). Content tables (`cards`, `encounters`, `info_nuggets`,
`decks`) back the dev tools; `progress_*` tables persist the Collection,
global nugget discovery, per-NPC trait discovery, and per-encounter retry
state (persistent core-shield breaks, `playedNonRelevantCards`). The app works
offline from bundled content in `src/content/` if Supabase is unreachable.
"Seed Supabase" in Dev Tools uploads the bundled content.

### Known environment quirk (this workspace)

In-place file edits through the mounted-folder bridge have produced truncated
syncs; when modifying source here, delete + rewrite files rather than editing
in place, and re-run `npm test` after any batch of writes.

## Status

Engine, tests, UI, dev tools, dual playtest, persistence, and content port are
in place. Open design questions are collected in `PORTING_NOTES.md` — most
importantly the DRAFT key-nugget assignments in `src/content/encounters.ts`
and the cards that need vocabulary decisions (equal_exchange,
monolithic_ideals, genuine_enjoyment, lunatic_love rider, copy-inversion).
