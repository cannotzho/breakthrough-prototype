// Placeholder combat screen (post-port step 2). Deliberately ugly: flat
// colored rects, default theme, no art, no shaders — this validates the
// interaction loop through CombatBridge, nothing else. Step 3 replaces this
// scene wholesale; it must need nothing from the engine beyond the bridge.
//
// Rendering policy: dynamic zones (hand, shields, field, meters) are fully
// rebuilt on every ViewChanged — fine for a placeholder with no animation.
// The log panel is the exception: it APPENDS View.NewLog entries, which
// doubles as a live demonstration of the event-delta half of the seam.

using System.Collections.Generic;
using System.Linq;
using Godot;

namespace Breakthrough.GodotHost;

public partial class CombatScreen : Control
{
    private CombatBridge _bridge = null!;

    // static chrome (built once)
    private Label _title = null!, _phase = null!, _patience = null!, _lies = null!;
    private Label _npcStats = null!, _npcHandRevealed = null!;
    private Label _priority = null!, _playerStats = null!, _botmLabel = null!, _toast = null!;
    private HBoxContainer _coreRow = null!, _guardRow = null!, _shieldRow = null!, _handRow = null!;
    private HFlowContainer _fieldRow = null!;
    private RichTextLabel _log = null!;
    private ScrollContainer _logScroll = null!;
    private Button _endTurn = null!, _npcStep = null!;
    private CheckBox _autoNpc = null!;
    private Control _promptLayer = null!;
    private PanelContainer _promptPanel = null!;
    private PopupMenu _cardMenu = null!;

    private int _menuHandIndex = -1;
    private int _selectedShield = -1;
    private bool _handPickerOpen;

    private static readonly Color BgColor = new("1a1a22");
    private static readonly Color PanelColor = new("26262f");

    public override void _Ready()
    {
        _bridge = new CombatBridge { Name = "CombatBridge" };
        AddChild(_bridge);

        BuildChrome();

        _bridge.StartEncounter(LaunchConfig.EncounterId, LaunchConfig.DeckName, LaunchConfig.Seed);
        _bridge.Session!.ViewChanged += OnViewChanged;
        OnViewChanged(_bridge.View!);
    }

    // ── static layout ───────────────────────────────────────────────────────

