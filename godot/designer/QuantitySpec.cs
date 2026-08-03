// Structured read/write for the engine's Quantity and Condition shapes, so
// the designer can edit the condition/scale pattern with widgets instead of
// raw JSON (Ken: it recurs throughout the game).
//
// Pure (Godot-free) and lossless by construction: anything these specs cannot
// model round-trips through Verbatim untouched, and the owning EffectRow only
// rebuilds JSON when the user actually edits — an untouched row still
// re-emits its original bytes.

using System.Linq;
using System.Text.Json.Nodes;

namespace Breakthrough.GodotHost.Designer;

/// <summary>One quantity: a kind plus whatever that kind carries.</summary>
public sealed class QuantitySpec
{
    public string Kind = "CONST";
    public int Value = 1;                       // CONST
    public string Side = "self";                // sided kinds
    public string CounterName = "";             // COUNTER
    public string PermanentDefId = "self";      // COUNTER
    public QuantitySpec? Cost;                  // DECK_CARDS_MATCHING_COST

    /// <summary>Set when the shape is beyond the widgets — preserved as-is.</summary>
    public JsonNode? Verbatim;

    public bool IsComplex => Verbatim != null;

    public static QuantitySpec From(JsonNode? node)
    {
        if (node is not JsonObject o || o["kind"]?.GetValue<string>() is not { } kind)
            return new QuantitySpec { Verbatim = node?.DeepClone() };
        if (!EffectSchema.QuantityKinds.Contains(kind))
            return new QuantitySpec { Verbatim = node.DeepClone() };

        var spec = new QuantitySpec { Kind = kind };
        switch (kind)
        {
            case "CONST":
                spec.Value = o["value"]?.GetValue<int>() ?? 0;
                break;
            case "COUNTER":
                spec.CounterName = o["counterName"]?.GetValue<string>() ?? "";
                spec.PermanentDefId = o["permanentDefId"]?.GetValue<string>() ?? "self";
                break;
            case "DECK_CARDS_MATCHING_COST":
                spec.Side = o["side"]?.GetValue<string>() ?? "self";
                spec.Cost = From(o["cost"]);
                if (spec.Cost.IsComplex) return new QuantitySpec { Verbatim = node.DeepClone() };
                break;
            default:
                if (EffectSchema.SidedQuantityKinds.Contains(kind))
                    spec.Side = o["side"]?.GetValue<string>() ?? "self";
                break;
        }
        return spec;
    }

    public JsonNode ToNode()
    {
        if (Verbatim != null) return Verbatim.DeepClone();
        var o = new JsonObject { ["kind"] = Kind };
        switch (Kind)
        {
            case "CONST":
                o["value"] = Value;
                break;
            case "COUNTER":
                o["counterName"] = CounterName;
                o["permanentDefId"] = PermanentDefId;
                break;
            case "DECK_CARDS_MATCHING_COST":
                o["side"] = Side;
                o["cost"] = (Cost ?? new QuantitySpec { Kind = "CHOSEN_NUMBER" }).ToNode();
                break;
            default:
                if (EffectSchema.SidedQuantityKinds.Contains(Kind)) o["side"] = Side;
                break;
        }
        return o;
    }

    public QuantitySpec Clone() => From(ToNode());
}

/// <summary>A condition: only the simple compare form is widget-editable.</summary>
public sealed class ConditionSpec
{
    public bool Enabled;
    public QuantitySpec Lhs = new() { Kind = "PATIENCE" };
    public string Op = "gte";
    public QuantitySpec Rhs = new() { Kind = "CONST", Value = 1 };

    /// <summary>all / any / not, or anything else the widgets can't express.</summary>
    public JsonNode? Verbatim;

    public bool IsComplex => Verbatim != null;

    public static ConditionSpec From(JsonNode? node)
    {
        if (node == null) return new ConditionSpec();
        if (node is not JsonObject o || o["compare"] is not JsonObject cmp)
            return new ConditionSpec { Enabled = true, Verbatim = node.DeepClone() };

        var lhs = QuantitySpec.From(cmp["lhs"]);
        var rhs = QuantitySpec.From(cmp["rhs"]);
        if (lhs.IsComplex || rhs.IsComplex)
            return new ConditionSpec { Enabled = true, Verbatim = node.DeepClone() };

        return new ConditionSpec
        {
            Enabled = true,
            Lhs = lhs,
            Op = cmp["op"]?.GetValue<string>() ?? "gte",
            Rhs = rhs,
        };
    }

    /// <summary>Null when disabled — the caller removes the key entirely.</summary>
    public JsonNode? ToNode()
    {
        if (!Enabled) return null;
        if (Verbatim != null) return Verbatim.DeepClone();
        return new JsonObject
        {
            ["compare"] = new JsonObject
            {
                ["lhs"] = Lhs.ToNode(),
                ["op"] = Op,
                ["rhs"] = Rhs.ToNode(),
            },
        };
    }
}
