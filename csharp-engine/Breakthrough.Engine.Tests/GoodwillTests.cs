// Goodwill (v1.4.2 — Ken): a third shared counter.
//  - Patience is ALWAYS capped at its starting value.
//  - The overflow becomes Goodwill when the encounter enables it, otherwise
//    it is discarded.
//  - Goodwill is a hard cost: a card with one cannot be played without it
//    (unlike Priority, which may be overspent).
//  - An additional Goodwill cost is optional: it never blocks the base play,
//    and is only payable when affordable.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class GoodwillTests
{
    private static CombatState StartWith(bool overflowToGoodwill, int startingGoodwill = 0,
        params string[] draw)
    {
        var order = draw.Length > 0 ? draw.ToList() : ["p_noop"];
        return Start(new StartOptions
        {
            Deck = [.. order, .. Enumerable.Repeat("p_noop", 12)],
            Config = c =>
            {
                c.ScriptedDrawOrder = [.. order, .. Enumerable.Repeat("p_noop", 12)];
                c.PatienceOverflowToGoodwill = overflowToGoodwill;
                c.StartingGoodwill = startingGoodwill;
            },
        });
    }

    [Fact]
    public void PatienceNeverExceedsItsStartingValue()
    {
        var s = StartWith(overflowToGoodwill: false);
        Assert.Equal(s.StartingPatience, s.Patience);
        Core.ModifyPatience(s, +5, Side.Player);
        Assert.Equal(s.StartingPatience, s.Patience);
        Assert.Equal(0, s.Goodwill);              // toggle off: overflow discarded
        Assert.True(HasLog(s, "patience-capped"));
    }

    [Fact]
    public void WithTheToggleOn_OverflowBecomesGoodwill()
    {
        var s = StartWith(overflowToGoodwill: true);
        Core.ModifyPatience(s, +5, Side.Player);
        Assert.Equal(s.StartingPatience, s.Patience);
        Assert.Equal(5, s.Goodwill);
    }

    [Fact]
    public void OnlyTheExcessOverflows_TheRestStillHeals()
    {
        var s = StartWith(overflowToGoodwill: true);
        Core.ModifyPatience(s, -4, Side.Player);   // 10 -> 6, room for 4
        Core.ModifyPatience(s, +6, Side.Player);   // 4 heals, 2 overflow
        Assert.Equal(s.StartingPatience, s.Patience);
        Assert.Equal(2, s.Goodwill);
    }

    [Fact]
    public void AGoodwillCost_BlocksThePlayWhenUnaffordable()
    {
        var s = StartWith(overflowToGoodwill: false, startingGoodwill: 1, "p_goodwill_cost");
        int handBefore = s.Player.Hand.Count;
        var rejected = PlayCardByDef(s, "p_goodwill_cost"); // costs 2 Goodwill
        Assert.Equal("illegal-action", LastLog(rejected)?.Type);
        Assert.Equal(handBefore, rejected.Player.Hand.Count); // nothing happened
        Assert.Equal(1, rejected.Goodwill);
    }

    [Fact]
    public void AGoodwillCost_IsSpentWhenAffordable()
    {
        var s = StartWith(overflowToGoodwill: false, startingGoodwill: 3, "p_goodwill_cost");
        s = PlayCardByDef(s, "p_goodwill_cost");
        Assert.Equal(1, s.Goodwill);                      // 3 − 2
        Assert.NotEqual("illegal-action", LastLog(s)?.Type);
    }

    [Fact]
    public void TheAdditionalCost_IsOptionalAndNeverBlocksTheBasePlay()
    {
        // 1 Goodwill: not enough for the +2 upgrade, but the card still plays.
        var s = StartWith(overflowToGoodwill: false, startingGoodwill: 1, "p_goodwill_bonus");
        var refused = Act(s, new PlayCard(
            s.Player.Hand.FindIndex(c => c.DefinitionId == "p_goodwill_bonus"), false, true));
        Assert.Equal("illegal-action", LastLog(refused)?.Type); // upgrade refused

        s = PlayCardByDef(s, "p_goodwill_bonus");              // base play is fine
        Assert.NotEqual("illegal-action", LastLog(s)?.Type);
        Assert.Equal(1, s.Goodwill);                            // nothing spent
        Assert.Equal(s.StartingPatience - 1, s.Patience);        // base effect only
    }

    [Fact]
    public void PayingTheAdditionalCost_SpendsItAndRunsTheExtraEffects()
    {
        var s = StartWith(overflowToGoodwill: false, startingGoodwill: 5, "p_goodwill_bonus");
        int idx = s.Player.Hand.FindIndex(c => c.DefinitionId == "p_goodwill_bonus");
        s = Act(s, new PlayCard(idx, false, true));
        Assert.Equal(3, s.Goodwill);                             // 5 − 2
        // base −1 Patience plus the upgrade's extra −1
        Assert.Equal(s.StartingPatience - 2, s.Patience);
    }
}
