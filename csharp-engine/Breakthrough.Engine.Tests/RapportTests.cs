// Rapport (v1.4.2 redesign — Ken's rules):
//  - on play you predict a Priority cost;
//  - if the opponent plays a card of that cost during their NEXT turn you
//    gain the card's Rapport reward in Goodwill;
//  - it pays ONCE, on the first match;
//  - an unmatched prediction expires when that opponent turn ends.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class RapportTests
{
    /// <summary>p_rapport predicts 1–10 and pays 2 Goodwill on a hit.</summary>
    private static CombatState PlayPrediction(int guess, params string[] npcDeck)
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.ScriptedDrawOrder = ["p_rapport", .. Enumerable.Repeat("p_noop", 11)];
                c.EnemyDeckCardIds = [.. npcDeck, .. Enumerable.Repeat("n_noop", 4)];
                c.ScriptedOpponentPlays = [.. npcDeck];
            },
        });
        s = PlayCardByDef(s, "p_rapport");
        s = Act(s, new ChooseNumber(guess));
        return s;
    }

    [Fact]
    public void ChoosingANumber_RegistersAPredictionRatherThanResolvingNow()
    {
        var s = PlayPrediction(3, "n_free");
        Assert.Single(s.RapportPredictions);
        Assert.Equal(3, s.RapportPredictions[0].Number);
        Assert.Equal(0, s.Goodwill);            // nothing paid out yet
        Assert.True(HasLog(s, "rapport-predicted"));
    }

    [Fact]
    public void APredictionThatMatchesAnOpponentPlay_PaysItsReward()
    {
        // n_free costs 0, so predicting 0 hits when they play it.
        var s = PlayPrediction(0, "n_free");
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Equal(2, s.Goodwill);            // p_rapport's reward
        Assert.True(HasLog(s, "rapport-hit"));
        Assert.Empty(s.RapportPredictions);     // spent
    }

    [Fact]
    public void ItPaysOnlyOnce_EvenWhenSeveralMatchingCardsArePlayed()
    {
        // Two 0-cost cards: only the first may pay out.
        var s = PlayPrediction(0, "n_free", "n_free");
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Equal(2, s.Goodwill);            // not 4
        Assert.Single(s.Log, l => l.Type == "rapport-hit");
    }

    [Fact]
    public void AWrongPrediction_PaysNothingAndExpiresWithTheTurn()
    {
        var s = PlayPrediction(9, "n_free"); // nothing costs 9
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.Equal(0, s.Goodwill);
        Assert.Empty(s.RapportPredictions);     // expired, not carried over
        Assert.True(HasLog(s, "rapport-missed"));
    }

    [Fact]
    public void TheRewardCanScaleWithTheChosenNumber()
    {
        // p_rapport_scaled rewards CHOSEN_NUMBER Goodwill instead of a constant.
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.ScriptedDrawOrder = ["p_rapport_scaled", .. Enumerable.Repeat("p_noop", 11)];
                c.EnemyDeckCardIds = ["n_cost3", .. Enumerable.Repeat("n_noop", 5)];
                c.ScriptedOpponentPlays = ["n_cost3"];
                c.MinTurnStartPriority = 8; // enough for them to play a 3-cost card
            },
        });
        s = PlayCardByDef(s, "p_rapport_scaled");
        s = Act(s, new ChooseNumber(3));   // predict the 3-cost card
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.True(HasLog(s, "rapport-hit"));
        Assert.Equal(3, s.Goodwill);       // reward scaled to the chosen number
    }
}
