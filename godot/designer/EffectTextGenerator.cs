// Deterministic effect-text generator (Ken designer round 2): turns a card's
// composited effect structures into a consistent, unambiguous player-facing
// string. Flavor / long description stays hand-authored (longDescription);
// this owns only the mechanical effectText so the whole card list shares one
// vocabulary.
//
// Pure (Godot-free) so it can be headless-tested. The one external input is a
// name resolver (definitionId → display name) for tokens/cards.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;

namespace Breakthrough.GodotHost.Designer;

public static class EffectTextGenerator
{
    public static string Generate(JsonObject card, Func<string, string> nameOf)
    {
        var parts = new List<string>();

        // Trap trigger wraps the card's MAIN effects as its payload.
        if (card["trapTrigger"] is JsonObject trap)
        {
            string when = TriggerClause(trap, nameOf);
            // The trigger's own condition is stated in the header; don't repeat
            // it on effects that carry an identical copy.
            string body = Sentence(EffectList(card["effects"], nameOf, trap["condition"]));
            parts.Add($"Trap — {when}: {body}");
        }
        else
        {
            var main = EffectList(card["effects"], nameOf);
            if (main.Count > 0) parts.Add(Sentence(main));
        }

        AddClause(parts, card["shieldTriggerEffects"], "Shield Trigger", nameOf);
        AddClause(parts, card["heavyHandEffects"], "Heavy Hand", nameOf);
        AddClause(parts, card["leaveTriggerEffects"], "When this leaves the Field", nameOf);
        AddClause(parts, card["turnStartEffects"], "At your turn start", nameOf);

        foreach (var ta in card["triggeredAbilities"] as JsonArray ?? [])
            if (ta is JsonObject o)
            {
                var trig = o["trigger"] as JsonObject;
                parts.Add($"{Cap(TriggerClause(trig, nameOf))}: {Sentence(EffectList(o["effects"], nameOf, trig?["condition"]))}");
            }

        foreach (var aa in card["activatedAbilities"] as JsonArray ?? [])
            if (aa is JsonObject o)
            {
                string cost = ActivatedCost(o["cost"] as JsonObject);
                string name = o["name"]?.GetValue<string>() ?? "Ability";
                parts.Add($"{name}{(cost.Length > 0 ? $" ({cost})" : "")}: {Sentence(EffectList(o["effects"], nameOf))}");
            }

        foreach (var th in card["thresholds"] as JsonArray ?? [])
            if (th is JsonObject o)
            {
                int val = o["value"]?.GetValue<int>() ?? 0;
                string counter = o["counterName"]?.GetValue<string>() ?? "counter";
                string consume = (o["consume"]?.GetValue<bool>() ?? false) ? " (then reset)" : "";
                parts.Add($"When {counter} reaches {val}{consume}: {Sentence(EffectList(o["effects"], nameOf))}");
            }

        return string.Join(" ", parts).Trim();
    }

    private static void AddClause(List<string> parts, JsonNode? effects, string label, Func<string, string> nameOf)
    {
        var list = EffectList(effects, nameOf);
        if (list.Count > 0) parts.Add($"{label}: {Sentence(list)}");
    }

    // ── one effect → clause ─────────────────────────────────────────────────

    private static List<string> EffectList(JsonNode? node, Func<string, string> nameOf, JsonNode? ambientCond = null)
    {
        var outp = new List<string>();
        string? ambient = ambientCond?.ToJsonString();
        foreach (var e in node as JsonArray ?? [])
            if (e is JsonObject o && Describe(o, nameOf, ambient) is { Length: > 0 } phrase)
                outp.Add(phrase);
        return outp;
    }

