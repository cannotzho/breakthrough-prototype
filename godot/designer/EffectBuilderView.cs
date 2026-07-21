// Godot view for the effect composition UI (scope M). Data-driven from
// EffectSchema: renders every card effect section as a structured list of
// rows with typed param slots, trigger headers ("When [event] by [who], if
// [quantity] [op] [N]"), ability/threshold meta, and a per-row raw-JSON
// escape hatch. All editing goes through CardEffectBuilder (the tested
// model); this file only binds widgets to it and fires Changed() so the
// designer re-validates + re-previews.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using Godot;

namespace Breakthrough.GodotHost.Designer;

public partial class EffectBuilderView : VBoxContainer
{
    private CardEffectBuilder _b = null!;
    private string[] _tokenIds = [];
    private Action _onChanged = () => { };

    private static readonly string[] EffectTypeNames = EffectSchema.Effects.Select(e => e.Type).ToArray();
    private static readonly string[] RelItems = ["self", "opponent"];
    private static readonly string[] TriggerWho = ["any", "self", "opponent"];
    private static readonly string[] RestrictionTargets = ["self", "opponent", "both"];

    public void Load(CardEffectBuilder builder, string[] tokenIds, Action onChanged)
    {
        _b = builder;
        _tokenIds = tokenIds;
        _onChanged = onChanged;
        Reload();
    }

    private void Changed() => _onChanged();

    private void Reload()
    {
        foreach (var c in GetChildren()) { RemoveChild(c); c.QueueFree(); }
        AddThemeConstantOverride("separation", 10);

        foreach (var key in CardEffectBuilder.ListSectionKeys)
            AddListSection(SectionTitle(key), _b.Lists[key]);

        AddTrapTriggerSection();
        AddTriggeredAbilities();
        AddActivatedAbilities();
        AddThresholds();
    }

    private static string SectionTitle(string key) => key switch
    {
        "effects" => "Main effects",
        "shieldTriggerEffects" => "Shield trigger effects",
        "heavyHandEffects" => "Heavy Hand effects",
        "leaveTriggerEffects" => "Leave-trigger effects",
        "turnStartEffects" => "Turn-start effects",
        _ => key,
    };

    // ── generic effect list ─────────────────────────────────────────────────

    private void AddListSection(string title, EffectListSection section)
    {
        var box = SectionBox(title, out var header);
        var addBtn = new MenuButton { Text = "＋ effect" };
        BuildEffectMenu(addBtn.GetPopup(), type =>
        {
            section.Rows.Add(NewRow(type));
            section.Structural = true;
            Changed();
            Reload();
        });
        header.AddChild(addBtn);

        for (int i = 0; i < section.Rows.Count; i++)
        {
            int idx = i;
            box.AddChild(BuildRowControl(section.Rows[idx], () =>
            {
                section.Rows.RemoveAt(idx); section.Structural = true; Changed(); Reload();
            }, moveBy =>
            {
                int j = idx + moveBy;
                if (j < 0 || j >= section.Rows.Count) return;
                (section.Rows[idx], section.Rows[j]) = (section.Rows[j], section.Rows[idx]);
                section.Structural = true; Changed(); Reload();
            }));
        }
        if (section.Rows.Count == 0) box.AddChild(Dim("(none)"));
    }

    // ── trap trigger ────────────────────────────────────────────────────────

    private void AddTrapTriggerSection()
    {
        var box = SectionBox("Trap trigger", out var header);
        var toggle = new CheckBox { Text = "is a trap", ButtonPressed = _b.HasTrapTrigger };
        toggle.Toggled += on =>
        {
            _b.HasTrapTrigger = on; _b.TrapStructural = true; _b.TrapTrigger.MarkDirty(); Changed(); Reload();
        };
        header.AddChild(toggle);
        if (_b.HasTrapTrigger)
            box.AddChild(BuildTriggerRow(_b.TrapTrigger, () => { _b.TrapTrigger.MarkDirty(); Changed(); }));
    }

