// Pure (Godot-free) model behind the effect composition UI (scope M).
//
// Loads a card's effect-bearing sections into editable rows and writes them
// back into the card's JsonObject. Fidelity contract, same as the rest of the
// designer:
//   - Row-level dirty tracking: an untouched row re-emits its ORIGINAL node
//     verbatim, and an untouched section is left in place entirely, so a
//     no-op load→save is byte-identical and a real edit produces a minimal
//     diff.
//   - Structured (dirty) rows serialize in the exact key order of
//     EngineJson.EffectJsonConverter, so edited rows still deserialize +
//     ValidateCard cleanly.
//   - Anything the builder can't model — nested SCHEDULE_EFFECTS, MODIFY_
//     PATIENCE alt-values, exotic quantities, All/Any/Not condition trees —
//     is preserved verbatim: whole rows drop to a raw-JSON escape hatch and
//     complex trigger conditions round-trip untouched.
//
// This file has NO Godot dependency so the round-trip can be headless-tested.

using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;

namespace Breakthrough.GodotHost.Designer;

// ── a single effect ─────────────────────────────────────────────────────────

public sealed class EffectRow
{
    public string Type = "";
    public bool IsRaw;
    public string RawText = "";
    public JsonNode? Original;
    public bool Dirty;

    /// <summary>Structured slot values keyed by ParamSpec.Key (int / bool / string / JsonNode).</summary>
    public readonly Dictionary<string, object?> Params = new();
    public JsonNode? Condition; // per-effect condition, preserved verbatim
    public JsonNode? Scale;     // per-effect scale, preserved verbatim

    public void MarkDirty() => Dirty = true;

    public static EffectRow FromNode(JsonNode? node)
    {
        var row = new EffectRow { Original = node?.DeepClone() };
        if (node is not JsonObject obj || obj["type"] is null)
        {
            row.IsRaw = true;
            row.RawText = node?.ToJsonString(DesignerJson.Pretty) ?? "{}";
            return row;
        }
        string type = obj["type"]!.GetValue<string>();
        row.Type = type;
        var spec = EffectSchema.Find(type);
        if (spec is null || !spec.BuilderSupported || obj.Any(kv => !EffectSchema.KnownKeys(spec).Contains(kv.Key)))
        {
            row.IsRaw = true;
            row.RawText = obj.ToJsonString(DesignerJson.Pretty);
            return row;
        }

        foreach (var p in spec.Params)
        {
            if (spec.FixedStrings?.ContainsKey(p.Key) == true) continue;
            if (obj[p.Key] is not { } val)
            {
                row.Params[p.Key] = p.Kind == SlotKind.Rel ? "self" : null;
                continue;
            }
            // Cast each arm to object: JsonNode has implicit conversions from
            // int/bool/string, so without this the switch unifies to JsonNode
            // and re-wraps primitives into JsonValue.
            row.Params[p.Key] = p.Kind switch
            {
                SlotKind.Int => (object)val.GetValue<int>(),
                SlotKind.Bool => (object)val.GetValue<bool>(),
                SlotKind.Rel or SlotKind.TokenId or SlotKind.Text => (object)val.GetValue<string>(),
                _ => val.DeepClone(), // Boundary / Restriction — verbatim
            };
        }
        row.Condition = obj["condition"]?.DeepClone();
        row.Scale = obj["scale"]?.DeepClone();
        return row;
    }

    public JsonNode ToNode()
    {
        if (!Dirty && Original is not null) return Original.DeepClone();
        if (IsRaw) return JsonNode.Parse(RawText)!;

        var spec = EffectSchema.Find(Type)!;
        var o = new JsonObject { ["type"] = Type };
        if (spec.FixedStrings is not null)
            foreach (var (k, v) in spec.FixedStrings) o[k] = v;

        foreach (var p in spec.Params)
        {
            if (spec.FixedStrings?.ContainsKey(p.Key) == true) continue;
            if (!Params.TryGetValue(p.Key, out var val)) continue;
            switch (p.Kind)
            {
                case SlotKind.Int:
                    if (val is int i) o[p.Key] = i;
                    else if (!p.Required) { } // unset optional int → omit
                    break;
                case SlotKind.Bool:
                    if (val is true) o[p.Key] = true; // omit when false
                    break;
                case SlotKind.Rel:
                    string rel = (val as string) ?? "self";
                    if (p.Required || rel != "self") o[p.Key] = rel; // omit self when optional
                    break;
                case SlotKind.TokenId:
                case SlotKind.Text:
                    if (val is string s && s.Length > 0) o[p.Key] = s;
                    break;
                default:
                    if (val is JsonNode n) o[p.Key] = n.DeepClone();
                    break;
            }
        }
        if (Condition is not null) o["condition"] = Condition.DeepClone();
        if (Scale is not null) o["scale"] = Scale.DeepClone();
        return o;
    }
}

