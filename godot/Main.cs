// Entry node. Two jobs:
//  - Headless (`godot --headless --path godot`): run the step-1 engine smoke
//    harness and exit 0/1 — the CI check, unchanged.
//  - Windowed: run the same harness, show its report, and offer a launcher
//    (encounter + deck + seed) into the playable placeholder CombatScreen.

using System;
using Godot;

namespace Breakthrough.GodotHost;

public partial class Main : Control
{
    public override void _Ready()
    {
        string projectDir = ProjectSettings.GlobalizePath("res://");
        var result = EngineHarness.RunSmokeGame(projectDir);

        GD.Print("=== Breakthrough engine in-Godot smoke run ===");
        GD.Print(result.Report);

        GetNode<RichTextLabel>("Output").Text =
            "[b]Breakthrough engine — in-Godot smoke run[/b]\n\n" + result.Report;

        if (DisplayServer.GetName() == "headless")
        {
            GetTree().Quit(result.Passed ? 0 : 1);
            return;
        }

        BuildLauncher();
    }

    private void BuildLauncher()
    {
        var content = EngineHarness.LoadContent(ProjectSettings.GlobalizePath("res://"));

        var bar = new HBoxContainer();
        bar.SetAnchorsPreset(LayoutPreset.BottomWide);
        bar.OffsetLeft = 12; bar.OffsetTop = -48; bar.OffsetRight = -12; bar.OffsetBottom = -12;
        bar.AddThemeConstantOverride("separation", 10);
        AddChild(bar);

        bar.AddChild(new Label { Text = "Encounter:" });
        var encounter = new OptionButton();
        foreach (var id in content.Encounters.Keys)
        {
            encounter.AddItem(id);
            if (id == LaunchConfig.EncounterId) encounter.Selected = encounter.ItemCount - 1;
        }
        bar.AddChild(encounter);

        bar.AddChild(new Label { Text = "Deck:" });
        var deck = new OptionButton();
        foreach (var name in content.StarterDeckLists.Keys) deck.AddItem(name);
        deck.Selected = 0;
        bar.AddChild(deck);

        bar.AddChild(new Label { Text = "Seed:" });
        var seed = new SpinBox { MinValue = 0, MaxValue = int.MaxValue, Value = LaunchConfig.Seed };
        bar.AddChild(seed);

        var random = new Button { Text = "🎲" };
        random.Pressed += () => seed.Value = Random.Shared.Next();
        bar.AddChild(random);

        var start = new Button { Text = "2D Debug Combat ▶" };
        start.Pressed += () =>
        {
            ApplyLaunchConfig(encounter, deck, seed);
            GetTree().ChangeSceneToFile("res://CombatScreen.tscn");
        };
        bar.AddChild(start);

        var arena = new Button { Text = "Enter the Mindspace ▶" };
        arena.Pressed += () =>
        {
            ApplyLaunchConfig(encounter, deck, seed);
            GetTree().ChangeSceneToFile("res://MindspaceArena.tscn");
        };
        bar.AddChild(arena);
    }

    private static void ApplyLaunchConfig(OptionButton encounter, OptionButton deck, SpinBox seed)
    {
        LaunchConfig.EncounterId = encounter.GetItemText(encounter.Selected);
        LaunchConfig.DeckName = deck.GetItemText(deck.Selected);
        LaunchConfig.Seed = (int)seed.Value;
    }
}