    // ── triggered abilities ─────────────────────────────────────────────────

    private void AddTriggeredAbilities()
    {
        var box = SectionBox("Triggered abilities", out var header);
        var add = new Button { Text = "＋ ability" };
        add.Pressed += () =>
        {
            var m = new TriggeredAbilityModel(null) { Id = $"ta{_b.TriggeredAbilities.Count + 1}", MetaDirty = true };
            m.Trigger.MarkDirty();
            _b.TriggeredAbilities.Add(m); _b.TriggeredStructural = true; Changed(); Reload();
        };
        header.AddChild(add);

        for (int i = 0; i < _b.TriggeredAbilities.Count; i++)
        {
            int idx = i;
            var m = _b.TriggeredAbilities[idx];
            var panel = AbilityPanel(() =>
            {
                _b.TriggeredAbilities.RemoveAt(idx); _b.TriggeredStructural = true; Changed(); Reload();
            }, out var inner);
            inner.AddChild(LabeledLine("id", m.Id, s => { m.Id = s; m.MetaDirty = true; Changed(); }));
            inner.AddChild(BuildTriggerRow(m.Trigger, () => { m.Trigger.MarkDirty(); Changed(); }));
            AddNestedEffectList(inner, m.Effects);
            box.AddChild(panel);
        }
        if (_b.TriggeredAbilities.Count == 0) box.AddChild(Dim("(none)"));
    }

    // ── activated abilities ─────────────────────────────────────────────────

    private void AddActivatedAbilities()
    {
        var box = SectionBox("Activated abilities", out var header);
        var add = new Button { Text = "＋ ability" };
        add.Pressed += () =>
        {
            _b.ActivatedAbilities.Add(new ActivatedAbilityModel(null)
            { Id = $"aa{_b.ActivatedAbilities.Count + 1}", Name = "Ability", MetaDirty = true });
            _b.ActivatedStructural = true; Changed(); Reload();
        };
        header.AddChild(add);

        for (int i = 0; i < _b.ActivatedAbilities.Count; i++)
        {
            int idx = i;
            var m = _b.ActivatedAbilities[idx];
            var panel = AbilityPanel(() =>
            {
                _b.ActivatedAbilities.RemoveAt(idx); _b.ActivatedStructural = true; Changed(); Reload();
            }, out var inner);
            inner.AddChild(LabeledLine("id", m.Id, s => { m.Id = s; m.MetaDirty = true; Changed(); }));
            inner.AddChild(LabeledLine("name", m.Name, s => { m.Name = s; m.MetaDirty = true; Changed(); }));
            var costRow = new HFlowContainer();
            costRow.AddChild(Dim("cost:"));
            costRow.AddChild(LabeledInt("priority", m.CostPriority, 0, 20, v => { m.CostPriority = v; m.MetaDirty = true; Changed(); }));
            costRow.AddChild(LabeledInt("patience", m.CostPatience, 0, 20, v => { m.CostPatience = v; m.MetaDirty = true; Changed(); }));
            costRow.AddChild(LabeledInt("sacShields", m.CostSacrificeShields, 0, 10, v => { m.CostSacrificeShields = v; m.MetaDirty = true; Changed(); }));
            costRow.AddChild(LabeledInt("discard", m.CostDiscardCards, 0, 10, v => { m.CostDiscardCards = v; m.MetaDirty = true; Changed(); }));
            inner.AddChild(costRow);
            AddNestedEffectList(inner, m.Effects);
            box.AddChild(panel);
        }
        if (_b.ActivatedAbilities.Count == 0) box.AddChild(Dim("(none)"));
    }

    // ── thresholds ──────────────────────────────────────────────────────────

