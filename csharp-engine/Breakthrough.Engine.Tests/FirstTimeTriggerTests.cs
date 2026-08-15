// "First time this turn" triggers (v1.4.2 — Ken).
//
// Expressed with the existing condition machinery rather than new trigger
// syntax: EVENT_OCCURRENCE_THIS_TURN counts how many times the current
// event's type has fired this turn (including the one being dispatched), so
// "the first time a shield is broken this turn" is simply `== 1`.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class FirstTimeTriggerTests
{
    [Fact]
    public void AnImpressionCanFireOnlyOnTheFirstShieldBreakOfATurn()
    {
        // p_first_break: +1 Goodwill the FIRST time a shield breaks each turn.
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.ScriptedDrawOrder = ["p_first_break", "p_break", "p_break", .. Enumerable.Repeat("p_noop", 9)];
                c.NpcGuardShieldCount = 5;
            },
        });
        s = PlayCardByDef(s, "p_first_break");   // the watcher Impression
        Assert.Equal(0, s.Goodwill);

        s = PlayCardByDef(s, "p_break");         // first break of the turn
        Assert.Equal(1, s.Goodwill);

        s = PlayCardByDef(s, "p_break");         // second break — must NOT pay
        Assert.Equal(1, s.Goodwill);
    }

    [Fact]
    public void TheCounterResetsSoTheNextTurnPaysAgain()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                // First five are the opening hand; the sixth is drawn at the
                // start of turn 2 (anything left in hand is discarded by
                // Back of Mind at turn end).
                c.ScriptedDrawOrder =
                [
                    "p_first_break", "p_break", "p_break", "p_noop", "p_noop",
                    "p_break", .. Enumerable.Repeat("p_noop", 6),
                ];
                c.NpcGuardShieldCount = 8;
            },
        });
        s = PlayCardByDef(s, "p_first_break");
        s = PlayCardByDef(s, "p_break");
        s = PlayCardByDef(s, "p_break");
        Assert.Equal(1, s.Goodwill);

        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);                        // new player turn begins
        s = PlayCardByDef(s, "p_break");          // first break of the NEW turn
        Assert.Equal(2, s.Goodwill);
    }

    [Fact]
    public void EventCountsAreTrackedPerEventType()
    {
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder = ["p_break", .. Enumerable.Repeat("p_noop", 11)],
        });
        s = PlayCardByDef(s, "p_break");
        // The play itself and the break are different event types.
        Assert.True(s.EventCountsThisTurn[EventTypes.CardPlayed] >= 1);
        Assert.True(s.EventCountsThisTurn[EventTypes.ShieldBroken] >= 1);
    }
}