    private void BuildChrome()
    {
        SetAnchorsPreset(LayoutPreset.FullRect);

        var bg = new ColorRect { Color = BgColor };
        bg.SetAnchorsPreset(LayoutPreset.FullRect);
        AddChild(bg);

        var root = new HBoxContainer();
        root.SetAnchorsPreset(LayoutPreset.FullRect);
        root.OffsetLeft = 10; root.OffsetTop = 8; root.OffsetRight = -10; root.OffsetBottom = -8;
        root.AddThemeConstantOverride("separation", 10);
        AddChild(root);

        var game = new VBoxContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        game.AddThemeConstantOverride("separation", 6);
        root.AddChild(game);

        // top bar
        var top = new HBoxContainer();
        top.AddThemeConstantOverride("separation", 16);
        game.AddChild(top);
        _title = AddLabel(top, "", 16);
        _phase = AddLabel(top, "", 13);
        _patience = AddLabel(top, "", 15);
        _patience.AddThemeColorOverride("font_color", new Color("e0b04a"));
        _lies = AddLabel(top, "", 13);
        top.AddChild(new Control { SizeFlagsHorizontal = SizeFlags.ExpandFill });
        _npcStats = AddLabel(top, "", 13);

        _npcHandRevealed = AddLabel(game, "", 11);
        _npcHandRevealed.AddThemeColorOverride("font_color", new Color("9ad1ff"));

        // NPC zone
        _coreRow = new HBoxContainer();
        _coreRow.AddThemeConstantOverride("separation", 6);
        game.AddChild(WrapZone("NPC Core Shields", _coreRow));
        _guardRow = new HBoxContainer();
        _guardRow.AddThemeConstantOverride("separation", 3);
        game.AddChild(WrapZone("NPC Guard Shields (face-down)", _guardRow));

        // field
        _fieldRow = new HFlowContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        _fieldRow.AddThemeConstantOverride("h_separation", 6);
        _fieldRow.AddThemeConstantOverride("v_separation", 6);
        var fieldScroll = new ScrollContainer
        {
            SizeFlagsVertical = SizeFlags.ExpandFill,
            HorizontalScrollMode = ScrollContainer.ScrollMode.Disabled,
        };
        fieldScroll.AddChild(_fieldRow);
        game.AddChild(WrapZone("Field (impressions / tokens / traps)", fieldScroll, expand: true));

        // player shields
        _shieldRow = new HBoxContainer();
        _shieldRow.AddThemeConstantOverride("separation", 3);
        game.AddChild(WrapZone("Your Shields (click two to swap order — leftmost breaks first)", _shieldRow));

        _botmLabel = AddLabel(game, "", 11);

        // hand
        _handRow = new HBoxContainer();
        _handRow.AddThemeConstantOverride("separation", 6);
        var handScroll = new ScrollContainer
        {
            CustomMinimumSize = new Vector2(0, 170),
            VerticalScrollMode = ScrollContainer.ScrollMode.Disabled,
        };
        handScroll.AddChild(_handRow);
        game.AddChild(WrapZone("Hand (click a card for actions)", handScroll));

        // bottom bar
        var bottom = new HBoxContainer();
        bottom.AddThemeConstantOverride("separation", 14);
        game.AddChild(bottom);
        _priority = AddLabel(bottom, "", 20);
        _priority.AddThemeColorOverride("font_color", new Color("6ad46a"));
        _playerStats = AddLabel(bottom, "", 13);
        _endTurn = new Button { Text = "End Turn" };
        _endTurn.Pressed += () => _bridge.EndPlayerTurn();
        bottom.AddChild(_endTurn);
        _npcStep = new Button { Text = "Step NPC" };
        _npcStep.Pressed += () => _bridge.ManualNpcStep();
        bottom.AddChild(_npcStep);
        _autoNpc = new CheckBox { Text = "Auto NPC", ButtonPressed = true };
        _autoNpc.Toggled += on => _bridge.AutoAdvanceNpc = on;
        bottom.AddChild(_autoNpc);
        bottom.AddChild(new Control { SizeFlagsHorizontal = SizeFlags.ExpandFill });
        _toast = AddLabel(bottom, "", 12);
        _toast.AddThemeColorOverride("font_color", new Color("ff7a6a"));

        // log panel
        var logCol = new VBoxContainer { CustomMinimumSize = new Vector2(300, 0) };
        root.AddChild(logCol);
        AddLabel(logCol, "Engine log", 13);
        _logScroll = new ScrollContainer { SizeFlagsVertical = SizeFlags.ExpandFill };
        _log = new RichTextLabel
        {
            BbcodeEnabled = true,
            FitContent = true,
            SizeFlagsHorizontal = SizeFlags.ExpandFill,
            CustomMinimumSize = new Vector2(290, 0),
        };
        _log.AddThemeFontSizeOverride("normal_font_size", 11);
        _logScroll.AddChild(_log);
        logCol.AddChild(_logScroll);

        // card action menu
        _cardMenu = new PopupMenu();
        _cardMenu.IdPressed += OnCardMenuPressed;
        AddChild(_cardMenu);

        // prompt layer
        _promptLayer = new Control { Visible = false };
        _promptLayer.SetAnchorsPreset(LayoutPreset.FullRect);
        var dim = new ColorRect { Color = new Color(0, 0, 0, 0.65f) };
        dim.SetAnchorsPreset(LayoutPreset.FullRect);
        _promptLayer.AddChild(dim);
        _promptPanel = new PanelContainer();
        _promptPanel.SetAnchorsPreset(LayoutPreset.Center);
        _promptLayer.AddChild(_promptPanel);
        AddChild(_promptLayer);
    }

