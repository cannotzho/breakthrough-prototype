// A physical card in the mindspace. Procedural placeholder: front/back quads
// (ArtLibrary "card_front"/"card_back" material slots, "card" mesh slot) plus
// Label3D text — an artist swaps materials/mesh without touching this script.
//
// Local space: card lies in the XY plane facing +Z, ~0.7 wide × 1.0 tall.
// Parents orient it (upright in hand, flat on table). Picking is an Area3D;
// MindspaceArena routes clicks/hovers back after ray-casting.
//
// ONE full-art layout for every card (Ken designer round 3): the face is the
// art (or the card_front material when there's no art), with a fixed-size
// title bar above a fixed-size effect-text box, both on a high-contrast dark
// band. The boxes NEVER resize — text is fit to them by shrinking the font
// between a max and a min (name is one line fit to width; effect text wraps
// and is fit to height). No "…" truncation. A designer-side character cap
// plus the min font keep the worst case bounded.

using Godot;

namespace Breakthrough.GodotHost.Arena;

public partial class Card3D : Node3D
{
    public string Key = "";          // instanceId / slotId / permanentId — zone-specific
    public string Zone = "";         // "hand" | "shield" | "field" | "guard" | "core" | "fx"
    public int IndexInZone;

    // ── face layout (world units; card is 0.7 × 1.0 centred at origin) ───────
    private const float FacePixel = 0.001f;

    private static readonly Vector3 CostPos = new(-0.255f, 0.40f, 0.010f);

    // Title bar: fixed rectangle just above the effect box.
    private static readonly Vector3 NameBandPos = new(0, -0.085f, 0.005f);
    private static readonly Vector3 NameTextPos = new(0, -0.085f, 0.009f);
    private const float NameBandW = 0.66f, NameBandH = 0.12f;
    private const float NameFitW = 0.60f, NameFitH = 0.10f;
    private const int NameMaxFont = 92, NameMinFont = 30;

    // Effect-text box: fixed rectangle in the lower part of the face.
    private static readonly Vector3 EffectBandPos = new(0, -0.315f, 0.005f);
    private static readonly Vector3 EffectTextPos = new(0, -0.315f, 0.009f);
    private const float EffectBandW = 0.66f, EffectBandH = 0.30f;
    private const float EffectFitW = 0.60f, EffectFitH = 0.27f;
    private const int EffectMaxFont = 44, EffectMinFont = 15;

    private static readonly Color Ink = new("f0e8d8");
    private static readonly Color InkOutline = new("14100a");

    // Colour strip sits directly above the title bar — the card's colour is
    // readable at a glance from table view (Ken playtest round 4).
    private static readonly Vector3 ColorStripPos = new(0, -0.0175f, 0.006f);
    private const float ColorStripW = 0.66f, ColorStripH = 0.025f;

    private Label3D _name = null!, _cost = null!, _text = null!;
    private MeshInstance3D _front = null!, _back = null!, _nameBand = null!, _effectBand = null!;
    private MeshInstance3D _colorStrip = null!;
    private Label3D? _badge, _counterBadge;
    private MeshInstance3D? _art, _artOverlay;
    private string _artDefId = "";
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

        _nameBand = MakeBand(NameBandPos, new Vector2(NameBandW, NameBandH), new Color(0.10f, 0.09f, 0.13f, 0.86f));
        _effectBand = MakeBand(EffectBandPos, new Vector2(EffectBandW, EffectBandH), new Color(0.04f, 0.03f, 0.06f, 0.82f));
        _colorStrip = MakeBand(ColorStripPos, new Vector2(ColorStripW, ColorStripH), ColorOf("Colorless"));

        _name = MakeLabel(NameTextPos, NameMaxFont, Ink);
        _name.VerticalAlignment = VerticalAlignment.Center;
        _name.AutowrapMode = TextServer.AutowrapMode.Off;
        _name.OutlineSize = 14;
        _name.OutlineModulate = InkOutline;

        _cost = MakeLabel(CostPos, 128, new Color("ffe0b0"));
        _cost.OutlineSize = 24;
        _cost.OutlineModulate = new Color("14100a");