    private static string Describe(JsonObject e, Func<string, string> nameOf, string? ambientCond = null)
    {
        string type = e["type"]?.GetValue<string>() ?? "";
        int I(string k, int d = 0) => e[k]?.GetValue<int>() ?? d;
        string S(string k) => e[k]?.GetValue<string>() ?? "";
        string scale = e["scale"] is JsonObject sc ? " per " + QuantityText(sc, nameOf) : "";

        string core = type switch
        {
            "MODIFY_PATIENCE" => I("value") >= 0 ? $"restore {I("value")} Patience{scale}" : $"pay {-I("value")} Patience{scale}",
            "MODIFY_PRIORITY" => PriorityText(I("value"), S("target"), scale),
            "DRAW_CARDS" => scale.Length > 0 ? $"draw cards equal to{scale[4..]}" : (I("value") == 1 ? "draw a card" : $"draw {I("value")} cards"),
            "BREAK_SHIELDS" => S("target") == "self"
                ? $"break {I("count")} of your {Plural("shield", I("count"))}"
                : $"break {I("count")} Guard {Plural("Shield", I("count"))}{scale}",
            "PLACE_SHIELDS" => $"place {I("count")} Placeholder {Plural("Shield", I("count"))}",
            "CREATE_TOKEN" => $"create {Article(I("count"), nameOf(S("tokenDefinitionId")))}",
            "DESTROY_TOKENS" => S("tokenDefinitionId").Length > 0
                ? $"destroy {I("count", 1)} {Plural(nameOf(S("tokenDefinitionId")), I("count", 1))}"
                : $"destroy {I("count", 1)} {Plural("token", I("count", 1))}",
            "DESTROY_IMPRESSION" => S("owner") == "opponent"
                ? (I("count", 1) == 1 ? "destroy an opponent Impression" : $"destroy {I("count")} opponent Impressions")
                : "destroy one of your Impressions",
            "TRANSFORM_TOKEN" => TransformText(e, nameOf),
            "APPLY_RESTRICTION" => RestrictionText(e["restriction"] as JsonObject),
            "APPLY_REPLACEMENT" => ReplacementText(e, nameOf),
            "REVEAL_NPC_HAND" => "the opponent reveals their hand",
            "HIDE_NPC_HAND" => "hide the opponent's hand",
            "REVEAL_NPC_DECK_TOP" => "the opponent plays with the top card of their deck revealed",
            "HIDE_NPC_DECK_TOP" => "hide the top of the opponent's deck",
            "DECK_REVEAL" => $"look at the top {I("count")} {Plural("card", I("count"))} of the opponent's deck",
            "CANCEL_STAGED_CARD" => "cancel the staged card",
            "DESTROY_SELF" => "destroy this",
            "RESHUFFLE_DECK" => "shuffle your deck",
            "CHOOSE_NUMBER" => $"choose a number {I("min")}–{I("max")}",
            "INCREMENT_COUNTERS" => $"add {I("amount")} {S("counterName")}{scale}",
            "COPY_FROM_NPC_DECK" => "copy an opponent-deck card into your hand",
            "SCHEDULE_EFFECTS" => $"later, {Lower(Sentence(EffectList(e["effects"], nameOf)))}",
            _ => "",
        };
        if (core.Length == 0) return "";
        // Skip a per-effect condition that just repeats the ambient trigger condition.
        if (e["condition"] is JsonObject cond && cond.ToJsonString() != ambientCond)
            core = $"if {ConditionText(cond, nameOf)}, {core}";
        return core;
    }

    // ── quantity / condition ─────────────────────────────────────────────────

    private static string QuantityText(JsonObject q, Func<string, string> nameOf)
    {
        string kind = q["kind"]?.GetValue<string>() ?? "";
        bool opp = q["side"]?.GetValue<string>() == "opponent";
        string side = opp ? "the opponent's" : "your";
        string subj = opp ? "the opponent" : "you";
        return kind switch
        {
            "CONST" => (q["value"]?.GetValue<int>() ?? 0).ToString(),
            "PATIENCE" => "Patience",
            "MISSING_PATIENCE" => "Patience lost",
            "PRIORITY" => $"{side} Priority",
            "ROUND" => "the round number",
            "LIE_COUNTER" => "the Lie count",
            "CARDS_PLAYED_THIS_TURN" => $"cards {subj} played this turn",
            "NPC_GUARDS_STANDING" => "standing Guard Shields",
            "CHOSEN_NUMBER" => "the chosen number",
            "SHIELDS_STANDING" => $"{side} standing shields",
            "OPP_SHIELDS_BROKEN_BY_PLAYER_THIS_TURN" => "opponent shields you broke this turn",
            "PLAYER_SHIELDS_BROKEN_BY_NPC_THIS_TURN" => "your shields broken this turn",
            "GUARDS_PLACED_BY_NPC_THIS_TURN" => "Guards the opponent placed this turn",
            "DECK_CARDS_MATCHING_COST" => "matching-cost cards in the opponent's deck",
            _ => kind.ToLowerInvariant().Replace('_', ' '),
        };
    }

