// v1.4 §10 — NPC behaviour: mirrored resource loop, leftmost-play policy,
// scheduled plays (set aside, injected, prioritized), automatic turn end.
//
// 1:1 C# port of tests/engine/npc.test.ts.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class NpcTests
{
    [Fact]
    public void DrawsToNpcHandLimit_AtNpcTurnStart()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.NpcHandLimit = 4;
                c.EnemyDeckCardIds = Enumerable.Repeat("n_free", 8).ToList();
            },
        });
        s = Act(s, new EndTurn());
        if (s.Phase == Phases.BotMSelect) s = Act(s, new BotmSelect([]));
        Assert.Equal(4, s.Npc.Hand.Count);
    }

    [Fact]
    public void PlaysLeftmostHandCard_WhilePriorityIsPositive()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.EnemyDeckCardIds = ["n_patience_drain", "n_noop", "n_noop", "n_noop", "n_noop", "n_noop"];
                c.ScriptedOpponentPlays = ["n_patience_drain", "n_noop", "n_noop", "n_noop", "n_noop", "n_noop"];
            },
        });
        s = Act(s, new EndTurn());
        if (s.Phase == Phases.BotMSelect) s = Act(s, new BotmSelect([]));
        s = Act(s, new Advance());
        // Leftmost (scripted first) card played first.
        var firstPlay = s.Log.FirstOrDefault(l => l.Type == "play" && DataEquals(l, "controller", "npc"));
        Assert.Equal("n_patience_drain", Data(firstPlay, "definitionId"));
    }

    [Fact]
    public void TurnEndsAutomatically_WhenPriorityHitsZeroOrHandEmpties_HandDiscards()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.EnemyDeckCardIds = Enumerable.Repeat("n_noop", 6).ToList(), // cost 1 each, priority 3
        });
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Equal(Side.Player, s.ActiveTurn); // handed off automatically
        Assert.Empty(s.Npc.Hand);
        Assert.Equal(5, s.Npc.Discard.Count); // 3 played + 2 discarded
    }

    [Fact]
    public void EmptyHand_EndsTurnEvenWithPriorityRemaining()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.EnemyDeckCardIds = ["n_free", "n_free"], // only 2 cards, cost 0
        });
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Equal(Side.Player, s.ActiveTurn);
        Assert.Equal(2, s.Npc.Discard.Count);
    }

    [Fact]
    public void ScheduledPlays_SetAside_ExcludedFromDraws_InjectedLeftmostWhenDue()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.EnemyDeckCardIds = ["n_patience_drain", .. Enumerable.Repeat("n_noop", 7)];
                c.ScheduledPlays = [new ScheduledPlayDef("n_patience_drain", 1)];
                c.NpcHandLimit = 8;
            },
        });
        Assert.Single(s.NpcScheduledAside);
        s = EndPlayerTurn(s); // Round 1 NPC turn: round(1) > afterTurn(1) is false → not injected
        Assert.DoesNotContain(s.Npc.Hand, c => c.DefinitionId == "n_patience_drain");
        s = RunNpcTurn(s); // finish NPC turn → Round 2 player turn
        s = EndPlayerTurn(s); // Round 2 NPC turn: 2 > 1 → injected leftmost
        Assert.Equal("n_patience_drain", s.Npc.Hand.FirstOrDefault()?.DefinitionId);
        Assert.Empty(s.NpcScheduledAside);
        s = RunNpcTurn(s);
        // Injected card played first (leftmost policy).
        var npcPlays = s.Log.Where(l => l.Type == "play" && DataEquals(l, "controller", "npc")).ToList();
        Assert.Contains(npcPlays, l => DataEquals(l, "definitionId", "n_patience_drain"));
    }

    [Fact]
    public void NpcImpressionTurnStartEffects_FireAtNpcTurnStart()
    {
        var s = Start(new StartOptions { Config = c => c.StartingImpressions = ["n_impression_ts"] });
        int patience = s.Patience;
        s = EndPlayerTurn(s);
        Assert.Equal(patience - 1, s.Patience); // −1 at NPC turn start
    }

    [Fact]
    public void CountersPlusThresholds_DriveEncounterMechanics_WithNoCardIdLogic()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.StartingImpressions = ["n_counter_impression"];
                c.ScriptedDrawOrder = ["p_counter_feeder", "p_counter_feeder", .. Enumerable.Repeat("p_noop", 10)];
            },
        });
        s = PlayCardByDef(s, "p_counter_feeder"); // +2 devotion
        var perm = s.Field.Find(p => p.DefinitionId == "n_counter_impression");
        Assert.Equal(2, perm?.Counters.GetValueOrDefault("devotion"));
        int shieldsBefore = s.PlayerShields.Count;
        s = PlayCardByDef(s, "p_counter_feeder"); // +2 → 4 ≥ threshold → consume, break 1 player shield
        var perm2 = s.Field.Find(p => p.DefinitionId == "n_counter_impression");
        Assert.Equal(0, perm2?.Counters.GetValueOrDefault("devotion"));
        Assert.Equal(shieldsBefore - 1, s.PlayerShields.Count);
    }

    [Fact]
    public void CopyFromNpcDeck_Copies_NeverSteals_WithThePatienceRider()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.ScriptedDrawOrder = ["p_copy", .. Enumerable.Repeat("p_noop", 11)];
                c.EnemyDeckCardIds = Enumerable.Repeat("n_noop", 6).ToList();
            },
        });
        int npcDeckSize = s.Npc.Deck.Count;
        s = PlayCardByDef(s, "p_copy");
        Assert.Equal(npcDeckSize, s.Npc.Deck.Count); // copying, not stealing
        var copy = s.Player.Hand.Find(c => c.DefinitionId.StartsWith("n_"));
        Assert.NotNull(copy);
        Assert.Equal(2, copy!.PatienceCostOverride);
        int patience = s.Patience;
        int idx = s.Player.Hand.FindIndex(c => c.InstanceId == copy.InstanceId);
        s = Act(s, new PlayCard(idx));
        Assert.Equal(patience - 2, s.Patience); // rider paid on play
    }

    [Fact]
    public void LieKeyword_ExceedingTheThreshold_LosesTheEncounter()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.LieThreshold = 2;
                c.ScriptedDrawOrder = ["p_lie", "p_lie", "p_lie", .. Enumerable.Repeat("p_noop", 9)];
            },
        });
        s = PlayCardByDef(s, "p_lie");
        s = PlayCardByDef(s, "p_lie");
        Assert.Null(s.Result); // at threshold, not over
        s = PlayCardByDef(s, "p_lie");
        Assert.Equal(Results.Lose, s.Result);
        Assert.Equal(LoseReasons.Lies, s.LoseReason);
    }

    [Fact]
    public void TokenReplacements_ApplyAtCreation_ExpireAtTheirBoundary()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                // Second maker sits at deck index 5 so the turn-2 refill draws it.
                c.ScriptedDrawOrder =
                [
                    "p_replacer", "p_token_maker", "p_noop", "p_noop", "p_noop", "p_token_maker",
                    .. Enumerable.Repeat("p_noop", 6),
                ];
            },
        });
        s = PlayCardByDef(s, "p_replacer");
        s = PlayCardByDef(s, "p_token_maker"); // creates tok_boom instead
        Assert.Contains(s.Field, p => p.DefinitionId == "tok_boom");
        s = EndPlayerTurn(s); // replacement expires at PLAYER_TURN_END
        s = RunNpcTurn(s);
        s = PlayCardByDef(s, "p_token_maker");
        Assert.Equal(1, s.Field.Count(p => p.DefinitionId == "tok_chain"));
    }
}
