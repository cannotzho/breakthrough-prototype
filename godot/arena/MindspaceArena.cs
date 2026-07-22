// The Mindspace — step-3 3D combat presentation over the CombatBridge seam.
// Inscryption-style framing: you sit at a table across from the opponent's
// avatar inside their mindspace. All visuals are ArtLibrary slots
// (procedural placeholders until an artist drops real assets in).
//
// Round-2 changes (Ken playtest): board ⇄ hand-inspect camera toggle (Tab or
// HUD button), hover detail panel on the HUD (Label3D has no tooltips), bell
// moved clear of the hand with an End Turn label, physical patience candle +
// priority token stacks on the table, slower NPC pacing (2.4 s) with serial
// focus-then-resolve beats, viewport stretch in project.godot. The
// patience-driven avatar mood stays exactly as it was (Ken's keep).
//
// The bridge/seam is NOT modified by this layer (one additive exception made
// in step 3: LogView carries the engine's structured Data payload).

using System.Collections.Generic;
using System.Linq;
using Godot;

namespace Breakthrough.GodotHost.Arena;

public partial class MindspaceArena : Node3D
{
    private CombatBridge _bridge = null!;
    private ArenaHud _hud = null!;
    private CameraRig _rig = null!;
    private OpponentAvatar _avatar = null!;
    private AnimationDirector _director = null!;
    private Node3D _bell = null!;
    private Label3D _bellLabel = null!;
    private PatienceCandle _candle = null!;
    private PriorityStack _playerStack = null!, _npcStack = null!;
    private PopupMenu _cardMenu = null!, _abilityMenu = null!;

    private readonly Dictionary<string, Card3D> _hand = new();
    private readonly Dictionary<string, Card3D> _shields = new();
    private readonly Dictionary<string, Card3D> _field = new();
    private readonly List<Card3D> _guards = [];
    private readonly List<Card3D> _cores = [];

    private enum ViewMode { Board, HandInspect, TopDown }

    private Card3D? _hovered;
    private string? _selectedShieldSlot;
    private ViewMode _viewMode = ViewMode.Board;

    // Back-of-Mind selection happens on the 3D cards themselves (Ken playtest
    // round 4) — picked hand cards lift and tint; a HUD bar confirms.
    private bool _botmMode;
    private int _botmLimit;
    private readonly HashSet<string> _botmPicks = [];
    private CardPile _playerDeckPile = null!, _playerDiscardPile = null!;
    private CardPile _npcDeckPile = null!, _npcDiscardPile = null!;
    private int _menuHandIndex = -1;
    private string _menuPermanentId = "";
    private IReadOnlyList<AbilityView> _menuAbilities = [];

    // anchors
    private static readonly Vector3 AvatarPos = new(0, 0, -3.4f);
    private static readonly Vector3 TableCenter = new(0, 0.3f, 0.2f);
    private static readonly Vector3 BellPos = new(3.15f, 0, 0.55f);
    private static readonly Vector3 CandlePos = new(-3.0f, 0, -1.4f);
    // Right of the bell, clear of the shield row (Ken round 5: shields were
    // clipping into the coins at the old x).
    private static readonly Vector3 PlayerStackPos = new(4.0f, 0, 1.15f);
    private static readonly Vector3 NpcStackPos = new(2.95f, 0, -1.55f);
    private static readonly Vector3 PlayerDeckExit = new(3.3f, 0.6f, 2.3f);
    private static readonly Vector3 PlayerDiscardExit = new(-3.3f, 0.6f, 2.3f);
    private static readonly Vector3 NpcDiscardExit = new(-3.0f, 0.7f, -2.5f);

    public override void _Ready()
    {
        // Opponent plays are acknowledged one at a time (Ken playtest round 4)
        // — no auto-advance; the HUD shows a Continue affordance per NPC card.
        _bridge = new CombatBridge { Name = "CombatBridge", AutoAdvanceNpc = false, NpcStepDelaySeconds = 2.4 };
        AddChild(_bridge);

        BuildWorld();

        _hud = new ArenaHud();
        _hud.Init(_bridge, ToggleHandInspect);
        AddChild(_hud);

        _cardMenu = new PopupMenu();
        _cardMenu.IdPressed += OnCardMenuPressed;
        AddChild(_cardMenu);
        _abilityMenu = new PopupMenu();
        _abilityMenu.IdPressed += OnAbilityMenuPressed;
        AddChild(_abilityMenu);

        _bridge.StartEncounter(LaunchConfig.EncounterId, LaunchConfig.DeckName, LaunchConfig.Seed);
        _bridge.Session!.ViewChanged += OnViewChanged;
        OnViewChanged(_bridge.View!);
    }

    // ── world construction (every visual is an ArtLibrary slot) ─────────────

