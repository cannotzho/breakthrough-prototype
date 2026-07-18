// A physical card in the mindspace. Procedural placeholder: front/back quads
// (ArtLibrary "card_front"/"card_back" material slots, "card" mesh slot) plus
// Label3D text — an artist swaps materials/mesh without touching this script.
//
// Local space: card lies in the XY plane facing +Z, ~0.7 wide × 1.0 tall.
// Parents orient it (upright in hand, flat on table). Picking is an Area3D;
// MindspaceArena routes clicks/hovers back through the Clicked/HoverChanged
// events after ray-casting.

using Godot;

namespace Breakthrough.GodotHost.Arena;

public partial class Card3D : Node3D
{
    public event System.Action<Card3D>? Clicked;

    public string Key = "";          // instanceId / slotId / permanentId — zone-specific
    public string Zone = "";         // "hand" | "shield" | "field" | "guard" | "fx"
    public int IndexInZone;

    private Label3D _name = null!, _cost = null!, _text = null!;
    private MeshInstance3D _front = null!, _back = null!;
    private bool _faceDown;
    private bool _hovered;
    private Vector3 _restScale = Vector3.One;

    public override void _Ready()
    {
        var mesh = ArtLibrary.CardMesh();

        _front = new MeshInstance3D { Mesh = mesh, MaterialOverride = ArtLibrary.Mat("card_front") };
        AddChild(_front);
        _back = new MeshInstance3D
        {
            Mesh = mesh,
            MaterialOverride = ArtLibrary.Mat("card_back"),
            RotationDegrees = new Vector3(0, 180, 0),
            Position = new Vector3(0, 0, -0.002f),
        };
        AddChild(_back);

        _name = MakeLabel(new Vector3(0, 0.38f, 0.01f), 42, new Color("2a2118"));
        _cost = MakeLabel(new Vector3(-0.28f, 0.44f, 0.01f), 60, new Color("7a1e1e"));
        _text = MakeLabel(new Vector3(0, -0.05f, 0.01f), 26, new Color("3a3228"));
        _text.Width = 240;
        _text.AutowrapMode = TextServer.AutowrapMode.WordSmart;

        var area = new Area3D { Monitoring = false };
        var shape = new CollisionShape3D
        {
            Shape = new BoxShape3D { Size = new Vector3(0.7f, 1.0f, 0.04f) },
        };
        area.AddChild(shape);
        area.SetMeta("card3d", GetPath());
        AddChild(area);
    }

    private Label3D MakeLabel(Vector3 pos, int fontSize, Color color)
    {
        var l = new Label3D
        {
            Position = pos,
            FontSize = fontSize,
            Modulate = color,
            PixelSize = 0.001f,
            OutlineSize = 0,
            HorizontalAlignment = HorizontalAlignment.Center,
        };
        AddChild(l);
        return l;
    }

    /// <summary>Swap either face's material (guard backs, core shields, …).</summary>
    public void SetMaterials(Material? front, Material? back)
    {
        if (front != null) _front.MaterialOverride = front;
        if (back != null) _back.MaterialOverride = back;
    }

    private Label3D? _badge;

    /// <summary>Marker shown on the back face (hint '?', broken '✔').</summary>
    public void SetBackBadge(string text)
    {
        if (_badge == null)
        {
            _badge = MakeLabel(new Vector3(0, 0, -0.012f), 140, Colors.White);
            _badge.RotationDegrees = new Vector3(0, 180, 0);
        }
        _badge.Text = text;
    }

    public void SetFace(string name, string costText, string effectText)
    {
        _name.Text = name;
        _cost.Text = costText;
        _text.Text = effectText.Length > 70 ? effectText[..69] + "…" : effectText;
    }

    public void SetFaceDown(bool faceDown)
    {
        _faceDown = faceDown;
        _name.Visible = _cost.Visible = _text.Visible = !faceDown;
        if (faceDown) RotationDegrees = new Vector3(RotationDegrees.X, 180, RotationDegrees.Z);
    }

    public bool FaceDown => _faceDown;

    public void SetRestScale(Vector3 s)
    {
        _restScale = s;
        if (!_hovered) Scale = s;
    }

    public void SetHovered(bool hovered)
    {
        if (_hovered == hovered) return;
        _hovered = hovered;
        var tween = CreateTween().SetTrans(Tween.TransitionType.Quad).SetEase(Tween.EaseType.Out);
        tween.TweenProperty(this, "scale", hovered ? _restScale * 1.12f : _restScale, 0.12);
    }

    public void NotifyClicked() => Clicked?.Invoke(this);

    /// <summary>Tween to a target transform (reconciliation move).</summary>
    public void GlideTo(Vector3 position, Vector3 rotationDegrees, float duration = 0.3f)
    {
        var tween = CreateTween().SetParallel().SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.Out);
        tween.TweenProperty(this, "position", position, duration);
        tween.TweenProperty(this, "rotation_degrees", rotationDegrees, duration);
    }

    /// <summary>Depart animation (discard/destroy), then free.</summary>
    public void DepartAndFree(Vector3 toward, float duration = 0.35f)
    {
        Zone = "fx"; // stop participating in picking routes
        var tween = CreateTween().SetParallel().SetTrans(Tween.TransitionType.Cubic).SetEase(Tween.EaseType.In);
        tween.TweenProperty(this, "position", toward, duration);
        tween.TweenProperty(this, "scale", Vector3.One * 0.02f, duration);
        tween.Chain().TweenCallback(Callable.From(QueueFree));
    }
}
