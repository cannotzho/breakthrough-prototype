// Autoload (registered in project.godot): window controls available on every
// scene. F11 or Alt+Enter toggles fullscreen ⇄ maximized. The project opens
// maximized by default (display/window/size/mode) so large monitors get the
// full canvas immediately; stretch mode canvas_items keeps the 3D viewport at
// native resolution and re-rasterizes HUD fonts at the scaled size, so text
// stays crisp at any display size.

using Godot;

namespace Breakthrough.GodotHost;

public partial class WindowControls : Node
{
    public override void _UnhandledInput(InputEvent ev)
    {
        if (ev is InputEventKey { Pressed: true, Echo: false } key &&
            (key.Keycode == Key.F11 || (key.Keycode == Key.Enter && key.AltPressed)))
        {
            var mode = DisplayServer.WindowGetMode();
            DisplayServer.WindowSetMode(mode == DisplayServer.WindowMode.Fullscreen
                ? DisplayServer.WindowMode.Maximized
                : DisplayServer.WindowMode.Fullscreen);
            GetViewport().SetInputAsHandled();
        }
    }
}