    private static Label AddLabel(Container parent, string text, int size)
    {
        var l = new Label { Text = text };
        l.AddThemeFontSizeOverride("font_size", size);
        parent.AddChild(l);
        return l;
    }

    private static VBoxContainer WrapZone(string caption, Control content, bool expand = false)
    {
        var box = new VBoxContainer();
        if (expand) box.SizeFlagsVertical = SizeFlags.ExpandFill;
        var cap = new Label { Text = caption };
        cap.AddThemeFontSizeOverride("font_size", 10);
        cap.AddThemeColorOverride("font_color", new Color("8a8a99"));
        box.AddChild(cap);
        box.AddChild(content);
        return box;
    }

    // ── per-view rebuild ────────────────────────────────────────────────────

    private void OnViewChanged(CombatView v)
    {
        _title.Text = v.EncounterName;
        _phase.Text = $"Round {v.Round} · {v.Phase} · {v.ActiveTurnKey} turn";
        _patience.Text = $"Patience {v.Patience}/{v.StartingPatience}";
        _lies.Text = v.LieThreshold is int lt ? $"Lies {v.LieCounter}/{lt}" : $"Lies {v.LieCounter}";
        _npcStats.Text = $"NPC — priority {v.NpcPriority} · hand {v.NpcHandCount} · deck {v.NpcDeckCount} · discard {v.NpcDiscardCount}";
        _npcHandRevealed.Text = v.NpcHandNames == null ? "" : "NPC hand revealed: " + string.Join(", ", v.NpcHandNames);
        _npcHandRevealed.Visible = v.NpcHandNames != null;

        _priority.Text = $"Priority {v.PlayerPriority}/{v.MaxPriority}";
        _playerStats.Text =
            (v.PlayerIncomingDebt > 0 ? $"debt owed to you {v.PlayerIncomingDebt} · " : "") +
            $"deck {v.PlayerDeckCount} · discard {v.PlayerDiscardCount}";
        _botmLabel.Text = v.BackOfMindNames.Count == 0
            ? $"Back of Mind: empty · limit {v.BotmLimit}"
            : $"Back of Mind ({v.BackOfMindNames.Count}/{v.BotmLimit}): {string.Join(", ", v.BackOfMindNames)}";

        _endTurn.Disabled = !v.CanAct;
        _npcStep.Disabled = !v.NpcTurnInProgress || _bridge.AutoAdvanceNpc;
        _toast.Text = _bridge.LastError ?? "";

        RebuildCoreShields(v);
        RebuildGuards(v);
        RebuildField(v);
        RebuildShields(v);
        RebuildHand(v);
        AppendLog(v.NewLog);
        RebuildPrompt(v);
    }

    private void RebuildCoreShields(CombatView v)
    {
        ClearChildren(_coreRow);
        foreach (var cs in v.NpcCoreShields)
        {
            var rect = new ColorRect
            {
                CustomMinimumSize = new Vector2(44, 60),
                Color = cs.Broken ? new Color("2e4a2e") : new Color("5a2e6e"),
                TooltipText = cs.Broken ? "Core Shield — broken" :
                    cs.IsHint ? "Core Shield (carries a hint) — needs its key nuggets while no Guards stand"
                              : "Core Shield — needs its key nuggets while no Guards stand",
            };
            var mark = new Label { Text = cs.Broken ? "✔" : cs.IsHint ? "?" : "■" };
            mark.SetAnchorsPreset(LayoutPreset.Center);
            rect.AddChild(mark);
            _coreRow.AddChild(rect);
        }
    }