        _text = MakeLabel(EffectTextPos, EffectMaxFont, Ink);
        _text.VerticalAlignment = VerticalAlignment.Center;
        _text.Width = EffectFitW / FacePixel;
        _text.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        _text.OutlineSize = 6;
        _text.OutlineModulate = InkOutline;

        var area = new Area3D { Monitoring = false };
        var shape = new CollisionShape3D { Shape = new BoxShape3D { Size = new Vector3(0.7f, 1.0f, 0.05f) } };
        area.AddChild(shape);
        area.SetMeta("card3d", GetPath());
        AddChild(area);
    }

    private MeshInstance3D MakeBand(Vector3 pos, Vector2 size, Color color)
    {
        var band = new MeshInstance3D
        {
            Mesh = new QuadMesh { Size = size },
            Position = pos,
            MaterialOverride = new StandardMaterial3D
            {
                ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                AlbedoColor = color,
            },
        };
        AddChild(band);
        return band;
    }

    private Label3D MakeLabel(Vector3 pos, int fontSize, Color color)
    {
        var l = new Label3D
        {
            Position = pos,
            FontSize = fontSize,
            Modulate = color,
            PixelSize = FacePixel,
            HorizontalAlignment = HorizontalAlignment.Center,
        };
        AddChild(l);
        return l;
    }

    // ── font fitting (boxes are fixed; only the font size changes) ───────────

    private static Font? FaceFont => ThemeDB.Singleton?.FallbackFont;

    /// <summary>Largest font (≤ maxF, ≥ minF) that keeps a single line within the box.</summary>
    private static int FitSingleLine(string text, float worldW, float worldH, int maxF, int minF)
    {
        int hCap = Mathf.Clamp((int)(worldH / FacePixel), minF, maxF);
        var font = FaceFont;
        if (font == null || text.Length == 0) return hCap;
        float maxWpx = worldW / FacePixel;
        for (int fs = hCap; fs > minF; fs--)
            if (font.GetStringSize(text, HorizontalAlignment.Center, -1, fs).X <= maxWpx) return fs;
        return minF;
    }

    /// <summary>Largest font (≤ maxF, ≥ minF) whose wrapped height fits the box.</summary>
    private static int FitMultiline(string text, float worldW, float worldH, int maxF, int minF)
    {
        var font = FaceFont;
        if (font == null || text.Length == 0) return maxF;
        float wPx = worldW / FacePixel;
        float hPx = worldH / FacePixel;
        for (int fs = maxF; fs > minF; fs--)
            if (font.GetMultilineStringSize(text, HorizontalAlignment.Center, wPx, fs).Y <= hPx) return fs;
        return minF;
    }

    // ── content ──────────────────────────────────────────────────────────────

    /// <summary>Card colour name ("Blue", "Red", …) → the strip colour.</summary>
    public static Color ColorOf(string color) => color switch
    {
        "Blue" => new Color("4a7fd4"),
        "Red" => new Color("c8443a"),
        "Green" => new Color("4aa85a"),
        "Orange" => new Color("d98a34"),
        "Purple" => new Color("8a5ad4"),
        _ => new Color("6a6a72"), // Colorless
    };

    /// <summary>Selection highlight (Back of Mind): lights up the title bar.</summary>
    public void SetHighlight(bool on)
    {
        if (_nameBand.MaterialOverride is StandardMaterial3D m)
            m.AlbedoColor = on ? new Color(0.62f, 0.50f, 0.16f, 0.94f) : new Color(0.10f, 0.09f, 0.13f, 0.86f);
    }

    public void SetColor(string color)
    {
        if (_colorStrip.MaterialOverride is StandardMaterial3D m) m.AlbedoColor = ColorOf(color);
    }

    public void SetFace(string name, string costText, string effectText, string? artDefId = null)
    {
        _name.Text = name;
        _name.FontSize = FitSingleLine(name, NameFitW, NameFitH, NameMaxFont, NameMinFont);
        _cost.Text = costText;
        _text.Text = effectText; // no truncation — the font shrinks to fit
        _text.FontSize = FitMultiline(effectText, EffectFitW, EffectFitH, EffectMaxFont, EffectMinFont);
        if (artDefId != null && artDefId != _artDefId)
        {
            _artDefId = artDefId;
            ApplyCardArt(artDefId);
        }
    }

    /// <summary>Swap either face's material (guard backs, core shields, …).</summary>
    public void SetMaterials(Material? front, Material? back)
    {
        if (front != null) _front.MaterialOverride = front;
        if (back != null) _back.MaterialOverride = back;
    }

    /// <summary>
    /// Counter total badge (top-right) for permanents carrying counters —
    /// readable from table view without hovering. Empty string hides it.
    /// </summary>
    public void SetCounterBadge(string text)
    {
        if (_counterBadge == null)
        {
            if (text.Length == 0) return;
            _counterBadge = MakeLabel(new Vector3(0.26f, 0.42f, 0.014f), 150, new Color("ffe08a"));
            _counterBadge.OutlineSize = 26;
            _counterBadge.OutlineModulate = new Color("3a2a10");
        }
        _counterBadge.Text = text;
        _counterBadge.Visible = text.Length > 0 && !_faceDown;
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

    // ── art (unified: the boxes/text are always present; art is a toggle) ────

    public void ApplyCardArt(string definitionId) =>
        ApplyCardArt(CardArtLibrary.Texture(definitionId), CardArtLibrary.Entry(definitionId));

    /// <summary>
    /// Composite an explicit texture + entry onto the face (the Card Designer
    /// previews UNSAVED settings through this overload). With no texture the
    /// card_front material is the background; the title bar, effect box and
    /// fitted text are permanent either way.
    /// </summary>
    public void ApplyCardArt(Texture2D? tex, CardArtEntry? entry)
    {
        _art?.QueueFree(); _art = null;
        _artOverlay?.QueueFree(); _artOverlay = null;
        if (tex == null || entry == null) return;

        _art = new MeshInstance3D
        {
            Mesh = new QuadMesh { Size = new Vector2(0.7f, 1.0f) * entry.ArtScale },
            MaterialOverride = new StandardMaterial3D
            {
                AlbedoTexture = tex,
                ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
            },
            Position = new Vector3(0, entry.ArtOffsetY, 0.003f),
            Visible = !_faceDown,
        };
        AddChild(_art);

        switch (entry.Overlay)
        {
            case "glow":
                _artOverlay = new MeshInstance3D
                {
                    Mesh = new QuadMesh { Size = new Vector2(0.78f, 1.08f) },
                    MaterialOverride = new StandardMaterial3D
                    {
                        ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                        Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                        AlbedoColor = entry.OverlayColor with { A = 0.35f },
                        EmissionEnabled = true,
                        Emission = entry.OverlayColor,
                        EmissionEnergyMultiplier = 1.4f,
                    },
                    Position = new Vector3(0, 0, -0.006f),
                };
                AddChild(_artOverlay);
                break;
            case "tint":
                _artOverlay = new MeshInstance3D
                {
                    Mesh = new QuadMesh { Size = new Vector2(0.7f, 1.0f) * entry.ArtScale },
                    MaterialOverride = new StandardMaterial3D
                    {
                        ShadingMode = BaseMaterial3D.ShadingModeEnum.Unshaded,
                        Transparency = BaseMaterial3D.TransparencyEnum.Alpha,
                        AlbedoColor = entry.OverlayColor with { A = 0.35f },
                    },
                    Position = new Vector3(0, entry.ArtOffsetY, 0.004f),
                };
                AddChild(_artOverlay);
                break;
        }
    }

    public void SetFaceDown(bool faceDown)
    {
        _faceDown = faceDown;
        bool show = !faceDown;
        _name.Visible = _cost.Visible = _text.Visible = show;
        _nameBand.Visible = _effectBand.Visible = _colorStrip.Visible = show;
        if (_art != null) _art.Visible = show;
        if (_artOverlay != null) _artOverlay.Visible = show;
        if (_counterBadge != null) _counterBadge.Visible = show && _counterBadge.Text.Length > 0;
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
