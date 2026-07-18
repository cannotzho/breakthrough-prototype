// JSON support for the engine's data vocabulary.
//
// Two consumers:
//  1. Canonical state serialization — the C# equivalent of the TS tests'
//     JSON.stringify(state) determinism checks (byte-identical output for
//     identical states).
//  2. Content deserialization — cards/encounters/nuggets exported from the TS
//     content layer keep their exact TS JSON shapes ({ type: 'MODIFY_PATIENCE',
//     ... }, { kind: 'CONST', ... }, { compare: ... }).
//
// Pure data plumbing — no Godot dependencies (System.Text.Json is part of the
// .NET base class library).

using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace Breakthrough.Engine.Json;

public static class EngineJson
{
    public static readonly JsonSerializerOptions Options = Create();

    private static JsonSerializerOptions Create()
    {
        var o = new JsonSerializerOptions
        {
            PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
            DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        };
        o.Converters.Add(new SideJsonConverter());
        o.Converters.Add(new NullableSideJsonConverter());
        o.Converters.Add(new RelSideJsonConverter());
        o.Converters.Add(new QuantityJsonConverter());
        o.Converters.Add(new ConditionJsonConverter());
        o.Converters.Add(new EffectJsonConverter());
        return o;
    }

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

    public static T Deserialize<T>(string json) => JsonSerializer.Deserialize<T>(json, Options)!;
}

public sealed class SideJsonConverter : JsonConverter<Side>
{
    public override Side Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.GetString() switch
        {
            "player" => Side.Player,
            "npc" => Side.Npc,
            var s => throw new JsonException($"Unknown side \"{s}\""),
        };

    public override void Write(Utf8JsonWriter writer, Side value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value.ToKey());
}

public sealed class NullableSideJsonConverter : JsonConverter<Side?>
{
    public override Side? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType == JsonTokenType.Null) return null;
        return reader.GetString() switch
        {
            "player" => Side.Player,
            "npc" => Side.Npc,
            var s => throw new JsonException($"Unknown side \"{s}\""),
        };
    }

    public override void Write(Utf8JsonWriter writer, Side? value, JsonSerializerOptions options)
    {
        if (value == null) writer.WriteNullValue();
        else writer.WriteStringValue(value.Value.ToKey());
    }
}

public sealed class RelSideJsonConverter : JsonConverter<RelSide>
{
    public override RelSide Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options) =>
        reader.GetString() switch
        {
            "self" => RelSide.Self,
            "opponent" => RelSide.Opponent,
            var s => throw new JsonException($"Unknown relative side \"{s}\""),
        };

    public override void Write(Utf8JsonWriter writer, RelSide value, JsonSerializerOptions options) =>
        writer.WriteStringValue(value == RelSide.Self ? "self" : "opponent");
}

internal static class JsonElementExtensions
{
    public static int GetIntProp(this JsonElement el, string name) => el.GetProperty(name).GetInt32();

