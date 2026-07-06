# Breakthrough — Rebuild Brief

> Companion to **Breakthrough_Design_v1.4.md** (the design authority). A fresh session should be able to build the entire game from these two documents plus the read-allowed files listed below. Prepared 2026-07-05.

---

## 1. Mission

Build Breakthrough **from scratch** as a new codebase: a polished, playable implementation of the v1.4 design, plus rebuilt dev tooling. The previous prototype (Vite + React 19 + TS + Tailwind) is reference material for *content and requirements only* — its engine contains known misunderstandings and bugs and must not be used as a source of truth for rules or architecture.

**Framework freedom:** choose whatever stack you judge best suited for a card game with heavy sequential animation, drag-and-drop, realtime multiplayer sync, and Supabase persistence. React is permitted but not required. Justify the choice briefly in the new CLAUDE.md. Wherever v1.4 §14 mentions Framer Motion, read "your stack's equivalent animation system" — the *requirements* (sequential, never-silent, every zone transition animated) are normative; the library is not.

**Polish bar:** this is a rebuild aimed at a more finished game, not a second prototype. Game feel matters: animation sequencing per v1.4 §14, readable state at a glance, no teleporting cards, no unexplained state changes, coherent visual identity.

---

## 2. Source-Code Access Rules

The old prototype lives in `prototype-v1/`. The new build lives at the repository root, alongside the two authority documents.

| Path | Access | Reason |
|---|---|---|
| `Breakthrough_Design_v1.4.md` | **Authority** | The rules. Where anything conflicts, this wins. |
| `Rebuild_Brief.md` | **Authority** | Scope, tooling requirements, porting notes. |
| `prototype-v1/src/data/devCards.ts`, `prototype-v1/src/data/encounterDefs.ts`, `prototype-v1/src/data/combinations.ts` | **Read as content reference** | Card/encounter/token *data* to port (see §6). Declarative; safe. |
| `prototype-v1/supabase/schema.sql`, `prototype-v1/src/lib/supabaseClient.ts` | **Read** | Existing persistence project: URL, anon key, current tables. |
| Everything else under `prototype-v1/` — in particular `src/combat/`, `src/screens/`, `src/components/`, `src/stores/`, `legacy/`, `breakthrough.html`, `CLAUDE.md`, `COMBAT_ARCHITECTURE.md`, `Breakthrough_Design.md` (v1.2) | **Do not read** | The buggy engine, the UI built on it, and superseded design docs containing repealed rules (patience overflow, shared-meter priority, shieldBreakOrder, "Red erodes Patience"). Reading them risks re-importing their misunderstandings. |
| `Gap_Analysis_v1.md` | Optional | Context for *why* v1.4 says what it says; not needed to build. |

If a rule seems ambiguous, resolve it from v1.4's invariants (§6.7) and directives (§15), or ask Ken — never by consulting the old engine.

---

## 3. Persistence: Supabase (kept)

Keep the existing Supabase project (URL + anon key in `prototype-v1/src/lib/supabaseClient.ts`; anon key only — acceptable for this prototype). You own the schema: **redesign tables freely** to fit v1.4 — do not contort the new engine to fit the old schema. Expected changes at minimum:

- `encounters`: drop `priorityMode`, `startingPriority`, `defaultRestorePriority`, `shieldBreakOrder`; add `minTurnStartPriority`, `firstTurnBonusPriority`, `maxPriority`, `startingSide`, `npcGuardShieldCount`, `npcHandLimit`; `opponentShields` entries become `{ cardId, isHint, hintText?, loreDescription, keyNuggetIds[] }`.
- `cards`: align with the v1.4 card model (keywords incl. Rapport/Heavy Hand, `shieldTriggerEffects`, `heavyHandEffects`, abilities, counters/thresholds; **no** deprecated `description` field).
- `info_nuggets`, `nugget_discovery`, `decks`: carry forward conceptually; `encounter_relevant_cards` becomes whatever shape serves `nuggetOverrides`.
- Add persistence v1.4 §12 actually requires and the old build never wired: per-encounter persistent shield breaks (retryable), trait discovery per NPC, `playedNonRelevantCards`.

