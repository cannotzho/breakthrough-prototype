# Breakthrough — Godot integration (steps 1–3)

Godot 4 (.NET) host for the ported C# engine
(`../csharp-engine/Breakthrough.Engine`): the step-1 smoke harness, the
step-2 **CombatBridge** seam with a 2D debug screen, and the step-3
**MindspaceArena** — the 3D combat presentation (Inscryption-style table,
opponent avatar, 3D cards) built entirely on placeholder procedural visuals
that an artist replaces via the ArtLibrary slots below.

## MindspaceArena (step 3)

`arena/MindspaceArena.cs` sits on the CombatBridge seam and renders combat in
3D: a table in a void, the opponent's avatar across from you (mood-driven rim
glow tracks patience), face-down guard row, core-shield row, field
permanents, your shield arc and hand fan as 3D cards, and a bell you ring to
end the turn. Card movement comes from view reconciliation (cards glide
between slots, keyed by instance/slot/permanent id); one-shot flourishes
(avatar flinch, floating damage numbers, camera shakes, NPC play flybys) are
driven by `arena/AnimationDirector.cs` off `CombatView.NewLog` — the seam's
event-delta contract. Prompts and toast-style rejection live on a 2D HUD
layer (`arena/ArenaHud.cs`).

## Artist slots (how real art gets in)

Every visual is requested from `arena/ArtLibrary.cs` by slot name. Drop a
file at the conventional path and the procedural placeholder yields to it —
no code changes:

| Kind | Path | Slots |
| --- | --- | --- |
| Material | `art/materials/<slot>.tres` | `card_front`, `card_back`, `shield_slab`, `shield_core`, `guard_back`, `core_shield`, `core_shield_broken`, `table`, `avatar_body`, `void_dome`, `bell`, `candle_wax`, `candle_flame`, `priority_token` |
| Mesh | `art/models/card.res` / `.tres` | `card` — unit card in the XY plane, ~0.7 × 1.0, facing +Z |
| Scene | `art/models/<slot>.tscn` | `avatar` (whole opponent prop), `table_prop`, `bell_prop`, `patience_prop` (root must keep the PatienceCandle script), `priority_prop` (root keeps PriorityStack) |

Placeholder shaders live in `art/shaders/` (`painterly_surface`,
`avatar_mood`, `mindspace_void`) — all knobs are named uniforms, so retints
are `.tres` edits. The avatar scene override keeps working with
`OpponentAvatar.cs` as long as its root is a Node3D; a ShaderMaterial with a
`mood` uniform on the first child mesh inherits the patience-driven glow.

## The seam (step 2)

```
CombatScreen.tscn / .cs   placeholder presentation (replaced in step 3)
        │  reads CombatView · calls typed intents
CombatBridge.cs           Node adapter: StateChanged signal, NPC pacing timer
CombatSession.cs          THE seam (pure C#): typed dispatch → Reduce,
        │                 emits CombatView after every action
CombatView.cs             the only state shape scenes see; hidden info
        │                 (NPC hand, guard backing, unbroken lore) filtered here
Breakthrough.Engine       untouched
```

Scenes never touch `CombatState`. Each `CombatView` carries `NewLog` — the
log-entry delta since the last emission — which is what step-3 animation
sequencing should key off.

## Prerequisites

- **Godot 4.7+ — .NET edition** (the build labeled ".NET", not the standard
  one): https://godotengine.org/download — unzip anywhere, no installer needed.
- **.NET 8 SDK** (already present if `dotnet --version` works).

## Run

- **Play (editor):** open this folder's `project.godot` in Godot, press
  **F5**. The `Main` scene runs the step-1 smoke harness, then shows a
  launcher bar (encounter · deck · seed) — **Enter the Mindspace ▶** opens
  the 3D arena; **2D Debug Combat ▶** opens the flat step-2 screen. In both:
  click a hand card for Play / Heavy Hand / Place-as-Shield; click two
  shields to swap their break order; prompts (reveal, choose-number,
  Back-of-Mind, deck reveal) appear as overlays; NPC turns advance
  automatically (toggle Auto NPC for manual stepping). In the arena, click
  the bell (or the HUD button) to end your turn, press **Tab** (or the HUD
  button) to toggle board view ⇄ hand inspect, and hover anything — cards,
  shields, guards, props — to read its full text on the bottom-left detail
  panel. Patience is the melting candle; each side's Priority is its token
  stack; big state changes get a camera focus beat before play continues.
- **Headless (CI-style):** `godot --headless --path godot` from the repo
  root. Exits 0 on PASS, 1 on FAIL.
- **GDScript interop demo:** open `GatewayDemo.tscn` and run the scene
  (Ctrl+F6 / Cmd+R). `gateway_demo.gd` drives a full round from GDScript
  through `EngineGateway.cs`.

## Compile without Godot

The project compiles with the plain .NET SDK (Godot.NET.Sdk + GodotSharp come
from NuGet; no Godot install required to build):

```
dotnet build godot/Breakthrough.Godot.sln
```

## Files

- `CombatSession.cs` / `CombatView.cs` / `CombatBridge.cs` — the step-2 seam
  (see diagram above). `CombatSession` + `CombatView` are pure C# and are
  driven end-to-end by a console verifier without a Godot runtime.
- `CombatScreen.cs` + `CombatScreen.tscn` — playable placeholder screen;
  builds all UI in code, fully rebuilds per view, appends log deltas.
- `LaunchConfig.cs` — static launcher→scene parameter holder.
- `EngineHarness.cs` — step-1 pure C# smoke driver (no Godot API); loads
  `content.json`, runs/replays the scripted game, times `Reduce` and
  full-state JSON serialization.
- `Main.cs` + `Main.tscn` — harness report + combat launcher; quits with an
  exit code under `--headless`.
- `EngineGateway.cs` — step-1 GDScript-facing bridge (JSON/Dictionary state
  reads); superseded by CombatBridge for scenes, kept for GDScript access.
- `gateway_demo.gd` + `GatewayDemo.tscn` — GDScript driving the gateway.
- `content.json` — derived; synced from
  `../csharp-engine/Breakthrough.Engine.Tests/content.json` by a build
  target (gitignored here). Regenerate the canonical copy with
  `npx vitest run --config csharp-engine/tools/vitest.config.ts`.
