// The Card Designer (roadmap step 5, Ken sign-off on Option B): the ONE full
// content editor. Edits the CANONICAL checked-in content/content.json —
// name / cost / color / effect text / effect structures — plus per-card art
// and compositing (godot/art/cards/ + manifest.json, see CardArt.cs).
//
// Fidelity properties:
//  - WYSIWYG: the preview is the REAL Card3D renderer in a SubViewport —
//    what you see is exactly what the arena shows.
//  - Validated: every apply/save deserializes the edited card through
//    EngineJson (the canonical vocabulary) and runs the ported C#
//    Validation.ValidateCard. Errors block saving.
//  - Diff-friendly: the file is edited as a JsonNode tree (System.Text.Json
//    preserves property order), so a save only changes the edited card.
//  - Effects are edited as validated JSON (the exact TS/C# effect
//    vocabulary), not a form — full power to fix any card, with the engine
//    itself as the safety net. Card IDs are immutable here (references from
//    encounters/decks stay valid by construction).
//
// The engine and existing card data are NEVER modified by this tool on its
// own — a human drives every change (per Ken: content fixes are manual).

using System.Collections.Generic;
using System.Linq;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Breakthrough.Engine;
using Breakthrough.Engine.Json;
using Breakthrough.GodotHost.Arena;
using Godot;

namespace Breakthrough.GodotHost.Designer;

