// Physical state props on the table (Ken playtest round 1): patience and
// priority live IN the scene, not just on the HUD — a melting candle for the
// opponent's patience and stacks of tokens for each side's priority. They are
// state-driven by MindspaceArena's reconciliation and highlighted by
// AnimationDirector focus beats (Inscryption's tipping-scales moment).
//
// ARTIST SLOTS: materials "candle_wax", "candle_flame", "priority_token";
// whole-prop scene overrides "patience_prop" / "priority_prop" (ArtLibrary) —
// a replacement scene keeps working if its root exposes the same script.

using Godot;

namespace Breakthrough.GodotHost.Arena;

/// <summary>Opponent patience as a melting candle: height tracks the ratio.</summary>
public partial class PatienceCandle : Node3D
{
    private const float FullHeight = 1.5f;
    private MeshInstance3D _wax = null!;
    private MeshInstance3D _flame = null!;
    private CylinderMesh _waxMesh = null!;
    private float _time;
    private float _ratio = 1f;

    public override void _Ready()
    {
        _waxMesh = new CylinderMesh { TopRadius = 0.14f, BottomRadius = 0.18f, Height = FullHeight };
        _wax = new MeshInstance3D
        {
            Mesh = _waxMesh,
            MaterialOverride = ArtLibrary.Mat("candle_wax"),
            Position = new Vector3(0, FullHeight / 2, 0),
        };
        AddChild(_wax);

        _flame = new MeshInstance3D
        {
            Mesh = new SphereMesh { Radius = 0.075f, Height = 0.21f },
            MaterialOverride = new StandardMaterial3D
            {
                EmissionEnabled = true,
                Emission = new Color("ffb04a"),
                EmissionEnergyMultiplier = 5.0f,
                AlbedoColor = new Color("fff0c8"),
            },
            Position = new Vector3(0, FullHeight + 0.12f, 0),
        };
        AddChild(_flame);

        var glow = new OmniLight3D
        {
            LightColor = new Color("ffb877"),
            LightEnergy = 0.9f,
            OmniRange = 3.5f,
            Position = new Vector3(0, FullHeight + 0.2f, 0),
        };
        _flame.AddChild(glow);
    }

    /// <summary>1 = full patience → 0 = exhausted. Tweens the melt.</summary>
    public void SetRatio(float ratio)
    {
        ratio = Mathf.Clamp(ratio, 0f, 1f);
        if (Mathf.IsEqualApprox(ratio, _ratio)) return;
        _ratio = ratio;
        float h = Mathf.Max(0.08f, FullHeight * ratio);
        var tween = CreateTween().SetParallel().SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.Out);
        tween.TweenProperty(_waxMesh, "height", h, 0.6);
        tween.TweenProperty(_wax, "position", new Vector3(0, h / 2, 0), 0.6);
        tween.TweenProperty(_flame, "position", new Vector3(0, h + 0.12f, 0), 0.6);
    }

    public void Pulse()
    {
        var tween = CreateTween().SetTrans(Tween.TransitionType.Elastic).SetEase(Tween.EaseType.Out);
        _flame.Scale = Vector3.One * 2.6f;
        tween.TweenProperty(_flame, "scale", Vector3.One, 0.7);
    }

    public override void _Process(double delta)
    {
        _time += (float)delta;
        // flicker — quickens as patience runs out
        float speed = 6f + (1f - _ratio) * 10f;
        float f = 1f + 0.12f * Mathf.Sin(_time * speed) + 0.06f * Mathf.Sin(_time * speed * 2.7f);
        if (_flame.Scale.IsEqualApprox(Vector3.One) || _flame.Scale.X < 1.3f)
            _flame.Scale = new Vector3(f, f * 1.15f, f);
    }
}

/// <summary>A side's Priority as a stack of tokens; count tracks the meter.</summary>
public partial class PriorityStack : Node3D
{
    private const float TokenHeight = 0.075f;
    private readonly System.Collections.Generic.List<MeshInstance3D> _tokens = [];
    private int _count = -1;