    private void AddThresholds()
    {
        var box = SectionBox("Thresholds", out var header);
        var add = new Button { Text = "＋ threshold" };
        add.Pressed += () =>
        {
            _b.Thresholds.Add(new ThresholdModel(null) { CounterName = "count", Value = 1, MetaDirty = true });
            _b.ThresholdsStructural = true; Changed(); Reload();
        };
        header.AddChild(add);

        for (int i = 0; i < _b.Thresholds.Count; i++)
        {
            int idx = i;
            var m = _b.Thresholds[idx];
            var panel = AbilityPanel(() =>
            {
                _b.Thresholds.RemoveAt(idx); _b.ThresholdsStructural = true; Changed(); Reload();
            }, out var inner);
            var metaRow = new HFlowContainer();
            metaRow.AddChild(LabeledLine("counter", m.CounterName, s => { m.CounterName = s; m.MetaDirty = true; Changed(); }));
            metaRow.AddChild(LabeledInt("value", m.Value, 0, 99, v => { m.Value = v; m.MetaDirty = true; Changed(); }));
            var consume = new CheckBox { Text = "consume", ButtonPressed = m.Consume };
            consume.Toggled += on => { m.Consume = on; m.MetaDirty = true; Changed(); };
            metaRow.AddChild(consume);
            var cp = new OptionButton();
            cp.AddItem("(default)");
            foreach (var c in EffectSchema.CheckPoints) cp.AddItem(c);
            cp.Selected = m.CheckPoint == null ? 0 : Array.IndexOf(EffectSchema.CheckPoints, m.CheckPoint) + 1;
            cp.ItemSelected += sel => { m.CheckPoint = sel == 0 ? null : EffectSchema.CheckPoints[(int)sel - 1]; m.MetaDirty = true; Changed(); };
            metaRow.AddChild(cp);
            inner.AddChild(metaRow);
            AddNestedEffectList(inner, m.Effects);
            box.AddChild(panel);
        }
        if (_b.Thresholds.Count == 0) box.AddChild(Dim("(none)"));
    }

    private void AddNestedEffectList(VBoxContainer parent, EffectListSection section)
    {
        var head = new HBoxContainer();
        head.AddChild(Dim("effects:"));
        var addBtn = new MenuButton { Text = "＋" };
        BuildEffectMenu(addBtn.GetPopup(), type =>
        {
            section.Rows.Add(NewRow(type)); section.Structural = true; Changed(); Reload();
        });
        head.AddChild(addBtn);
        parent.AddChild(head);
        for (int i = 0; i < section.Rows.Count; i++)
        {
            int idx = i;
            parent.AddChild(BuildRowControl(section.Rows[idx],
                () => { section.Rows.RemoveAt(idx); section.Structural = true; Changed(); Reload(); },
                moveBy =>
                {
                    int j = idx + moveBy;
                    if (j < 0 || j >= section.Rows.Count) return;
                    (section.Rows[idx], section.Rows[j]) = (section.Rows[j], section.Rows[idx]);
                    section.Structural = true; Changed(); Reload();
                }));
        }
    }

    // ── one effect row ──────────────────────────────────────────────────────