    private void BuildWorld()
    {
        AddChild(new WorldEnvironment
        {
            Environment = new Godot.Environment
            {
                BackgroundMode = Godot.Environment.BGMode.Color,
                BackgroundColor = new Color("050508"),
                AmbientLightSource = Godot.Environment.AmbientSource.Color,
                AmbientLightColor = new Color("2a2438"),
                AmbientLightEnergy = 0.6f,
                FogEnabled = true,
                FogLightColor = new Color("14101e"),
                FogDensity = 0.015f,
                GlowEnabled = true,
                GlowIntensity = 0.6f,
            },
        });

        AddChild(new MeshInstance3D
        {
            Name = "VoidDome",
            Mesh = new SphereMesh { Radius = 30, Height = 60 },
            MaterialOverride = ArtLibrary.Mat("void_dome"),
        });

        var table = ArtLibrary.SceneOverride("table_prop") ?? new MeshInstance3D
        {
            Mesh = new BoxMesh { Size = new Vector3(9.5f, 0.3f, 7.5f) },
            MaterialOverride = ArtLibrary.Mat("table"),
            Position = new Vector3(0, -0.15f, 0),
        };
        table.Name = "Table";
        AddChild(table);

        var key = new SpotLight3D
        {
            Position = new Vector3(0, 6.5f, 1.5f),
            SpotRange = 14,
            SpotAngle = 55,
            LightEnergy = 3.2f,
            LightColor = new Color("ffe8c8"),
            ShadowEnabled = true,
        };
        AddChild(key);
        key.LookAt(TableCenter, Vector3.Up); // LookAt requires being in-tree

        AddChild(new OmniLight3D
        {
            Position = AvatarPos + new Vector3(0, 3.2f, -1.5f),
            OmniRange = 9,
            LightEnergy = 1.6f,
            LightColor = new Color("6a4ae0"),
        });

        _avatar = new OpponentAvatar { Position = AvatarPos };
        AddChild(_avatar);

        _rig = new CameraRig();
        AddChild(_rig);

        _bell = ArtLibrary.SceneOverride("bell_prop") ?? BuildBell();
        _bell.Position = BellPos;
        AddChild(_bell);

        _candle = (ArtLibrary.SceneOverride("patience_prop") as PatienceCandle) ?? new PatienceCandle();
        _candle.Position = CandlePos;
        AddChild(_candle);

        _playerStack = (ArtLibrary.SceneOverride("priority_prop") as PriorityStack) ?? new PriorityStack();
        _playerStack.Position = PlayerStackPos;
        AddChild(_playerStack);
        _npcStack = (ArtLibrary.SceneOverride("priority_prop") as PriorityStack) ?? new PriorityStack();
        _npcStack.Position = NpcStackPos;
        AddChild(_npcStack);

        // draw & discard piles on the table, aligned with the card exit anchors
        _playerDeckPile = new CardPile { PileId = "player-deck", Position = new Vector3(PlayerDeckExit.X, 0, PlayerDeckExit.Z) };
        _playerDiscardPile = new CardPile { PileId = "player-discard", FaceUp = true, Position = new Vector3(PlayerDiscardExit.X, 0, PlayerDiscardExit.Z) };
        _npcDeckPile = new CardPile { PileId = "npc-deck", Position = new Vector3(3.0f, 0, -2.5f) };
        _npcDiscardPile = new CardPile { PileId = "npc-discard", FaceUp = true, Position = new Vector3(NpcDiscardExit.X, 0, NpcDiscardExit.Z) };
        foreach (var pile in new[] { _playerDeckPile, _playerDiscardPile, _npcDeckPile, _npcDiscardPile })
            AddChild(pile);

        _director = new AnimationDirector();
        AddChild(_director);
        _director.Init(new AnimationDirector.ArenaRefs
        {
            Avatar = _avatar,
            Rig = _rig,
            Candle = _candle,
            PlayerStack = _playerStack,
            NpcStack = _npcStack,
            AvatarAnchor = AvatarPos + new Vector3(0, 2.0f, 0.6f),
            PlayerShieldAnchor = new Vector3(0, 1.0f, 1.05f),
            GuardAnchor = new Vector3(0, 1.1f, -1.65f),
            CoreAnchor = new Vector3(0, 1.2f, -2.35f),
            TableCenter = TableCenter,
            NpcDiscardExit = NpcDiscardExit,
            PlayerDeckAnchor = _playerDeckPile.Position + new Vector3(0, 0.5f, 0),
            NpcDeckAnchor = _npcDeckPile.Position + new Vector3(0, 0.5f, 0),
            ResolvePermanentPos = permId =>
                _field.TryGetValue(permId, out var card) ? card.Position : null,
            ResolveCard = defId => _bridge.GetCardInfo(defId),
        });
    }

    private Node3D BuildBell()
    {
        var bell = new Node3D { Name = "Bell" };
        var body = new MeshInstance3D
        {
            Mesh = new CylinderMesh { TopRadius = 0.16f, BottomRadius = 0.28f, Height = 0.22f },
            MaterialOverride = ArtLibrary.Mat("bell"),
            Position = new Vector3(0, 0.11f, 0),
        };
        bell.AddChild(body);
        _bellLabel = new Label3D
        {
            Text = "End Turn",
            Position = new Vector3(0, 0.62f, 0),
            FontSize = 96,
            PixelSize = 0.002f,
            Modulate = new Color("ffe8b8"),
            OutlineSize = 16,
            OutlineModulate = new Color("14101e"),
            Billboard = BaseMaterial3D.BillboardModeEnum.Enabled,
        };
        bell.AddChild(_bellLabel);
        var area = new Area3D { Monitoring = false };
        var shape = new CollisionShape3D { Shape = new CylinderShape3D { Radius = 0.38f, Height = 0.5f } };
        area.AddChild(shape);
        area.Position = new Vector3(0, 0.25f, 0);
        area.SetMeta("bell", true);
        bell.AddChild(area);
        return bell;
    }