    public static int? GetIntPropOrNull(this JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null ? v.GetInt32() : null;

    public static string GetStringProp(this JsonElement el, string name) => el.GetProperty(name).GetString()!;

    public static string? GetStringPropOrNull(this JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null ? v.GetString() : null;

    public static bool GetBoolPropOrFalse(this JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;

    public static JsonElement? GetPropOrNull(this JsonElement el, string name) =>
        el.TryGetProperty(name, out var v) && v.ValueKind != JsonValueKind.Null ? v : null;
}

public sealed class QuantityJsonConverter : JsonConverter<Quantity>
{
    public override Quantity Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        return ReadQuantity(doc.RootElement, options);
    }

    internal static Quantity ReadQuantity(JsonElement el, JsonSerializerOptions options)
    {
        string kind = el.GetStringProp("kind");
        RelSide Rel() => el.GetStringProp("side") == "self" ? RelSide.Self : RelSide.Opponent;
        return kind switch
        {
            "CONST" => new ConstQ(el.GetIntProp("value")),
            "PATIENCE" => new PatienceQ(),
            "MISSING_PATIENCE" => new MissingPatienceQ(),
            "PRIORITY" => new PriorityQ(Rel()),
            "ROUND" => new RoundQ(),
            "LIE_COUNTER" => new LieCounterQ(),
            "CARDS_PLAYED_THIS_TURN" => new CardsPlayedThisTurnQ(Rel()),
            "EXTRA_DRAWS_THIS_TURN" => new ExtraDrawsThisTurnQ(Rel()),
            "PRIORITY_GAINED_THIS_TURN" => new PriorityGainedThisTurnQ(Rel()),
            "OPP_SHIELDS_BROKEN_BY_PLAYER_THIS_TURN" => new OppShieldsBrokenByPlayerThisTurnQ(),
            "OPP_SHIELDS_BROKEN_BY_PLAYER_PREV_TURN" => new OppShieldsBrokenByPlayerPrevTurnQ(),
            "PLAYER_SHIELDS_BROKEN_BY_NPC_THIS_TURN" => new PlayerShieldsBrokenByNpcThisTurnQ(),
            "GUARDS_PLACED_BY_NPC_THIS_TURN" => new GuardsPlacedByNpcThisTurnQ(),
            "NPC_GUARDS_STANDING" => new NpcGuardsStandingQ(),
            "CHOSEN_NUMBER" => new ChosenNumberQ(),
            "COUNTER" => new CounterQ(el.GetStringProp("counterName"), el.GetStringProp("permanentDefId")),
            "DECK_CARDS_MATCHING_COST" => new DeckCardsMatchingCostQ(Rel(), ReadQuantity(el.GetProperty("cost"), options)),
            "SHIELDS_STANDING" => new ShieldsStandingQ(Rel()),
            "STAGED_CARD_COST" => new StagedCardCostQ(),
            "STAGED_CARD_BREAK_COUNT" => new StagedCardBreakCountQ(),
            "EVENT_DELTA" => new EventDeltaQ(),
            "EVENT_DELTA_ABS" => new EventDeltaAbsQ(),
            "EVENT_NEW_VALUE" => new EventNewValueQ(),
            "EVENT_CARD_COST" => new EventCardCostQ(),
            "EVENT_IS_OWN_SHIELD" => new EventIsOwnShieldQ(),
            "EVENT_IS_EXTRA_DRAW" => new EventIsExtraDrawQ(),
            _ => throw new JsonException($"Unknown quantity kind \"{kind}\""),
        };
    }

    public override void Write(Utf8JsonWriter writer, Quantity value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        void Kind(string k) => writer.WriteString("kind", k);
        void Rel(RelSide s) => writer.WriteString("side", s == RelSide.Self ? "self" : "opponent");
        switch (value)
        {
            case ConstQ q:
                Kind("CONST");
                writer.WriteNumber("value", q.Value);
                break;
            case PatienceQ: Kind("PATIENCE"); break;
            case MissingPatienceQ: Kind("MISSING_PATIENCE"); break;
            case PriorityQ q: Kind("PRIORITY"); Rel(q.Side); break;
            case RoundQ: Kind("ROUND"); break;
            case LieCounterQ: Kind("LIE_COUNTER"); break;
            case CardsPlayedThisTurnQ q: Kind("CARDS_PLAYED_THIS_TURN"); Rel(q.Side); break;
            case ExtraDrawsThisTurnQ q: Kind("EXTRA_DRAWS_THIS_TURN"); Rel(q.Side); break;
            case PriorityGainedThisTurnQ q: Kind("PRIORITY_GAINED_THIS_TURN"); Rel(q.Side); break;
            case OppShieldsBrokenByPlayerThisTurnQ: Kind("OPP_SHIELDS_BROKEN_BY_PLAYER_THIS_TURN"); break;
            case OppShieldsBrokenByPlayerPrevTurnQ: Kind("OPP_SHIELDS_BROKEN_BY_PLAYER_PREV_TURN"); break;
            case PlayerShieldsBrokenByNpcThisTurnQ: Kind("PLAYER_SHIELDS_BROKEN_BY_NPC_THIS_TURN"); break;
            case GuardsPlacedByNpcThisTurnQ: Kind("GUARDS_PLACED_BY_NPC_THIS_TURN"); break;
            case NpcGuardsStandingQ: Kind("NPC_GUARDS_STANDING"); break;
            case ChosenNumberQ: Kind("CHOSEN_NUMBER"); break;
            case CounterQ q:
                Kind("COUNTER");
                writer.WriteString("counterName", q.CounterName);
                writer.WriteString("permanentDefId", q.PermanentDefId);
                break;
            case DeckCardsMatchingCostQ q:
                Kind("DECK_CARDS_MATCHING_COST");
                Rel(q.Side);
                writer.WritePropertyName("cost");
                Write(writer, q.Cost, options);
                break;
            case ShieldsStandingQ q: Kind("SHIELDS_STANDING"); Rel(q.Side); break;
            case StagedCardCostQ: Kind("STAGED_CARD_COST"); break;
            case StagedCardBreakCountQ: Kind("STAGED_CARD_BREAK_COUNT"); break;
            case EventDeltaQ: Kind("EVENT_DELTA"); break;
            case EventDeltaAbsQ: Kind("EVENT_DELTA_ABS"); break;
            case EventNewValueQ: Kind("EVENT_NEW_VALUE"); break;
            case EventCardCostQ: Kind("EVENT_CARD_COST"); break;
            case EventIsOwnShieldQ: Kind("EVENT_IS_OWN_SHIELD"); break;
            case EventIsExtraDrawQ: Kind("EVENT_IS_EXTRA_DRAW"); break;
            default: throw new JsonException($"Unknown quantity {value.GetType().Name}");
        }
        writer.WriteEndObject();
    }
}

public sealed class ConditionJsonConverter : JsonConverter<Condition>
{
    public override Condition Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        return ReadCondition(doc.RootElement, options);
    }

    internal static Condition ReadCondition(JsonElement el, JsonSerializerOptions options)
    {
        if (el.TryGetProperty("compare", out var cmp))
        {
            return new CompareCondition(
                QuantityJsonConverter.ReadQuantity(cmp.GetProperty("lhs"), options),
                cmp.GetStringProp("op"),
                QuantityJsonConverter.ReadQuantity(cmp.GetProperty("rhs"), options));
        }
        if (el.TryGetProperty("all", out var all))
        {
            return new AllCondition(all.EnumerateArray().Select(x => ReadCondition(x, options)).ToList());
        }
        if (el.TryGetProperty("any", out var any))
        {
            return new AnyCondition(any.EnumerateArray().Select(x => ReadCondition(x, options)).ToList());
        }
        if (el.TryGetProperty("not", out var not))
        {
            return new NotCondition(ReadCondition(not, options));
        }
        throw new JsonException("Unknown condition shape");
    }

    public override void Write(Utf8JsonWriter writer, Condition value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        switch (value)
        {
            case CompareCondition c:
                writer.WritePropertyName("compare");
                writer.WriteStartObject();
                writer.WritePropertyName("lhs");
                JsonSerializer.Serialize(writer, c.Lhs, options);
                writer.WriteString("op", c.Op);
                writer.WritePropertyName("rhs");
                JsonSerializer.Serialize(writer, c.Rhs, options);
                writer.WriteEndObject();
                break;
            case AllCondition c:
                writer.WritePropertyName("all");
                writer.WriteStartArray();
                foreach (var x in c.Items) Write(writer, x, options);
                writer.WriteEndArray();
                break;
            case AnyCondition c:
                writer.WritePropertyName("any");
                writer.WriteStartArray();
                foreach (var x in c.Items) Write(writer, x, options);
                writer.WriteEndArray();
                break;
            case NotCondition c:
                writer.WritePropertyName("not");
                Write(writer, c.Inner, options);
                break;
            default:
                throw new JsonException($"Unknown condition {value.GetType().Name}");
        }
        writer.WriteEndObject();
    }
}

public sealed class EffectJsonConverter : JsonConverter<Effect>
{
    public override Effect Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        using var doc = JsonDocument.ParseValue(ref reader);
        return ReadEffect(doc.RootElement, options);
    }