    private Control BuildRowControl(EffectRow row, Action onRemove, Action<int> onMove)
    {
        // HFlow so a wide row wraps to the next line instead of scrolling.
        var wrap = new HFlowContainer();
        wrap.AddThemeConstantOverride("h_separation", 5);
        wrap.AddThemeConstantOverride("v_separation", 3);

        if (row.IsRaw)
        {
            var raw = new TextEdit
            {
                Text = row.RawText,
                CustomMinimumSize = new Vector2(360, 60),
                SizeFlagsHorizontal = SizeFlags.ExpandFill,
            };
            raw.TextChanged += () => { row.RawText = raw.Text; row.MarkDirty(); Changed(); };
            wrap.AddChild(new Label { Text = "raw", TooltipText = "This effect is beyond the builder — edit as JSON." });
            wrap.AddChild(raw);
            wrap.AddChild(RemoveBtn(onRemove));
            return Framed(wrap);
        }

        var typePick = new OptionButton();
        foreach (var t in EffectTypeNames) typePick.AddItem(t);
        typePick.Selected = Array.IndexOf(EffectTypeNames, row.Type);
        typePick.ItemSelected += sel =>
        {
            var fresh = NewRow(EffectTypeNames[(int)sel]);
            row.Type = fresh.Type; row.IsRaw = fresh.IsRaw; row.Params.Clear();
            foreach (var kv in fresh.Params) row.Params[kv.Key] = kv.Value;
            row.Condition = null; row.Scale = null; row.MarkDirty(); Changed(); Reload();
        };
        wrap.AddChild(typePick);

        var spec = EffectSchema.Find(row.Type)!;
        foreach (var p in spec.Params)
        {
            if (spec.FixedStrings?.ContainsKey(p.Key) == true) continue;
            wrap.AddChild(new Label { Text = p.Label });
            wrap.AddChild(BuildParamWidget(row, p));
        }
        if (row.Condition != null || row.Scale != null)
            wrap.AddChild(new Label { Text = "＋cond/scale", TooltipText = "This effect carries a condition/scale, preserved on save." });

        wrap.AddChild(RawToggle(row));
        wrap.AddChild(MoveBtn("▲", () => onMove(-1)));
        wrap.AddChild(MoveBtn("▼", () => onMove(1)));
        wrap.AddChild(RemoveBtn(onRemove));
        return Framed(wrap);
    }

    private Control BuildParamWidget(EffectRow row, ParamSpec p)
    {
        switch (p.Kind)
        {
            case SlotKind.Int:
            {
                if (!p.Required)
                {
                    var h = new HBoxContainer();
                    bool has = row.Params.TryGetValue(p.Key, out var cur) && cur is int;
                    var chk = new CheckBox { ButtonPressed = has };
                    var sb = new SpinBox { MinValue = p.Min, MaxValue = p.Max, Value = has ? (int)cur! : p.Default, Editable = has };
                    chk.Toggled += on => { row.Params[p.Key] = on ? (object)(int)sb.Value : null; sb.Editable = on; row.MarkDirty(); Changed(); };
                    sb.ValueChanged += v => { row.Params[p.Key] = (int)v; row.MarkDirty(); Changed(); };
                    h.AddChild(chk); h.AddChild(sb);
                    return h;
                }
                var spin = new SpinBox { MinValue = p.Min, MaxValue = p.Max, Value = row.Params.TryGetValue(p.Key, out var v0) && v0 is int iv ? iv : p.Default };
                spin.ValueChanged += v => { row.Params[p.Key] = (int)v; row.MarkDirty(); Changed(); };
                return spin;
            }
            case SlotKind.Bool:
            {
                var chk = new CheckBox { ButtonPressed = row.Params.TryGetValue(p.Key, out var v) && v is true };
                chk.Toggled += on => { row.Params[p.Key] = on; row.MarkDirty(); Changed(); };
                return chk;
            }
            case SlotKind.Rel:
            {
                var opt = new OptionButton();
                foreach (var r in RelItems) opt.AddItem(r);
                opt.Selected = (row.Params.TryGetValue(p.Key, out var v) ? v as string : "self") == "opponent" ? 1 : 0;
                opt.ItemSelected += sel => { row.Params[p.Key] = RelItems[(int)sel]; row.MarkDirty(); Changed(); };
                return opt;
            }
            case SlotKind.TokenId:
            {
                var opt = new OptionButton();
                if (!p.Required) opt.AddItem("(none)");
                foreach (var t in _tokenIds) opt.AddItem(t);
                string? cur = row.Params.TryGetValue(p.Key, out var v) ? v as string : null;
                int at = cur == null ? 0 : Array.IndexOf(_tokenIds, cur) + (p.Required ? 0 : 1);
                opt.Selected = Math.Max(0, at);
                opt.ItemSelected += sel =>
                {
                    int i = (int)sel;
                    row.Params[p.Key] = !p.Required && i == 0 ? null : _tokenIds[i - (p.Required ? 0 : 1)];
                    row.MarkDirty(); Changed();
                };
                return opt;
            }
            case SlotKind.Text:
            {
                var le = new LineEdit { Text = (row.Params.TryGetValue(p.Key, out var v) ? v as string : "") ?? "", CustomMinimumSize = new Vector2(120, 0) };
                le.TextChanged += s => { row.Params[p.Key] = s; row.MarkDirty(); Changed(); };
                return le;
            }
            case SlotKind.Restriction:
                return BuildRestrictionWidget(row, p);
            case SlotKind.Boundary:
                return BuildBoundaryWidget(row, p);
            default:
                return Dim("?");
        }
    }

