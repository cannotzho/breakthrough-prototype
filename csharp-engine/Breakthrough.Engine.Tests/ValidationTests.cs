// v1.4 §15.5 + Brief §7 traps 5/12 — authoring-time validation.
//
// 1:1 C# port of tests/engine/validation.test.ts.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class ValidationTests
{
    [Fact]
    public void RejectsTrapSubscriptions_ToNonCanonicalEvents()
    {
        var bad = new CardDefinition
        {
            Id = "x", Name = "x", Cost = 1, Subtype = Subtypes.Trap, Keywords = [Keywords.Trap],
            EffectText = "x",
            TrapTrigger = new TriggerCondition("END_OF_PLAYER_TURN"),
        };
        Assert.Contains(Validation.ValidateCard(bad),
            i => i.Severity == Severities.Error && i.Message.Contains("non-canonical"));
    }

    [Fact]
    public void RejectsTriggeredAbilities_OnNonCanonicalEvents()
    {
        var bad = new CardDefinition
        {
            Id = "x", Name = "x", Cost = 1, EffectText = "x",
            TriggeredAbilities = [new TriggeredAbility("a", new TriggerCondition("OPPONENT_BREAKS_SHIELD"), [])],
        };
        Assert.NotEmpty(Validation.ValidateCard(bad));
    }

    [Fact]
    public void RejectsTrapsWithNoTrigger_NoSilentDeadTraps()
    {
        var bad = new CardDefinition
        {
            Id = "x", Name = "x", Cost = 1, EffectText = "x",
            Subtype = Subtypes.Trap, Keywords = [Keywords.Trap],
        };
        Assert.Contains(Validation.ValidateCard(bad), i => i.Severity == Severities.Error);
    }

    [Fact]
    public void RejectsKeylessLocks()
    {
        var cfg = MakeEncounter(c => c.OpponentShields =
        [
            new NpcCoreShieldDef { CardId = "lore_1", IsHint = false, LoreDescription = "x", KeyNuggetIds = [] },
        ]);
        Assert.Contains(Validation.ValidateEncounter(cfg, CARDS, NUGGETS),
            i => i.Message.Contains("keyless") || i.Message.Contains("no key"));
    }

    [Fact]
    public void RejectsEmptyOpponentShieldRow_NoVacuousWins()
    {
        var cfg = MakeEncounter(c =>
        {
            c.NpcGuardShieldCount = 0;
            c.OpponentShields = [];
        });
        Assert.Contains(Validation.ValidateEncounter(cfg, CARDS, NUGGETS), i => i.Severity == Severities.Error);
        Assert.Throws<ValidationException>(() => Start(new StartOptions
        {
            Config = c =>
            {
                c.NpcGuardShieldCount = 0;
                c.OpponentShields = [];
            },
        }));
    }

    [Fact]
    public void RejectsKeys_ReferencingUnknownNuggets()
    {
        var cfg = MakeEncounter(c => c.OpponentShields =
        [
            new NpcCoreShieldDef { CardId = "lore_1", IsHint = false, LoreDescription = "x", KeyNuggetIds = ["nope"] },
        ]);
        Assert.Contains(Validation.ValidateEncounter(cfg, CARDS, NUGGETS), i => i.Message.Contains("does not exist"));
    }

    [Fact]
    public void RejectsRapportWithoutPredictionConfig_AndHeavyHandWithoutAlternateEffects()
    {
        var rapport = new CardDefinition
        {
            Id = "x", Name = "x", Cost = 1, EffectText = "x", Keywords = [Keywords.Rapport],
        };
        Assert.Contains(Validation.ValidateCard(rapport), i => i.Severity == Severities.Error);
        var heavy = new CardDefinition
        {
            Id = "x", Name = "x", Cost = 1, EffectText = "x", Keywords = [Keywords.HeavyHand],
        };
        Assert.Contains(Validation.ValidateCard(heavy), i => i.Severity == Severities.Error);
    }

    [Fact]
    public void RejectsInformationCards_WithoutANuggetId()
    {
        var bad = new CardDefinition
        {
            Id = "x", Name = "x", Cost = 1, EffectText = "x", Supertype = Supertypes.Information,
        };
        Assert.Contains(Validation.ValidateCard(bad), i => i.Severity == Severities.Error);
    }

    [Fact]
    public void RejectsScheduledPlays_ForCardsNotInTheEnemyDeck()
    {
        var cfg = MakeEncounter(c => c.ScheduledPlays = [new ScheduledPlayDef("p_noop", 2)]);
        Assert.Contains(Validation.ValidateEncounter(cfg, CARDS, NUGGETS), i => i.Severity == Severities.Error);
    }
}