    // ── view cycle: board → hand-inspect → top-down (Tab / HUD button) ──────

    private void ToggleHandInspect() => CycleView(+1);

    private void CycleView(int direction)
    {
        if (_hud.IsModalOpen) return;
        SetViewMode((ViewMode)(((int)_viewMode + direction + 3) % 3));
    }

    private void SetViewMode(ViewMode mode)
    {
        _viewMode = mode;
        _hud.SetViewLabel(mode switch
        {
            ViewMode.HandInspect => "Hand",
            ViewMode.TopDown => "Top-Down",
            _ => "Board",
        });
        var v = _bridge.View;
        if (v != null)
        {
            ApplyFraming(v);
            ReconcileHand(v);
        }
    }

    private void ApplyFraming(CombatView v)
    {
        _rig.SetFraming(
            v.Result != null ? CameraRig.Framing.Result :
            _viewMode == ViewMode.HandInspect ? CameraRig.Framing.HandInspect :
            _viewMode == ViewMode.TopDown ? CameraRig.Framing.TopDown :
            v.NpcTurnInProgress ? CameraRig.Framing.NpcTurn : CameraRig.Framing.PlayerTurn);
    }

    // ── view reconciliation ─────────────────────────────────────────────────

    // ── presentation timeline ────────────────────────────────────────────────
    // Views are QUEUED, not applied on arrival: each view's cues play first
    // (they drive the candle/coins from the log), and the view's remaining
    // state — cards, piles, HUD, prompts — is applied as the final step of
    // that view's timeline. This is what keeps coins from being spent before
    // the card that spent them has appeared (Ken playtest round 4).
    private readonly Queue<CombatView> _pendingViews = new();

    /// <summary>True while animation is still catching up with the engine.</summary>
    private bool Presenting => _director.IsBusy || _pendingViews.Count > 0;

    private void OnViewChanged(CombatView v) => _pendingViews.Enqueue(v);

    public override void _Process(double delta)
    {
        if (_director.IsBusy || _pendingViews.Count == 0) return;
        var next = _pendingViews.Dequeue();
        _director.StartingPatience = next.StartingPatience;
        _director.Play(next);                                  // cues (drive props)
        _director.EnqueueAction(() => ApplyViewState(next));   // then the rest of the state
    }

    private void ApplyViewState(CombatView v)
    {
        // The opponent acting or the game ending pulls you back to board view.
        if (_viewMode != ViewMode.Board && (v.NpcTurnInProgress || v.Result != null))
            SetViewMode(ViewMode.Board);

        // Back-of-Mind is picked on the 3D cards, so suppress the 2D overlay
        // and drive a confirm bar instead.
        bool wantBotm = v.Prompt is BotmPromptView;
        if (wantBotm && !_botmMode)
        {
            _botmMode = true;
            _botmPicks.Clear();
            _botmLimit = ((BotmPromptView)v.Prompt!).Limit;
        }
        else if (!wantBotm && _botmMode)
        {
            _botmMode = false;
            _botmPicks.Clear();
        }
        _hud.SuppressBotmOverlay = _botmMode;
        _hud.Refresh(v);
        if (_botmMode) _hud.ShowBotmBar(_botmLimit, _botmPicks.Count, v.Hand.Count, ConfirmBotmPicks);
        else _hud.HideBotmBar();

        _avatar.SetMood(v.StartingPatience <= 0 ? 0 : 1f - (float)v.Patience / v.StartingPatience);
        _avatar.SetLeaning(v.NpcTurnInProgress);
        ApplyFraming(v);

        // Catch-up: the cues already moved these in step with their beats;
        // this just guarantees the final values match the engine exactly.
        _candle.SetRatio(v.StartingPatience <= 0 ? 0 : (float)v.Patience / v.StartingPatience);
        _playerStack.SetCount(v.PlayerPriority);
        _npcStack.SetCount(v.NpcPriority);
        _playerDeckPile.SetState(v.PlayerDeckCount, null);
        _playerDiscardPile.SetState(v.PlayerDiscardCount, v.PlayerDiscardNames.Count > 0 ? v.PlayerDiscardNames[^1] : null);
        _npcDeckPile.SetState(v.NpcDeckCount, null);
        _npcDiscardPile.SetState(v.NpcDiscardCount, v.NpcDiscardNames.Count > 0 ? v.NpcDiscardNames[^1] : null);
        if (_bellLabel != null) _bellLabel.Modulate = _bellLabel.Modulate with { A = v.CanAct ? 1f : 0.25f };

        ReconcileHand(v);
        ReconcileShields(v);
        ReconcileField(v);
        ReconcileGuards(v);
        ReconcileCores(v);
    }

