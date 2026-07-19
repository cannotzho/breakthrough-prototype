// Camera work for the arena: named framings tweened on phase changes, an
// explicit hand-inspect framing the player toggles (board ⇄ hand, Inscryption
// style), a FocusOn beat that dollies toward a table object and back (used by
// AnimationDirector for state-change highlights), idle breath, mouse-parallax
// tilt, and an impact shake. Pure presentation — MindspaceArena tells it what
// to frame; it never reads game state.

using Godot;

namespace Breakthrough.GodotHost.Arena;

public partial class CameraRig : Node3D
{
    public enum Framing { PlayerTurn, NpcTurn, Result, HandInspect, TopDown }

    private Camera3D _camera = null!;

    /// <summary>Exposed for mouse-ray picking.</summary>
    public Camera3D Camera => _camera;

    private Framing _framing = Framing.PlayerTurn;
    private float _time;
    private Vector2 _parallax;
    private float _shake;
    private Tween? _moveTween;
    private Vector3 _lookTarget;

    public Framing CurrentFraming => _framing;

    private static (Vector3 pos, Vector3 look) FramingTransform(Framing f) => f switch
    {
        Framing.PlayerTurn => (new Vector3(0, 4.6f, 4.4f), new Vector3(0, 0.9f, -1.0f)),
        Framing.NpcTurn => (new Vector3(0, 3.4f, 2.6f), new Vector3(0, 1.9f, -3.2f)),
        Framing.HandInspect => (new Vector3(0, 2.35f, 5.1f), new Vector3(0, 1.25f, 2.7f)),
        // Near-vertical, kept slightly oblique so LookAt's up vector stays valid.
        Framing.TopDown => (new Vector3(0, 8.4f, 1.6f), new Vector3(0, 0, -0.3f)),
        _ => (new Vector3(0, 6.5f, 6.0f), new Vector3(0, 0.5f, -1.5f)),
    };

    public override void _Ready()
    {
        _camera = new Camera3D { Fov = 55, Current = true };
        AddChild(_camera);
        var (pos, look) = FramingTransform(_framing);
        ApplyLook(pos, look);
    }

    public void SetFraming(Framing framing)
    {
        if (_framing == framing) return;
        _framing = framing;
        TweenTo(FramingTransform(framing), 0.9f);
    }

    /// <summary>
    /// Focus beat: dolly toward a world point, hold so the player registers the
    /// state change, then return to the current framing. Total ≈ 0.4 + hold + 0.55 s.
    /// </summary>
    public void FocusOn(Vector3 point, float hold = 0.8f)
    {
        var (basePos, _) = FramingTransform(_framing);
        var toward = basePos + (point - basePos).Normalized() * 1.7f;

        _moveTween?.Kill();
        _moveTween = CreateTween().SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.InOut);
        _moveTween.TweenProperty(this, "position", toward, 0.4);
        _moveTween.Parallel().TweenMethod(LookCallable(), _lookTarget, point, 0.4);
        _moveTween.TweenInterval(hold);
        var (backPos, backLook) = FramingTransform(_framing);
        _moveTween.TweenProperty(this, "position", backPos, 0.55);
        _moveTween.Parallel().TweenMethod(LookCallable(), point, backLook, 0.55);
    }

    private void TweenTo((Vector3 pos, Vector3 look) target, float duration)
    {
        _moveTween?.Kill();
        _moveTween = CreateTween().SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.InOut);
        _moveTween.TweenProperty(this, "position", target.pos, duration);
        _moveTween.Parallel().TweenMethod(LookCallable(), _lookTarget, target.look, duration);
    }

    private Callable LookCallable() => Callable.From((Vector3 look) =>
    {
        _lookTarget = look;
        LookAt(look, Vector3.Up);
    });

    private void ApplyLook(Vector3 pos, Vector3 look)
    {
        Position = pos;
        _lookTarget = look;
        LookAt(look, Vector3.Up);
    }

    public void Shake(float strength = 1.0f) => _shake = Mathf.Max(_shake, 0.12f * strength);

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
