// v1.4 §4 — boundary step ordering (normative), expiry ticks before new
// applications (Brief §7 trap 6), per-turn counter naming/reset, BotM timing,
// scheduled effects.
//
// 1:1 C# port of tests/engine/boundaries.test.ts.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class BoundariesTests
{
    [Fact]
    public void RoundIncrements_AtPlayerTurnStartOnly()
    {
        var s = Start();
        Assert.Equal(1, s.Round);
        s = EndPlayerTurn(s);
        Assert.Equal(1, s.Round); // NPC turn, same round
        s = RunNpcTurn(s);
        Assert.Equal(2, s.Round);
    }

    [Fact]
    public void RestrictionAppliedAtBoundary_DoesNotExpireInThatSameInstant_Trap6()
    {
        // n_trap_pts (NPC trap) fires at PLAYER_TURN_START (step 9) and applies
        // PREVENT_DRAW(player) expiring at PLAYER_TURN_START. Expiry ticks run
        // at step 3 — before step 9 — so the restriction must survive the
        // boundary where it was applied, block that turn's mid-turn draws, and
        // expire at the NEXT Player Turn Start. (NPC deck is deep enough that
        // the fired trap is not recycled and replayed within the test window.)
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                // p_draw sits at deck index 5 so the turn-2 refill draws it.
                c.ScriptedDrawOrder = [.. Enumerable.Repeat("p_noop", 5), "p_draw", .. Enumerable.Repeat("p_noop", 14)];
                c.EnemyDeckCardIds = ["n_trap_pts", .. Enumerable.Repeat("n_noop", 9)];
                c.ScriptedOpponentPlays = ["n_trap_pts"];
            },
            Deck = Enumerable.Repeat("p_noop", 20).ToList(),
        });
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s); // NPC lays the trap; it fires at this Player Turn Start
        Assert.True(HasLog(s, "trap-fired"));
        Assert.Contains(s.Restrictions, r => r.Type == RestrictionTypes.PreventDraw);
        int handBefore = s.Player.Hand.Count;
        s = PlayCardByDef(s, "p_draw"); // mid-turn draw blocked
        Assert.Equal(handBefore - 1, s.Player.Hand.Count); // played 1, drew 0
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s); // next Player Turn Start: expiry tick removes it (step 3)
        Assert.DoesNotContain(s.Restrictions, r => r.Type == RestrictionTypes.PreventDraw);
        Assert.Equal(5, s.Player.Hand.Count); // turn-start draw unblocked
    }

    [Fact]
    public void NpcApplied_DuringYourNextTurnRestriction_BlocksTurnStartDraw_ExpiresAtPlayerTurnEnd()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.EnemyDeckCardIds = ["n_draw_blocker", .. Enumerable.Repeat("n_noop", 5)];
                c.ScriptedOpponentPlays = ["n_draw_blocker"];
            },
            Deck = Enumerable.Repeat("p_noop", 20).ToList(),
        });
        int handAtStart = s.Player.Hand.Count;
        Assert.Equal(5, handAtStart);
        s = EndPlayerTurn(s); // player discards hand (BotM keep 0)
        s = RunNpcTurn(s); // NPC plays n_draw_blocker; player turn starts with draw prevented
        Assert.Empty(s.Player.Hand); // turn-start draw fully blocked
        s = EndPlayerTurn(s); // restriction expires at PLAYER_TURN_END
        s = RunNpcTurn(s);
        Assert.Equal(5, s.Player.Hand.Count); // draws normal again
    }

    [Fact]
    public void UntriggeredTraps_ExpireToOwnerDiscard_AtOwnersNextTurnStart()
    {
        // Rapport trap with a wrong prediction: never fires, must expire.
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.ScriptedDrawOrder = ["p_trap_rapport", .. Enumerable.Repeat("p_noop", 11)];
                c.EnemyDeckCardIds = Enumerable.Repeat("n_noop", 6).ToList();
            },
        });
        s = PlayCardByDef(s, "p_trap_rapport");
        Assert.IsType<ChooseNumberBlock>(s.PendingBlock);
        s = Act(s, new ChooseNumber(9)); // n_noop costs 1 — never matches
        Assert.Contains(s.Field, p => p.Kind == PermanentKinds.Trap && p.Owner == Side.Player);
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.DoesNotContain(s.Field, p => p.Kind == PermanentKinds.Trap && p.Owner == Side.Player);
        Assert.Contains(s.Player.Discard, c => c.DefinitionId == "p_trap_rapport");
        Assert.True(HasLog(s, "trap-expired"));
    }

    [Fact]
    public void PerTurnCountersReset_OppShieldsBrokenRollsIntoPrevTurnMirror()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.ScriptedDrawOrder = ["p_break", "p_break", .. Enumerable.Repeat("p_noop", 10)];
                c.NpcGuardShieldCount = 5;
            },
        });
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break");
        Assert.Equal(2, s.OppShieldsBrokenByPlayerThisTurn);
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Equal(2, s.OppShieldsBrokenByPlayerPrevTurn);
        Assert.Equal(0, s.OppShieldsBrokenByPlayerThisTurn);
    }

    [Fact]
    public void BotmCards_ReturnToHandBeforeTurnStartDraw()
    {
        var s = Start(new StartOptions { Deck = Enumerable.Repeat("p_noop", 20).ToList() });
        s = Act(s, new EndTurn());
        Assert.Equal(Phases.BotMSelect, s.Phase);
        s = Act(s, new BotmSelect([0]));
        Assert.Single(s.BackOfMind);
        s = RunNpcTurn(s);
        Assert.Empty(s.BackOfMind);
        Assert.Equal(5, s.Player.Hand.Count); // 1 returned + drew 4 up to limit
    }

    [Fact]
    public void BotmKeep_IsCappedByTheLimit()
    {
        var s = Start();
        s = Act(s, new EndTurn());
        var over = Act(s, new BotmSelect([0, 1]));
        Assert.Equal("illegal-action", LastLog(over)?.Type);
    }

    [Fact]
    public void ScheduledEffects_FireAtTheirNamedBoundary()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_scheduler", .. Enumerable.Repeat("p_noop", 11)],
        });
        s = PlayCardByDef(s, "p_scheduler"); // +4 priority at next PLAYER_TURN_START
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Equal(3 + 4, s.Player.Priority); // fired at step 8, after formula
        Assert.Empty(s.ScheduledEffects);
    }

    [Fact]
    public void NpcHand_DiscardsAtNpcTurnEnd_DeckRecyclesNextTurn()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.EnemyDeckCardIds = Enumerable.Repeat("n_noop", 6).ToList();
                c.NpcHandLimit = 5;
            },
        });
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s); // NPC drew 5, played 3 (priority 3), discarded 2
        Assert.Empty(s.Npc.Hand);
        Assert.Equal(5, s.Npc.Discard.Count);
        Assert.Single(s.Npc.Deck);
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s); // needs 5: 1 from deck + recycle
        Assert.True(HasLog(s, "recycle"));
    }
}
