// 2D layer over the mindspace: meters, toast-style rejection feedback (Ken's
// ruling — the reducer's reason surfaces as a fading toast, no predictive
// legality), and the modal prompts (reveal / choose-number / deck reveal /
// Back-of-Mind / ability-discard picker / result). Deliberately minimal
// styling; step-3+ art replaces the look, not the flow.

using System.Collections.Generic;
using System.Linq;
using Godot;

namespace Breakthrough.GodotHost.Arena;

public partial class ArenaHud : CanvasLayer
{
    private CombatBridge _bridge = null!;

    private Label _patience = null!, _phase = null!, _priority = null!, _lies = null!, _botm = null!;
    private Label _toast = null!;
    private Button _endTurn = null!;
    private CheckBox _autoNpc = null!;
    private Control _promptLayer = null!;
    private PanelContainer _promptPanel = null!;
    private bool _handPickerOpen;
    private Tween? _toastTween;

    public void Init(CombatBridge bridge) => _bridge = bridge;

    public override void _Ready()
    {
        var top = new HBoxContainer();
        top.SetAnchorsPreset(Control.LayoutPreset.TopWide);
        top.OffsetLeft = 16; top.OffsetTop = 10; top.OffsetRight = -16;
        top.AddThemeConstantOverride("separation", 24);
        AddChild(top);
        _phase = HudLabel(top, 14);
        _patience = HudLabel(top, 18);
        _patience.AddThemeColorOverride("font_color", new Color("e0b04a"));
        _lies = HudLabel(top, 14);
        top.AddChild(new Control { SizeFlagsHorizontal = Control.SizeFlags.ExpandFill });
        _botm = HudLabel(top, 12);

        var bottom = new HBoxContainer();
        bottom.SetAnchorsPreset(Control.LayoutPreset.BottomWide);
        bottom.OffsetLeft = 16; bottom.OffsetTop = -52; bottom.OffsetRight = -16; bottom.OffsetBottom = -12;
        bottom.AddThemeConstantOverride("separation", 18);
        AddChild(bottom);
        _priority = HudLabel(bottom, 20);
        _priority.AddThemeColorOverride("font_color", new Color("6ad46a"));
        bottom.AddChild(new Control { SizeFlagsHorizontal = Control.SizeFlags.ExpandFill });
        _endTurn = new Button { Text = "End Turn (or ring the bell)" };
        _endTurn.Pressed += () => _bridge.EndPlayerTurn();
        bottom.AddChild(_endTurn);
        _autoNpc = new CheckBox { Text = "Auto NPC", ButtonPressed = true };
        _autoNpc.Toggled += on => _bridge.AutoAdvanceNpc = on;
        bottom.AddChild(_autoNpc);

        _toast = new Label
        {
            HorizontalAlignment = HorizontalAlignment.Center,
            Modulate = new Color(1, 1, 1, 0),
        };
        _toast.AddThemeFontSizeOverride("font_size", 16);
        _toast.AddThemeColorOverride("font_color", new Color("ff8a7a"));
        _toast.SetAnchorsPreset(Control.LayoutPreset.CenterBottom);
        _toast.OffsetTop = -110; _toast.OffsetLeft = -400; _toast.OffsetRight = 400;
        AddChild(_toast);

        _promptLayer = new Control { Visible = false };
        _promptLayer.SetAnchorsPreset(Control.LayoutPreset.FullRect);
        var dim = new ColorRect { Color = new Color(0, 0, 0, 0.55f) };
        dim.SetAnchorsPreset(Control.LayoutPreset.FullRect);
        _promptLayer.AddChild(dim);
        _promptPanel = new PanelContainer();
        _promptPanel.SetAnchorsPreset(Control.LayoutPreset.Center);
        _promptLayer.AddChild(_promptPanel);
        AddChild(_promptLayer);
    }

    private static Label HudLabel(Container parent, int size)
    {
        var l = new Label();
        l.AddThemeFontSizeOverride("font_size", size);
        parent.AddChild(l);
        return l;
    }

    // ── per-view refresh ────────────────────────────────────────────────────

    public void Refresh(CombatView v)
    {
        _phase.Text = $"{v.EncounterName} · round {v.Round} · {v.Phase}";
        _patience.Text = $"Patience {v.Patience}/{v.StartingPatience}";
        _lies.Text = v.LieThreshold is int lt ? $"Lies {v.LieCounter}/{lt}" : $"Lies {v.LieCounter}";
        _priority.Text = $"Priority {v.PlayerPriority}/{v.MaxPriority}" +
            (v.PlayerIncomingDebt > 0 ? $"  (+{v.PlayerIncomingDebt} debt owed to you)" : "");
        _botm.Text = v.BackOfMindNames.Count == 0
            ? ""
            : $"Back of Mind: {string.Join(", ", v.BackOfMindNames)}";
        _endTurn.Disabled = !v.CanAct;

        if (_bridge.LastError != null) Toast(_bridge.LastError);
        RebuildPrompt(v);
    }

    /// <summary>Toast-style rejection (and general notices): fades in, holds, fades out.</summary>
    public void Toast(string message)
    {
        _toast.Text = message;
        _toastTween?.Kill();
        _toast.Modulate = new Color(1, 1, 1, 1);
        _toastTween = CreateTween();
        _toastTween.TweenInterval(1.8);
        _toastTween.TweenProperty(_toast, "modulate:a", 0.0f, 0.5);
    }

    // ── prompts (same flow as the 2D placeholder screen) ────────────────────

