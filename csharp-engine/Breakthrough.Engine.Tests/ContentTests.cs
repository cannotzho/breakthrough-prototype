// Ported content sanity: every card validates, both encounters validate and
// boot, and a scripted FCP opening runs without engine errors.
//
// 1:1 C# port of tests/engine/content.test.ts, consuming the exact TS content
// bundle via content.json.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class ContentTests
{
    private static ContentBundle C => Content.Bundle;

    [Fact]
    public void EveryCardDefinition_PassesAuthoringValidation()
    {
        var errors = C.Cards.Values
            .SelectMany(Validation.ValidateCard)
            .Where(i => i.Severity == Severities.Error)
            .ToList();
        Assert.Equal([], errors);
    }

    [Fact]
    public void BothEncounters_PassValidation()
    {
        foreach (var enc in C.Encounters.Values)
        {
            var errors = Validation.ValidateEncounter(enc, C.Cards, C.Nuggets)
                .Where(i => i.Severity == Severities.Error)
                .ToList();
            Assert.Equal([], errors);
        }
    }

    public static TheoryData<string> DeckNames()
    {
        var data = new TheoryData<string>();
        foreach (var name in Content.Bundle.StarterDeckLists.Keys) data.Add(name);
        return data;
    }

    [Theory]
    [MemberData(nameof(DeckNames))]
    public void FcpEncounter_BootsAndSurvivesThreeFullRounds(string deckName)
    {
        var deck = C.StarterDeckLists[deckName];
        var s = Setup.BuildInitialState(new SetupInput
        {
            Config = C.Encounters["fan_club_president"],
            Cards = C.Cards,
            Tokens = C.Tokens,
            Nuggets = C.Nuggets,
            Recipes = C.Recipes,
            PlayerDeckCardIds = deck,
            CollectionCardIds = C.DevCollectionIds,
            Seed = 2026,
        });
        Assert.Equal(Phases.PlayerPending, s.Phase);
        Assert.Contains(s.Field, p => p.DefinitionId == "fcp_idols_favor");

        int guard = 0;
        for (int round = 0; round < 3 && s.Result == null; round++)
        {
            // Player: play whatever is playable, then end turn.
            while (s.Phase == Phases.PlayerPending && s.Player.Priority >= 1 && s.Player.Hand.Count > 0)
            {
                if (++guard > 200) throw new InvalidOperationException("runaway");
                var next = Reducer.Reduce(s, new PlayCard(0));
                if (LastLog(next)?.Type == "illegal-action") break;
                s = next;
                while (s.PendingBlock != null)
                {
                    s = s.PendingBlock is ChooseNumberBlock block
                        ? Reducer.Reduce(s, new ChooseNumber(block.Min))
                        : Reducer.Reduce(s, new Acknowledge());
                }
            }
            if (s.Result != null) break;
            s = Reducer.Reduce(s, new EndTurn());
            if (s.Phase == Phases.BotMSelect) s = Reducer.Reduce(s, new BotmSelect([]));
            while (s.Phase == Phases.EnemyPending)
            {
                if (++guard > 400) throw new InvalidOperationException("runaway npc");
                s = Reducer.Reduce(s, new Advance());
                while (s.PendingBlock != null) s = Reducer.Reduce(s, new Acknowledge());
            }
        }
        // No engine errors and no resolution halts anywhere in the run.
        Assert.Equal([], s.Log.Where(l => l.Type == "error").ToList());
        Assert.False(s.ResolutionHalted);
    }

    [Fact]
    public void TheInformant_IsWinnableViaLockAndKeys_WithTheDraftedOverrides()
    {
        List<string> deck =
        [
            "dev_push",
            "dev_push",
            "dev_push",
            "dev_quick_retort",
            "info_warehouse_logs",
            "info_personal_history",
            "info_incident_report",
            "dev_hold",
            "dev_nudge",
            "dev_quick_retort",
            "dev_push",
            "dev_hold",
        ];
        var s = Setup.BuildInitialState(new SetupInput
        {
            Config = C.Encounters["test_encounter"].With(c =>
            {
                c.NpcGuardShieldCount = 3;
                c.ScriptedDrawOrder = deck;
            }),
            Cards = C.Cards,
            Tokens = C.Tokens,
            Nuggets = C.Nuggets,
            PlayerDeckCardIds = deck,
            CollectionCardIds = C.DevCollectionIds,
            Seed = 7,
        });

        void Play(string defId)
        {
            int idx = s.Player.Hand.FindIndex(c => c.DefinitionId == defId);
            Assert.True(idx >= 0, $"{defId} in hand");
            s = Reducer.Reduce(s, new PlayCard(idx));
            while (s.PendingBlock != null) s = Reducer.Reduce(s, new Acknowledge());
        }

        void DoEndTurn(IReadOnlyList<string>? keepDefIds = null)
        {
            s = Reducer.Reduce(s, new EndTurn());
            if (s.Phase == Phases.BotMSelect)
            {
                var keep = (keepDefIds ?? [])
                    .Select(id => s.Player.Hand.FindIndex(c => c.DefinitionId == id))
                    .Where(i => i >= 0)
                    .ToList();
                s = Reducer.Reduce(s, new BotmSelect(keep));
            }
            while (s.Phase == Phases.EnemyPending)
            {
                s = Reducer.Reduce(s, new Advance());
                while (s.PendingBlock != null) s = Reducer.Reduce(s, new Acknowledge());
            }
        }

        // Turn 1: 3 guards down (2+2 cost), quick retort funds the third push.
        Play("dev_quick_retort"); // +2 → 7
        Play("dev_push");
        Play("dev_push");
        Play("dev_push");
        Assert.Equal(0, s.NpcGuardsStanding);
        // Keep the key drawn this turn through Back of Mind (v1.4 §3.11).
        DoEndTurn(["info_warehouse_logs"]);
        Play("info_warehouse_logs"); // breaks lock 1
        Play("info_personal_history"); // breaks lock 2 (hint)
        Play("info_incident_report"); // breaks lock 3 → WIN
        Assert.Equal(Results.Win, s.Result);
        Assert.Contains("info_warehouse_logs", s.GainedCardIds);
    }
}
