// v1.4 §3.3 — Guard Shields and lock-and-keys, incl. guard restoration
// re-gating (Brief §4.5), key-waste rules, and win-before-loss (§6.7.4).
//
// 1:1 C# port of tests/engine/locks.test.ts.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class LocksTests
{
    private static readonly string[] KeyDeck = ["info_a", "info_b", "p_break", "p_break", .. Enumerable.Repeat("p_noop", 8)];

    [Fact]
    public void Keys_AreInertWhileGuardsStand_CardResolvesOverrideAndRecycles()
    {
        var s = Start(new StartOptions { Config = c => c.ScriptedDrawOrder = KeyDeck });
        Assert.Equal(2, s.NpcGuardsStanding);
        int handBefore = s.Player.Hand.Count;
        s = PlayCardByDef(s, "info_a"); // override: cost 1, draw 1
        Assert.All(s.NpcCoreShields, c => Assert.False(c.Broken)); // no break
        Assert.Contains(s.Player.Discard, c => c.DefinitionId == "info_a"); // replayable later
        Assert.Equal(handBefore, s.Player.Hand.Count); // played 1, drew 1
        Assert.Null(s.PendingBlock);
    }

    [Fact]
    public void GenericBreakEffects_HitGuardsOnly_FizzleAtZeroGuards()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_break", "p_break", "p_break", .. Enumerable.Repeat("p_noop", 9)],
        });
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break");
        Assert.Equal(0, s.NpcGuardsStanding);
        int cores = s.NpcCoreShields.Count(c => c.Broken);
        s = PlayCardByDef(s, "p_break"); // no guards left → fizzles
        Assert.Equal(cores, s.NpcCoreShields.Count(c => c.Broken)); // cores untouched
        Assert.True(HasLog(s, "break-fizzle"));
    }

    [Fact]
    public void WithGuardsDown_MatchingKeyBreaksItsLock_SuspendsOnReveal()
    {
        var s = Start(new StartOptions { Config = c => c.ScriptedDrawOrder = KeyDeck });
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break"); // guards down
        s = PlayCardByDef(s, "info_a");
        Assert.IsType<RevealBlock>(s.PendingBlock);
        Assert.Contains("lore_1", s.GainedCardIds); // non-Hint adds its card
        s = Act(s, new Acknowledge());
        Assert.True(s.NpcCoreShields.Find(c => c.CardId == "lore_1")?.Broken);
        // Completion ran after the Reveal: card moved, CARD_RESOLVED dispatched.
        Assert.Contains(s.Player.Discard, c => c.DefinitionId == "info_a");
        Assert.Contains(s.Log, l =>
            l.Type == "event" && DataEquals(l, "type", "CARD_RESOLVED") && DataEquals(l, "cardDefId", "info_a"));
    }

    [Fact]
    public void BreakOrder_IsPlayerDetermined_WhicheverKeyPlaysFirstBreaksFirst()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["info_b", "p_break", "p_break", .. Enumerable.Repeat("p_noop", 9)],
        });
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "info_b"); // second-listed lock breaks first
        var reveal = Assert.IsType<RevealBlock>(s.PendingBlock);
        Assert.True(reveal.IsHint);
        s = Act(s, new Acknowledge());
        Assert.True(s.NpcCoreShields.Find(c => c.CardId == "lore_2")?.Broken);
        Assert.False(s.NpcCoreShields.Find(c => c.CardId == "lore_1")?.Broken);
        Assert.DoesNotContain("lore_2", s.GainedCardIds); // Hints add no card
    }

    [Fact]
    public void KeyForAlreadyBrokenLock_ResolvesNormallyWithNoBreak()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.MinTurnStartPriority = 6;
                c.ScriptedDrawOrder = ["info_a", "info_a", "p_break", "p_break", .. Enumerable.Repeat("p_noop", 8)];
            },
        });
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "info_a");
        s = Act(s, new Acknowledge());
        s = PlayCardByDef(s, "info_a"); // lock already broken → override only
        Assert.Null(s.PendingBlock);
    }

    [Fact]
    public void GuardRestoration_ReGatesTheLocks()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.ScriptedDrawOrder = ["p_break", "p_break", "info_a", .. Enumerable.Repeat("p_noop", 9)];
                c.EnemyDeckCardIds = ["n_guards_up", .. Enumerable.Repeat("n_noop", 5)];
                c.ScriptedOpponentPlays = ["n_guards_up"];
            },
        });
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break");
        Assert.Equal(0, s.NpcGuardsStanding);
        // Keep info_a through the turn transition via Back of Mind.
        s = Act(s, new EndTurn());
        int keep = s.Player.Hand.FindIndex(c => c.DefinitionId == "info_a");
        s = Act(s, new BotmSelect([keep]));
        s = RunNpcTurn(s); // NPC restores 2 guards
        Assert.Equal(2, s.NpcGuardsStanding);
        s = PlayCardByDef(s, "info_a"); // key no longer works
        Assert.Null(s.PendingBlock);
        Assert.All(s.NpcCoreShields, c => Assert.False(c.Broken));
        Assert.True(HasLog(s, "guards-placed"));
    }

    [Fact]
    public void BreakingEveryOpponentShield_Wins()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.MinTurnStartPriority = 6;
                c.ScriptedDrawOrder = ["p_break", "p_break", "info_a", "info_b", .. Enumerable.Repeat("p_noop", 8)];
            },
        });
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "info_a");
        s = Act(s, new Acknowledge());
        s = PlayCardByDef(s, "info_b");
        s = Act(s, new Acknowledge());
        Assert.Equal(Results.Win, s.Result);
        Assert.Equal(Phases.Won, s.Phase);
    }

    [Fact]
    public void WinIsCheckedBeforeLoss_LastShieldPlusPatienceZeroInOnePlay_IsWin()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.OpponentPatience = 3;
                c.NpcGuardShieldCount = 0;
                c.OpponentShields =
                [
                    new NpcCoreShieldDef { CardId = "lore_1", IsHint = false, LoreDescription = "x", KeyNuggetIds = ["nug_a"] },
                ];
                c.NuggetOverrides =
                [
                    new NuggetOverride("nug_a", 0, [new ModifyPatienceEffect(-5)], "x"),
                ];
                c.ScriptedDrawOrder = ["info_a", .. Enumerable.Repeat("p_noop", 11)];
            },
        });
        s = PlayCardByDef(s, "info_a"); // −5 Patience (→ −2), then lock check breaks the last core
        s = Act(s, new Acknowledge());
        Assert.Equal(Results.Win, s.Result);
    }

    [Fact]
    public void NuggetDiscovery_FiresOnceAndPersistsInState()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["info_a", "info_a", .. Enumerable.Repeat("p_noop", 10)],
        });
        s = PlayCardByDef(s, "info_a");
        Assert.Equal(["nug_a"], s.DiscoveredNuggetIds);
        s = PlayCardByDef(s, "info_a");
        Assert.Equal(["nug_a"], s.DiscoveredNuggetIds); // no duplicate
        Assert.Equal(1, s.Log.Count(l => l.Type == "discovery"));
    }

    [Fact]
    public void NonOverriddenNuggetCards_ConvertToPonder_AndAreRecorded()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["info_c", .. Enumerable.Repeat("p_noop", 11)],
        });
        int hand = s.Player.Hand.Count;
        s = PlayCardByDef(s, "info_c"); // no override for nug_c → Ponder (cost 1, draw 1)
        Assert.Equal(hand, s.Player.Hand.Count); // played 1, drew 1
        Assert.Equal(4, s.Player.Priority); // paid Ponder's cost 1
        Assert.Contains("info_c", s.PlayedNonRelevantCards);
    }
}
