// A physical card in the mindspace. Procedural placeholder: front/back quads
// (ArtLibrary "card_front"/"card_back" material slots, "card" mesh slot) plus
// Label3D text — an artist swaps materials/mesh without touching this script.
//
// Local space: card lies in the XY plane facing +Z, ~0.7 wide × 1.0 tall.
// Parents orient it (upright in hand, flat on table). Picking is an Area3D;
// MindspaceArena routes clicks/hovers back after ray-casting.
//
// Readability (Ken playtest round 1): heavy font sizes with outlines, name
// wraps to the card width instead of overflowing, effect text enlarged. Full
// rules text lives on the HUD hover-detail panel, not the card face.

using Godot;

namespace Breakthrough.GodotHost.Arena;

public partial class Card3D : Node3D
{
    public string Key = "";          // instanceId / slotId / permanentId — zone-specific
    public string Zone = "";         // "hand" | "shield" | "field" | "guard" | "core" | "fx"
    public int IndexInZone;

    private Label3D _name = null!, _cost = null!, _text = null!;
    private MeshInstance3D _front = null!, _back = null!;
    private Label3D? _badge;
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

        _name = MakeLabel(new Vector3(0, 0.455f, 0.01f), 92, new Color("241c12"));
        _name.VerticalAlignment = VerticalAlignment.Top;
        _name.Width = 600;
        _name.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        _name.OutlineSize = 16;
        _name.OutlineModulate = new Color("e8dcc2");

        _cost = MakeLabel(new Vector3(-0.26f, 0.40f, 0.012f), 130, new Color("7a1e1e"));
        _cost.OutlineSize = 22;
        _cost.OutlineModulate = new Color("f0e4ca");

        _text = MakeLabel(new Vector3(0, -0.04f, 0.01f), 44, new Color("32291e"));
        _text.Width = 580;
        _text.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        _text.OutlineSize = 8;
        _text.OutlineModulate = new Color("e8dcc2");

        var area = new Area3D { Monitoring = false };
        var shape = new CollisionShape3D
        {
            Shape = new BoxShape3D { Size = new Vector3(0.7f, 1.0f, 0.05f) },
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

    /// <summary>Marker shown on the back face (hint '?', broken '✔').</summary>
    public void SetBackBadge(string text)
    {
        if (_badge == null)
        {
            _badge = MakeLabel(new Vector3(0, 0, -0.012f), 160, Colors.White);
            _badge.RotationDegrees = new Vector3(0, 180, 0);
            _badge.OutlineSize = 18;
            _badge.OutlineModulate = new Color("14101e");
        }
        _badge.Text = text;
    }

    public void SetFace(string name, string costText, string effectText)
    {
        _name.Text = name;
        _cost.Text = costText;
        _text.Text = effectText.Length > 80 ? effectText[..79] + "…" : effectText;
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
        tween.TweenProperty(this, "scale", hovered ? _restScale * 1.14f : _restScale, 0.12);
    }

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