// ── a trigger header ("When [event] by [who], if [q] [op] [N]") ──────────────

public sealed class TriggerModel
{
    public string Event = "CARD_PLAYED";
    public string ControllerFilter = "any"; // any | self | opponent  ("any" ⇒ omit)
    public bool HasCondition;
    public bool ConditionComplex;           // present but not a simple Compare(q, op, CONST)
    public JsonNode? ComplexCondition;       // verbatim when complex
    public string Lhs = "PATIENCE";          // simple quantity kind
    public string LhsSide = "self";
    public string Op = "gte";
    public int Rhs = 1;

    public JsonNode? Original;
    public bool Dirty;

    public void MarkDirty() => Dirty = true;

    public static TriggerModel FromNode(JsonNode node)
    {
        var t = new TriggerModel { Original = node.DeepClone() };
        var obj = node.AsObject();
        t.Event = obj["event"]?.GetValue<string>() ?? "CARD_PLAYED";
        t.ControllerFilter = obj["controllerFilter"]?.GetValue<string>() ?? "any";
        if (obj["condition"] is { } cond)
        {
            t.HasCondition = true;
            if (TryReadSimpleCompare(cond, out var lhs, out var lhsSide, out var op, out var rhs))
            {
                t.Lhs = lhs; t.LhsSide = lhsSide; t.Op = op; t.Rhs = rhs;
            }
            else
            {
                t.ConditionComplex = true;
                t.ComplexCondition = cond.DeepClone();
            }
        }
        return t;
    }

    public JsonNode ToNode()
    {
        if (!Dirty && Original is not null) return Original.DeepClone();
        var o = new JsonObject { ["event"] = Event };
        if (ControllerFilter != "any") o["controllerFilter"] = ControllerFilter;
        if (HasCondition)
            o["condition"] = ConditionComplex && ComplexCondition is not null
                ? ComplexCondition.DeepClone()
                : SimpleCompare(Lhs, LhsSide, Op, Rhs);
        return o;
    }

    internal static JsonObject SimpleCompare(string lhsKind, string lhsSide, string op, int rhs)
    {
        var lhs = new JsonObject { ["kind"] = lhsKind };
        if (EffectSchema.SidedQuantityKinds.Contains(lhsKind)) lhs["side"] = lhsSide;
        return new JsonObject
        {
            ["compare"] = new JsonObject
            {
                ["lhs"] = lhs,
                ["op"] = op,
                ["rhs"] = new JsonObject { ["kind"] = "CONST", ["value"] = rhs },
            },
        };
    }

    internal static bool TryReadSimpleCompare(JsonNode cond, out string lhs, out string lhsSide, out string op, out int rhs)
    {
        lhs = "PATIENCE"; lhsSide = "self"; op = "gte"; rhs = 1;
        if (cond is not JsonObject o || o["compare"] is not JsonObject cmp) return false;
        if (cmp["lhs"] is not JsonObject l || cmp["rhs"] is not JsonObject r) return false;
        string lk = l["kind"]?.GetValue<string>() ?? "";
        if (!EffectSchema.QuantityKinds.Contains(lk) || EffectSchema.RawOnlyQuantityKinds.Contains(lk)) return false;
        if (r["kind"]?.GetValue<string>() != "CONST") return false;
        lhs = lk;
        lhsSide = l["side"]?.GetValue<string>() ?? "self";
        op = cmp["op"]?.GetValue<string>() ?? "gte";
        rhs = r["value"]?.GetValue<int>() ?? 0;
        return true;
    }
}