Existing rows in the old shape may be treated as migration input or discarded — coordinate with Ken; the authored content in the data files (§6) is the guaranteed-portable copy.

---

## 4. Deliverables

1. **Combat engine** implementing v1.4 exactly: pure, framework-agnostic, no card-ID logic, single `handoff()`, generic effect-stack suspension, canonical event dispatch (v1.4 §15 in full).
2. **Game screens:** title; combat (full v1.4 UI incl. single-bar two-meter priority display, lockout affordance, shield-type visuals, BotM, Field zones); win/lose flow with retry for retryable encounters.
3. **Dev tools** (rebuilt fresh — see §5).
4. **Dual playtest mode — launch requirement.** Two clients, one combat: host builds the encounter, guest connects, actions broadcast over a realtime channel (Supabase Realtime is the natural choice given §3), role-gated action permissions, deterministic shared state. The NPC side is driven by the second human (replacing the §10 leftmost-play policy); state transitions must be byte-identical to single-player for the same action sequence.
5. **Tests.** The old repo had none; this one must. Minimum: unit tests over the engine covering every v1.4 §6.7 invariant, the §4 boundary step ordering, debt-transfer arithmetic, lock-and-keys gating (incl. guard restoration re-gating), trap cancellation, and the §7 "known traps" list below.
6. **New CLAUDE.md** documenting the new architecture, commands, and dev tooling (including dual playtest and manual enemy mode, which live here rather than in the design doc).

---

## 5. Dev Tooling Requirements

The old dev tools are **semi-broken against deprecated data structures — especially the encounter builder**. Do not imitate them; build against the new types from day one.

