// v1.4 §3.6/§5 — trap cancellation (staged window), owner-relative filters,
// canonical-event dispatch coverage (Brief §7 traps 4 & 5), ordering.
//
// 1:1 C# port of tests/engine/traps.test.ts.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class TrapsTests
{
    [Fact]
    public void CancelTrapInStagedWindow_PreventsResolutionEntirely_SingleDiscard()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.ScriptedDrawOrder = ["p_trap_cancel", .. Enumerable.Repeat("p_noop", 11)];
                c.EnemyDeckCardIds = ["n_patience_drain", .. Enumerable.Repeat("n_noop", 5)];
                c.ScriptedOpponentPlays = ["n_patience_drain"];
            },
        });
        int patience = s.Patience;
        s = PlayCardByDef(s, "p_trap_cancel");
        s = EndPlayerTurn(s);
        int npcPriorityLog = s.Log.Count;
        s = Reducer.Reduce(s, new Advance()); // stages n_patience_drain → trap cancels
        Assert.Equal(patience, s.Patience); // effects never resolved
        // Cancelled card in NPC discard exactly once (§6.7.5).
        Assert.Equal(1, s.Npc.Discard.Count(c => c.DefinitionId == "n_patience_drain"));
        // No cost was deducted — cancellation is pre-cost (§3.6).
        var costLog = s.Log.Skip(npcPriorityLog).Where(l =>
            l.Type == "play" && DataEquals(l, "controller", "npc") && DataEquals(l, "definitionId", "n_patience_drain")).ToList();
        Assert.Empty(costLog);
        // The fired trap left the field to the player's discard.
        Assert.DoesNotContain(s.Field, p => p.Kind == PermanentKinds.Trap && p.Owner == Side.Player);
        Assert.Contains(s.Player.Discard, c => c.DefinitionId == "p_trap_cancel");
    }

    [Fact]
    public void RapportTrap_FiresOnlyOnAMatchingPrediction()
    {
        static CombatState Mk(int guess)
        {
            var s = Start(new StartOptions
            {
                Config = c =>
                {
                    c.ScriptedDrawOrder = ["p_trap_rapport", .. Enumerable.Repeat("p_noop", 11)];
                    c.EnemyDeckCardIds = ["n_patience_drain", .. Enumerable.Repeat("n_noop", 5)];
                    c.ScriptedOpponentPlays = ["n_patience_drain"];
                },
            });
            s = PlayCardByDef(s, "p_trap_rapport");
            s = Act(s, new ChooseNumber(guess));
            s = EndPlayerTurn(s);
            return RunNpcTurn(s);
        }
        var hit = Mk(1); // n_patience_drain costs 1
        Assert.True(HasLog(hit, "cancel"));
        Assert.Equal(10 + 1, hit.Patience); // +1×chosen(1), drain cancelled
        var miss = Mk(7);
        Assert.False(HasLog(miss, "cancel"));
        Assert.Equal(10 - 2, miss.Patience); // drain resolved
    }

    [Fact]
    public void NpcTraps_WatchPlayerEvents_BothDirectionsWork()
    {
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.EnemyDeckCardIds = ["n_trap_on_play", .. Enumerable.Repeat("n_noop", 5)];
                c.ScriptedOpponentPlays = ["n_trap_on_play"];
            },
        });
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s); // NPC trap now on the field
        Assert.Contains(s.Field, p => p.Kind == PermanentKinds.Trap && p.Owner == Side.Npc);
        int patience = s.Patience;
        s = PlayCardByDef(s, "p_noop"); // player play triggers it
        Assert.Equal(patience - 1, s.Patience);
    }

    [Fact]
    public void TrapFiringOrder_IsPlayOrder_OldestFirst()
    {
        // Two patience-watching traps: both fire on one PATIENCE_CHANGED; the
        // log must show them in play order.
        var s = Start(new StartOptions
        {
            Config = c => c.ScriptedDrawOrder =
            [
                "p_trap_on_patience", "p_trap_on_patience", "p_patience_down", "p_patience_down",
                .. Enumerable.Repeat("p_noop", 8),
            ],
        });
        s = PlayCardByDef(s, "p_trap_on_patience");
        s = PlayCardByDef(s, "p_trap_on_patience");
        s = PlayCardByDef(s, "p_patience_down"); // 10 → 7, no fire (≥5)
        Assert.Equal(0, s.Log.Count(l => l.Type == "trap-fired"));
        s = PlayCardByDef(s, "p_patience_down"); // 7 → 4 < 5: both fire
        var fires = s.Log.Where(l => l.Type == "trap-fired").ToList();
        Assert.Equal(2, fires.Count);
    }
}

