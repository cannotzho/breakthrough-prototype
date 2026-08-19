# CLAUDE.md — Breakthrough

**Breakthrough** is a detective card game. Ken Zho is the design authority —
design changes go through him. Rules baseline: `Breakthrough_Design_v1.4.md`
plus `DESIGN_CHANGES_v1.4.1.md`; `Rebuild_Brief.md` holds the original scope.
`ENGINE_EFFECTS.md` is the designer-facing reference for what the engine can
currently do. `PORTING_NOTES.md` tracks open ask-Ken items.

## READ THIS FIRST — what is canonical

The project moved from a TypeScript/React prototype to **Godot 4 (.NET) with a
C# engine**, and that move is complete:

| Concern | Canonical today | Status of the old thing |
| --- | --- | --- |
| Combat engine | `csharp-engine/Breakthrough.Engine/` | `src/engine/` (TS) is legacy |
| Game client | `godot/` (Mindspace arena) | `src/ui/` React app is legacy |
| Card/encounter content | `content/content.json` (checked in) | authored TS files are deleted |
| Content editing | in-game **Card Designer** (`godot/designer/`) | `src/devtools/` is legacy |

- **The C# engine is the source of truth for correct behaviour** (Ken,
  2026-07-23). It has intentionally diverged from the TS engine. Divergences
  are expected — do **not** "fix" C# back toward TS.
- `csharp-engine/Breakthrough.Engine.Tests/TraceParityTests.cs` replays a
  recorded *TS* trace. It was the port-fidelity check and is now legacy: when
  an intentional behaviour change breaks it, regenerate or retire the trace
  rather than reverting the engine. Verify the change was intended first.
- `src/` (Vite/React) still builds and its 102-test Vitest suite still passes;
  it reads the same `content/content.json` through a thin loader
  (`src/content/index.ts`). Keep it compiling, but new work goes to Godot/C#.
- `prototype-v1/` is a retired prototype. Do not read its engine, screens,
  components, stores, or old design docs (Brief §2).

## Commands

```
dotnet test csharp-engine                     # engine suite (128 tests) — the one that matters
dotnet build godot/Breakthrough.Godot.sln     # Godot client + designer (no Godot install needed)
npm test                                      # legacy TS engine suite (102)
npm run build                                 # legacy React app typecheck + build
```

Godot itself (4.7+, **.NET edition**) is only needed to *run* the game:
open `godot/project.godot`, F5. See `godot/README.md` for controls and the
artist asset contract.

## Architecture

```
csharp-engine/
  Breakthrough.Engine/        PURE. No Godot, no UI, no module state, no card
                              IDs (one permitted: 'ponder', the fallback).
    Types.ts→Types.cs           full vocabulary; CombatState; CombatAction union
    Quantities.cs               EvalQuantity / EvalCondition
    Rng.cs                      mulberry32; RNG state lives in CombatState
    Core.cs                     effect stack (ONE suspension mechanism),
                                event dispatch (ONE integration point),
                                shields, play sequencing, thresholds
    Boundaries.cs               ONE Handoff(); all §4 boundary steps; Check()
    Reducer.cs                  Reduce(state, action) — clones, rejects illegal
    Setup.cs / Validation.cs    initial state / authoring-time checks
    Json/EngineJson.cs          canonical (de)serialisation — the wire-format authority
  Breakthrough.Engine.Tests/  xUnit suite + content.json copy
godot/
  CombatSession.cs            THE UI/engine seam (pure C#): typed intents in,
                              CombatView out. Scenes NEVER touch CombatState.
  CombatView.cs               the only state shape scenes see; hidden info
                              (NPC hand, guard backing, face-down traps) is
                              filtered HERE; NewLog carries the per-view log
                              delta that drives animation
  CombatBridge.cs             Node adapter: StateChanged signal, NPC pacing
  arena/                      MindspaceArena (3D combat), Card3D, ArenaHud,
                              AnimationDirector, TableProps, ArtLibrary,
                              AudioLibrary, CardArt
  designer/                   Card Designer: effect builder, QuantitySpec,
                              EffectSchema, EffectTextGenerator
  art/                        shaders, card art + manifest.json, audio slots
content/content.json          CANONICAL content store (cards, tokens, nuggets,
                              encounters, recipes, decks)
src/                          legacy React app + TS engine (still builds)
```