- **Card editor / collection browser:** CRUD on Supabase-backed cards with the *full* v1.4 vocabulary — effects, scales, conditions, keywords (incl. Rapport prediction config and Heavy Hand alternate effects), trap trigger conditions, shield-trigger effects, triggered/activated abilities, counter/threshold definitions. **Authoring-time validation** per v1.4 §15.5: reject trap/ability subscriptions to non-canonical events, keyless configurations, Core-shield multi-break violations.
- **Encounter builder:** full v1.4 §7 config — guard count, NPC core shields with key-nugget pickers (validate ≥1 key per lock, keys reference real nuggets), nugget overrides, traits, NPC deck composition, scheduled plays, starting impressions, priority parameters. Launch playtest directly from the editor.
- **Nugget manager:** CRUD for info nuggets; show which encounters override each nugget and which locks it keys.
- **Deck builder:** compose player Conversation Decks from the collection; launch playtest with a chosen deck.
- **In-combat dev panel:** state inspector (both priority meters, debt, counters, restrictions, field, boundaries log), action log, dev actions (set priority/patience/lie, force-break shields, add card to hand, stage enemy card, phase override), **manual enemy mode** (human picks the NPC's play from its hand).
- Keep the floating **issue reporter** concept if cheap; it's nice-to-have, not required.

---

## 6. Content Porting Appendix

Authored content to carry into the new build (source: old data files + Supabase rows):

- **Ponder** and the starter sets: `BLUE_STARTER_CARDS`, `RED_STARTER_CARDS`, `GREEN_STARTER_CARDS`, `ORANGE_STARTER_CARDS`; token definitions (`DEV_TOKEN_DEFINITIONS`); the **Fan Club President** set + encounter; test encounters.

**This is a re-expression, not a copy-paste.** The old data is authored against a vocabulary v1.4 deliberately cut. Translation rules:

1. **Cut restriction types** (`MIRROR_NPC_PRIORITY_GAIN`, `DEVOTION_PAYS_PRIORITY`, `CONDITIONAL_MAX_*`, `SELF_BREAK_ON_NPC_SHIELD_BREAK`, `PATIENCE_PER_*`, `PRIORITY_PER_*`) → re-express as triggered abilities over v1.4 §5.1 events. If genuinely impossible, propose promoting the type to core (doc change) rather than hacking.
2. **Hardcoded-ID mechanics** (devotion on `fcp_idols_favor`/`fcp_my_idol`, amplification via `fcp_complete_devotion`, rapport counters on `green_to_truly_know`, break-replacement on `green_genuine_enjoyment`) → generic counters/thresholds/triggered abilities/restrictions in card data (v1.4 §3.10). The engine must not know these cards exist.
3. **Dead trap triggers** (`OPPONENT_BREAKS_SHIELD`, `PATIENCE_CHANGE`, `PRIORITY_CHANGE`) → now real canonical events; port those cards (e.g. Sensitive Deflection) onto them and test that they actually fire.
4. **Mistimed traps** (`END_OF_PLAYER_TURN` cards: His Loyal Fan, Distracting Madness, Unhinged Focus) → re-author against the correct boundary event per each card's *printed intent* (their effectText states the intent; the old trigger data does not).
5. **Cancel/intercept traps** (Disarming Word, Gross Oversight) → port onto the `CARD_STAGED` window; they were broken before and must be tested to genuinely cancel.
6. **Encounters need new design work:** the old model had directly-breakable information shields; v1.4 requires each NPC Core Shield to list **key nuggets**. Assigning keys to the test and FCP encounters is design, not porting — draft proposals and confirm with Ken. Same for splitting each encounter's old shield row into guards vs cores (old `npcDummyShieldSlots` ≈ new `npcGuardShieldCount`).
7. **Patience asymmetry audit (v1.4 §3.2):** re-read every ported card's patience effects under "player pays cost / NPC attacks the budget." Reword card text that implies the player wants Patience low. Copied-NPC-card patience inversion remains an open design question (v1.4 §16.7) — flag affected cards rather than deciding unilaterally.

---

## 7. Known Traps (test against these explicitly)

Bug classes from the previous build — each should have a test proving the new build doesn't reproduce it:

1. Turn-handoff logic duplicated across multiple reducer paths (→ one `handoff()`).
2. Suspension/resume implemented per-modal, with completion steps skipped on the resume path (NPC impression/trap placement lost after a Reveal) (→ one effect stack; completion always runs).
3. A "restore priority" config value defined but never read; restore computed from the current meter (→ v1.4 has no restore; turn-start formula only, tested).
4. Trap cancellation that didn't prevent resolution and double-discarded the card.
5. Trigger types that no code path ever dispatched (→ authoring validation + dispatch tests per event).
6. One-turn restrictions expiring in the same boundary that applied them (→ §4 step ordering is normative; test it).
7. Cards vanishing from the game on shield break (→ v1.4: real cards discard; placeholders remove — both tested).
8. BotM prompt re-triggering mid-NPC-turn when the player gained cards (→ BotM fires only at Player Turn End).
9. Ambiguous per-turn counter names (→ v1.4 §4 naming convention).
10. Module-level mutable engine state; engine mutating the encounter config (traits) (→ purity tests).
11. Card-ID string checks inside the engine (→ grep-level lint rule if you like).
12. Win check passing vacuously on an empty opponent shield row (→ config validation).

---

## 8. Working With Ken

- Ken is the design authority; v1.4 changes go through him and get a changelog entry.
- Ask before deciding: key-nugget assignments (§6.6 above), copy-inversion rule, anything touching v1.4 §16 open questions, schema migration vs discard of old Supabase rows, and any state-machine change (v1.4 §4.1-equivalent rule: those are version bumps).
- Decide yourself: framework, project structure, schema shape, visual design (within §14 principles), test tooling.

*End of brief.*
