// Player-chosen token destruction (v1.4.2 — Ken).
//
// DESTROY_TOKENS used to take the earliest-arriving tokens automatically.
// The player now picks, via a ChooseTokensBlock that suspends the effect
// sequence exactly like CHOOSE_NUMBER: the frame index has already advanced,
// so resolution RESUMES at the next effect and never restarts (§6.7 inv. 6).
//
// This is the one intentional divergence from the TS engine — it is additive
// and player-only, so NPC turns stay automatic (§4.4).

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class ChooseTokensTests
{
    /// <summary>Three distinct tokens on the Field, then a "destroy 2" card in hand.</summary>
    private static CombatState WithThreeTokens()
    {
        var s = Start(new StartOptions
        {
            Deck = ["p_token_maker", "p_token_maker", "p_token_maker", "p_token_smash", "p_noop", "p_noop"],
            Config = c => c.ScriptedDrawOrder =
                ["p_token_maker", "p_token_maker", "p_token_maker", "p_token_smash", "p_noop", "p_noop"],
        });
        s = PlayCardByDef(s, "p_token_maker");
        s = PlayCardByDef(s, "p_token_maker");
        s = PlayCardByDef(s, "p_token_maker");
        Assert.Equal(3, s.Field.Count(p => p.Kind == PermanentKinds.Token));
        return s;
    }

    [Fact]
    public void DestroyingFewerTokensThanYouControl_AsksThePlayerToChoose()
    {
        var s = WithThreeTokens();
        s = PlayCardByDef(s, "p_token_smash");

        var block = Assert.IsType<ChooseTokensBlock>(s.PendingBlock);
        Assert.Equal(2, block.Count);
        Assert.Equal(3, block.PermanentIds.Count);
        // Nothing is destroyed until the choice is made.
        Assert.Equal(3, s.Field.Count(p => p.Kind == PermanentKinds.Token));
    }

    [Fact]
    public void ChoosingTokens_DestroysExactlyThoseAndResumes()
    {
        var s = WithThreeTokens();
        var before = s.Field.Where(p => p.Kind == PermanentKinds.Token)
            .Select(p => p.PermanentId).ToList();
        s = PlayCardByDef(s, "p_token_smash");

        // Pick the LAST two — the opposite of the old earliest-first policy.
        var picks = new[] { before[2], before[1] };
        s = Reducer.Reduce(s, new ChooseTokens(picks));

        Assert.Null(s.PendingBlock);
        var left = s.Field.Where(p => p.Kind == PermanentKinds.Token).Select(p => p.PermanentId).ToList();
        Assert.Equal([before[0]], left);
        // The play completed rather than stalling mid-sequence.
        Assert.False(s.ResolutionHalted);
        Assert.Null(s.PendingPlay);
    }

    [Fact]
    public void WrongNumberOfPicks_IsRejectedAndLeavesStateUnchanged()
    {
        var s = WithThreeTokens();
        s = PlayCardByDef(s, "p_token_smash");
        var ids = ((ChooseTokensBlock)s.PendingBlock!).PermanentIds;

        var after = Reducer.Reduce(s, new ChooseTokens([ids[0]])); // only 1 of 2
        Assert.Equal("illegal-action", LastLog(after)?.Type);
        Assert.IsType<ChooseTokensBlock>(after.PendingBlock);
        Assert.Equal(3, after.Field.Count(p => p.Kind == PermanentKinds.Token));
    }

    [Fact]
    public void DuplicateOrUnknownPicks_AreRejected()
    {
        var s = WithThreeTokens();
        s = PlayCardByDef(s, "p_token_smash");
        var ids = ((ChooseTokensBlock)s.PendingBlock!).PermanentIds;

        var dup = Reducer.Reduce(s, new ChooseTokens([ids[0], ids[0]]));
        Assert.Equal("illegal-action", LastLog(dup)?.Type);

        var unknown = Reducer.Reduce(s, new ChooseTokens([ids[0], "perm_nope"]));
        Assert.Equal("illegal-action", LastLog(unknown)?.Type);
    }

    [Fact]
    public void WhenTheCountCoversEveryToken_ThereIsNothingToChoose()
    {
        // Two tokens, "destroy 2" — no decision, so no block.
        var s = Start(new StartOptions
        {
            Deck = ["p_token_maker", "p_token_maker", "p_token_smash", "p_noop", "p_noop", "p_noop"],
            Config = c => c.ScriptedDrawOrder =
                ["p_token_maker", "p_token_maker", "p_token_smash", "p_noop", "p_noop", "p_noop"],
        });
        s = PlayCardByDef(s, "p_token_maker");
        s = PlayCardByDef(s, "p_token_maker");
        s = PlayCardByDef(s, "p_token_smash");

        Assert.Null(s.PendingBlock);
        Assert.Equal(0, s.Field.Count(p => p.Kind == PermanentKinds.Token));
    }
}