// ── a list of effect rows (the reusable building block) ──────────────────────

public sealed class EffectListSection
{
    public readonly string Key;
    public readonly List<EffectRow> Rows = [];
    public bool Structural; // rows added / removed / reordered

    public EffectListSection(string key, JsonArray? source)
    {
        Key = key;
        if (source is not null)
            foreach (var n in source) Rows.Add(EffectRow.FromNode(n));
    }

    public bool Touched => Structural || Rows.Any(r => r.Dirty);

    public JsonArray ToArray()
    {
        var arr = new JsonArray();
        foreach (var r in Rows) arr.Add(r.ToNode());
        return arr;
    }
}

// ── one triggered ability (trigger header + its own effect rows) ─────────────

public sealed class TriggeredAbilityModel
{
    public string Id = "";
    public TriggerModel Trigger = new();
    public EffectListSection Effects;
    public int? MaxTimesPerPlay;
    public int? MaxTimesPerTurn;
    public JsonObject? Original;
    public bool MetaDirty;

    public TriggeredAbilityModel(JsonObject? src)
    {
        Original = src?.DeepClone()?.AsObject();
        Id = src?["id"]?.GetValue<string>() ?? "";
        Trigger = src?["trigger"] is { } tr ? TriggerModel.FromNode(tr) : new TriggerModel();
        Effects = new EffectListSection("effects", src?["effects"] as JsonArray);
        MaxTimesPerPlay = src?["maxTimesPerPlay"]?.GetValue<int>();
        MaxTimesPerTurn = src?["maxTimesPerTurn"]?.GetValue<int>();
    }

    public bool Touched => MetaDirty || Trigger.Dirty || Effects.Touched;

    public JsonNode ToNode()
    {
        if (!Touched && Original is not null) return Original.DeepClone();
        var o = new JsonObject { ["id"] = Id, ["trigger"] = Trigger.ToNode(), ["effects"] = Effects.ToArray() };
        if (MaxTimesPerPlay is int p) o["maxTimesPerPlay"] = p;
        if (MaxTimesPerTurn is int t) o["maxTimesPerTurn"] = t;
        return o;
    }
}

// ── one activated ability (name + cost + effect rows) ────────────────────────

public sealed class ActivatedAbilityModel
{
    public string Id = "";
    public string Name = "";
    public int CostPriority, CostPatience, CostSacrificeShields, CostDiscardCards;
    public EffectListSection Effects;
    public JsonObject? Original;
    public bool MetaDirty;

    public ActivatedAbilityModel(JsonObject? src)
    {
        Original = src?.DeepClone()?.AsObject();
        Id = src?["id"]?.GetValue<string>() ?? "";
        Name = src?["name"]?.GetValue<string>() ?? "";
        if (src?["cost"] is JsonObject c)
        {
            CostPriority = c["priority"]?.GetValue<int>() ?? 0;
            CostPatience = c["patience"]?.GetValue<int>() ?? 0;
            CostSacrificeShields = c["sacrificeShields"]?.GetValue<int>() ?? 0;
            CostDiscardCards = c["discardCards"]?.GetValue<int>() ?? 0;
        }
        Effects = new EffectListSection("effects", src?["effects"] as JsonArray);
    }

    public bool Touched => MetaDirty || Effects.Touched;

    public JsonNode ToNode()
    {
        if (!Touched && Original is not null) return Original.DeepClone();
        var cost = new JsonObject();
        if (CostPriority != 0) cost["priority"] = CostPriority;
        if (CostPatience != 0) cost["patience"] = CostPatience;
        if (CostSacrificeShields != 0) cost["sacrificeShields"] = CostSacrificeShields;
        if (CostDiscardCards != 0) cost["discardCards"] = CostDiscardCards;
        return new JsonObject { ["id"] = Id, ["name"] = Name, ["cost"] = cost, ["effects"] = Effects.ToArray() };
    }
}

// ── one threshold (counter/value/consume/checkPoint + effect rows) ───────────

public sealed class ThresholdModel
{
    public string CounterName = "";
    public int Value = 1;
    public bool Consume;
    public string? CheckPoint;
    public EffectListSection Effects;
    public JsonObject? Original;
    public bool MetaDirty;