    internal static Effect ReadEffect(JsonElement el, JsonSerializerOptions options)
    {
        string type = el.GetStringProp("type");
        Condition? ReadCond(string name) =>
            el.GetPropOrNull(name) is { } c ? ConditionJsonConverter.ReadCondition(c, options) : null;
        Quantity? ReadQty(string name) =>
            el.GetPropOrNull(name) is { } q ? QuantityJsonConverter.ReadQuantity(q, options) : null;
        RelSide RelOf(string name) => el.GetStringProp(name) == "self" ? RelSide.Self : RelSide.Opponent;
        BoundaryRef? ReadBoundary(string name) =>
            el.GetPropOrNull(name) is { } b
                ? new BoundaryRef { Boundary = b.GetStringProp("boundary"), Occurrences = b.GetIntProp("occurrences") }
                : null;
        List<Effect> ReadEffects(string name) =>
            el.GetProperty(name).EnumerateArray().Select(x => ReadEffect(x, options)).ToList();

        Effect core = type switch
        {
            "MODIFY_PATIENCE" => new ModifyPatienceEffect(el.GetIntProp("value"))
            {
                AltValue = el.GetIntPropOrNull("altValue"),
                AltCondition = ReadCond("altCondition"),
            },
            "MODIFY_PRIORITY" => new ModifyPriorityEffect(el.GetIntProp("value"))
            {
                Target = el.GetStringPropOrNull("target") == "opponent" ? RelSide.Opponent : RelSide.Self,
            },
            "DRAW_CARDS" => new DrawCardsEffect(el.GetIntProp("value")),
            "BREAK_SHIELDS" => new BreakShieldsEffect(RelOf("target"), el.GetIntProp("count")),
            "PLACE_SHIELDS" => new PlaceShieldsEffect(el.GetIntProp("count")),
            "CREATE_TOKEN" => new CreateTokenEffect(el.GetStringProp("tokenDefinitionId"), el.GetIntProp("count")),
            "DESTROY_TOKENS" => new DestroyTokensEffect(el.GetIntProp("count"))
            {
                TokenDefinitionId = el.GetStringPropOrNull("tokenDefinitionId"),
            },
            "TRANSFORM_TOKEN" => new TransformTokenEffect(el.GetStringProp("fromTokenId"), el.GetStringProp("toTokenId"))
            {
                Count = el.GetIntPropOrNull("count"),
                UpTo = el.GetBoolPropOrFalse("upTo"),
                All = el.GetBoolPropOrFalse("all"),
            },
            "DESTROY_SELF" => new DestroySelfEffect(),
            "DESTROY_IMPRESSION" => new DestroyImpressionEffect(RelOf("owner"))
            {
                Count = el.GetIntPropOrNull("count"),
            },
            "APPLY_RESTRICTION" => new ApplyRestrictionEffect(ReadRestrictionDef(el.GetProperty("restriction"))),
            "APPLY_REPLACEMENT" => new ApplyReplacementEffect(
                el.GetStringProp("originalTokenId"), el.GetStringProp("replacementTokenId"))
            {
                Expiry = ReadBoundary("expiry"),
            },
            "SCHEDULE_EFFECTS" => new ScheduleEffectsEffect(ReadEffects("effects"), ReadBoundary("at")!),
            "CHOOSE_NUMBER" => new ChooseNumberEffect(el.GetIntProp("min"), el.GetIntProp("max")),
            "COPY_FROM_NPC_DECK" => new CopyFromNpcDeckEffect(el.GetIntProp("count"))
            {
                CostEquals = ReadQty("costEquals"),
                WithShieldBreak = el.GetBoolPropOrFalse("withShieldBreak"),
                PatienceCostOverride = ReadQty("patienceCostOverride"),
            },
            "REVEAL_NPC_HAND" => new RevealNpcHandEffect(),
            "HIDE_NPC_HAND" => new HideNpcHandEffect(),
            "REVEAL_NPC_DECK_TOP" => new RevealNpcDeckTopEffect(),
            "HIDE_NPC_DECK_TOP" => new HideNpcDeckTopEffect(),
            "DECK_REVEAL" => new DeckRevealEffect(el.GetIntProp("count")),
            "CANCEL_STAGED_CARD" => new CancelStagedCardEffect(),
            "INCREMENT_COUNTERS" => new IncrementCountersEffect(
                el.GetStringProp("counterName"), el.GetStringProp("targetDefinitionId"), el.GetIntProp("amount")),
            "RESHUFFLE_DECK" => new ReshuffleDeckEffect(),
            _ => throw new JsonException($"Unknown effect type \"{type}\""),
        };
        return core with { Condition = ReadCond("condition"), Scale = ReadQty("scale") };
    }