    private void ReconcileHand(CombatView v)
    {
        var seen = new HashSet<string>();
        int n = v.Hand.Count;
        foreach (var cardView in v.Hand)
        {
            seen.Add(cardView.InstanceId);
            if (!_hand.TryGetValue(cardView.InstanceId, out var card))
            {
                card = new Card3D { Zone = "hand", Key = cardView.InstanceId, Position = PlayerDeckExit };
                AddChild(card);
                _hand[cardView.InstanceId] = card;
            }
            card.IndexInZone = cardView.HandIndex;
            card.SetColor(cardView.Color);
            card.SetFace(cardView.Name, cardView.EffectiveCost.ToString(), cardView.EffectText, cardView.DefinitionId);
            var (pos, rot) = _viewMode == ViewMode.HandInspect
                ? InspectSlot(cardView.HandIndex, n)
                : HandSlot(cardView.HandIndex, n);
            // Cards picked for Back of Mind lift out of the fan.
            bool picked = _botmMode && _botmPicks.Contains(cardView.InstanceId);
            if (picked) pos += new Vector3(0, 0.28f, -0.12f);
            card.SetHighlight(picked);
            card.SetRestScale(Vector3.One * HandScale(n));
            card.GlideTo(pos, rot);
        }
        DepartStale(_hand, seen, PlayerDiscardExit);
    }

    /// <summary>
    /// Default fan: low and clear of the bell/table props. With a big hand the
    /// cards overlap, so each one is stepped forward in z — the later card
    /// always draws in front of its neighbour, and hovering lifts it clear
    /// (Ken round 5: crowded hands were unreadable/unclickable).
    /// </summary>
    private static (Vector3, Vector3) HandSlot(int i, int n)
    {
        float spread = Mathf.Min(0.72f, 4.6f / Mathf.Max(n, 1));
        float x = (i - (n - 1) * 0.5f) * spread;
        float depth = i * 0.012f; // consistent overlap order
        return (
            new Vector3(x, 0.98f + Mathf.Abs(x) * -0.03f, 2.62f + Mathf.Abs(x) * 0.05f + depth),
            new Vector3(-42, 0, -x * 3f));
    }

    /// <summary>Shrink cards once the hand gets crowded so more of each shows.</summary>
    private static float HandScale(int n) => n <= 6 ? 1f : Mathf.Max(0.72f, 6f / n);

    /// <summary>Inspect layout: a flat, wide row square to the inspect camera.</summary>
    private static (Vector3, Vector3) InspectSlot(int i, int n)
    {
        float spread = Mathf.Min(1.0f, 6.2f / Mathf.Max(n, 1));
        float x = (i - (n - 1) * 0.5f) * spread;
        return (
            new Vector3(x, 1.32f, 3.05f),
            new Vector3(-24, 0, 0));
    }

    private void ReconcileShields(CombatView v)
    {
        if (_selectedShieldSlot != null && v.PlayerShields.All(s => s.SlotId != _selectedShieldSlot))
            _selectedShieldSlot = null;
        var seen = new HashSet<string>();
        int n = v.PlayerShields.Count;
        foreach (var slot in v.PlayerShields)
        {
            seen.Add(slot.SlotId);
            if (!_shields.TryGetValue(slot.SlotId, out var card))
            {
                card = new Card3D { Zone = "shield", Key = slot.SlotId, Position = TableCenter };
                AddChild(card);
                card.SetRestScale(new Vector3(0.62f, 0.62f, 0.62f));
                _shields[slot.SlotId] = card;
            }
            card.IndexInZone = slot.Index;
            bool isCore = slot.ShieldType == Breakthrough.Engine.ShieldTypes.Core;
            card.SetFace(
                slot.CardName ?? "—",
                isCore ? "CORE" : slot.ShieldType == Breakthrough.Engine.ShieldTypes.Real ? "S" : "PH",
                $"{slot.PatienceCostOnBreak} patience on break");
            float spread = Mathf.Min(0.55f, 6.0f / Mathf.Max(n, 1));
            float x = (slot.Index - (n - 1) * 0.5f) * spread;
            float lift = slot.SlotId == _selectedShieldSlot ? 0.22f : 0f;
            card.GlideTo(new Vector3(x, 0.42f + lift, 1.2f), new Vector3(-62, 0, 0));
        }
        DepartStale(_shields, seen, PlayerDiscardExit);
    }

    private void ReconcileField(CombatView v)
    {
        var seen = new HashSet<string>();
        var npcPerms = v.Field.Where(p => p.OwnerKey == "npc").ToList();
        var playerPerms = v.Field.Where(p => p.OwnerKey == "player").ToList();
        PlaceFieldRow(npcPerms, -0.85f, seen);
        PlaceFieldRow(playerPerms, 0.15f, seen);
        DepartStale(_field, seen, PlayerDiscardExit);
    }