    public ThresholdModel(JsonObject? src)
    {
        Original = src?.DeepClone()?.AsObject();
        CounterName = src?["counterName"]?.GetValue<string>() ?? "";
        Value = src?["value"]?.GetValue<int>() ?? 1;
        Consume = src?["consume"]?.GetValue<bool>() ?? false;
        CheckPoint = src?["checkPoint"]?.GetValue<string>();
        Effects = new EffectListSection("effects", src?["effects"] as JsonArray);
    }

    public bool Touched => MetaDirty || Effects.Touched;

    public JsonNode ToNode()
    {
        if (!Touched && Original is not null) return Original.DeepClone();
        var o = new JsonObject
        {
            ["counterName"] = CounterName,
            ["value"] = Value,
            ["consume"] = Consume,
            ["effects"] = Effects.ToArray(),
        };
        if (CheckPoint is not null) o["checkPoint"] = CheckPoint;
        return o;
    }
}

// ── the whole card's effect surface ──────────────────────────────────────────

public sealed class CardEffectBuilder
{
    public static readonly string[] ListSectionKeys =
        ["effects", "shieldTriggerEffects", "heavyHandEffects", "leaveTriggerEffects", "turnStartEffects"];

    public readonly Dictionary<string, EffectListSection> Lists = new();

    public bool HasTrapTrigger;
    public TriggerModel TrapTrigger = new();

    public readonly List<TriggeredAbilityModel> TriggeredAbilities = [];
    public readonly List<ActivatedAbilityModel> ActivatedAbilities = [];
    public readonly List<ThresholdModel> Thresholds = [];
    public bool TriggeredStructural, ActivatedStructural, ThresholdsStructural, TrapStructural;

    public CardEffectBuilder(JsonObject card)
    {
        foreach (var key in ListSectionKeys)
            Lists[key] = new EffectListSection(key, card[key] as JsonArray);

        if (card["trapTrigger"] is { } tt)
        {
            HasTrapTrigger = true;
            TrapTrigger = TriggerModel.FromNode(tt);
        }
        if (card["triggeredAbilities"] is JsonArray ta)
            foreach (var n in ta) TriggeredAbilities.Add(new TriggeredAbilityModel(n as JsonObject));
        if (card["activatedAbilities"] is JsonArray aa)
            foreach (var n in aa) ActivatedAbilities.Add(new ActivatedAbilityModel(n as JsonObject));
        if (card["thresholds"] is JsonArray th)
            foreach (var n in th) Thresholds.Add(new ThresholdModel(n as JsonObject));
    }

    /// <summary>
    /// Write managed sections back into the card node, replacing ONLY the keys
    /// whose section was touched (so untouched sections leave the file
    /// byte-identical). Empty lists remove the key entirely.
    /// </summary>
    public void WriteBack(JsonObject card)
    {
        foreach (var key in ListSectionKeys)
        {
            var section = Lists[key];
            bool existed = card.ContainsKey(key);
            if (!section.Touched) continue;
            if (section.Rows.Count == 0)
            {
                if (existed) card.Remove(key);
            }
            else
            {
                card[key] = section.ToArray();
            }
        }

        if (TrapStructural || TrapTrigger.Dirty)
        {
            if (HasTrapTrigger) card["trapTrigger"] = TrapTrigger.ToNode();
            else card.Remove("trapTrigger");
        }
        WriteList(card, "triggeredAbilities", TriggeredStructural,
            TriggeredAbilities, a => a.Touched, a => a.ToNode());
        WriteList(card, "activatedAbilities", ActivatedStructural,
            ActivatedAbilities, a => a.Touched, a => a.ToNode());
        WriteList(card, "thresholds", ThresholdsStructural,
            Thresholds, a => a.Touched, a => a.ToNode());
    }

    private static void WriteList<T>(JsonObject card, string key, bool structural,
        List<T> items, System.Func<T, bool> touched, System.Func<T, JsonNode> toNode)
    {
        if (!structural && !items.Any(touched)) return;
        if (items.Count == 0)
        {
            if (card.ContainsKey(key)) card.Remove(key);
            return;
        }
        var arr = new JsonArray();
        foreach (var it in items) arr.Add(toNode(it));
        card[key] = arr;
    }
}
