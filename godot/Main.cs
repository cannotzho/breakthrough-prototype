// Entry node for the engine harness scene. All engine work happens in
// EngineHarness (pure C#); this node only resolves the content path via
// Godot, prints the report to the Godot console, and mirrors it into a
// RichTextLabel as the minimal debug UI.
//
// Headless-friendly: `godot --headless --path godot` runs the harness and
// exits with code 0 on PASS / 1 on FAIL, so it can serve as a CI smoke check.

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
        }
    }
}