    private static string ConditionText(JsonObject cond, Func<string, string> nameOf)
    {
        if (cond["compare"] is JsonObject cmp)
        {
            string lhs = cmp["lhs"] is JsonObject l ? QuantityText(l, nameOf) : "?";
            string rhs = cmp["rhs"] is JsonObject r ? QuantityText(r, nameOf) : "?";
            string op = cmp["op"]?.GetValue<string>() switch
            {
                "lt" => "is below", "lte" => "is at most", "gt" => "is above",
                "gte" => "is at least", "eq" => "equals", "neq" => "is not", _ => "?",
            };
            return $"{lhs} {op} {rhs}";
        }
        if (cond["not"] is JsonObject n) return $"not ({ConditionText(n, nameOf)})";
        if (cond["all"] is JsonArray all) return string.Join(" and ", all.Select(x => ConditionText((JsonObject)x!, nameOf)));
        if (cond["any"] is JsonArray any) return string.Join(" or ", any.Select(x => ConditionText((JsonObject)x!, nameOf)));
        return "a condition holds";
    }

    // ── trigger / cost / restriction / transform / replacement ───────────────

    private static string TriggerClause(JsonObject? trig, Func<string, string> nameOf)
    {
        if (trig == null) return "when triggered";
        string ev = trig["event"]?.GetValue<string>() ?? "";
        string who = trig["controllerFilter"]?.GetValue<string>() ?? "any";
        string subj = who == "self" ? "you" : who == "opponent" ? "the opponent" : "either side";
        string evText = ev switch
        {
            "CARD_PLAYED" => $"{subj} play{(who == "self" ? "" : "s")} a card",
            "CARD_STAGED" => $"{subj} stage{(who == "self" ? "" : "s")} a card",
            "CARD_RESOLVED" => $"{subj} resolve{(who == "self" ? "" : "s")} a card",
            "CARD_DRAWN" => $"{subj} draw{(who == "self" ? "" : "s")} a card",
            "SHIELD_BROKEN" => "a shield is broken",
            "PATIENCE_CHANGED" => "Patience changes",
            "PRIORITY_CHANGED" => "Priority changes",
            "TOKEN_CREATED" => "a token is created",
            "TOKEN_DESTROYED" => "a token is destroyed",
            "PLAYER_TURN_START" => "your turn starts",
            "PLAYER_TURN_END" => "your turn ends",
            "NPC_TURN_START" => "the opponent's turn starts",
            "NPC_TURN_END" => "the opponent's turn ends",
            _ => ev.ToLowerInvariant().Replace('_', ' '),
        };
        string cond = trig["condition"] is JsonObject c ? $" and {ConditionText(c, nameOf)}" : "";
        return $"when {evText}{cond}";
    }

    private static string ActivatedCost(JsonObject? cost)
    {
        if (cost == null) return "";
        var bits = new List<string>();
        int P(string k) => cost[k]?.GetValue<int>() ?? 0;
        if (P("priority") > 0) bits.Add($"{P("priority")} Priority");
        if (P("patience") > 0) bits.Add($"{P("patience")} Patience");
        if (P("sacrificeShields") > 0) bits.Add($"sacrifice {P("sacrificeShields")} {Plural("shield", P("sacrificeShields"))}");
        if (P("discardCards") > 0) bits.Add($"discard {P("discardCards")}");
        return string.Join(", ", bits);
    }

    private static string PriorityText(int v, string target, string scale)
    {
        if (target == "opponent")
            return v >= 0 ? $"give the opponent +{v} Priority{scale}" : $"the opponent loses {-v} Priority{scale}";
        return v >= 0 ? $"+{v} Priority{scale}" : $"−{-v} Priority{scale}";
    }

    private static string TransformText(JsonObject e, Func<string, string> nameOf)
    {
        string from = nameOf(e["fromTokenId"]?.GetValue<string>() ?? "");
        string to = nameOf(e["toTokenId"]?.GetValue<string>() ?? "");
        if (e["all"]?.GetValue<bool>() ?? false) return $"transform all {Plural(from, 2)} into {Plural(to, 2)}";
        int c = e["count"]?.GetValue<int>() ?? 1;
        if (e["upTo"]?.GetValue<bool>() ?? false) return $"transform up to {c} {Plural(from, c)} into {Plural(to, c)}";
        return c == 1 ? $"transform {Article(1, from)} into {ArticleWord(to)} {to}" : $"transform {c} {Plural(from, c)} into {Plural(to, c)}";
    }