    private void RebuildGuards(CombatView v)
    {
        ClearChildren(_guardRow);
        for (int i = 0; i < v.NpcGuardsStanding; i++)
        {
            _guardRow.AddChild(new ColorRect
            {
                CustomMinimumSize = new Vector2(24, 34),
                Color = new Color("6e3a2e"),
                TooltipText = "Guard Shield (face-down) — generic breaks hit these first; leftmost breaks first",
            });
        }
        if (v.NpcGuardsStanding == 0)
            AddLabel(_guardRow, "none standing — core shields exposed", 11);
    }

    private void RebuildField(CombatView v)
    {
        ClearChildren(_fieldRow);
        foreach (var p in v.Field)
        {
            var panel = new PanelContainer { CustomMinimumSize = new Vector2(150, 0) };
            var box = new VBoxContainer();
            panel.AddChild(box);
            var name = AddLabel(box, $"{p.Name}", 12);
            name.AddThemeColorOverride("font_color",
                p.OwnerKey == "player" ? new Color("7ab4e8") : new Color("e89a7a"));
            AddLabel(box, $"{p.Kind} · {p.OwnerKey}" +
                (p.TurnsRemaining is int t ? $" · {t} turn{(t == 1 ? "" : "s")} left" : ""), 10);
            if (p.Counters.Count > 0)
                AddLabel(box, string.Join("  ", p.Counters.Select(kv => $"{kv.Key}:{kv.Value}")), 11);
            if (p.EffectText.Length > 0)
            {
                var txt = AddLabel(box, Truncate(p.EffectText, 90), 10);
                txt.AutowrapMode = TextServer.AutowrapMode.WordSmart;
                txt.CustomMinimumSize = new Vector2(140, 0);
                txt.TooltipText = p.EffectText;
            }
            foreach (var ab in p.Abilities)
            {
                var btn = new Button { Text = $"{ab.Name} ({ab.CostText})", Disabled = !v.CanAct };
                string permId = p.PermanentId;
                var ability = ab;
                btn.Pressed += () => OnAbilityPressed(permId, ability);
                box.AddChild(btn);
            }
            _fieldRow.AddChild(panel);
        }
        if (v.Field.Count == 0) AddLabel(_fieldRow, "(empty)", 11);
    }

    private void RebuildShields(CombatView v)
    {
        if (_selectedShield >= v.PlayerShields.Count) _selectedShield = -1;
        ClearChildren(_shieldRow);
        foreach (var slot in v.PlayerShields)
        {
            var btn = new Button
            {
                CustomMinimumSize = new Vector2(64, 40),
                Text = slot.ShieldType switch
                {
                    Breakthrough.Engine.ShieldTypes.Placeholder => "PH",
                    Breakthrough.Engine.ShieldTypes.Core => $"CORE\n{Truncate(slot.CardName ?? "", 8)}",
                    _ => $"S\n{Truncate(slot.CardName ?? "", 8)}",
                },
                TooltipText = $"{slot.ShieldType} shield" +
                    (slot.CardName != null ? $" — {slot.CardName}" : "") +
                    $" · {slot.PatienceCostOnBreak} patience on break",
                Disabled = !v.CanAct,
            };
            if (slot.Index == _selectedShield) btn.Modulate = new Color("ffe08a");
            int idx = slot.Index;
            btn.Pressed += () => OnShieldClicked(idx);
            _shieldRow.AddChild(btn);
        }
        if (v.PlayerShields.Count == 0) AddLabel(_shieldRow, "no shields — next hit is lethal (§3.5)", 11);
    }

    private void RebuildHand(CombatView v)
    {
        ClearChildren(_handRow);
        foreach (var card in v.Hand)
        {
            var btn = new Button
            {
                CustomMinimumSize = new Vector2(126, 150),
                Text = $"{card.Name}\n[{card.EffectiveCost}] {card.Supertype}" +
                       (card.IsAssembled ? " ✦" : "") +
                       "\n" + Truncate(card.EffectText, 60),
                TooltipText = $"{card.Name} — cost {card.EffectiveCost} ({card.Color} {card.Supertype})\n{card.EffectText}",
                ClipText = true,
                Disabled = !v.CanPlay,
            };
            btn.Modulate = CardTint(card.Color);
            int idx = card.HandIndex;
            btn.Pressed += () => OpenCardMenu(idx);
            _handRow.AddChild(btn);
        }
        if (v.Hand.Count == 0) AddLabel(_handRow, "(empty hand)", 11);
    }

