// v1.4 §3.1 — two-meter Priority, overspend, debt transfer, lockout.
// (Brief §7 trap 3 — turn-start formula only, no "restore priority".)
//
// 1:1 C# port of tests/engine/priority.test.ts.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class PriorityTests
{
    [Fact]
    public void FirstTurn_MinMaxMinTurnStart_PlusFirstTurnBonus()
    {
        var s = Start();
        Assert.Equal(1, s.Round);
        Assert.Equal(Side.Player, s.ActiveTurn);
        Assert.Equal(3 + 2, s.Player.Priority);
    }

    [Fact]
    public void FirstTurnBonus_GoesToNpc_WhenItStarts_Round0()
    {
        var s = Start(new StartOptions { Config = c => c.StartingSide = Side.Npc });
        Assert.Equal(0, s.Round);
        Assert.Equal(Side.Npc, s.ActiveTurn);
        Assert.Equal(3 + 2, s.Npc.Priority);
    }

    [Fact]
    public void Overspend_DrivesMeterNegative_FullCostAlwaysDeducted()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_expensive", .. Enumerable.Repeat("p_noop", 11)],
        });
        s = PlayCardByDef(s, "p_expensive"); // cost 9 at priority 5
        Assert.Equal(-4, s.Player.Priority);
        Assert.Equal(Phases.PlayerPending, s.Phase); // no automatic handoff
    }

    [Fact]
    public void Lockout_AtZeroOrBelow_PlaysRejected_EndTurnStillRequiredAndLegal()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_expensive", .. Enumerable.Repeat("p_noop", 11)],
        });
        s = PlayCardByDef(s, "p_expensive");
        string before = StateJsonIgnoringLog(s);
        var rejected = PlayCardByDef(s, "p_noop");
        Assert.Equal(before, StateJsonIgnoringLog(rejected)); // unchanged
        Assert.Equal("illegal-action", LastLog(rejected)?.Type);
        var ended = Act(s, new EndTurn());
        Assert.Contains(ended.Phase, new[] { Phases.BotMSelect, Phases.EnemyPending, Phases.PlayerPending, Phases.Won, Phases.Lost });
    }

    [Fact]
    public void Debt_TransfersToOpponentAtTurnEnd_ClampedByMaxPriority()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_expensive", .. Enumerable.Repeat("p_noop", 11)],
        });
        s = PlayCardByDef(s, "p_expensive"); // → −4
        s = EndPlayerTurn(s);
        // NPC turn-start: min(10, 3 + 4) = 7
        Assert.True(s.Npc.Priority <= 7);
        Assert.Contains(s.Log, l => l.Type == "debt-transfer" && DataEquals(l, "debt", 4));
        Assert.Equal(0, s.Player.Priority); // meter zeroed at settlement
    }

    [Fact]
    public void DebtClamp_HappensAtTurnStart_NotAtOverspend()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.MaxPriority = 5;
                c.ScriptedDrawOrder = ["p_expensive", .. Enumerable.Repeat("p_noop", 11)];
            },
        });
        s = PlayCardByDef(s, "p_expensive"); // 5 → −4 (unclamped)
        Assert.Equal(-4, s.Player.Priority);
        s = Act(s, new EndTurn());
        if (s.Phase == Phases.BotMSelect) s = Act(s, new BotmSelect([]));
        // min(maxPriority 5, 3 + 4) = 5
        Assert.Contains(s.Log, l =>
            l.Type == "turn-start-priority" && DataEquals(l, "side", "npc") && DataEquals(l, "value", 5));
    }

    [Fact]
    public void PositiveSurplus_RecordsToLastUnspentPriority_NoMechanicalEffect()
    {
        var s = Start();
        s = EndPlayerTurn(s); // player ends at 5
        Assert.Equal(5, s.Player.LastUnspentPriority);
        Assert.Equal(0, s.Player.Priority);
    }

    [Fact]
    public void Debt_IsConsumedOnUse_NeverBanked()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_expensive", .. Enumerable.Repeat("p_noop", 11)],
        });
        s = PlayCardByDef(s, "p_expensive");
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s); // NPC turn with the debt bonus
        Assert.Equal(0, s.Npc.IncomingDebt);
        // Next NPC turn starts from the base again (no leftover debt)
        s = EndPlayerTurn(s);
        var entry = s.Log.AsEnumerable().Reverse()
            .FirstOrDefault(l => l.Type == "turn-start-priority" && DataEquals(l, "side", "npc"));
        Assert.Equal(0, Data(entry, "debt") ?? 0);
    }

    [Fact]
    public void CostMayExceedCurrentPriority_AsLongAsMeterIsPositive()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_free", "p_expensive", .. Enumerable.Repeat("p_noop", 10)],
        });
        s = PlayCardByDef(s, "p_free"); // 5
        Assert.Equal(5, s.Player.Priority);
        s = PlayCardByDef(s, "p_expensive"); // 5 → −4, legal (meter was ≥1)
        Assert.Equal(-4, s.Player.Priority);
    }

    [Fact]
    public void PriorityGainingAbility_ReopensWindowMidTurn_NoTurnTransition()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_impression_battery", "p_expensive", .. Enumerable.Repeat("p_noop", 10)],
        });
        s = PlayCardByDef(s, "p_impression_battery"); // cost 1 → 4, impression on field
        s = PlayCardByDef(s, "p_expensive"); // 4 → −5, locked out
        Assert.Equal(-5, s.Player.Priority);
        var perm = s.Field.Find(p => p.DefinitionId == "p_impression_battery");
        Assert.NotNull(perm);
        // Activated ability costs Patience only — usable while locked out.
        s = Act(s, new ActivateAbility(perm!.PermanentId, "surge"));
        Assert.Equal(1, s.Player.Priority);
        Assert.Equal(Side.Player, s.ActiveTurn); // still the same turn
        var s2 = PlayCardByDef(s, "p_noop"); // playable again
        Assert.NotEqual("illegal-action", LastLog(s2)?.Type);
    }

    [Fact]
    public void NpcSymmetry_NpcOverspendsAndTransfersDebtToPlayer()
    {
        // NPC deck of cost-1 cards, minTurnStart 3 → 3 plays then locked.
        var s = Start(new StartOptions
        {
            Config = c => c.EnemyDeckCardIds = Enumerable.Repeat("n_noop", 6).ToList(),
        });
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Equal(Side.Player, s.ActiveTurn);
        // NPC ended at 0 exactly → no debt.
        var entry = s.Log.AsEnumerable().Reverse()
            .FirstOrDefault(l => l.Type == "turn-start-priority" && DataEquals(l, "side", "player"));
        Assert.Equal(0, Data(entry, "debt") ?? 0);
    }
}
