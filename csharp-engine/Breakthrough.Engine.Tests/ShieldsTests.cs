// v1.4 §3.4/§3.5 — player shield economy: placeholders removed vs real cards
// discarded (Brief §7 trap 7), Safety, Shield Triggers, dummy-before-core,
// Core single-break (§6.7.7), shield-loss arming semantics.
//
// 1:1 C# port of tests/engine/shields.test.ts.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class ShieldsTests
{
    private static Action<EncounterConfig> Breaker(string n, Action<EncounterConfig>? extra = null) => c =>
    {
        c.EnemyDeckCardIds = [n, .. Enumerable.Repeat("n_noop", 5)];
        c.ScriptedOpponentPlays = [n];
        extra?.Invoke(c);
    };

    [Fact]
    public void BrokenPlaceholder_MinusOnePatience_RemovedFromGame_NotDiscarded()
    {
        var s = Start(new StartOptions { Config = Breaker("n_break") });
        s = EndPlayerTurn(s);
        int discardBefore = s.Player.Discard.Count;
        s = RunNpcTurn(s);
        Assert.Equal(2, s.PlayerShields.Count); // 3 placeholders − 1
        Assert.Equal(9, s.Patience);
        Assert.Equal(discardBefore, s.Player.Discard.Count); // nothing entered discard
    }

    [Fact]
    public void BrokenRealCardShield_MinusOnePatience_CardGoesToPlayerDiscard()
    {
        var s = Start(new StartOptions
        {
            Config = Breaker("n_break", c =>
            {
                c.PlayerDummyShieldSlots = 0;
                c.UnbreakablePlayerShields = false;
            }),
        });
        // Place p_noop from hand as a real shield (2 Priority).
        int idx = s.Player.Hand.FindIndex(c => c.DefinitionId == "p_noop");
        s = Act(s, new PlaceShield(idx));
        Assert.Equal(3, s.Player.Priority); // 5 − 2
        Assert.Equal(ShieldTypes.Real, s.PlayerShields[0].ShieldType);
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Contains(s.Player.Discard, c => c.DefinitionId == "p_noop");
    }

    [Fact]
    public void Safety_EffectiveBreak_ZeroPatienceInsteadOfOne()
    {
        var s = Start(new StartOptions
        {
            Config = Breaker("n_break", c =>
            {
                c.PlayerDummyShieldSlots = 0;
                c.ScriptedDrawOrder = ["p_safety", .. Enumerable.Repeat("p_noop", 11)];
            }),
        });
        int idx = s.Player.Hand.FindIndex(c => c.DefinitionId == "p_safety");
        Assert.True(idx >= 0);
        s = Act(s, new PlaceShield(idx));
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Equal(10, s.Patience); // no patience lost on the Safety break
    }

    [Fact]
    public void ShieldTrigger_ResolvesBeforeTheBreakOutcome()
    {
        var s = Start(new StartOptions
        {
            Config = Breaker("n_break", c =>
            {
                c.PlayerDummyShieldSlots = 0;
                c.ScriptedDrawOrder = ["p_shield_trigger", .. Enumerable.Repeat("p_noop", 11)];
            }),
        });
        int idx = s.Player.Hand.FindIndex(c => c.DefinitionId == "p_shield_trigger");
        s = Act(s, new PlaceShield(idx));
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        // +2 (trigger) then −1 (break outcome) = net +1
        Assert.Equal(11, s.Patience);
        Assert.Contains(s.Player.Discard, c => c.DefinitionId == "p_shield_trigger");
    }

    [Fact]
    public void AllDummyShieldsBreakBeforeAnyCore_OneEffectNeverBreaksTwoCores()
    {
        var s = Start(new StartOptions
        {
            Config = Breaker("n_break5", c =>
            {
                c.PlayerDummyShieldSlots = 1;
                c.AllowedCoreShields =
                [
                    new CoreShieldDef("p_noop", 0),
                    new CoreShieldDef("p_free", 0),
                ];
            }),
            Collection = ["p_noop", "p_free"],
        });
        Assert.Equal([ShieldTypes.Placeholder, ShieldTypes.Core, ShieldTypes.Core],
            s.PlayerShields.Select(x => x.ShieldType).ToList());
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s); // n_break5: placeholder + first core, then capped
        Assert.Single(s.PlayerShields);
        Assert.Equal(ShieldTypes.Core, s.PlayerShields[0].ShieldType);
        Assert.True(HasLog(s, "break-capped"));
    }

    [Fact]
    public void ShieldLoss_NeverArms_WhenEncounterDefinesNoPlayerShields()
    {
        var s = Start(new StartOptions
        {
            Config = Breaker("n_break2", c =>
            {
                c.PlayerDummyShieldSlots = 0;
                c.AllowedCoreShields = [];
            }),
        });
        Assert.False(s.ShieldLossArmed);
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s); // breaks fizzle on an empty row
        Assert.Null(s.Result); // no loss — condition never armed (§3.4)
    }

    [Fact]
    public void ArmedPlusEmptiedRow_IsLossAtTheNextCheck()
    {
        var s = Start(new StartOptions { Config = Breaker("n_break", c => c.PlayerDummyShieldSlots = 1) });
        Assert.True(s.ShieldLossArmed);
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Equal(Results.Lose, s.Result);
        Assert.Equal(LoseReasons.Shields, s.LoseReason);
    }

    [Fact]
    public void UnbreakablePlayerShields_DisablesNpcBreaksAndTheLossCondition()
    {
        var s = Start(new StartOptions
        {
            Config = Breaker("n_break", c =>
            {
                c.PlayerDummyShieldSlots = 1;
                c.UnbreakablePlayerShields = true;
            }),
        });
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Single(s.PlayerShields);
        Assert.Null(s.Result);
    }

    [Fact]
    public void Resequencing_IsFreeAndReordersTheRow()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.PlayerDummyShieldSlots = 1;
                c.AllowedCoreShields = [new CoreShieldDef("p_noop", 0)];
            },
            Collection = ["p_noop"],
        });
        var before = s.PlayerShields.Select(x => x.SlotId).ToList();
        int priority = s.Player.Priority;
        s = Act(s, new ResequenceShields([1, 0]));
        Assert.Equal([before[1], before[0]], s.PlayerShields.Select(x => x.SlotId).ToList());
        Assert.Equal(priority, s.Player.Priority); // free
    }

    [Fact]
    public void NpcSelfBreakEffects_HitItsOwnGuardsOnly()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.NpcGuardShieldCount = 3;
                c.EnemyDeckCardIds = ["n_self_break", .. Enumerable.Repeat("n_noop", 5)];
                c.ScriptedOpponentPlays = ["n_self_break"];
            },
        });
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Equal(2, s.NpcGuardsStanding);
        Assert.All(s.NpcCoreShields, c => Assert.False(c.Broken));
        Assert.Null(s.PendingBlock); // self-breaking a Guard reveals nothing
    }
}