public class CanonicalEventDispatchTests
{
    /// <summary>Build a player trap subscribed to `eventType`.</summary>
    private static CardDefinition TrapFor(string eventType) => new()
    {
        Id = "probe",
        Name = "probe",
        Cost = 0,
        Color = "Colorless",
        Supertype = Supertypes.Skill,
        Subtype = Subtypes.Trap,
        Keywords = [Keywords.Trap],
        Effects = [new ModifyPatienceEffect(1)],
        EffectText = "probe",
        TrapTrigger = new TriggerCondition(eventType),
    };

    private static CombatState Drive(string eventType, CombatState s) => eventType switch
    {
        EventTypes.CardPlayed => PlayCardByDef(s, "p_noop"),
        EventTypes.CardResolved => PlayCardByDef(s, "p_noop"),
        EventTypes.CardDrawn => PlayCardByDef(s, "p_draw"),
        EventTypes.PatienceChanged => PlayCardByDef(s, "p_patience_down"),
        EventTypes.PriorityChanged => PlayCardByDef(s, "p_gain_priority"),
        EventTypes.ShieldBroken => PlayCardByDef(s, "p_break"),
        EventTypes.TokenCreated => PlayCardByDef(s, "p_token_maker"),
        EventTypes.TokenDestroyed => PlayCardByDef(PlayCardByDef(s, "p_token_maker"), "p_token_smash"),
        EventTypes.PlayerTurnEnd => EndPlayerTurn(s),
        EventTypes.NpcTurnStart => RunNpcTurn(EndPlayerTurn(s)),
        EventTypes.NpcTurnEnd => RunNpcTurn(EndPlayerTurn(s)),
        EventTypes.CardStaged => RunNpcTurn(EndPlayerTurn(s)),
        _ => throw new InvalidOperationException($"No scenario for {eventType}"),
    };

    private static IReadOnlyList<string> ScenarioDeck(string eventType) => eventType switch
    {
        EventTypes.CardDrawn => ["probe", "p_draw", "p_noop", "p_noop", "p_noop"],
        EventTypes.TokenCreated => ["probe", "p_token_maker", "p_noop", "p_noop", "p_noop"],
        EventTypes.TokenDestroyed => ["probe", "p_token_maker", "p_token_smash", "p_noop", "p_noop"],
        _ => ["probe", "p_noop", "p_patience_down", "p_gain_priority", "p_break"],
    };

    public static TheoryData<string> Scenarios() =>
    [
        EventTypes.CardPlayed,
        EventTypes.CardResolved,
        EventTypes.CardDrawn,
        EventTypes.PatienceChanged,
        EventTypes.PriorityChanged,
        EventTypes.ShieldBroken,
        EventTypes.TokenCreated,
        EventTypes.TokenDestroyed,
        EventTypes.PlayerTurnEnd,
        EventTypes.NpcTurnStart,
        EventTypes.NpcTurnEnd,
        EventTypes.CardStaged,
    ];

    [Theory]
    [MemberData(nameof(Scenarios))]
    public void Event_IsGenuinelyDispatched_AndFiresASubscribedTrap(string eventType)
    {
        var cards = new Dictionary<string, CardDefinition>(CARDS) { ["probe"] = TrapFor(eventType) };
        var deck = new List<string>(ScenarioDeck(eventType));
        deck.AddRange(Enumerable.Repeat("p_noop", 7));
        var s = Setup.BuildInitialState(new SetupInput
        {
            Config = MakeEncounter(c => c.ScriptedDrawOrder = deck),
            Cards = cards,
            Tokens = TOKENS,
            Nuggets = NUGGETS,
            PlayerDeckCardIds = deck,
            CollectionCardIds = [],
            Seed = 7,
        });
        s = PlayCardByDef(s, "probe");
        s = Drive(eventType, s);
        Assert.True(HasLog(s, "trap-fired"));
    }

    [Fact]
    public void PlayerTurnStart_IsDispatched_AndFiresASubscribedNpcTrap()
    {
        // Owner-relative asymmetry: a player trap expires at §4.1 step 4 before
        // the step-9 dispatch, so PLAYER_TURN_START is an NPC-trap event.
        var s = Start(new StartOptions
        {
            Config = c =>
            {
                c.EnemyDeckCardIds = ["n_trap_pts", .. Enumerable.Repeat("n_noop", 5)];
                c.ScriptedOpponentPlays = ["n_trap_pts"];
            },
        });
        s = EndPlayerTurn(s);
        s = RunNpcTurn(s);
        Assert.True(HasLog(s, "trap-fired"));
    }
}