    /// <summary>
    /// Lay a side's permanents out, wrapping onto extra rows once there are
    /// too many to fit across the table (Ken round 5: a crowded board hid
    /// cards behind each other).
    /// </summary>
    private void PlaceFieldRow(List<PermanentView> perms, float z, HashSet<string> seen)
    {
        const int PerRow = 7;
        int n = perms.Count;
        int rows = Mathf.Max(1, (n + PerRow - 1) / PerRow);
        float rowScale = rows > 1 ? 0.58f : 0.7f;
        for (int i = 0; i < n; i++)
        {
            var p = perms[i];
            seen.Add(p.PermanentId);
            if (!_field.TryGetValue(p.PermanentId, out var card))
            {
                card = new Card3D { Zone = "field", Key = p.PermanentId, Position = TableCenter + new Vector3(0, 0.6f, 0) };
                AddChild(card);
                card.SetRestScale(new Vector3(0.7f, 0.7f, 0.7f));
                _field[p.PermanentId] = card;
            }
            string counters = p.Counters.Count == 0
                ? ""
                : string.Join(" ", p.Counters.Select(kv => $"{kv.Key}:{kv.Value}"));
            string sub = p.Kind + (p.TurnsRemaining is int t ? $" · {t}t" : "") +
                (p.Abilities.Count > 0 ? " · click for abilities" : "");
            card.SetColor(_bridge.GetCardInfo(p.DefinitionId)?.Color ?? "Colorless");
            card.SetFace(p.Name, counters, sub, p.DefinitionId);
            // Counter total as a corner badge, readable from table view.
            int counterTotal = p.Counters.Values.Sum();
            card.SetCounterBadge(counterTotal > 0 ? counterTotal.ToString() : "");
            card.SetRestScale(Vector3.One * rowScale);

            int row = i / PerRow;
            int inRow = i % PerRow;
            int rowCount = Mathf.Min(PerRow, n - row * PerRow);
            float spread = Mathf.Min(0.85f, 6.0f / Mathf.Max(rowCount, 1));
            float x = (inRow - (rowCount - 1) * 0.5f) * spread;
            // Extra rows step back toward that side's edge of the table.
            float rowZ = z + row * (z < 0 ? -0.5f : 0.5f);
            card.GlideTo(new Vector3(x, 0.18f, rowZ), new Vector3(-90, 0, 0));
        }
    }

    private void ReconcileGuards(CombatView v)
    {
        // Guards are anonymous & face-down: reconcile by count; leftmost breaks first.
        while (_guards.Count > v.NpcGuardsStanding)
        {
            var broken = _guards[0];
            _guards.RemoveAt(0);
            broken.DepartAndFree(broken.Position + new Vector3(0, 1.4f, 0.5f));
        }
        while (_guards.Count < v.NpcGuardsStanding)
        {
            var card = new Card3D { Zone = "guard", Position = AvatarPos + new Vector3(0, 1.4f, 0.4f) };
            AddChild(card);
            card.SetRestScale(new Vector3(0.55f, 0.55f, 0.55f));
            card.SetMaterials(null, ArtLibrary.Mat("guard_back"));
            card.SetFaceDown(true);
            _guards.Add(card);
        }
        int n = _guards.Count;
        for (int i = 0; i < n; i++)
        {
            float spread = Mathf.Min(0.42f, 5.4f / Mathf.Max(n, 1));
            float x = (i - (n - 1) * 0.5f) * spread;
            _guards[i].GlideTo(new Vector3(x, 0.42f, -1.65f), new Vector3(-62, 180, 0));
        }
    }

    private void ReconcileCores(CombatView v)
    {
        while (_cores.Count < v.NpcCoreShields.Count)
        {
            var card = new Card3D { Zone = "core", Position = AvatarPos + new Vector3(0, 1.8f, 0.2f) };
            AddChild(card);
            card.SetRestScale(new Vector3(0.72f, 0.72f, 0.72f));
            _cores.Add(card);
        }
        int n = v.NpcCoreShields.Count;
        for (int i = 0; i < n; i++)
        {
            var cs = v.NpcCoreShields[i];
            var card = _cores[i];
            card.SetMaterials(null, ArtLibrary.Mat(cs.Broken ? "core_shield_broken" : "core_shield"));
            card.SetFaceDown(true);
            if (!cs.Broken && cs.IsHint) card.SetBackBadge("?");
            else if (cs.Broken) card.SetBackBadge("✔");
            float spread = Mathf.Min(0.9f, 4.5f / Mathf.Max(n, 1));
            float x = (i - (n - 1) * 0.5f) * spread;
            card.GlideTo(
                new Vector3(x, cs.Broken ? 0.25f : 0.75f, -2.35f),
                cs.Broken ? new Vector3(-90, 180, 0) : new Vector3(-75, 180, 0));
        }
    }

    private static void DepartStale(Dictionary<string, Card3D> map, HashSet<string> seen, Vector3 exit)
    {
        foreach (var key in map.Keys.Where(k => !seen.Contains(k)).ToList())
        {
            map[key].DepartAndFree(exit);
            map.Remove(key);
        }
    }

