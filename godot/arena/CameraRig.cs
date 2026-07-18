// Camera work for the arena: named framings tweened on phase changes, a slow
// idle breath, mouse-parallax tilt, and an impact shake. Pure presentation —
// MindspaceArena tells it which framing to use; it never reads game state.

using Godot;

namespace Breakthrough.GodotHost.Arena;

public partial class CameraRig : Node3D
{
    public enum Framing { PlayerTurn, NpcTurn, Result }

    private Camera3D _camera = null!;

    /// <summary>Exposed for mouse-ray picking.</summary>
    public Camera3D Camera => _camera;
    private Framing _framing = Framing.PlayerTurn;
    private float _time;
    private Vector2 _parallax;
    private float _shake;

    private static (Vector3 pos, Vector3 look) FramingTransform(Framing f) => f switch
    {
        Framing.PlayerTurn => (new Vector3(0, 4.6f, 4.4f), new Vector3(0, 0.9f, -1.0f)),
        Framing.NpcTurn => (new Vector3(0, 3.4f, 2.6f), new Vector3(0, 1.9f, -3.2f)),
        _ => (new Vector3(0, 6.5f, 6.0f), new Vector3(0, 0.5f, -1.5f)),
    };

    public override void _Ready()
    {
        _camera = new Camera3D { Fov = 55, Current = true };
        AddChild(_camera);
        Snap(_framing);
    }

    public void SetFraming(Framing framing)
    {
        if (_framing == framing) return;
        _framing = framing;
        var (pos, look) = FramingTransform(framing);
        var tween = CreateTween().SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.InOut);
        tween.TweenProperty(this, "position", pos, 0.9);
        tween.Parallel().TweenMethod(
            Callable.From((Vector3 l) => LookAtFrom(Position, l)),
            CurrentLook(), look, 0.9);
    }

    public void Shake(float strength = 1.0f) => _shake = Mathf.Max(_shake, 0.12f * strength);

    private Vector3 _lookTarget;

    private Vector3 CurrentLook() => _lookTarget;

    private void LookAtFrom(Vector3 pos, Vector3 look)
    {
        _lookTarget = look;
        Position = pos;
        LookAt(look, Vector3.Up);
    }

    private void Snap(Framing f)
    {
        var (pos, look) = FramingTransform(f);
        LookAtFrom(pos, look);
    }

    public override void _Process(double delta)
    {
        _time += (float)delta;
        _shake = Mathf.MoveToward(_shake, 0, (float)delta * 0.5f);

        var mouse = GetViewport().GetMousePosition();
        var size = GetViewport().GetVisibleRect().Size;
        var target = size.X > 0
            ? new Vector2(mouse.X / size.X - 0.5f, mouse.Y / size.Y - 0.5f)
            : Vector2.Zero;
        _parallax = _parallax.Lerp(target, (float)delta * 3f);

        float breatheY = Mathf.Sin(_time * 0.5f) * 0.04f;
        var jitter = _shake > 0
            ? new Vector3(GD.Randf() - 0.5f, GD.Randf() - 0.5f, 0) * _shake
            : Vector3.Zero;
        _camera.Position = new Vector3(_parallax.X * 0.35f, breatheY - _parallax.Y * 0.2f, 0) + jitter;
        _camera.RotationDegrees = new Vector3(-_parallax.Y * 1.5f, -_parallax.X * 2.5f, 0);
    }
}