public partial class CardDesigner : Control
{
    private static readonly JsonSerializerOptions WriteOptions = new()
    {
        WriteIndented = true,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private static readonly string[] KnownColors = ["Colorless", "Blue", "Red", "Green", "Orange", "Purple"];

    private string _contentPath = "";
    private JsonObject _root = new();
    private JsonObject _cards = new();
    private JsonObject? _tokens;
    private JsonObject _manifest = new();
    private string _currentId = "";
    private List<string> _listedIds = [];

    // left
    private LineEdit _filter = null!;
    private ItemList _cardList = null!;
    // center
    private Card3D _previewCard = null!;
    private RichTextLabel _issues = null!;
    private float _previewSpin;
    // right
    private Label _idLabel = null!;
    private LineEdit _nameEdit = null!;
    private SpinBox _costEdit = null!;
    private OptionButton _colorEdit = null!;
    private TextEdit _effectTextEdit = null!;
    private TextEdit _longDescEdit = null!;
    private EffectBuilderView _builderView = null!;
    private ScrollContainer _builderScroll = null!;
    private CardEffectBuilder _builderModel = null!;
    private TextEdit _rawEdit = null!;
    private Button _rawToggle = null!;
    private bool _rawMode;

    /// <summary>All effect-bearing card keys the builder / raw hatch manage.</summary>
    private static readonly string[] ManagedEffectKeys =
    [
        "effects", "shieldTriggerEffects", "heavyHandEffects", "leaveTriggerEffects", "turnStartEffects",
        "trapTrigger", "triggeredAbilities", "activatedAbilities", "thresholds",
    ];
    private Label _artPathLabel = null!;
    private OptionButton _overlayEdit = null!;
    private ColorPickerButton _overlayColor = null!;
    private HSlider _artScale = null!, _artOffset = null!;
    private Label _saveStatus = null!;
    private Button _saveButton = null!;
    private FileDialog _fileDialog = null!;
    private string _pendingArtPath = ""; // res:// path of this card's art ("" = none)

    public override void _Ready()
    {
        _contentPath = EngineHarness.ResolveContentPath(ProjectSettings.GlobalizePath("res://"));
        if (!System.IO.File.Exists(_contentPath))
        {
            var err = new Label { Text = $"Canonical content store not found:\n{_contentPath}" };
            err.SetAnchorsPreset(LayoutPreset.Center);
            AddChild(err);
            return;
        }
        _root = (JsonObject)JsonNode.Parse(System.IO.File.ReadAllText(_contentPath))!;
        _cards = _root["cards"]!.AsObject();
        _tokens = _root["tokens"]?.AsObject();
        _manifest = System.IO.File.Exists(CardArtLibrary.ManifestPath)
            ? (JsonObject)JsonNode.Parse(System.IO.File.ReadAllText(CardArtLibrary.ManifestPath))!
            : new JsonObject();

        BuildUi();
        RefreshCardList();
        if (_listedIds.Count > 0) SelectCard(_listedIds[0]);
    }

    // ── UI construction ─────────────────────────────────────────────────────

    private void BuildUi()
    {
        SetAnchorsPreset(LayoutPreset.FullRect);
        var bg = new ColorRect { Color = new Color("1a1a22") };
        bg.SetAnchorsPreset(LayoutPreset.FullRect);
        AddChild(bg);

        var root = new HBoxContainer();
        root.SetAnchorsPreset(LayoutPreset.FullRect);
        root.OffsetLeft = 10; root.OffsetTop = 10; root.OffsetRight = -10; root.OffsetBottom = -10;
        root.AddThemeConstantOverride("separation", 12);
        AddChild(root);

        // left: card list
        var left = new VBoxContainer { CustomMinimumSize = new Vector2(280, 0) };
        root.AddChild(left);
        left.AddChild(new Label { Text = "Cards (canonical content.json)" });
        _filter = new LineEdit { PlaceholderText = "filter…" };
        _filter.TextChanged += _ => RefreshCardList();
        left.AddChild(_filter);
        _cardList = new ItemList { SizeFlagsVertical = SizeFlags.ExpandFill };
        _cardList.ItemSelected += i => SelectCard(_listedIds[(int)i]);
        left.AddChild(_cardList);

        // center: WYSIWYG preview + validation
        var center = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        root.AddChild(center);
        var viewportContainer = new SubViewportContainer
        {
            Stretch = true,
            SizeFlagsVertical = SizeFlags.ExpandFill,
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
        };
        var viewport = new SubViewport { OwnWorld3D = true, TransparentBg = false };
        viewportContainer.AddChild(viewport);
        center.AddChild(viewportContainer);

        var previewWorld = new Node3D();
        viewport.AddChild(previewWorld);
        var cam = new Camera3D { Position = new Vector3(0, 0, 1.5f), Fov = 45, Current = true };
        previewWorld.AddChild(cam);
        previewWorld.AddChild(new DirectionalLight3D { RotationDegrees = new Vector3(-35, 25, 0), LightEnergy = 1.4f });
        _previewCard = new Card3D { Zone = "fx" };
        previewWorld.AddChild(_previewCard);

        center.AddChild(new Label { Text = "Validation (ported C# engine Validation.ValidateCard)" });
        _issues = new RichTextLabel { BbcodeEnabled = true, FitContent = false, CustomMinimumSize = new Vector2(0, 110) };
        center.AddChild(_issues);

        // right: edit panel. Horizontal scroll disabled everywhere — wide
        // effect rows wrap instead of scrolling sideways (Ken designer round 2).
        var rightScroll = new ScrollContainer
        {
            CustomMinimumSize = new Vector2(460, 0),
            HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled,
        };
        root.AddChild(rightScroll);
        var right = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        right.AddThemeConstantOverride("separation", 8);
        rightScroll.AddChild(right);

        _idLabel = new Label();
        right.AddChild(_idLabel);

        right.AddChild(new Label { Text = "Name (max 28 chars — the title bar never resizes; the font shrinks to fit)" });
        _nameEdit = new LineEdit { MaxLength = 28 };
        right.AddChild(_nameEdit);

        right.AddChild(new Label { Text = "Cost" });
        _costEdit = new SpinBox { MinValue = 0, MaxValue = 30 };
        right.AddChild(_costEdit);

        right.AddChild(new Label { Text = "Color" });
        _colorEdit = new OptionButton();
        foreach (var c in KnownColors) _colorEdit.AddItem(c);
        right.AddChild(_colorEdit);

        right.AddChild(new Label { Text = "Effect text (auto-generated from effects; editable only for cards with no mechanical effects)" });
        _effectTextEdit = new TextEdit { CustomMinimumSize = new Vector2(0, 80), WrapMode = TextEdit.LineWrappingMode.Boundary };
        right.AddChild(_effectTextEdit);

        right.AddChild(new Label { Text = "Long description / flavor (optional — hand-authored)" });
        _longDescEdit = new TextEdit { CustomMinimumSize = new Vector2(0, 70), WrapMode = TextEdit.LineWrappingMode.Boundary };
        right.AddChild(_longDescEdit);

        var effHeader = new HBoxContainer();
        effHeader.AddChild(new Label { Text = "Effect composition (validated on apply/save)" });
        effHeader.AddChild(new Control { SizeFlagsHorizontal = SizeFlags.ExpandFill });
        _rawToggle = new Button { Text = "Raw JSON", ToggleMode = true };
        _rawToggle.Toggled += OnRawToggled;
        effHeader.AddChild(_rawToggle);
        right.AddChild(effHeader);

        _builderScroll = new ScrollContainer
        {
            CustomMinimumSize = new Vector2(0, 340),
            HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled,
        };
        _builderView = new EffectBuilderView { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        _builderScroll.AddChild(_builderView);
        right.AddChild(_builderScroll);

        _rawEdit = new TextEdit { CustomMinimumSize = new Vector2(0, 340), Visible = false };
        right.AddChild(_rawEdit);

        right.AddChild(new HSeparator());
        right.AddChild(new Label { Text = "Art & compositing (art/cards/ + manifest.json)" });
        _artPathLabel = new Label { Text = "art: (none)", AutowrapMode = TextServer.AutowrapMode.Arbitrary };
        right.AddChild(_artPathLabel);
        var importBtn = new Button { Text = "Import Art…" };
        importBtn.Pressed += () => _fileDialog.PopupCentered(new Vector2I(800, 500));
        right.AddChild(importBtn);

        right.AddChild(new Label { Text = "Overlay" });
        _overlayEdit = new OptionButton();
        foreach (var o in new[] { "none", "glow", "tint" }) _overlayEdit.AddItem(o);
        right.AddChild(_overlayEdit);
        _overlayColor = new ColorPickerButton { Color = Colors.White, CustomMinimumSize = new Vector2(0, 30) };
        right.AddChild(_overlayColor);

        right.AddChild(new Label { Text = "Art scale" });
        _artScale = new HSlider { MinValue = 0.5, MaxValue = 1.5, Step = 0.05, Value = 1.0 };
        right.AddChild(_artScale);
        right.AddChild(new Label { Text = "Art vertical offset" });
        _artOffset = new HSlider { MinValue = -0.3, MaxValue = 0.3, Step = 0.01, Value = 0.0 };
        right.AddChild(_artOffset);

        right.AddChild(new HSeparator());
        var applyBtn = new Button { Text = "Apply to Preview" };
        applyBtn.Pressed += () => ApplyPreview();
        right.AddChild(applyBtn);
        _saveButton = new Button { Text = "Save Card" };
        _saveButton.Pressed += SaveCard;
        right.AddChild(_saveButton);
        var revertBtn = new Button { Text = "Revert" };
        revertBtn.Pressed += () => SelectCard(_currentId);
        right.AddChild(revertBtn);
        var backBtn = new Button { Text = "Back to Launcher" };
        backBtn.Pressed += () => GetTree().ChangeSceneToFile("res://Main.tscn");
        right.AddChild(backBtn);
        _saveStatus = new Label();
        right.AddChild(_saveStatus);

        _fileDialog = new FileDialog
        {
            Access = FileDialog.AccessEnum.Filesystem,
            FileMode = FileDialog.FileModeEnum.OpenFile,
            Filters = ["*.png, *.jpg, *.jpeg, *.webp ; Images"],
        };
        _fileDialog.FileSelected += OnArtFileSelected;
        AddChild(_fileDialog);
    }

    public override void _Process(double delta)
    {
        if (_previewCard == null) return;
        _previewSpin += (float)delta;
        _previewCard.RotationDegrees = new Vector3(0, Mathf.Sin(_previewSpin * 0.7f) * 14f, 0);
    }

    // ── list & selection ────────────────────────────────────────────────────

    private void RefreshCardList()
    {
        string filter = _filter.Text.Trim().ToLowerInvariant();
        _listedIds = _cards
            .Select(kv => kv.Key)
            .Where(id => filter.Length == 0
                || id.Contains(filter, System.StringComparison.OrdinalIgnoreCase)
                || (NameOf(id)?.Contains(filter, System.StringComparison.OrdinalIgnoreCase) ?? false))
            .OrderBy(id => id, System.StringComparer.Ordinal)
            .ToList();
        _cardList.Clear();
        foreach (var id in _listedIds)
        {
            bool isToken = _tokens?.ContainsKey(id) == true;
            _cardList.AddItem($"{NameOf(id)}  ·  {id}{(isToken ? "  [token]" : "")}");
        }
    }

    private string? NameOf(string id) => _cards[id]?["name"]?.GetValue<string>();

    private void SelectCard(string id)
    {
        if (_cards[id] is not JsonObject card) return;
        _currentId = id;
        _idLabel.Text = $"id: {id} (immutable)";
        _nameEdit.Text = card["name"]?.GetValue<string>() ?? "";
        _costEdit.Value = card["cost"]?.GetValue<double>() ?? 0;
        string color = card["color"]?.GetValue<string>() ?? "Colorless";
        int colorIdx = System.Array.IndexOf(KnownColors, color);
        if (colorIdx < 0) { _colorEdit.AddItem(color); colorIdx = _colorEdit.ItemCount - 1; }
        _colorEdit.Selected = colorIdx;
        _effectTextEdit.Text = card["effectText"]?.GetValue<string>() ?? "";
        _longDescEdit.Text = card["longDescription"]?.GetValue<string>() ?? "";
        LoadEffectBuilder(card);

        // art fields from the manifest (or convention fallback)
        var artEntry = _manifest[id] as JsonObject;
        _pendingArtPath = artEntry?["texture"]?.GetValue<string>()
            ?? (CardArtLibrary.Entry(id)?.TexturePath ?? "");
        _artPathLabel.Text = _pendingArtPath.Length > 0 ? $"art: {_pendingArtPath}" : "art: (none)";
        string overlay = artEntry?["overlay"]?.GetValue<string>() ?? "none";
        _overlayEdit.Selected = System.Math.Max(0, System.Array.IndexOf(new[] { "none", "glow", "tint" }, overlay));
        _overlayColor.Color = Color.FromString(artEntry?["overlayColor"]?.GetValue<string>() ?? "#ffffff", Colors.White);
        _artScale.Value = artEntry?["artScale"]?.GetValue<double>() ?? 1.0;
        _artOffset.Value = artEntry?["artOffsetY"]?.GetValue<double>() ?? 0.0;

        _rawToggle.SetPressedNoSignal(false);
        _rawMode = false;
        _builderScroll.Visible = true;
        _rawEdit.Visible = false;

        _saveStatus.Text = "";
        ApplyPreview();
    }

    // ── effect builder / raw hatch ──────────────────────────────────────────

    private string[] TokenIds() => _tokens?.Select(kv => kv.Key).OrderBy(k => k, System.StringComparer.Ordinal).ToArray() ?? [];

    /// <summary>Definition id → display name, for the effect-text generator.</summary>
    private string ResolveName(string defId) =>
        _cards[defId]?["name"]?.GetValue<string>()
        ?? _tokens?[defId]?["name"]?.GetValue<string>()
        ?? defId;

    /// <summary>
    /// Effect text is auto-generated from the card's effects for consistent
    /// vocabulary; cards with no mechanical effects (info / vanilla) keep a
    /// hand-editable field.
    /// </summary>
    private (string Text, bool Generated) ComputeEffectText(JsonObject node)
    {
        string gen = EffectTextGenerator.Generate(node, ResolveName);
        return gen.Length > 0 ? (gen, true) : (_effectTextEdit.Text, false);
    }

    private void LoadEffectBuilder(JsonObject card)
    {
        _builderModel = new CardEffectBuilder((JsonObject)card.DeepClone());
        _builderView.Load(_builderModel, TokenIds(), () => ApplyPreview());
    }

    /// <summary>Object of only the effect-bearing keys present on a card.</summary>
    private static JsonObject ExtractEffectKeys(JsonObject card)
    {
        var o = new JsonObject();
        foreach (var k in ManagedEffectKeys)
            if (card[k] is { } v) o[k] = v.DeepClone();
        return o;
    }

    private void OnRawToggled(bool on)
    {
        if (on)
        {
            // builder → raw: snapshot the current effect keys into the editor.
            var (node, err) = BuildEditedNode();
            if (node == null) { _rawToggle.SetPressedNoSignal(false); _saveStatus.Text = err ?? "cannot switch"; return; }
            _rawEdit.Text = ExtractEffectKeys(node).ToJsonString(WriteOptions);
            _rawMode = true;
            _builderScroll.Visible = false;
            _rawEdit.Visible = true;
        }
        else
        {
            // raw → builder: parse and rebuild the model so edits carry over.
            try
            {
                var eff = JsonNode.Parse(_rawEdit.Text) as JsonObject
                          ?? throw new System.Text.Json.JsonException("expected a JSON object of effect keys");
                var rebuilt = new JsonObject();
                foreach (var kv in eff) rebuilt[kv.Key] = kv.Value!.DeepClone();
                _builderModel = new CardEffectBuilder(rebuilt);
                _builderView.Load(_builderModel, TokenIds(), () => ApplyPreview());
                _rawMode = false;
                _builderScroll.Visible = true;
                _rawEdit.Visible = false;
            }
            catch (System.Exception e)
            {
                _rawToggle.SetPressedNoSignal(true);
                _saveStatus.Text = $"raw JSON does not parse: {e.Message}";
                return;
            }
        }
        ApplyPreview();
    }

    // ── edit model ──────────────────────────────────────────────────────────

    /// <summary>The edited card as a JsonObject, or null with an error string.</summary>
    private (JsonObject? Node, string? Error) BuildEditedNode()
    {
        if (_cards[_currentId] is not JsonObject orig) return (null, "no card selected");
        var node = (JsonObject)JsonNode.Parse(orig.ToJsonString())!;
        node["name"] = _nameEdit.Text;
        node["cost"] = (int)_costEdit.Value;
        node["color"] = _colorEdit.GetItemText(_colorEdit.Selected);

        if (_rawMode)
        {
            // Raw hatch: replace ALL managed effect keys with the editor's object.
            JsonObject eff;
            try
            {
                eff = JsonNode.Parse(_rawEdit.Text) as JsonObject
                      ?? throw new JsonException("expected a JSON object of effect keys");
            }
            catch (JsonException e)
            {
                return (null, $"raw effects JSON does not parse: {e.Message}");
            }
            foreach (var k in ManagedEffectKeys) node.Remove(k);
            foreach (var kv in eff) node[kv.Key] = kv.Value!.DeepClone();
        }
        else
        {
            // Builder: write only touched sections back (minimal diffs).
            _builderModel.WriteBack(node);
        }

        // Effect text is derived from the finished effects (consistent vocab).
        node["effectText"] = ComputeEffectText(node).Text;
        // Long description / flavor stays hand-authored.
        if (_longDescEdit.Text.Trim().Length > 0) node["longDescription"] = _longDescEdit.Text;
        else node.Remove("longDescription");
        return (node, null);
    }

    private CardArtEntry PendingArtEntry() => new(
        _pendingArtPath,
        _overlayEdit.GetItemText(_overlayEdit.Selected),
        _overlayColor.Color,
        (float)_artScale.Value,
        (float)_artOffset.Value);

    /// <summary>Validate the edited card and render it on the real Card3D. Returns true if error-free.</summary>
    private bool ApplyPreview()
    {
        var (node, error) = BuildEditedNode();
        if (node == null)
        {
            _issues.Text = $"[color=#ff5a4a]{error}[/color]";
            return false;
        }

        CardDefinition def;
        try
        {
            def = EngineJson.Deserialize<CardDefinition>(node.ToJsonString());
        }
        catch (System.Exception e)
        {
            _issues.Text = $"[color=#ff5a4a]card does not deserialize through the engine vocabulary: {Escape(e.Message)}[/color]";
            return false;
        }

        var issues = Validation.ValidateCard(def);
        _issues.Text = issues.Count == 0
            ? "[color=#8ae08a]valid — no issues[/color]"
            : string.Join("\n", issues.Select(i =>
                $"[color=#{(i.Severity == Severities.Error ? "ff5a4a" : "ffb04a")}]{i.Severity} · {Escape(i.Where)}: {Escape(i.Message)}[/color]"));

        // Reflect the generated effect text (read-only when derived from effects).
        var (etext, generated) = ComputeEffectText(node);
        _effectTextEdit.Editable = !generated;
        if (generated) _effectTextEdit.Text = etext;

        _previewCard.SetFace(def.Name, def.Cost.ToString(), def.EffectText);
        Texture2D? tex = null;
        if (_pendingArtPath.Length > 0)
        {
            string global = ProjectSettings.GlobalizePath(_pendingArtPath);
            if (System.IO.File.Exists(global) && Image.LoadFromFile(global) is { } img)
                tex = ImageTexture.CreateFromImage(img);
        }
        _previewCard.ApplyCardArt(tex, tex == null ? null : PendingArtEntry());

        return issues.All(i => i.Severity != Severities.Error);
    }

    // ── persistence ─────────────────────────────────────────────────────────

    private void SaveCard()
    {
        if (!ApplyPreview())
        {
            _saveStatus.Text = "not saved — fix validation errors first";
            return;
        }
        var (node, _) = BuildEditedNode();

        // cards[] always; tokens[] too when the id is a token (ALL_CARDS
        // includes tokens, so both copies must stay identical).
        _cards[_currentId] = JsonNode.Parse(node!.ToJsonString());
        if (_tokens?.ContainsKey(_currentId) == true)
            _tokens[_currentId] = JsonNode.Parse(node.ToJsonString());
        System.IO.File.WriteAllText(_contentPath, _root.ToJsonString(WriteOptions) + "\n");

        // art manifest entry (only when there is art or a non-default overlay)
        var entry = PendingArtEntry();
        if (entry.TexturePath.Length > 0)
        {
            _manifest[_currentId] = new JsonObject
            {
                ["texture"] = entry.TexturePath,
                ["overlay"] = entry.Overlay,
                ["overlayColor"] = "#" + entry.OverlayColor.ToHtml(false),
                ["artScale"] = System.Math.Round(entry.ArtScale, 3),
                ["artOffsetY"] = System.Math.Round(entry.ArtOffsetY, 3),
            };
        }
        else
        {
            _manifest.Remove(_currentId);
        }
        System.IO.Directory.CreateDirectory(CardArtLibrary.CardsDir);
        System.IO.File.WriteAllText(CardArtLibrary.ManifestPath, _manifest.ToJsonString(WriteOptions) + "\n");
        CardArtLibrary.Reload();

        // Re-baseline the builder against the saved node so later edits keep
        // diffing minimally, and reflect any raw-mode edits back into it.
        if (_cards[_currentId] is JsonObject saved && !_rawMode)
            LoadEffectBuilder(saved);

        _saveStatus.Text = $"saved ✔  ({System.DateTime.Now:HH:mm:ss})";
        RefreshCardList();
    }

    private void OnArtFileSelected(string path)
    {
        string ext = System.IO.Path.GetExtension(path).ToLowerInvariant();
        System.IO.Directory.CreateDirectory(CardArtLibrary.CardsDir);
        string destGlobal = System.IO.Path.Combine(CardArtLibrary.CardsDir, _currentId + ext);
        System.IO.File.Copy(path, destGlobal, overwrite: true);
        _pendingArtPath = $"res://art/cards/{_currentId}{ext}";
        _artPathLabel.Text = $"art: {_pendingArtPath}";
        CardArtLibrary.Reload();
        ApplyPreview();
    }

    private static string Escape(string s) => s.Replace("[", "[lb]");
}
