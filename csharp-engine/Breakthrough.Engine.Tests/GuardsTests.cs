// v1.4.1 — two-tier opponent shields: card-backed Guard Shields with Shield
// Triggers, dummy fill, patience-free opponent guard breaks, restoration.
//
// 1:1 C# port of tests/engine/guards.test.ts.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class GuardsTests
{
    private static readonly CardDefinition GuardSt = new()
    {
        Id = "g_st",
        Name = "g_st",
        Cost = 0,
        Color = "Colorless",
        Supertype = Supertypes.Skill,
        Subtype = null,
        Keywords = [Keywords.ShieldTrigger],
        Effects = [],
        ShieldTriggerEffects = [new ModifyPatienceEffect(-2)],
        EffectText = "Shield Trigger: drain 2 Patience.",
    };

    private static CombatState StartWithCardGuards(int guardCount, IReadOnlyList<string> guardCards, int seed = 5)
    {
        var cards = new Dictionary<string, CardDefinition>(CARDS) { ["g_st"] = GuardSt };
        return Setup.BuildInitialState(new SetupInput
        {
            Config = MakeEncounter(c =>
            {
                c.NpcGuardShieldCount = guardCount;
                c.NpcGuardShieldCardIds = guardCards;
                c.ScriptedDrawOrder = ["p_break", "p_break", "p_break", .. Enumerable.Repeat("p_noop", 9)];
            }),
            Cards = cards,
            Tokens = TOKENS,
            Nuggets = NUGGETS,
            PlayerDeckCardIds = ["p_break", "p_break", "p_break", .. Enumerable.Repeat("p_noop", 9)],
            CollectionCardIds = [],
            Seed = seed,
        });
    }

    [Fact]
    public void CardGuards_CountTowardGuardTotal_DummiesFillDifference()
    {
        var s = StartWithCardGuards(3, ["g_st"]);
        Assert.Equal(3, s.NpcGuardsStanding);
        Assert.Equal(1, s.NpcGuards.Count(g => g.CardId == "g_st"));
        Assert.Equal(2, s.NpcGuards.Count(g => g.CardId == null));
    }

    [Fact]
    public void BreakingOpponentDummyGuard_NeverCostsPatience()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.NpcGuardShieldCount = 2; // all dummies
                c.ScriptedDrawOrder = ["p_break", .. Enumerable.Repeat("p_noop", 11)];
            },
        });
        int patience = s.Patience;
        s = PlayCardByDef(s, "p_break");
        Assert.Equal(1, s.NpcGuardsStanding);
        Assert.Equal(patience, s.Patience); // no patience change on opponent guard break
    }

    [Fact]
    public void CardBackedGuard_FiresShieldTriggerWhenBroken_CardGoesToNpcDiscard()
    {
        // Break all three guards: exactly one is g_st (drains 2 via trigger).
        var s = StartWithCardGuards(3, ["g_st"]);
        int patience = s.Patience;
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break");
        Assert.Equal(0, s.NpcGuardsStanding);
        Assert.Equal(patience - 2, s.Patience); // only the trigger, no break outcome cost
        Assert.Equal(1, s.Npc.Discard.Count(c => c.DefinitionId == "g_st"));
    }

    [Fact]
    public void GuardRowComposition_IsDeterministicPerSeed_FaceDownShuffle()
    {
        static string Order(int seed) =>
            string.Join(",", StartWithCardGuards(4, ["g_st"], seed).NpcGuards.Select(g => g.CardId ?? "-"));
        Assert.Equal(Order(11), Order(11));
    }

    [Fact]
    public void GuardRestoration_PlacesDummyGuards_NoCards_AndReGatesLocks()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.NpcGuardShieldCount = 1;
                c.ScriptedDrawOrder = ["p_break", "info_a", .. Enumerable.Repeat("p_noop", 10)];
                c.EnemyDeckCardIds = ["n_guards_up", .. Enumerable.Repeat("n_noop", 5)];
                c.ScriptedOpponentPlays = ["n_guards_up"];
            },
        });
        s = PlayCardByDef(s, "p_break");
        Assert.Equal(0, s.NpcGuardsStanding);
        s = Reducer.Reduce(s, new EndTurn());
        if (s.Phase == Phases.BotMSelect)
        {
            int keep = s.Player.Hand.FindIndex(c => c.DefinitionId == "info_a");
            s = Reducer.Reduce(s, new BotmSelect(keep >= 0 ? [keep] : []));
        }
        while (s.Phase == Phases.EnemyPending) s = Reducer.Reduce(s, new Advance());
        Assert.Equal(2, s.NpcGuardsStanding);
        Assert.All(s.NpcGuards, g => Assert.Null(g.CardId)); // restored guards are dummies
    }

    [Fact]
    public void Validation_RejectsMoreCardGuardsThanGuardTotal()
    {
        Assert.Throws<ValidationException>(() => StartWithCardGuards(1, ["g_st", "g_st"]));
    }
}

public class EncounterCountDefaultsTests
{
    [Fact]
    public void OmittedGuardCountAndDummySlots_DefaultTo10And10()
    {
        var config = MakeEncounter(c =>
        {
            c.NpcGuardShieldCount = null;
            c.PlayerDummyShieldSlots = null;
        });
        var s = Setup.BuildInitialState(new SetupInput
        {
            Config = config,
            Cards = CARDS,
            Tokens = TOKENS,
            Nuggets = NUGGETS,
            PlayerDeckCardIds = Enumerable.Repeat("p_noop", 12).ToList(),
            CollectionCardIds = [],
            Seed = 3,
        });
        Assert.Equal(10, s.NpcGuardsStanding);
        Assert.Equal(10, s.PlayerShields.Count);
        Assert.All(s.PlayerShields, x => Assert.Equal(ShieldTypes.Placeholder, x.ShieldType));
    }
}
