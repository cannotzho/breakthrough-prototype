// Table-driven schema for the effect composition UI (scope M, Ken sign-off).
// One entry per effect type in the engine vocabulary, mirroring the wire
// format defined by EngineJson.EffectJsonConverter EXACTLY — the converter is
// the authority; this table only describes which JSON keys exist and what
// widget edits each. Anything the table can't describe (nested effect lists,
// alt-conditions, exotic quantities) falls back to per-row raw JSON.

using System.Collections.Generic;
using System.Linq;

namespace Breakthrough.GodotHost.Designer;

public enum SlotKind
{
    Int,        // WriteNumber(key)
    Rel,        // "self" | "opponent"; when !Required, absent means self and
                // the key is only written for opponent (matches the converter)
    Bool,       // written only when true
    TokenId,    // dropdown over the bundle's token definition ids
    Text,       // free string (counter names, target def ids)
    Boundary,   // { boundary: <name>, occurrences: n }
    Restriction // composite APPLY_RESTRICTION payload (dedicated widget)
}

public sealed record ParamSpec(string Key, string Label, SlotKind Kind,
    bool Required = true, int Min = -30, int Max = 30, int Default = 1);

public sealed record EffectSpec(string Type, bool BuilderSupported, params ParamSpec[] Params)
{
    /// <summary>Extra literal keys the converter always writes for this type.</summary>
    public IReadOnlyDictionary<string, string>? FixedStrings { get; init; }
}

public static class EffectSchema
{
    public static readonly string[] Events =
    [
        "CARD_STAGED", "CARD_PLAYED", "CARD_RESOLVED", "CARD_DRAWN", "SHIELD_BROKEN",
        "PATIENCE_CHANGED", "PRIORITY_CHANGED", "TOKEN_CREATED", "TOKEN_DESTROYED",
        "PLAYER_TURN_START", "PLAYER_TURN_END", "NPC_TURN_START", "NPC_TURN_END",
    ];

    public static readonly string[] Boundaries =
        ["PLAYER_TURN_START", "PLAYER_TURN_END", "NPC_TURN_START", "NPC_TURN_END"];

    public static readonly string[] Comparators = ["lt", "lte", "gt", "gte", "eq", "neq"];
    public static readonly string[] ComparatorGlyphs = ["<", "≤", ">", "≥", "=", "≠"];

    public static readonly string[] RestrictionTypes =
    [
        "PREVENT_SHIELD_BREAK", "PREVENT_DRAW", "PREVENT_EXTRA_DRAWS", "PREVENT_PATIENCE_GAIN",
        "MAX_CARD_COST", "INCREASE_CARD_COST", "MAX_PLAYS_PER_TURN", "MAX_TURN_START_DRAW",
        "PRIORITY_FLOOR", "PATIENCE_COST_PER_CARD", "BOTM_LIMIT_BONUS",
    ];

    public static readonly string[] CheckPoints = ["AFTER_NPC_PLAY", "AFTER_ANY_PLAY"];

    /// <summary>
    /// Quantity kinds for the dropdown. CONST first (the default); kinds
    /// carrying a "side" param are listed in SidedQuantityKinds; COUNTER and
    /// DECK_CARDS_MATCHING_COST carry extra structure and are raw-JSON-only.
    /// </summary>
    public static readonly string[] QuantityKinds =
    [
        "CONST", "PATIENCE", "MISSING_PATIENCE", "PRIORITY", "ROUND", "LIE_COUNTER",
        "CARDS_PLAYED_THIS_TURN", "EXTRA_DRAWS_THIS_TURN", "PRIORITY_GAINED_THIS_TURN",
        "OPP_SHIELDS_BROKEN_BY_PLAYER_THIS_TURN", "OPP_SHIELDS_BROKEN_BY_PLAYER_PREV_TURN",
        "PLAYER_SHIELDS_BROKEN_BY_NPC_THIS_TURN", "GUARDS_PLACED_BY_NPC_THIS_TURN",
        "NPC_GUARDS_STANDING", "CHOSEN_NUMBER", "SHIELDS_STANDING",
        "STAGED_CARD_COST", "STAGED_CARD_BREAK_COUNT",
        "EVENT_DELTA", "EVENT_DELTA_ABS", "EVENT_NEW_VALUE", "EVENT_CARD_COST",
        "EVENT_IS_OWN_SHIELD", "EVENT_IS_EXTRA_DRAW",
        "COUNTER", "DECK_CARDS_MATCHING_COST",
    ];