    private static RestrictionDef ReadRestrictionDef(JsonElement el) => new(
        el.GetStringProp("type"), el.GetStringProp("target"))
    {
        Value = el.GetIntPropOrNull("value"),
        ConditionThreshold = el.GetIntPropOrNull("conditionThreshold"),
        Expiry = el.GetPropOrNull("expiry") is { } b
            ? new BoundaryRef { Boundary = b.GetStringProp("boundary"), Occurrences = b.GetIntProp("occurrences") }
            : null,
    };

    public override void Write(Utf8JsonWriter writer, Effect value, JsonSerializerOptions options)
    {
        writer.WriteStartObject();
        void Type(string t) => writer.WriteString("type", t);
        void Rel(string name, RelSide s) => writer.WriteString(name, s == RelSide.Self ? "self" : "opponent");
        void Boundary(string name, BoundaryRef b)
        {
            writer.WritePropertyName(name);
            writer.WriteStartObject();
            writer.WriteString("boundary", b.Boundary);
            writer.WriteNumber("occurrences", b.Occurrences);
            writer.WriteEndObject();
        }
        void Qty(string name, Quantity q)
        {
            writer.WritePropertyName(name);
            JsonSerializer.Serialize(writer, q, options);
        }
        void Cond(string name, Condition c)
        {
            writer.WritePropertyName(name);
            JsonSerializer.Serialize(writer, c, options);
        }

        switch (value)
        {
            case ModifyPatienceEffect e:
                Type("MODIFY_PATIENCE");
                writer.WriteNumber("value", e.Value);
                if (e.AltValue != null) writer.WriteNumber("altValue", e.AltValue.Value);
                if (e.AltCondition != null) Cond("altCondition", e.AltCondition);
                break;
            case ModifyPriorityEffect e:
                Type("MODIFY_PRIORITY");
                writer.WriteNumber("value", e.Value);
                if (e.Target == RelSide.Opponent) Rel("target", e.Target);
                break;
            case DrawCardsEffect e:
                Type("DRAW_CARDS");
                writer.WriteNumber("value", e.Value);
                break;
            case BreakShieldsEffect e:
                Type("BREAK_SHIELDS");
                Rel("target", e.Target);
                writer.WriteNumber("count", e.Count);
                break;
            case PlaceShieldsEffect e:
                Type("PLACE_SHIELDS");
                writer.WriteString("target", "self");
                writer.WriteNumber("count", e.Count);
                break;
            case CreateTokenEffect e:
                Type("CREATE_TOKEN");
                writer.WriteString("tokenDefinitionId", e.TokenDefinitionId);
                writer.WriteNumber("count", e.Count);
                break;
            case DestroyTokensEffect e:
                Type("DESTROY_TOKENS");
                writer.WriteNumber("count", e.Count);
                if (e.TokenDefinitionId != null) writer.WriteString("tokenDefinitionId", e.TokenDefinitionId);
                break;
            case TransformTokenEffect e:
                Type("TRANSFORM_TOKEN");
                writer.WriteString("fromTokenId", e.FromTokenId);
                writer.WriteString("toTokenId", e.ToTokenId);
                if (e.Count != null) writer.WriteNumber("count", e.Count.Value);
                if (e.UpTo) writer.WriteBoolean("upTo", e.UpTo);
                if (e.All) writer.WriteBoolean("all", e.All);
                break;
            case DestroySelfEffect:
                Type("DESTROY_SELF");
                break;
            case DestroyImpressionEffect e:
                Type("DESTROY_IMPRESSION");
                Rel("owner", e.Owner);
                if (e.Count != null) writer.WriteNumber("count", e.Count.Value);
                break;
            case ApplyRestrictionEffect e:
                Type("APPLY_RESTRICTION");
                writer.WritePropertyName("restriction");
                writer.WriteStartObject();
                writer.WriteString("type", e.Restriction.Type);
                writer.WriteString("target", e.Restriction.Target);
                if (e.Restriction.Value != null) writer.WriteNumber("value", e.Restriction.Value.Value);
                if (e.Restriction.ConditionThreshold != null) writer.WriteNumber("conditionThreshold", e.Restriction.ConditionThreshold.Value);
                if (e.Restriction.Expiry != null) Boundary("expiry", e.Restriction.Expiry);
                writer.WriteEndObject();
                break;
            case ApplyReplacementEffect e:
                Type("APPLY_REPLACEMENT");
                writer.WriteString("originalTokenId", e.OriginalTokenId);
                writer.WriteString("replacementTokenId", e.ReplacementTokenId);
                if (e.Expiry != null) Boundary("expiry", e.Expiry);
                break;
            case ScheduleEffectsEffect e:
                Type("SCHEDULE_EFFECTS");
                writer.WritePropertyName("effects");
                writer.WriteStartArray();
                foreach (var x in e.Effects) Write(writer, x, options);
                writer.WriteEndArray();
                Boundary("at", e.At);
                break;
            case ChooseNumberEffect e:
                Type("CHOOSE_NUMBER");
                writer.WriteNumber("min", e.Min);
                writer.WriteNumber("max", e.Max);
                break;
            case CopyFromNpcDeckEffect e:
                Type("COPY_FROM_NPC_DECK");
                writer.WriteNumber("count", e.Count);
                if (e.CostEquals != null) Qty("costEquals", e.CostEquals);
                if (e.WithShieldBreak) writer.WriteBoolean("withShieldBreak", e.WithShieldBreak);
                if (e.PatienceCostOverride != null) Qty("patienceCostOverride", e.PatienceCostOverride);
                break;
            case RevealNpcHandEffect:
                Type("REVEAL_NPC_HAND");
                break;
            case HideNpcHandEffect:
                Type("HIDE_NPC_HAND");
                break;
            case RevealNpcDeckTopEffect:
                Type("REVEAL_NPC_DECK_TOP");
                break;
            case HideNpcDeckTopEffect:
                Type("HIDE_NPC_DECK_TOP");
                break;
            case DeckRevealEffect e:
                Type("DECK_REVEAL");
                writer.WriteString("side", "opponent");
                writer.WriteNumber("count", e.Count);
                break;
            case CancelStagedCardEffect:
                Type("CANCEL_STAGED_CARD");
                break;
            case IncrementCountersEffect e:
                Type("INCREMENT_COUNTERS");
                writer.WriteString("counterName", e.CounterName);
                writer.WriteString("targetDefinitionId", e.TargetDefinitionId);
                writer.WriteNumber("amount", e.Amount);
                break;
            case ReshuffleDeckEffect:
                Type("RESHUFFLE_DECK");
                break;
            default:
                throw new JsonException($"Unknown effect {value.GetType().Name}");
        }
        if (value.Condition != null) Cond("condition", value.Condition);
        if (value.Scale != null) Qty("scale", value.Scale);
        writer.WriteEndObject();
    }
}