    private static string ReplacementText(JsonObject e, Func<string, string> nameOf)
    {
        string orig = nameOf(e["originalTokenId"]?.GetValue<string>() ?? "");
        string repl = nameOf(e["replacementTokenId"]?.GetValue<string>() ?? "");
        string expiry = e["expiry"] is JsonObject b ? Cap(ExpiryPhrase(b)) : "Permanently";
        return $"{expiry}, whenever you would create {ArticleWord(orig)} {orig}, create {ArticleWord(repl)} {repl} instead";
    }

    private static string RestrictionText(JsonObject? r)
    {
        if (r == null) return "";
        string type = r["type"]?.GetValue<string>() ?? "";
        string target = r["target"]?.GetValue<string>() ?? "self";
        int val = r["value"]?.GetValue<int>() ?? 0;
        string expiry = r["expiry"] is JsonObject b ? " " + ExpiryPhrase(b) : "";

        string SubjectPoss() => target == "self" ? "your" : target == "opponent" ? "the opponent's" : "all";
        string SubjectCan() => target == "self" ? "you can't" : target == "opponent" ? "the opponent can't" : "no one can";

        return type switch
        {
            "PREVENT_SHIELD_BREAK" => target == "both"
                ? $"no shields can be broken{expiry}"
                : $"{SubjectPoss()} shields can't be broken{expiry}",
            "PREVENT_DRAW" => $"{SubjectCan()} draw{expiry}",
            "PREVENT_EXTRA_DRAWS" => $"{SubjectCan()} draw extra cards{expiry}",
            "PREVENT_PATIENCE_GAIN" => $"{SubjectCan()} gain Patience{expiry}",
            "MAX_CARD_COST" => $"{SubjectPoss()} cards cost at most {val}{expiry}",
            "INCREASE_CARD_COST" => $"{SubjectPoss()} cards cost {val} more{expiry}",
            "MAX_PLAYS_PER_TURN" => $"{SubjectCan().Replace("can't", "can play at most " + val + " cards")}{expiry}",
            "MAX_TURN_START_DRAW" => $"{SubjectPoss()} turn-start draw is capped at {val}{expiry}",
            "PRIORITY_FLOOR" => $"{SubjectPoss()} Priority can't fall below {val}{expiry}",
            "PATIENCE_COST_PER_CARD" => $"{SubjectPoss()} cards cost {val} extra Patience{expiry}",
            "BOTM_LIMIT_BONUS" => $"keep {val} more {Plural("card", val)} in Back of Mind{expiry}",
            _ => type.ToLowerInvariant().Replace('_', ' ') + expiry,
        };
    }

    private static string ExpiryPhrase(JsonObject b)
    {
        string boundary = b["boundary"]?.GetValue<string>() ?? "";
        int occ = b["occurrences"]?.GetValue<int>() ?? 1;
        return (boundary, occ) switch
        {
            ("PLAYER_TURN_END", 1) => "this turn",
            ("PLAYER_TURN_END", 2) => "until the end of your next turn",
            ("PLAYER_TURN_START", 1) => "until your next turn",
            ("NPC_TURN_END", 1) => "until the opponent's turn ends",
            ("NPC_TURN_START", 1) => "until the opponent's next turn",
            _ => $"for {occ} {boundary.ToLowerInvariant().Replace('_', ' ')}",
        };
    }

    // ── word helpers ─────────────────────────────────────────────────────────

    private static string Sentence(List<string> clauses)
    {
        if (clauses.Count == 0) return "";
        var sentences = clauses.Select(c => Cap(c) + ".");
        return string.Join(" ", sentences);
    }

    private static string Plural(string noun, int n) => n == 1 ? noun : noun.EndsWith('s') ? noun : noun + "s";

    /// <summary>"a Logical Chain" / "an Impression" / "two Logical Chains".</summary>
    private static string Article(int count, string noun) => count switch
    {
        1 => $"{ArticleWord(noun)} {noun}",
        2 => $"two {Plural(noun, 2)}",
        3 => $"three {Plural(noun, 3)}",
        _ => $"{count} {Plural(noun, count)}",
    };

    private static string ArticleWord(string noun) =>
        noun.Length > 0 && "aeiouAEIOU".IndexOf(noun[0]) >= 0 ? "an" : "a";

    private static string Cap(string s) => s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s[1..];
    private static string Lower(string s) => s.Length == 0 ? s : char.ToLowerInvariant(s[0]) + s[1..];
}
