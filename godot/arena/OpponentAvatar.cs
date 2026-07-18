// The opponent across the table. Procedural placeholder figure (capsule body,
// head, glowing eyes) with the avatar_mood rim shader; an artist replaces the
// whole prop by adding res://art/models/avatar.tscn (ArtLibrary "avatar"
// scene slot) — this script keeps working: it only needs a Node3D to sway,
// and drives the "mood" shader parameter on any material that has one.

using Godot;

namespace Breakthrough.GodotHost.Arena;

public partial class OpponentAvatar : Node3D
{
    private Node3D _figure = null!;
    private ShaderMaterial? _moodMat;
    private float _time;
    private float _mood;
    private Tween? _flinchTween;

    public override void _Ready()
    {
        var artist = ArtLibrary.SceneOverride("avatar");
        if (artist != null)
        {
            _figure = artist;
            AddChild(_figure);
            // Adopt an artist material's mood uniform if present on the root mesh.
            if (_figure.GetChildOrNull<MeshInstance3D>(0)?.MaterialOverride is ShaderMaterial sm)
                _moodMat = sm;
            return;
        }

        _figure = new Node3D();
        AddChild(_figure);

        _moodMat = (ShaderMaterial)ArtLibrary.Mat("avatar_body");
        var body = new MeshInstance3D
        {
            Mesh = new CapsuleMesh { Radius = 0.55f, Height = 2.1f },
            MaterialOverride = _moodMat,
            Position = new Vector3(0, 1.05f, 0),
        };
        _figure.AddChild(body);

        var head = new MeshInstance3D
        {
            Mesh = new SphereMesh { Radius = 0.42f, Height = 0.84f },
            MaterialOverride = _moodMat,
            Position = new Vector3(0, 2.35f, 0),
        };
        _figure.AddChild(head);

        foreach (float x in new[] { -0.16f, 0.16f })
        {
            var eyeMat = new StandardMaterial3D
            {
                EmissionEnabled = true,
                Emission = new Color("d8e8ff"),
                EmissionEnergyMultiplier = 2.0f,
                AlbedoColor = Colors.White,
            };
            _figure.AddChild(new MeshInstance3D
            {
                Mesh = new SphereMesh { Radius = 0.055f, Height = 0.11f },
                MaterialOverride = eyeMat,
                Position = new Vector3(x, 2.42f, 0.36f),
            });
        }
    }

    /// <summary>0 = calm → 1 = patience exhausted; drives the rim glow and sway rate.</summary>
    public void SetMood(float mood)
    {
        _mood = Mathf.Clamp(mood, 0f, 1f);
        _moodMat?.SetShaderParameter("mood", _mood);
    }

    public void Flinch(float strength = 1.0f)
    {
        _flinchTween?.Kill();
        _flinchTween = CreateTween().SetTrans(Tween.TransitionType.Elastic).SetEase(Tween.EaseType.Out);
        _figure.Position = new Vector3(0, 0, -0.28f * strength);
        _flinchTween.TweenProperty(_figure, "position", Vector3.Zero, 0.6);
    }

    /// <summary>Lean toward the table (used while the NPC acts).</summary>
    public void SetLeaning(bool leaning)
    {
        var tween = CreateTween().SetTrans(Tween.TransitionType.Quad).SetEase(Tween.EaseType.Out);
        tween.TweenProperty(_figure, "rotation_degrees",
            leaning ? new Vector3(12, 0, 0) : Vector3.Zero, 0.5);
    }

    public override void _Process(double delta)
    {
        _time += (float)delta;
        float sway = 1.0f + _mood * 1.6f;
        _figure.RotationDegrees = new Vector3(
            _figure.RotationDegrees.X,
            Mathf.Sin(_time * 0.6f * sway) * 2.2f,
            Mathf.Sin(_time * 0.83f * sway) * 1.1f);
    }
}