    private void AppendLog(IReadOnlyList<LogView> entries)
    {
        foreach (var e in entries)
        {
            string color = e.Type switch
            {
                "error" => "ff5a4a",
                "illegal-action" => "ffb04a",
                _ => "9a9aa8",
            };
            _log.AppendText($"[color=#{color}]{e.Seq}. {Escape(e.Message)}[/color]\n");
        }
        if (entries.Count > 0)
            Callable.From(() => _logScroll.ScrollVertical = (int)_logScroll.GetVScrollBar().MaxValue)
                .CallDeferred();
    }

    // ── hand card actions ───────────────────────────────────────────────────

    private void OpenCardMenu(int handIndex)
    {
        var v = _bridge.View!;
        if (!v.CanPlay || handIndex >= v.Hand.Count) return;
        var card = v.Hand[handIndex];
        _menuHandIndex = handIndex;
        _cardMenu.Clear();
        _cardMenu.AddItem($"Play — {card.EffectiveCost} Priority", 0);
        if (card.HasHeavyHand)
            _cardMenu.AddItem($"Play with Heavy Hand — {card.EffectiveCost * 2} Priority", 1);
        _cardMenu.AddItem($"Place as Shield — {v.RealShieldPlacementCost} Priority", 2);
        _cardMenu.Position = (Vector2I)GetGlobalMousePosition();
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

    // ── shield resequencing (two clicks = move) ─────────────────────────────

    private void OnShieldClicked(int index)
    {
        var v = _bridge.View!;
        if (_selectedShield < 0)
        {
            _selectedShield = index;
        }
        else if (_selectedShield == index)
        {
            _selectedShield = -1;
        }
        else
        {
            var order = Enumerable.Range(0, v.PlayerShields.Count).ToList();
            int moved = order[_selectedShield];
            order.RemoveAt(_selectedShield);
            order.Insert(index, moved);
            _selectedShield = -1;
            _bridge.ResequenceShieldOrder(order);
            return; // dispatch already re-rendered
        }
        RebuildShields(v);
    }

    // ── abilities ───────────────────────────────────────────────────────────

    private void OnAbilityPressed(string permanentId, AbilityView ability)
    {
        if (ability.DiscardCardsRequired <= 0)
        {
            _bridge.ActivateAbilityOn(permanentId, ability.Id);
            return;
        }
        // Cost includes chosen discards: pick exactly N hand cards first.
        ShowHandPicker(
            $"{ability.Name}: choose {ability.DiscardCardsRequired} card(s) to discard",
            exactCount: ability.DiscardCardsRequired,
            maxCount: ability.DiscardCardsRequired,
            onConfirm: picks => _bridge.ActivateAbilityOn(permanentId, ability.Id, picks));
    }

    // ── prompt overlays ─────────────────────────────────────────────────────

    private void RebuildPrompt(CombatView v)
    {
        // A hand-picker built by ShowHandPicker manages its own lifetime.
        if (_promptLayer.Visible && _handPickerOpen) return;

        if (v.Result != null) { ShowResult(v.Result); return; }
        switch (v.Prompt)
        {
            case RevealPromptView r: ShowReveal(r); break;
            case ChooseNumberPromptView c: ShowChooseNumber(c); break;
            case DeckRevealPromptView d: ShowDeckReveal(d); break;
            case BotmPromptView b: ShowBotm(b); break;
            default: HidePrompt(); break;
        }
    }

    private VBoxContainer OpenPromptBox(string title)
    {
        _handPickerOpen = false;
        ClearChildren(_promptPanel);
        var box = new VBoxContainer { CustomMinimumSize = new Vector2(420, 0) };
        box.AddThemeConstantOverride("separation", 10);
        _promptPanel.AddChild(box);
        var t = AddLabel(box, title, 16);
        t.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        _promptLayer.Visible = true;
        return box;
    }

    private void HidePrompt()
    {
        _promptLayer.Visible = false;
        _handPickerOpen = false;
    }

    private void ShowReveal(RevealPromptView r)
    {
        var box = OpenPromptBox(r.IsHint ? "Core Shield broken — hint revealed" : "Core Shield broken");
        var lore = AddLabel(box, r.Lore, 13);
        lore.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        lore.CustomMinimumSize = new Vector2(400, 0);
        if (r.HintText != null)
        {
            var hint = AddLabel(box, "Hint: " + r.HintText, 12);
            hint.AddThemeColorOverride("font_color", new Color("9ad1ff"));
            hint.AutowrapMode = TextServer.AutowrapMode.WordSmart;
        }
        if (r.GainedCardName != null)
        {
            var gained = AddLabel(box, $"Gained for your Collection: {r.GainedCardName}", 12);
            gained.AddThemeColorOverride("font_color", new Color("8ae08a"));
        }
        AddPromptButton(box, "Continue", () => _bridge.AcknowledgePrompt());
    }

    private void ShowChooseNumber(ChooseNumberPromptView c)
    {
        var box = OpenPromptBox($"Choose a number ({c.Min}–{c.Max})");
        if (c.Max - c.Min <= 12)
        {
            var row = new HBoxContainer();
            row.AddThemeConstantOverride("separation", 6);
            box.AddChild(row);
            for (int n = c.Min; n <= c.Max; n++)
            {
                int value = n;
                var b = new Button { Text = n.ToString(), CustomMinimumSize = new Vector2(40, 40) };
                b.Pressed += () => _bridge.ChooseNumberValue(value);
                row.AddChild(b);
            }
        }
        else
        {
            var spin = new SpinBox { MinValue = c.Min, MaxValue = c.Max, Value = c.Min };
            box.AddChild(spin);
            AddPromptButton(box, "Choose", () => _bridge.ChooseNumberValue((int)spin.Value));
        }
    }

    private void ShowDeckReveal(DeckRevealPromptView d)
    {
        var box = OpenPromptBox("Deck revealed (top first)");
        foreach (var name in d.CardNames) AddLabel(box, "• " + name, 12);
        AddPromptButton(box, "Continue", () => _bridge.AcknowledgePrompt());
    }

    private void ShowBotm(BotmPromptView b)
    {
        var box = OpenPromptBox($"Back of Mind — keep up to {b.Limit} card(s); the rest are discarded");
        var picks = new List<int>();
        var confirm = new Button();
        var toggles = new List<Button>();

        void Refresh()
        {
            confirm.Text = $"Keep {picks.Count} · Discard {b.Hand.Count - picks.Count}";
            confirm.Disabled = picks.Count > b.Limit;
            for (int i = 0; i < toggles.Count; i++)
                toggles[i].Modulate = picks.Contains(i) ? new Color("ffe08a") : Colors.White;
        }

        var row = new HFlowContainer();
        row.AddThemeConstantOverride("h_separation", 6);
        box.AddChild(row);
        for (int i = 0; i < b.Hand.Count; i++)
        {
            int idx = i;
            var card = b.Hand[i];
            var t = new Button
            {
                Text = $"{card.Name}\n[{card.EffectiveCost}]",
                CustomMinimumSize = new Vector2(100, 70),
                TooltipText = card.EffectText,
            };
            t.Pressed += () =>
            {
                if (!picks.Remove(idx)) picks.Add(idx);
                Refresh();
            };
            toggles.Add(t);
            row.AddChild(t);
        }
        confirm.Pressed += () => _bridge.ConfirmBotm(picks.OrderBy(x => x).ToList());
        box.AddChild(confirm);
        Refresh();
    }

    /// <summary>Generic pick-N-from-hand overlay (ability discard costs).</summary>
    private void ShowHandPicker(string title, int exactCount, int maxCount, System.Action<List<int>> onConfirm)
    {
        var v = _bridge.View!;
        var box = OpenPromptBox(title);
        _handPickerOpen = true;
        var picks = new List<int>();
        var confirm = new Button();
        var toggles = new List<Button>();

        void Refresh()
        {
            confirm.Text = $"Confirm ({picks.Count}/{exactCount})";
            confirm.Disabled = picks.Count != exactCount;
            for (int i = 0; i < toggles.Count; i++)
                toggles[i].Modulate = picks.Contains(i) ? new Color("ffe08a") : Colors.White;
        }

        var row = new HFlowContainer();
        row.AddThemeConstantOverride("h_separation", 6);
        box.AddChild(row);
        for (int i = 0; i < v.Hand.Count; i++)
        {
            int idx = i;
            var card = v.Hand[i];
            var t = new Button
            {
                Text = $"{card.Name}\n[{card.EffectiveCost}]",
                CustomMinimumSize = new Vector2(100, 70),
                TooltipText = card.EffectText,
            };
            t.Pressed += () =>
            {
                if (!picks.Remove(idx))
                {
                    if (picks.Count >= maxCount) return;
                    picks.Add(idx);
                }
                Refresh();
            };
            toggles.Add(t);
            row.AddChild(t);
        }
        confirm.Pressed += () =>
        {
            HidePrompt();
            onConfirm(picks.OrderBy(x => x).ToList());
        };
        box.AddChild(confirm);
        var cancel = new Button { Text = "Cancel" };
        cancel.Pressed += HidePrompt;
        box.AddChild(cancel);
        Refresh();
    }

    private void ShowResult(ResultView r)
    {
        bool won = r.Result == "WIN";
        var box = OpenPromptBox(won ? "BREAKTHROUGH — you win" : "Conversation over — you lose");
        var head = (Label)box.GetChild(0);
        head.AddThemeColorOverride("font_color", won ? new Color("8ae08a") : new Color("ff7a6a"));
        if (r.LoseReason != null)
            AddLabel(box, r.LoseReason switch
            {
                "PATIENCE" => "Their patience ran out.",
                "LIES" => "Too many lies unraveled.",
                "SHIELDS" => "You took a hit with no shields standing.",
                _ => r.LoseReason,
            }, 13);
        AddPromptButton(box, "Retry (same seed)", () => _bridge.Restart());
        AddPromptButton(box, "New seed", () => _bridge.Restart((int)(Time.GetTicksMsec() % int.MaxValue)));
        AddPromptButton(box, "Back to launcher", () => GetTree().ChangeSceneToFile("res://Main.tscn"));
    }

    private void AddPromptButton(VBoxContainer box, string text, System.Action onPress)
    {
        var b = new Button { Text = text };
        b.Pressed += () => onPress();
        box.AddChild(b);
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private static void ClearChildren(Node parent)
    {
        foreach (var child in parent.GetChildren())
        {
            parent.RemoveChild(child);
            child.QueueFree();
        }
    }

    private static string Truncate(string s, int max) =>
        s.Length <= max ? s : s[..(max - 1)] + "…";

    private static string Escape(string s) => s.Replace("[", "[lb]");

    private static Color CardTint(string color) => color switch
    {
        "Blue" => new Color("aecbff"),
        "Orange" => new Color("ffd0a8"),
        "Red" => new Color("ffb0a8"),
        "Green" => new Color("b8ffb0"),
        "Purple" => new Color("dcb8ff"),
        _ => Colors.White,
    };
}
