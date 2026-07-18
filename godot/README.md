# Breakthrough — Godot integration (steps 1–2)

Godot 4 (.NET) host for the ported C# engine
(`../csharp-engine/Breakthrough.Engine`): the step-1 smoke harness plus the
step-2 **CombatBridge** seam and a playable placeholder combat screen.
Flat rects and default theme only — presentation is step 3.

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
  launcher bar (encounter · deck · seed) — **Start Combat ▶** opens the
  placeholder combat screen. Click a hand card for Play / Heavy Hand /
  Place-as-Shield; click two shields to swap their break order; prompts
  (reveal, choose-number, Back-of-Mind, deck reveal) appear as overlays;
  NPC turns advance automatically (toggle Auto NPC for manual stepping).
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