    private Control BuildRestrictionWidget(EffectRow row, ParamSpec p)
    {
        var node = row.Params.TryGetValue(p.Key, out var v) ? v as JsonObject : null;
        node ??= new JsonObject { ["type"] = EffectSchema.RestrictionTypes[0], ["target"] = "opponent" };
        row.Params[p.Key] = node;

        // Exotic shapes (expiry / conditionThreshold) → compact JSON field.
        bool simple = node.All(kv => kv.Key is "type" or "target" or "value");
        if (!simple)
        {
            var le = new LineEdit { Text = node.ToJsonString(), CustomMinimumSize = new Vector2(300, 0) };
            le.TextChanged += s =>
            {
                try { row.Params[p.Key] = JsonNode.Parse(s)!; row.MarkDirty(); Changed(); } catch { }
            };
            return le;
        }

        var h = new HBoxContainer();
        var typeOpt = new OptionButton();
        foreach (var t in EffectSchema.RestrictionTypes) typeOpt.AddItem(t);
        typeOpt.Selected = Math.Max(0, Array.IndexOf(EffectSchema.RestrictionTypes, node["type"]?.GetValue<string>()));
        typeOpt.ItemSelected += sel => { node["type"] = EffectSchema.RestrictionTypes[(int)sel]; row.MarkDirty(); Changed(); };
        h.AddChild(typeOpt);

        var tgtOpt = new OptionButton();
        foreach (var t in RestrictionTargets) tgtOpt.AddItem(t);
        tgtOpt.Selected = Math.Max(0, Array.IndexOf(RestrictionTargets, node["target"]?.GetValue<string>()));
        tgtOpt.ItemSelected += sel => { node["target"] = RestrictionTargets[(int)sel]; row.MarkDirty(); Changed(); };
        h.AddChild(tgtOpt);

        bool hasVal = node.ContainsKey("value");
        var vchk = new CheckBox { Text = "value", ButtonPressed = hasVal };
        var vsb = new SpinBox { MinValue = -30, MaxValue = 30, Value = hasVal ? node["value"]!.GetValue<int>() : 1, Editable = hasVal };
        vchk.Toggled += on => { if (on) node["value"] = (int)vsb.Value; else node.Remove("value"); vsb.Editable = on; row.MarkDirty(); Changed(); };
        vsb.ValueChanged += val => { node["value"] = (int)val; row.MarkDirty(); Changed(); };
        h.AddChild(vchk); h.AddChild(vsb);
        return h;
    }

    private Control BuildBoundaryWidget(EffectRow row, ParamSpec p)
    {
        var node = row.Params.TryGetValue(p.Key, out var v) ? v as JsonObject : null;
        var h = new HBoxContainer();
        var enable = new CheckBox { Text = "until", ButtonPressed = node != null };
        var boundary = new OptionButton { Disabled = node == null };
        foreach (var bn in EffectSchema.Boundaries) boundary.AddItem(bn);
        boundary.Selected = Math.Max(0, Array.IndexOf(EffectSchema.Boundaries, node?["boundary"]?.GetValue<string>()));
        var occ = new SpinBox { MinValue = 1, MaxValue = 20, Value = node?["occurrences"]?.GetValue<int>() ?? 1, Editable = node != null };

        void Rebuild()
        {
            if (!enable.ButtonPressed) { row.Params[p.Key] = null; }
            else row.Params[p.Key] = new JsonObject { ["boundary"] = EffectSchema.Boundaries[boundary.Selected], ["occurrences"] = (int)occ.Value };
            row.MarkDirty(); Changed();
        }
        enable.Toggled += _ => { boundary.Disabled = !enable.ButtonPressed; occ.Editable = enable.ButtonPressed; Rebuild(); };
        boundary.ItemSelected += _ => Rebuild();
        occ.ValueChanged += _ => Rebuild();
        h.AddChild(enable); h.AddChild(boundary); h.AddChild(occ);
        return h;
    }

