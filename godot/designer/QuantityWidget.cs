// The shared quantity picker. Used by the effect rows' condition/scale
// editors AND by card-level fields that take a quantity (Rapport's reward),
// so both offer exactly the same vocabulary.

using System;
using Godot;

namespace Breakthrough.GodotHost.Designer;

public static class QuantityWidget
{
    private static readonly string[] RelItems = ["self", "opponent"];

    /// <summary>
    /// Kind dropdown plus whatever that kind carries (constant value, side,
    /// counter name, or a nested cost quantity). Rebuilds itself in place
    /// when the kind changes; calls onChanged after every edit.
    /// </summary>
    public static Control Build(QuantitySpec spec, Action onChanged)
    {
        var box = new HFlowContainer();

        void Rebuild()
        {
            foreach (var c in box.GetChildren()) { box.RemoveChild(c); c.QueueFree(); }
            if (spec.IsComplex)
            {
                box.AddChild(Dim("(complex — raw JSON)"));
                return;
            }

            var kindPick = new OptionButton();
            foreach (var k in EffectSchema.QuantityKinds) kindPick.AddItem(k);
            kindPick.Selected = Math.Max(0, Array.IndexOf(EffectSchema.QuantityKinds, spec.Kind));
            kindPick.ItemSelected += sel =>
            {
                spec.Kind = EffectSchema.QuantityKinds[(int)sel];
                if (spec.Kind == "DECK_CARDS_MATCHING_COST")
                    spec.Cost ??= new QuantitySpec { Kind = "CHOSEN_NUMBER" };
                onChanged();
                Rebuild();
            };
            box.AddChild(kindPick);

            if (spec.Kind == "CONST")
            {
                var sb = new SpinBox { MinValue = -30, MaxValue = 30, Value = spec.Value };
                sb.ValueChanged += v => { spec.Value = (int)v; onChanged(); };
                box.AddChild(sb);
            }
            if (EffectSchema.SidedQuantityKinds.Contains(spec.Kind) || spec.Kind == "DECK_CARDS_MATCHING_COST")
            {
                var side = new OptionButton();
                foreach (var r in RelItems) side.AddItem(r);
                side.Selected = spec.Side == "opponent" ? 1 : 0;
                side.ItemSelected += sel => { spec.Side = RelItems[(int)sel]; onChanged(); };
                box.AddChild(side);
            }
            if (spec.Kind == "COUNTER")
            {
                box.AddChild(LabeledLine("counter", spec.CounterName, s => { spec.CounterName = s; onChanged(); }));
                box.AddChild(LabeledLine("on", spec.PermanentDefId, s => { spec.PermanentDefId = s; onChanged(); }));
            }
            if (spec.Kind == "DECK_CARDS_MATCHING_COST")
            {
                box.AddChild(Dim("of cost"));
                box.AddChild(Build(spec.Cost ??= new QuantitySpec { Kind = "CHOSEN_NUMBER" }, onChanged));
            }
        }

        Rebuild();
        return box;
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
        var le = new LineEdit { Text = value, CustomMinimumSize = new Vector2(120, 0) };
        le.TextChanged += s => onChanged(s);
        h.AddChild(le);
        return h;
    }
}