    public static readonly HashSet<string> SidedQuantityKinds =
    [
        "PRIORITY", "CARDS_PLAYED_THIS_TURN", "EXTRA_DRAWS_THIS_TURN",
        "PRIORITY_GAINED_THIS_TURN", "SHIELDS_STANDING",
    ];

    public static readonly HashSet<string> RawOnlyQuantityKinds = ["COUNTER", "DECK_CARDS_MATCHING_COST"];

    public static readonly IReadOnlyList<EffectSpec> Effects =
    [
        new("MODIFY_PATIENCE", true,
            new ParamSpec("value", "amount", SlotKind.Int, Default: -1)),
        // (altValue/altCondition variants fall to raw — detected by unknown keys)
        new("MODIFY_PRIORITY", true,
            new ParamSpec("value", "amount", SlotKind.Int),
            new ParamSpec("target", "target", SlotKind.Rel, Required: false)),
        new("DRAW_CARDS", true,
            new ParamSpec("value", "cards", SlotKind.Int, Min: 1)),
        new("BREAK_SHIELDS", true,
            new ParamSpec("target", "target", SlotKind.Rel),
            new ParamSpec("count", "count", SlotKind.Int, Min: 1)),
        new("PLACE_SHIELDS", true,
            new ParamSpec("count", "count", SlotKind.Int, Min: 1))
        { FixedStrings = new Dictionary<string, string> { ["target"] = "self" } },
        new("CREATE_TOKEN", true,
            new ParamSpec("tokenDefinitionId", "token", SlotKind.TokenId),
            new ParamSpec("count", "count", SlotKind.Int, Min: 1)),
        new("DESTROY_TOKENS", true,
            new ParamSpec("count", "count", SlotKind.Int, Min: 1),
            new ParamSpec("tokenDefinitionId", "token", SlotKind.TokenId, Required: false)),
        new("TRANSFORM_TOKEN", true,
            new ParamSpec("fromTokenId", "from", SlotKind.TokenId),
            new ParamSpec("toTokenId", "into", SlotKind.TokenId),
            new ParamSpec("count", "count", SlotKind.Int, Required: false, Min: 1),
            new ParamSpec("upTo", "up to", SlotKind.Bool),
            new ParamSpec("all", "all", SlotKind.Bool)),
        new("DESTROY_SELF", true),
        new("DESTROY_IMPRESSION", true,
            new ParamSpec("owner", "owner", SlotKind.Rel),
            new ParamSpec("count", "count", SlotKind.Int, Required: false, Min: 1)),
        new("APPLY_RESTRICTION", true,
            new ParamSpec("restriction", "restriction", SlotKind.Restriction)),
        new("APPLY_REPLACEMENT", true,
            new ParamSpec("originalTokenId", "replaces", SlotKind.TokenId),
            new ParamSpec("replacementTokenId", "with", SlotKind.TokenId),
            new ParamSpec("expiry", "until", SlotKind.Boundary, Required: false)),
        new("SCHEDULE_EFFECTS", false), // nested effect list — raw JSON only
        new("CHOOSE_NUMBER", true,
            new ParamSpec("min", "min", SlotKind.Int, Min: 0),
            new ParamSpec("max", "max", SlotKind.Int, Min: 0, Default: 3)),
        new("COPY_FROM_NPC_DECK", false), // optional quantity params — raw JSON only
        new("REVEAL_NPC_HAND", true),
        new("HIDE_NPC_HAND", true),
        new("REVEAL_NPC_DECK_TOP", true),
        new("HIDE_NPC_DECK_TOP", true),
        new("DECK_REVEAL", true,
            new ParamSpec("count", "cards", SlotKind.Int, Min: 1))
        { FixedStrings = new Dictionary<string, string> { ["side"] = "opponent" } },
        new("CANCEL_STAGED_CARD", true),
        new("INCREMENT_COUNTERS", true,
            new ParamSpec("counterName", "counter", SlotKind.Text),
            new ParamSpec("targetDefinitionId", "on card", SlotKind.Text),
            new ParamSpec("amount", "amount", SlotKind.Int)),
        new("RESHUFFLE_DECK", true),
    ];

    public static EffectSpec? Find(string type) => Effects.FirstOrDefault(e => e.Type == type);

    /// <summary>Keys the builder understands for a row of this type (others force raw mode).</summary>
    public static HashSet<string> KnownKeys(EffectSpec spec)
    {
        var keys = new HashSet<string> { "type", "condition", "scale" };
        foreach (var p in spec.Params) keys.Add(p.Key);
        if (spec.FixedStrings != null) foreach (var k in spec.FixedStrings.Keys) keys.Add(k);
        return keys;
    }
}