    private void RebuildPrompt(CombatView v)
    {
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
        foreach (var child in _promptPanel.GetChildren())
        {
            _promptPanel.RemoveChild(child);
            child.QueueFree();
        }
        var box = new VBoxContainer { CustomMinimumSize = new Vector2(430, 0) };
        box.AddThemeConstantOverride("separation", 10);
        _promptPanel.AddChild(box);
        var t = new Label { Text = title, AutowrapMode = TextServer.AutowrapMode.WordSmart };
        t.AddThemeFontSizeOverride("font_size", 17);
        box.AddChild(t);
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
        var lore = new Label
        {
            Text = r.Lore,
            AutowrapMode = TextServer.AutowrapMode.WordSmart,
            CustomMinimumSize = new Vector2(410, 0),
        };
        box.AddChild(lore);
        if (r.HintText != null)
        {
            var hint = new Label { Text = "Hint: " + r.HintText, AutowrapMode = TextServer.AutowrapMode.WordSmart };
            hint.AddThemeColorOverride("font_color", new Color("9ad1ff"));
            box.AddChild(hint);
        }
        if (r.GainedCardName != null)
        {
            var gained = new Label { Text = $"Gained for your Collection: {r.GainedCardName}" };
            gained.AddThemeColorOverride("font_color", new Color("8ae08a"));
            box.AddChild(gained);
        }
        PromptButton(box, "Continue", () => _bridge.AcknowledgePrompt());
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
            PromptButton(box, "Choose", () => _bridge.ChooseNumberValue((int)spin.Value));
        }
    }

    private void ShowDeckReveal(DeckRevealPromptView d)
    {
        var box = OpenPromptBox("Deck revealed (top first)");
        foreach (var name in d.CardNames) box.AddChild(new Label { Text = "• " + name });
        PromptButton(box, "Continue", () => _bridge.AcknowledgePrompt());
    }

    private void ShowBotm(BotmPromptView b)
    {
        var box = OpenPromptBox($"Back of Mind — keep up to {b.Limit} card(s); the rest are discarded");
        BuildPicker(box, b.Hand,
            confirmText: picks => $"Keep {picks.Count} · Discard {b.Hand.Count - picks.Count}",
            confirmEnabled: picks => picks.Count <= b.Limit,
            onConfirm: picks => _bridge.ConfirmBotm(picks),
            cancellable: false);
    }

    public void ShowDiscardPicker(string abilityName, int count, IReadOnlyList<HandCardView> hand,
        System.Action<List<int>> onConfirm)
    {
        var box = OpenPromptBox($"{abilityName}: choose {count} card(s) to discard");
        _handPickerOpen = true;
        BuildPicker(box, hand,
            confirmText: picks => $"Confirm ({picks.Count}/{count})",
            confirmEnabled: picks => picks.Count == count,
            onConfirm: picks => { HidePrompt(); onConfirm(picks); },
            cancellable: true,
            maxPicks: count);
    }

    private void BuildPicker(VBoxContainer box, IReadOnlyList<HandCardView> hand,
        System.Func<List<int>, string> confirmText,
        System.Func<List<int>, bool> confirmEnabled,
        System.Action<List<int>> onConfirm,
        bool cancellable,
        int maxPicks = int.MaxValue)
    {
        var picks = new List<int>();
        var confirm = new Button();
        var toggles = new List<Button>();

        void Update()
        {
            confirm.Text = confirmText(picks);
            confirm.Disabled = !confirmEnabled(picks);
            for (int i = 0; i < toggles.Count; i++)
                toggles[i].Modulate = picks.Contains(i) ? new Color("ffe08a") : Colors.White;
        }

        var row = new HFlowContainer();
        row.AddThemeConstantOverride("h_separation", 6);
        box.AddChild(row);
        for (int i = 0; i < hand.Count; i++)
        {
            int idx = i;
            var card = hand[i];
            var t = new Button
            {
                Text = $"{card.Name}\n[{card.EffectiveCost}]",
                CustomMinimumSize = new Vector2(100, 66),
                TooltipText = card.EffectText,
            };
            t.Pressed += () =>
            {
                if (!picks.Remove(idx))
                {
                    if (picks.Count >= maxPicks) return;
                    picks.Add(idx);
                }
                Update();
            };
            toggles.Add(t);
            row.AddChild(t);
        }
        confirm.Pressed += () => onConfirm(picks.OrderBy(x => x).ToList());
        box.AddChild(confirm);
        if (cancellable)
        {
            var cancel = new Button { Text = "Cancel" };
            cancel.Pressed += HidePrompt;
            box.AddChild(cancel);
        }
        Update();
    }

    private void ShowResult(ResultView r)
    {
        bool won = r.Result == "WIN";
        var box = OpenPromptBox(won ? "BREAKTHROUGH — you win" : "Conversation over — you lose");
        var head = (Label)box.GetChild(0);
        head.AddThemeColorOverride("font_color", won ? new Color("8ae08a") : new Color("ff7a6a"));
        if (r.LoseReason != null)
        {
            box.AddChild(new Label
            {
                Text = r.LoseReason switch
                {
                    "PATIENCE" => "Their patience ran out.",
                    "LIES" => "Too many lies unraveled.",
                    "SHIELDS" => "You took a hit with no shields standing.",
                    _ => r.LoseReason,
                },
            });
        }
        PromptButton(box, "Retry (same seed)", () => _bridge.Restart());
        PromptButton(box, "New seed", () => _bridge.Restart((int)(Time.GetTicksMsec() % int.MaxValue)));
        PromptButton(box, "Back to launcher", () => GetTree().ChangeSceneToFile("res://Main.tscn"));
    }

    private static void PromptButton(VBoxContainer box, string text, System.Action onPress)
    {
        var b = new Button { Text = text };
        b.Pressed += () => onPress();
        box.AddChild(b);
    }
}
