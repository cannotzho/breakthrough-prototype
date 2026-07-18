# Breakthrough — Godot integration harness (step 1)

Minimal Godot 4 (.NET) host proving the ported C# engine
(`../csharp-engine/Breakthrough.Engine`) runs correctly *inside* Godot.
No visuals, no art — a smoke-run scene and a GDScript interop gateway.

## Prerequisites

- **Godot 4.7+ — .NET edition** (the build labeled ".NET", not the standard
  one): https://godotengine.org/download — unzip anywhere, no installer needed.
- **.NET 8 SDK** (already present if `dotnet --version` works).

## Run

- **Editor:** open this folder's `project.godot` in Godot, press **F5**.
  The `Main` scene loads the real content bundle, boots the
  `fan_club_president` encounter, drives three scripted rounds through
  `Reducer.Reduce`, replays them to prove determinism, and prints a
  PASS/FAIL report to the Output console and the on-screen label.
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

- `EngineHarness.cs` — pure C# smoke driver (no Godot API); loads
  `content.json`, runs/replays the scripted game, times `Reduce` and
  full-state JSON serialization.
- `Main.cs` + `Main.tscn` — prints the harness report; quits with an exit
  code under `--headless`.
- `EngineGateway.cs` — GDScript-facing bridge: typed action methods in,
  state out as JSON string / parsed Dictionary / small summary Dictionary.
- `gateway_demo.gd` + `GatewayDemo.tscn` — GDScript driving the gateway.
- `content.json` — derived; synced from
  `../csharp-engine/Breakthrough.Engine.Tests/content.json` by a build
  target (gitignored here). Regenerate the canonical copy with
  `npx vitest run --config csharp-engine/tools/vitest.config.ts`.