    // ── trigger row ("When [event] by [who], if [q] [op] [N]") ───────────────

    private Control BuildTriggerRow(TriggerModel t, Action onChanged)
    {
        var box = new VBoxContainer();
        var line = new HBoxContainer();
        line.AddChild(new Label { Text = "When" });
        var ev = new OptionButton();
        foreach (var e in EffectSchema.Events) ev.AddItem(e);
        ev.Selected = Math.Max(0, Array.IndexOf(EffectSchema.Events, t.Event));
        ev.ItemSelected += sel => { t.Event = EffectSchema.Events[(int)sel]; onChanged(); };
        line.AddChild(ev);
        line.AddChild(new Label { Text = "by" });
        var who = new OptionButton();
        foreach (var w in TriggerWho) who.AddItem(w);
        who.Selected = Math.Max(0, Array.IndexOf(TriggerWho, t.ControllerFilter));
        who.ItemSelected += sel => { t.ControllerFilter = TriggerWho[(int)sel]; onChanged(); };
        line.AddChild(who);
        box.AddChild(line);

        if (t.ConditionComplex)
        {
            box.AddChild(Dim("if: (complex condition — preserved; edit via whole-card raw JSON)"));
            return Framed(box);
        }

        var condLine = new HFlowContainer();
        var useCond = new CheckBox { Text = "if", ButtonPressed = t.HasCondition };
        condLine.AddChild(useCond);
        var lhs = new OptionButton { Disabled = !t.HasCondition };
        foreach (var q in EffectSchema.QuantityKinds.Where(k => !EffectSchema.RawOnlyQuantityKinds.Contains(k)))
            lhs.AddItem(q);
        lhs.Selected = Math.Max(0, Array.IndexOf(EffectSchema.QuantityKinds, t.Lhs));
        var op = new OptionButton { Disabled = !t.HasCondition };
        for (int i = 0; i < EffectSchema.Comparators.Length; i++) op.AddItem(EffectSchema.ComparatorGlyphs[i]);
        op.Selected = Math.Max(0, Array.IndexOf(EffectSchema.Comparators, t.Op));
        var rhs = new SpinBox { MinValue = -30, MaxValue = 30, Value = t.Rhs, Editable = t.HasCondition };
        var side = new OptionButton { Disabled = !t.HasCondition || !EffectSchema.SidedQuantityKinds.Contains(t.Lhs) };
        foreach (var r in RelItems) side.AddItem(r);
        side.Selected = t.LhsSide == "opponent" ? 1 : 0;

        useCond.Toggled += on => { t.HasCondition = on; lhs.Disabled = op.Disabled = !on; rhs.Editable = on; side.Disabled = !on || !EffectSchema.SidedQuantityKinds.Contains(t.Lhs); onChanged(); };
        lhs.ItemSelected += sel => { t.Lhs = lhs.GetItemText((int)sel); side.Disabled = !EffectSchema.SidedQuantityKinds.Contains(t.Lhs); onChanged(); };
        op.ItemSelected += sel => { t.Op = EffectSchema.Comparators[(int)sel]; onChanged(); };
        rhs.ValueChanged += v => { t.Rhs = (int)v; onChanged(); };
        side.ItemSelected += sel => { t.LhsSide = RelItems[(int)sel]; onChanged(); };

        condLine.AddChild(lhs); condLine.AddChild(side); condLine.AddChild(op); condLine.AddChild(rhs);
        box.AddChild(condLine);
        return Framed(box);
    }

