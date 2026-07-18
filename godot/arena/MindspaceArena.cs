// The Mindspace — step-3 3D combat presentation over the CombatBridge seam.
// Inscryption-style framing: you sit at a table across from the opponent's
// avatar inside their mindspace. All visuals are ArtLibrary slots
// (procedural placeholders until an artist drops real assets in).
//
// Responsibilities:
//  - build the world (dome, table, lights, avatar, bell, camera rig)
//  - reconcile CombatView → persistent Card3D nodes (keyed by instance /
//    slot / permanent id) with glide/depart tweens
//  - hand AnimationDirector the NewLog delta each view for one-shot cues
//  - mouse-ray picking: hand card menus, shield swap, ability menus, the bell
//  - camera framing + avatar mood per view
//
// The bridge/seam is NOT modified by this layer (one additive exception made
// in step 3: LogView now carries the engine's structured Data payload).

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
    private PopupMenu _cardMenu = null!, _abilityMenu = null!;

    private readonly Dictionary<string, Card3D> _hand = new();
    private readonly Dictionary<string, Card3D> _shields = new();
    private readonly Dictionary<string, Card3D> _field = new();
    private readonly List<Card3D> _guards = [];
    private readonly List<Card3D> _cores = [];

    private Card3D? _hovered;
    private string? _selectedShieldSlot;
    private int _menuHandIndex = -1;
    private string _menuPermanentId = "";
    private IReadOnlyList<AbilityView> _menuAbilities = [];

    // anchors
    private static readonly Vector3 AvatarPos = new(0, 0, -3.4f);
    private static readonly Vector3 TableCenter = new(0, 0.3f, 0.2f);
    private static readonly Vector3 PlayerDeckExit = new(3.3f, 0.6f, 2.3f);
    private static readonly Vector3 PlayerDiscardExit = new(-3.3f, 0.6f, 2.3f);
    private static readonly Vector3 NpcDiscardExit = new(-3.0f, 0.7f, -2.5f);

    public override void _Ready()
    {
        _bridge = new CombatBridge { Name = "CombatBridge" };
        AddChild(_bridge);

        BuildWorld();

        _hud = new ArenaHud();
        _hud.Init(_bridge);
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
        _bell.Position = new Vector3(2.5f, 0.0f, 1.7f);
        AddChild(_bell);

        _director = new AnimationDirector();
        AddChild(_director);
        _director.Init(_avatar, _rig,
            avatarAnchor: AvatarPos + new Vector3(0, 2.0f, 0.6f),
            playerShieldAnchor: new Vector3(0, 1.0f, 0.9f),
            guardAnchor: new Vector3(0, 1.1f, -1.65f),
            tableCenter: TableCenter,
            npcDiscardExit: NpcDiscardExit);
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
        var area = new Area3D { Monitoring = false };
        var shape = new CollisionShape3D { Shape = new CylinderShape3D { Radius = 0.34f, Height = 0.4f } };
        area.AddChild(shape);
        area.Position = new Vector3(0, 0.2f, 0);
        area.SetMeta("bell", true);
        bell.AddChild(area);
        return bell;
    }

    // ── view reconciliation ─────────────────────────────────────────────────

    private void OnViewChanged(CombatView v)
    {
        _hud.Refresh(v);
        _director.Play(v.NewLog);

        _avatar.SetMood(v.StartingPatience <= 0 ? 0 : 1f - (float)v.Patience / v.StartingPatience);
        _avatar.SetLeaning(v.NpcTurnInProgress);
        _rig.SetFraming(
            v.Result != null ? CameraRig.Framing.Result :
            v.NpcTurnInProgress ? CameraRig.Framing.NpcTurn : CameraRig.Framing.PlayerTurn);

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
            card.SetFace(cardView.Name, cardView.EffectiveCost.ToString(), cardView.EffectText);
            var (pos, rot) = HandSlot(cardView.HandIndex, n);
            card.GlideTo(pos, rot);
        }
        DepartStale(_hand, seen, PlayerDiscardExit);
    }

    private static (Vector3, Vector3) HandSlot(int i, int n)
    {
        float spread = Mathf.Min(0.78f, 4.8f / Mathf.Max(n, 1));
        float x = (i - (n - 1) * 0.5f) * spread;
        return (
            new Vector3(x, 1.28f + Mathf.Abs(x) * -0.03f, 2.75f + Mathf.Abs(x) * 0.05f),
            new Vector3(-38, 0, -x * 4f));
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
            card.GlideTo(new Vector3(x, 0.42f + lift, 1.05f), new Vector3(-62, 0, 0));
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

    private void PlaceFieldRow(List<PermanentView> perms, float z, HashSet<string> seen)
    {
        int n = perms.Count;
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
            card.SetFace(p.Name, counters, sub);
            float spread = Mathf.Min(0.85f, 6.0f / Mathf.Max(n, 1));
            float x = (i - (n - 1) * 0.5f) * spread;
            card.GlideTo(new Vector3(x, 0.18f, z), new Vector3(-90, 0, 0));
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

    // ── input: mouse-ray picking ────────────────────────────────────────────

    public override void _UnhandledInput(InputEvent ev)
    {
        switch (ev)
        {
            case InputEventMouseMotion motion:
                UpdateHover(motion.Position);
                break;
            case InputEventMouseButton { ButtonIndex: MouseButton.Left, Pressed: true } click:
                HandleClick(click.Position);
                break;
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

    private void UpdateHover(Vector2 screenPos)
    {
        var card = CardFromCollider(PickAt(screenPos));
        if (card != null && card.Zone is not ("hand" or "shield" or "field")) card = null;
        if (ReferenceEquals(card, _hovered)) return;
        _hovered?.SetHovered(false);
        _hovered = card;
        _hovered?.SetHovered(true);
    }

    private void HandleClick(Vector2 screenPos)
    {
        var collider = PickAt(screenPos);
        if (collider is Area3D bellArea && bellArea.HasMeta("bell"))
        {
            if (_bridge.View is { CanAct: true }) _bridge.EndPlayerTurn();
            else _hud.Toast("You can't end the turn right now.");
            return;
        }
        var card = CardFromCollider(collider);
        if (card == null) return;
        switch (card.Zone)
        {
            case "hand": OnHandCardClicked(card); break;
            case "shield": OnShieldClicked(card); break;
            case "field": OnFieldClicked(card); break;
        }
    }

    private void OnHandCardClicked(Card3D card)
    {
        var v = _bridge.View!;
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
