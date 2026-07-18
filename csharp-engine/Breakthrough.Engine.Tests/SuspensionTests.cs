// v1.4 §6.3–6.5 — one generic suspension mechanism: sequences suspend and
// resume, never restart (§6.7.6); completion always runs (Brief §7 trap 2);
// BotM fires only at Player Turn End (Brief §7 trap 8).
//
// 1:1 C# port of tests/engine/suspension.test.ts.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class SuspensionTests
{
    [Fact]
    public void ChooseNumber_SuspendsMidList_ResumesAtNextStep_NeverRestarts()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_choose", .. Enumerable.Repeat("p_noop", 11)],
        });
        s = PlayCardByDef(s, "p_choose");
        Assert.IsType<ChooseNumberBlock>(s.PendingBlock);
        Assert.Equal(Phases.PlayerPending, s.Phase); // phase untouched; block gates actions
        // Combat is suspended: other plays are rejected.
        var rejected = PlayCardByDef(s, "p_noop");
        Assert.Equal("illegal-action", LastLog(rejected)?.Type);
        s = Act(s, new ChooseNumber(7));
        Assert.Equal(10 + 7, s.Patience); // scaled effect ran exactly once
        Assert.Equal(1, s.Player.Discard.Count(c => c.DefinitionId == "p_choose")); // completion ran once
        Assert.Null(s.PendingBlock);
    }

    [Fact]
    public void CompletionSteps_RunAfterARevealResume_CardNeverLeftInLimbo()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_break", "p_break", "info_a", .. Enumerable.Repeat("p_noop", 9)],
        });
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "info_a"); // key breaks core → Reveal Pending
        Assert.IsType<RevealBlock>(s.PendingBlock);
        // Card not yet moved — sequence is suspended, not restarted.
        Assert.DoesNotContain(s.Player.Discard, c => c.DefinitionId == "info_a");
        s = Act(s, new Acknowledge());
        Assert.Equal(1, s.Player.Discard.Count(c => c.DefinitionId == "info_a"));
        Assert.Contains(s.Log, l => l.Type == "event" && DataEquals(l, "type", "CARD_RESOLVED"));
    }

    [Fact]
    public void Reveal_FreezesCombatState_NoActionsAcceptedWhilePending()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_break", "p_break", "info_a", .. Enumerable.Repeat("p_noop", 9)],
        });
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "info_a");
        var rejected = Act(s, new EndTurn());
        Assert.Equal("illegal-action", LastLog(rejected)?.Type);
    }
}

public class BackOfMindTests
{
    [Fact]
    public void BotmSelect_FiresOnlyFromPlayerTurnEnd_NeverMidNpcTurn()
    {
        // p_trap_draw draws the player a card during the NPC's turn.
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.ScriptedDrawOrder = ["p_trap_draw", .. Enumerable.Repeat("p_noop", 19)];
                c.EnemyDeckCardIds = ["n_noop", .. Enumerable.Repeat("n_noop", 5)];
            },
            Deck = Enumerable.Repeat("p_noop", 20).ToList(),
        });
        s = PlayCardByDef(s, "p_trap_draw");
        s = Act(s, new EndTurn());
        Assert.Equal(Phases.BotMSelect, s.Phase);
        s = Act(s, new BotmSelect([]));
        Assert.Empty(s.Player.Hand);
        s = RunNpcTurn(s); // trap draws mid-NPC-turn; must NOT prompt BotM
        // RunNpcTurn ends on the player's next turn; hand = gained card kept + refill
        Assert.All(s.Log, l => Assert.NotEqual("error", l.Type));
        Assert.Equal(2, s.Round); // NPC turn completed without a BotM detour
    }

    [Fact]
    public void CardsGainedDuringNpcTurn_SitInHandUntilNextPlayerTurn()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.ScriptedDrawOrder = ["p_trap_draw", .. Enumerable.Repeat("p_noop", 19)];
                c.EnemyDeckCardIds = Enumerable.Repeat("n_noop", 6).ToList();
            },
            Deck = Enumerable.Repeat("p_noop", 20).ToList(),
        });
        s = PlayCardByDef(s, "p_trap_draw");
        s = Act(s, new EndTurn());
        s = Act(s, new BotmSelect([])); // hand emptied
        s = RunNpcTurn(s);
        // Hand refilled to limit at turn start; the mid-NPC-turn draw is part of it.
        Assert.Equal(5, s.Player.Hand.Count);
    }
}
