// Authoring-time validation (v1.4 §15.5, §3.3; Rebuild_Brief §5).
// Rejects subscriptions to non-canonical events, keyless locks, empty shield
// rows, and malformed configs — config errors, not gameplay states.
//
// 1:1 C# port of src/engine/validation.ts (messages preserved verbatim).

namespace Breakthrough.Engine;

public sealed record ValidationIssue(string Severity, string Where, string Message);

public static class Severities
{
    public const string Error = "error";
    public const string Warning = "warning";
}

public sealed class ValidationException(string message) : Exception(message);

public static class Validation
{
    private static bool IsCanonical(string e) => EventTypes.Canonical.Contains(e);

    private static void ValidateTrigger(TriggerCondition t, string where, List<ValidationIssue> issues)
    {
        if (!IsCanonical(t.Event))
        {
            issues.Add(new ValidationIssue(
                Severities.Error,
                where,
                $"Trigger subscribes to non-canonical event \"{t.Event}\". Canonical events: {string.Join(", ", EventTypes.Canonical)}."));
        }
    }

    public static List<ValidationIssue> ValidateCard(CardDefinition card)
    {
        var issues = new List<ValidationIssue>();
        string w = $"card {card.Id}";

        if (card.Subtype == Subtypes.Trap)
        {
            if (card.TrapTrigger == null)
            {
                issues.Add(new ValidationIssue(Severities.Error, w, "Trap card has no trapTrigger — no silent dead traps (v1.4 §3.6)."));
            }
            else
            {
                ValidateTrigger(card.TrapTrigger, w, issues);
            }
            if (!card.Keywords.Contains(Keywords.Trap))
            {
                issues.Add(new ValidationIssue(Severities.Warning, w, "Trap subtype without Trap keyword."));
            }
        }
        foreach (var ab in card.TriggeredAbilities ?? [])
        {
            ValidateTrigger(ab.Trigger, $"{w} / ability {ab.Id}", issues);
        }
        if (card.Keywords.Contains(Keywords.Rapport) && card.Rapport == null)
        {
            issues.Add(new ValidationIssue(Severities.Error, w, "Rapport keyword requires rapport prediction config (v1.4 §8.3)."));
        }
        if (card.Keywords.Contains(Keywords.HeavyHand) && card.HeavyHandEffects == null)
        {
            issues.Add(new ValidationIssue(Severities.Error, w, "Heavy Hand keyword requires heavyHandEffects (v1.4 §8.3)."));
        }
        if (card.Supertype == Supertypes.Information && card.NuggetId == null)
        {
            issues.Add(new ValidationIssue(Severities.Error, w, "Information Card must carry a nuggetId (v1.4 §3.9)."));
        }
        if (card.Subtype == Subtypes.Token && card.Cost != 0)
        {
            issues.Add(new ValidationIssue(Severities.Warning, w, "Tokens are never played from hand; cost is meaningless."));
        }
        return issues;
    }

    public static List<ValidationIssue> ValidateEncounter(
        EncounterConfig config,
        IReadOnlyDictionary<string, CardDefinition> cards,
        IReadOnlyDictionary<string, InfoNugget> nuggets)
    {
        var issues = new List<ValidationIssue>();
        string w = $"encounter {config.Id}";

        int guardCount = EncounterDefaults.ResolvedGuardCount(config);
        // ≥ 1 opponent shield total (v1.4 §3.3 validation; Brief §7 trap 12 — no vacuous wins)
        if (guardCount + config.OpponentShields.Count < 1)
        {
            issues.Add(new ValidationIssue(Severities.Error, w, "Encounter must define at least one opponent shield (guards + cores ≥ 1)."));
        }
        if (guardCount < 0)
        {
            issues.Add(new ValidationIssue(Severities.Error, w, "npcGuardShieldCount cannot be negative."));
        }

        // v1.4.1 — card-backed Guard Shields count toward the guard total.
        var guardCards = config.NpcGuardShieldCardIds ?? [];
        if (guardCards.Count > guardCount)
        {
            issues.Add(new ValidationIssue(
                Severities.Error,
                w,
                $"npcGuardShieldCardIds ({guardCards.Count}) exceeds the guard total ({guardCount}) — card guards count toward the total."));
        }
        foreach (var id in guardCards)
        {
            if (!cards.ContainsKey(id))
            {
                issues.Add(new ValidationIssue(Severities.Error, w, $"Guard Shield card \"{id}\" not found."));
            }
            else if (!cards[id].Keywords.Contains(Keywords.ShieldTrigger))
            {
                issues.Add(new ValidationIssue(Severities.Warning, w, $"Guard Shield card \"{id}\" has no Shield Trigger — it will break with no effect."));
            }
        }

        for (int i = 0; i < config.OpponentShields.Count; i++)
        {
            var shield = config.OpponentShields[i];
            string sw = $"{w} / core shield {i} ({shield.CardId})";
            if (shield.KeyNuggetIds == null || shield.KeyNuggetIds.Count == 0)
            {
                issues.Add(new ValidationIssue(Severities.Error, sw, "NPC Core Shield lists no key nuggets — a keyless lock is a config error (v1.4 §3.3)."));
            }
            foreach (var nid in shield.KeyNuggetIds ?? [])
            {
                if (!nuggets.ContainsKey(nid))
                {
                    issues.Add(new ValidationIssue(Severities.Error, sw, $"Key nugget \"{nid}\" does not exist."));
                }
            }
            if (!shield.IsHint && !cards.ContainsKey(shield.CardId))
            {
                issues.Add(new ValidationIssue(Severities.Error, sw, $"Core shield card \"{shield.CardId}\" not found (non-Hint shields add their card to the Collection)."));
            }
        }

        foreach (var id in config.EnemyDeckCardIds)
        {
            if (!cards.ContainsKey(id)) issues.Add(new ValidationIssue(Severities.Error, w, $"Enemy deck card \"{id}\" not found."));
        }
        foreach (var sp in config.ScheduledPlays ?? [])
        {
            if (!config.EnemyDeckCardIds.Contains(sp.CardId))
            {
                issues.Add(new ValidationIssue(Severities.Error, w, $"Scheduled play \"{sp.CardId}\" is not in the enemy deck."));
            }
        }
        foreach (var id in config.StartingImpressions ?? [])
        {
            if (!cards.ContainsKey(id)) issues.Add(new ValidationIssue(Severities.Error, w, $"Starting impression \"{id}\" not found."));
        }
        foreach (var ov in config.NuggetOverrides)
        {
            if (!nuggets.ContainsKey(ov.NuggetId))
            {
                issues.Add(new ValidationIssue(Severities.Error, w, $"Nugget override references unknown nugget \"{ov.NuggetId}\"."));
            }
        }
        if (EncounterDefaults.ResolvedDummySlots(config) < 0)
        {
            issues.Add(new ValidationIssue(Severities.Error, w, "playerDummyShieldSlots cannot be negative."));
        }
        return issues;
    }

    public static void AssertValid(IEnumerable<ValidationIssue> issues)
    {
        var errors = issues.Where(i => i.Severity == Severities.Error).ToList();
        if (errors.Count > 0)
        {
            throw new ValidationException(
                $"Validation failed:\n{string.Join("\n", errors.Select(e => $"  [{e.Where}] {e.Message}"))}");
        }
    }
}