    public void SetCount(int count)
    {
        count = Mathf.Max(0, count);
        if (count == _count) return;
        bool grew = count > _count && _count >= 0;
        _count = count;

        while (_tokens.Count > count)
        {
            var t = _tokens[^1];
            _tokens.RemoveAt(_tokens.Count - 1);
            var tween = t.CreateTween().SetParallel().SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.In);
            tween.TweenProperty(t, "position", t.Position + new Vector3(0.5f, 0.6f, 0), 0.3);
            tween.TweenProperty(t, "scale", Vector3.One * 0.02f, 0.3);
            tween.Chain().TweenCallback(Callable.From(t.QueueFree));
        }
        while (_tokens.Count < count)
        {
            var token = new MeshInstance3D
            {
                Mesh = new CylinderMesh { TopRadius = 0.16f, BottomRadius = 0.16f, Height = TokenHeight * 0.85f },
                MaterialOverride = ArtLibrary.Mat("priority_token"),
                Position = new Vector3(0, _tokens.Count * TokenHeight + 1.0f, 0),
                RotationDegrees = new Vector3(0, GD.Randf() * 360f, 0),
            };
            AddChild(token);
            int slot = _tokens.Count;
            _tokens.Add(token);
            var tween = token.CreateTween().SetTrans(Tween.TransitionType.Bounce).SetEase(Tween.EaseType.Out);
            tween.TweenProperty(token, "position", new Vector3(0, slot * TokenHeight + TokenHeight / 2, 0), 0.45);
        }
        if (grew) Pulse();
    }

    public void Pulse()
    {
        var tween = CreateTween().SetTrans(Tween.TransitionType.Elastic).SetEase(Tween.EaseType.Out);
        Scale = Vector3.One * 1.25f;
        tween.TweenProperty(this, "scale", Vector3.One, 0.5);
    }

    /// <summary>Where focus beats should look (mid-stack).</summary>
    public Vector3 FocusPoint => GlobalPosition + new Vector3(0, 0.4f, 0);
}

/// <summary>
/// A draw or discard pile on the table: stacked card backs whose height
/// tracks the count, a floating count label, and — for face-up piles — the
/// most recent card shown on top. Clickable (Area3D meta "pile" = PileId);
/// MindspaceArena opens the discard browser from it.
/// </summary>
public partial class CardPile : Node3D
{
    private const float CardThickness = 0.022f;
    private const int MaxVisualCards = 14;

    public string PileId = "";
    public bool FaceUp;

    private readonly System.Collections.Generic.List<MeshInstance3D> _cards = [];
    private Label3D _count = null!;
    private Label3D _topName = null!;
    private int _lastCount = -1;

    public override void _Ready()
    {
        _count = new Label3D
        {
            Text = "0",
            Position = new Vector3(0, 0.85f, 0),
            FontSize = 110,
            PixelSize = 0.002f,
            Modulate = new Color("e8dcc2"),
            OutlineSize = 18,
            OutlineModulate = new Color("14101e"),
            Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
        };
        AddChild(_count);

        _topName = new Label3D
        {
            FontSize = 64,
            PixelSize = 0.0012f,
            Modulate = new Color("241c12"),
            OutlineSize = 10,
            OutlineModulate = new Color("e8dcc2"),
            HorizontalAlignment = HorizontalAlignment.Center,
            Width = 520,
            AutowrapMode = TextServer.AutowrapMode.WordSmart,
            Visible = false,
        };
        AddChild(_topName);

        var area = new Area3D { Monitoring = false };
        var shape = new CollisionShape3D
        {
            Shape = new BoxShape3D { Size = new Vector3(0.85f, 0.6f, 1.15f) },
        };
        area.AddChild(shape);
        area.Position = new Vector3(0, 0.3f, 0);
        area.SetMeta("pile", PileId);
        AddChild(area);
    }

    public void SetState(int count, string? topCardName)
    {
        if (count != _lastCount)
        {
            _lastCount = count;
            _count.Text = count.ToString();
            int visual = Mathf.Min(count, MaxVisualCards);
            while (_cards.Count > visual)
            {
                _cards[^1].QueueFree();
                _cards.RemoveAt(_cards.Count - 1);
            }
            while (_cards.Count < visual)
            {
                var mesh = new MeshInstance3D
                {
                    Mesh = ArtLibrary.CardMesh(),
                    MaterialOverride = ArtLibrary.Mat("card_back"),
                    Position = new Vector3(0, _cards.Count * CardThickness + 0.01f, 0),
                    RotationDegrees = new Vector3(-90, GD.Randf() * 8f - 4f, 0),
                };
                AddChild(mesh);
                _cards.Add(mesh);
            }
        }

        bool showTop = FaceUp && count > 0 && topCardName != null;
        if (_cards.Count > 0)
            _cards[^1].MaterialOverride = ArtLibrary.Mat(showTop ? "card_front" : "card_back");
        _topName.Visible = showTop;
        if (showTop)
        {
            _topName.Text = topCardName!;
            _topName.Position = new Vector3(0, _cards.Count * CardThickness + 0.02f, 0);
            _topName.RotationDegrees = new Vector3(-90, 0, 0);
        }
    }
}