    // ── row factory & small widgets ─────────────────────────────────────────

    private EffectRow NewRow(string type)
    {
        var row = new EffectRow { Type = type, Dirty = true };
        var spec = EffectSchema.Find(type)!;
        foreach (var p in spec.Params)
        {
            if (spec.FixedStrings?.ContainsKey(p.Key) == true) continue;
            row.Params[p.Key] = p.Kind switch
            {
                SlotKind.Int => p.Required ? p.Default : null,
                SlotKind.Bool => false,
                SlotKind.Rel => "self",
                SlotKind.TokenId => p.Required ? (_tokenIds.FirstOrDefault() ?? "") : null,
                SlotKind.Text => "",
                SlotKind.Restriction => new JsonObject { ["type"] = EffectSchema.RestrictionTypes[0], ["target"] = "opponent" },
                _ => null,
            };
        }
        return row;
    }

    private Button RawToggle(EffectRow row)
    {
        var b = new Button { Text = "{}", TooltipText = "Edit this effect as raw JSON" };
        b.Pressed += () =>
        {
            row.RawText = row.ToNode().ToJsonString(DesignerJson.Pretty);
            row.IsRaw = true; row.MarkDirty(); Changed(); Reload();
        };
        return b;
    }

    private static Button RemoveBtn(Action onRemove)
    {
        var b = new Button { Text = "✕" };
        b.Pressed += () => onRemove();
        return b;
    }

    private static Button MoveBtn(string glyph, Action onMove)
    {
        var b = new Button { Text = glyph };
        b.Pressed += () => onMove();
        return b;
    }

    private VBoxContainer SectionBox(string title, out HBoxContainer header)
    {
        var box = new VBoxContainer();
        header = new HBoxContainer();
        var t = new Label { Text = title };
        t.AddThemeColorOverride("font_color", new Color("cfc4a5"));
        header.AddChild(t);
        box.AddChild(header);
        AddChild(box);
        AddChild(new HSeparator());
        return box;
    }

    private static PanelContainer AbilityPanel(Action onRemove, out VBoxContainer inner)
    {
        var panel = new PanelContainer();
        var outer = new VBoxContainer();
        panel.AddChild(outer);
        var top = new HBoxContainer();
        top.AddChild(new Control { SizeFlagsHorizontal = SizeFlags.ExpandFill });
        top.AddChild(RemoveBtn(onRemove));
        outer.AddChild(top);
        inner = new VBoxContainer();
        outer.AddChild(inner);
        return panel;
    }

    private static Control Framed(Control c)
    {
        var p = new PanelContainer { SizeFlagsHorizontal = SizeFlags.ExpandFill };
        p.AddChild(c);
        return p;
    }

    private static Label Dim(string text)
    {
        var l = new Label { Text = text };
        l.AddThemeColorOverride("font_color", new Color("8a8a99"));
        return l;
    }

    private static Control LabeledLine(string label, string value, Action<string> onChanged)
    {
        var h = new HBoxContainer();
        h.AddChild(Dim(label));
        var le = new LineEdit { Text = value, CustomMinimumSize = new Vector2(130, 0) };
        le.TextChanged += s => onChanged(s);
        h.AddChild(le);
        return h;
    }

    private static Control LabeledInt(string label, int value, int min, int max, Action<int> onChanged)
    {
        var h = new HBoxContainer();
        h.AddChild(Dim(label));
        var sb = new SpinBox { MinValue = min, MaxValue = max, Value = value };
        sb.ValueChanged += v => onChanged((int)v);
        h.AddChild(sb);
        return h;
    }

    private void BuildEffectMenu(PopupMenu menu, Action<string> onPick)
    {
        menu.Clear();
        for (int i = 0; i < EffectTypeNames.Length; i++) menu.AddItem(EffectTypeNames[i], i);
        menu.IdPressed += id => onPick(EffectTypeNames[(int)id]);
    }
}