### Engine invariants (do not regress)

- Two independent Priority meters; overspend unbounded; debt transfers at turn
  end, clamped at the *receiver's* turn start (§3.1). No auto turn handoff.
- Turn-start formula only — there is no "restore priority" anywhere. Priority
  gained during the opponent's turn is therefore lost at your turn start; that
  is correct, not a bug.
- All timed mechanics live in exactly one §4 boundary step; expiry ticks run
  before boundary-triggered effects apply.
- Generic break effects hit Guard Shields only; NPC Core Shields break solely
  via key nuggets while zero Guards stand; Guards are restorable (§3.3).
- Effect sequences suspend and resume, never restart; play completion always
  runs, including after a Reveal (§6.7.6).
- Cancelled staged cards discard exactly once and never begin resolution (§3.6).
- BotM Select fires only from Player Turn End (§6.5).
- The reducer is pure; encounter config is immutable input. Determinism:
  identical (seed, action sequence) ⇒ byte-identical state.
- Adding a new resume action? The reducer has a **pending-block gate** that
  rejects any action while a block is pending — whitelist it there or it will
  silently fail as an illegal action.

### v1.4.2 mechanics (C#-only, added after the port)

- **Goodwill** — a third shared counter beside Patience and Lies. Patience is
  now always capped at its starting value; the overflow becomes Goodwill when
  `encounter.patienceOverflowToGoodwill` is on, else it is discarded.
- **Goodwill costs** — `goodwillCost` is a hard cost (blocks the play, unlike
  Priority which may be overspent); `additionalGoodwillCost` +
  `additionalEffects` is an optional upgrade that never blocks the base play.
- **Rapport** — a card-level `rapport` field (NOT an effect, NOT a trap
  trigger): on play the player predicts a Priority cost; if the opponent plays
  a card of that cost during their next turn it pays `reward` (a Quantity, so
  it can scale) in Goodwill. First match only; expires at NPC Turn End.
- **Player-chosen token destruction** — `DESTROY_TOKENS` raises a
  `ChooseTokensBlock` when the player has more candidates than the count. The
  NPC always auto-resolves earliest-first so its turn stays automatic.
- **First-time-this-turn triggers** — no new syntax: the
  `EVENT_OCCURRENCE_THIS_TURN` quantity counts the current event type's
  firings this turn, so "first time" is `eq 1` in an ordinary condition.

### Working rules that have paid off

- **Content is Ken's.** Never hand-edit `content/content.json`, card art, or
  `art/cards/manifest.json` — he edits those in the Card Designer, and his
  in-progress edits are routinely uncommitted in the working tree. Commit only
  your own code.
- **Verify before claiming.** The engine has a headless-testable seam: pure
  C# files (`CombatSession`, `CombatView`, designer model/specs) can be
  compiled into a scratch console project and driven without Godot. Several
  "engine bugs" turned out to be content or presentation issues — trace them
  before changing the engine.
- Godot is **not installed on this machine**; everything is verified by
  `dotnet build` + `dotnet test` + headless drivers. Visual/layout constants
  are Ken's to tune in-editor.
- PowerShell breaks on `>=`/`>` in heredoc commit messages — use
  `git commit -F <file>`.
- Push only when Ken asks; he usually smoke-tests local commits first.

## Status

Engine ported and extended (128 tests), Godot client playable end to end
(3D arena, animation timeline, audio), Card Designer authoring the canonical
content with structured effect composition and auto-generated rules text.

Open: the six Green Rapport cards still carry the pre-v1.4.2 shape and need
their reward set + saved in the designer (validation warns). Effect-text
vocabulary refinement is tracked in
[issue #179](https://github.com/cannotzho/breakthrough-prototype/issues/179).