    // ── input ───────────────────────────────────────────────────────────────

    // drag-to-play state: press on a hand card arms a candidate; moving past
    // the threshold turns it into a drag (release = drop), releasing without
    // movement is a plain click (action menu). Mirrors the React UI's 6 px
    // activation constraint.
    private const float DragThresholdPx = 12f;
    private Card3D? _pressCandidate;
    private Vector2 _pressScreen;
    private bool _dragging;

    public override void _UnhandledInput(InputEvent ev)
    {
        switch (ev)
        {
            case InputEventKey { Pressed: true, Echo: false } key:
                switch (key.Keycode)
                {
                    case Key.Tab: CycleView(+1); break;
                    case Key.Right or Key.Down: CycleView(+1); break;
                    case Key.Left or Key.Up: CycleView(-1); break;
                }
                break;
            case InputEventMouseButton { ButtonIndex: MouseButton.WheelDown, Pressed: true }:
                CycleView(+1);
                break;
            case InputEventMouseButton { ButtonIndex: MouseButton.WheelUp, Pressed: true }:
                CycleView(-1);
                break;
            case InputEventMouseMotion motion:
                if (_pressCandidate != null) UpdateDrag(motion.Position);
                else UpdateHover(motion.Position);
                break;
            case InputEventMouseButton { ButtonIndex: MouseButton.Left, Pressed: true } press:
                HandlePress(press.Position);
                break;
            case InputEventMouseButton { ButtonIndex: MouseButton.Left, Pressed: false } release:
                HandleRelease(release.Position);
                break;
        }
    }

    private void UpdateDrag(Vector2 screenPos)
    {
        if (_pressCandidate == null || !IsInstanceValid(_pressCandidate)) { CancelDrag(); return; }
        if (!_dragging)
        {
            if (screenPos.DistanceTo(_pressScreen) < DragThresholdPx) return;
            _dragging = true;
            _hud.HideCardDetail();
            _hovered?.SetHovered(false);
            _hovered = null;
        }
        // Follow the mouse on a lifted table plane.
        var cam = _rig.Camera;
        var from = cam.ProjectRayOrigin(screenPos);
        var dir = cam.ProjectRayNormal(screenPos);
        if (new Plane(Vector3.Up, 1.05f).IntersectsRay(from, dir) is Vector3 point)
        {
            _pressCandidate.Position = point;
            _pressCandidate.RotationDegrees = new Vector3(-55, 0, 0);
        }
    }

    private void CancelDrag()
    {
        _pressCandidate = null;
        _dragging = false;
    }

    private void HandleRelease(Vector2 screenPos)
    {
        var card = _pressCandidate;
        bool wasDragging = _dragging;
        CancelDrag();
        if (card == null || !IsInstanceValid(card)) return;

        if (!wasDragging)
        {
            OnHandCardClicked(card); // plain click → action menu
            return;
        }

        var v = _bridge.View!;
        var cardView = v.Hand.FirstOrDefault(h => h.InstanceId == card.Key);
        if (cardView == null) { ReconcileHand(v); return; }

        // Drop zones by table depth: past the shield row = play; on the
        // shield row band = place as shield; anywhere else = back to hand.
        float z = card.Position.Z;
        if (z < 0.85f)
        {
            if (!_bridge.PlayCardAt(cardView.HandIndex)) ReconcileHand(_bridge.View!);
        }
        else if (z < 1.55f)
        {
            if (!_bridge.PlaceShieldAt(cardView.HandIndex)) ReconcileHand(_bridge.View!);
        }
        else
        {
            ReconcileHand(v); // glide back to the fan
        }
    }

    private GodotObject? PickAt(Vector2 screenPos)
    {
        var cam = _rig.Camera;
        var from = cam.ProjectRayOrigin(screenPos);
        var to = from + cam.ProjectRayNormal(screenPos) * 60f;
        var query = PhysicsRayQueryParameters3D.Create(from, to);
        query.CollideWithAreas = true;
        query.CollideWithBodies = false;
        var hit = GetWorld3D().DirectSpaceState.IntersectRay(query);
        return hit.Count > 0 ? hit["collider"].AsGodotObject() : null;
    }

    private Card3D? CardFromCollider(GodotObject? collider) =>
        collider is Area3D area && area.HasMeta("card3d")
            ? GetNodeOrNull<Card3D>(area.GetMeta("card3d").AsNodePath())
            : null;

    private static string? PileIdFromCollider(GodotObject? collider) =>
        collider is Area3D area && area.HasMeta("pile") ? area.GetMeta("pile").AsString() : null;

    private void UpdateHover(Vector2 screenPos)
    {
        var collider = PickAt(screenPos);

        if (PileIdFromCollider(collider) is string pileId)
        {
            _hovered?.SetHovered(false);
            _hovered = null;
            ShowPileDetail(pileId);
            return;
        }

        var card = CardFromCollider(collider);
        if (card != null && card.Zone is not ("hand" or "shield" or "field" or "guard" or "core")) card = null;
        if (ReferenceEquals(card, _hovered)) return;
        _hovered?.SetHovered(false);
        _hovered = card;
        if (card != null && card.Zone is "hand" or "shield" or "field") card.SetHovered(true);
        RefreshDetailPanel(card);
    }

    private void ShowPileDetail(string pileId)
    {
        var v = _bridge.View;
        if (v == null) return;
        switch (pileId)
        {
            case "player-deck":
                _hud.ShowCardDetail("Your deck", $"{v.PlayerDeckCount} card(s) remaining",
                    "Click to see what's left. The draw order stays hidden.");
                break;
            case "player-discard":
                _hud.ShowCardDetail("Your discard pile", $"{v.PlayerDiscardCount} card(s)",
                    (v.PlayerDiscardNames.Count > 0 ? $"Top: {v.PlayerDiscardNames[^1]}. " : "") + "Click to browse.");
                break;
            case "npc-deck":
                _hud.ShowCardDetail("Their deck", $"{v.NpcDeckCount} card(s)", "Contents hidden.");
                break;
            case "npc-discard":
                _hud.ShowCardDetail("Their discard pile", $"{v.NpcDiscardCount} card(s)",
                    (v.NpcDiscardNames.Count > 0 ? $"Top: {v.NpcDiscardNames[^1]}. " : "") + "Click to browse.");
                break;
        }
    }

    /// <summary>Full rules text for whatever the cursor is over (no 3D tooltips).</summary>
    private void RefreshDetailPanel(Card3D? card)
    {
        var v = _bridge.View;
        if (card == null || v == null)
        {
            _hud.HideCardDetail();
            return;
        }
        switch (card.Zone)
        {
            case "hand":
                var h = v.Hand.FirstOrDefault(c => c.InstanceId == card.Key);
                if (h == null) break;
                _hud.ShowCardDetail(h.Name,
                    $"Cost {h.EffectiveCost} · {h.Color} {h.Supertype}" +
                    (h.HasHeavyHand ? " · Heavy Hand available" : "") +
                    (h.IsAssembled ? " · assembled" : ""),
                    h.EffectText);
                return;
            case "field":
                var p = v.Field.FirstOrDefault(f => f.PermanentId == card.Key);
                if (p == null) break;
                string counters = p.Counters.Count == 0
                    ? ""
                    : "\nCounters: " + string.Join(", ", p.Counters.Select(kv => $"{kv.Key} {kv.Value}"));
                string abilities = p.Abilities.Count == 0
                    ? ""
                    : "\n" + string.Join("\n", p.Abilities.Select(a => $"Ability: {a.Name} ({a.CostText})"));
                _hud.ShowCardDetail(p.Name,
                    $"{p.Kind} · {p.OwnerKey}" + (p.TurnsRemaining is int t ? $" · {t} turn(s) left" : ""),
                    p.EffectText + counters + abilities);
                return;
            case "shield":
                var s = v.PlayerShields.FirstOrDefault(x => x.SlotId == card.Key);
                if (s == null) break;
                _hud.ShowCardDetail(s.CardName ?? "Placeholder Shield", $"{s.ShieldType} shield",
                    $"Breaks for {s.PatienceCostOnBreak} patience. Leftmost shield breaks first — click two shields to swap order.");
                return;
            case "guard":
                _hud.ShowCardDetail("Guard Shield", "face-down",
                    "Generic break effects hit Guard Shields first; leftmost breaks first. Some guards carry a card with a Shield Trigger.");
                return;
            case "core":
                _hud.ShowCardDetail("Core Shield", "the real defenses",
                    "Breaks only when its key Info Nuggets are played while no Guards stand. Broken cores reveal lore — '?' marks a hint.");
                return;
        }
        _hud.HideCardDetail();
    }

    private void HandlePress(Vector2 screenPos)
    {
        // While the opponent is acting, a click anywhere acknowledges the
        // current play and advances one step — but only once the previous
        // step has finished animating, so clicks can't outrun the timeline.
        if (_bridge.View is { NpcTurnInProgress: true } && !_bridge.AutoAdvanceNpc
            && !_hud.IsModalOpen && !Presenting)
        {
            _bridge.ManualNpcStep();
            return;
        }

        var collider = PickAt(screenPos);
        if (collider is Area3D bellArea && bellArea.HasMeta("bell"))
        {
            if (_bridge.View is { CanAct: true }) _bridge.EndPlayerTurn();
            else _hud.Toast("You can't end the turn right now.");
            return;
        }
        if (PileIdFromCollider(collider) is string pileId)
        {
            var v = _bridge.View!;
            switch (pileId)
            {
                case "player-discard":
                case "npc-discard":
                    _hud.TogglePileBrowser(pileId);
                    break;
                case "player-deck":
                    // What's left, sorted — never the draw order.
                    _hud.ShowDeckBrowser($"Your deck — {v.PlayerDeckCount} card(s) remaining (order hidden)",
                        v.PlayerDeckNamesSorted, v.PlayerDeckDefIdsSorted);
                    break;
                case "npc-deck":
                    _hud.Toast($"Their deck: {v.NpcDeckCount} card(s) — contents hidden.");
                    break;
            }
            return;
        }
        var card = CardFromCollider(collider);
        if (card == null) return;
        switch (card.Zone)
        {
            case "hand":
                // Arm drag-to-play; a motionless release opens the menu instead.
                if (_bridge.View is { CanPlay: true })
                {
                    _pressCandidate = card;
                    _pressScreen = screenPos;
                }
                else
                {
                    OnHandCardClicked(card); // surfaces the can't-play toast
                }
                break;
            case "shield": OnShieldClicked(card); break;
            case "field": OnFieldClicked(card); break;
        }
    }

    private void ConfirmBotmPicks()
    {
        var v = _bridge.View!;
        var indices = v.Hand.Where(h => _botmPicks.Contains(h.InstanceId))
            .Select(h => h.HandIndex).OrderBy(i => i).ToList();
        _bridge.ConfirmBotm(indices);
    }

    /// <summary>Toggle a Back-of-Mind pick on the 3D card itself.</summary>
    private void ToggleBotmPick(Card3D card)
    {
        var v = _bridge.View!;
        if (!_botmPicks.Remove(card.Key))
        {
            if (_botmPicks.Count >= _botmLimit)
            {
                _hud.Toast($"You can only keep {_botmLimit} card(s).");
                return;
            }
            _botmPicks.Add(card.Key);
        }
        _hud.ShowBotmBar(_botmLimit, _botmPicks.Count, v.Hand.Count, ConfirmBotmPicks);
        ReconcileHand(v);
    }

    private void OnHandCardClicked(Card3D card)
    {
        var v = _bridge.View!;
        if (_botmMode) { ToggleBotmPick(card); return; }
        if (!v.CanPlay)
        {
            _hud.Toast(v.NpcTurnInProgress ? "It's their turn." : "You can't play right now.");
            return;
        }
        var cardView = v.Hand.FirstOrDefault(h => h.InstanceId == card.Key);
        if (cardView == null) return;
        _menuHandIndex = cardView.HandIndex;
        _cardMenu.Clear();
        _cardMenu.AddItem($"Play — {cardView.EffectiveCost} Priority", 0);
        if (cardView.HasHeavyHand)
            _cardMenu.AddItem($"Play with Heavy Hand — {cardView.EffectiveCost * 2} Priority", 1);
        _cardMenu.AddItem($"Place as Shield — {v.RealShieldPlacementCost} Priority", 2);
        _cardMenu.Position = (Vector2I)GetViewport().GetMousePosition();
        _cardMenu.Popup();
    }

    private void OnCardMenuPressed(long id)
    {
        int idx = _menuHandIndex;
        _menuHandIndex = -1;
        switch (id)
        {
            case 0: _bridge.PlayCardAt(idx); break;
            case 1: _bridge.PlayCardAt(idx, heavyHand: true); break;
            case 2: _bridge.PlaceShieldAt(idx); break;
        }
    }

    private void OnShieldClicked(Card3D card)
    {
        var v = _bridge.View!;
        if (!v.CanAct)
        {
            _hud.Toast("You can't resequence shields right now.");
            return;
        }
        if (_selectedShieldSlot == null)
        {
            _selectedShieldSlot = card.Key;
        }
        else if (_selectedShieldSlot == card.Key)
        {
            _selectedShieldSlot = null;
        }
        else
        {
            int from = v.PlayerShields.First(s => s.SlotId == _selectedShieldSlot).Index;
            int to = card.IndexInZone;
            var order = Enumerable.Range(0, v.PlayerShields.Count).ToList();
            int moved = order[from];
            order.RemoveAt(from);
            order.Insert(to, moved);
            _selectedShieldSlot = null;
            _bridge.ResequenceShieldOrder(order);
            return;
        }
        ReconcileShields(v); // re-apply lift highlight
    }

    private void OnFieldClicked(Card3D card)
    {
        var v = _bridge.View!;
        var perm = v.Field.FirstOrDefault(p => p.PermanentId == card.Key);
        if (perm == null || perm.Abilities.Count == 0) return;
        if (!v.CanAct)
        {
            _hud.Toast("Abilities can only be activated on your turn.");
            return;
        }
        _menuPermanentId = perm.PermanentId;
        _menuAbilities = perm.Abilities;
        _abilityMenu.Clear();
        for (int i = 0; i < perm.Abilities.Count; i++)
            _abilityMenu.AddItem($"{perm.Abilities[i].Name} ({perm.Abilities[i].CostText})", i);
        _abilityMenu.Position = (Vector2I)GetViewport().GetMousePosition();
        _abilityMenu.Popup();
    }

    private void OnAbilityMenuPressed(long id)
    {
        var ability = _menuAbilities[(int)id];
        string permId = _menuPermanentId;
        if (ability.DiscardCardsRequired <= 0)
        {
            _bridge.ActivateAbilityOn(permId, ability.Id);
            return;
        }
        _hud.ShowDiscardPicker(ability.Name, ability.DiscardCardsRequired, _bridge.View!.Hand,
            picks => _bridge.ActivateAbilityOn(permId, ability.Id, picks));
    }
}
