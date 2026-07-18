// §6.7 inv. 12 & Brief §7 trap 10 — reducer purity, config immutability,
// and full determinism (the dual-playtest foundation, Brief §4).
//
// 1:1 C# port of tests/engine/purity.test.ts.
//
// PORTING NOTE: the TS suite's first test deep-freezes the input state with
// Object.freeze and asserts reduce() does not throw — JS-specific (C# has no
// object freezing). Its intent (reduce never mutates its input) is asserted
// here by snapshotting the input's canonical JSON before and after the call,
// which is also exactly what the second TS test does.

using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class PurityTests
{
    private static readonly CombatAction[] Script =
    [
        new PlayCard(0),
        new PlayCard(0),
        new EndTurn(),
        new BotmSelect([0]),
        new Advance(),
        new Advance(),
        new Advance(),
        new Advance(),
    ];

    [Fact]
    public void Reduce_NeverMutatesItsInput_FrozenStateEquivalent()
    {
        // TS: deep-freeze + expect(no throw). C#: JSON snapshot equality.
        var s0 = Start();
        string snapshot = StateJson(s0);
        _ = Reducer.Reduce(s0, new PlayCard(0));
        Assert.Equal(snapshot, StateJson(s0));
    }

    [Fact]
    public void InputState_IsByteIdenticalBeforeAndAfterReduce()
    {
        var s0 = Start();
        string snapshot = StateJson(s0);
        _ = Reducer.Reduce(s0, new EndTurn());
        Assert.Equal(snapshot, StateJson(s0));
    }

    [Fact]
    public void SameSeedAndActionSequence_YieldByteIdenticalStates()
    {
        static string Run()
        {
            var s = Start(new StartOptions { Seed = 1234 });
            foreach (var a in Script) s = Reducer.Reduce(s, a);
            return StateJson(s);
        }
        Assert.Equal(Run(), Run());
    }

    [Fact]
    public void DifferentSeeds_Diverge_RandomnessFlowsThroughTheStateRng()
    {
        static string ShuffleOf(int seed) => ToJson(Start(new StartOptions
        {
            Seed = seed,
            Deck = ["p_break", "p_draw", "p_noop", "p_lie", "p_safety", "p_choose", "p_free", "p_heavy", "p_copy", "p_scheduler", "p_replacer", "p_token_maker"],
        }).Player.Deck.Select(c => c.DefinitionId).ToList());
        Assert.NotEqual(ShuffleOf(1), ShuffleOf(2));
    }

    [Fact]
    public void EncounterConfig_IsImmutableInput_NeverMutated()
    {
        var s = Start();
        string cfg = ToJson(s.Config);
        s = Reducer.Reduce(s, new PlayCard(0));
        s = Reducer.Reduce(s, new EndTurn());
        if (s.Phase == Phases.BotMSelect) s = Reducer.Reduce(s, new BotmSelect([]));
        while (s.Phase == Phases.EnemyPending) s = Reducer.Reduce(s, new Advance());
        Assert.Equal(cfg, ToJson(s.Config));
    }

    [Fact]
    public void ManualNpcPlayOfSameCard_ProducesIdenticalTransitionsToAdvance()
    {
        CombatState Auto()
        {
            var s = Start(new StartOptions { Seed = 99 });
            s = Reducer.Reduce(s, new EndTurn());
            if (s.Phase == Phases.BotMSelect) s = Reducer.Reduce(s, new BotmSelect([]));
            s = Reducer.Reduce(s, new Advance());
            return s;
        }
        CombatState Manual()
        {
            var s = Start(new StartOptions { Seed = 99 });
            s = Reducer.Reduce(s, new EndTurn());
            if (s.Phase == Phases.BotMSelect) s = Reducer.Reduce(s, new BotmSelect([]));
            s = Reducer.Reduce(s, new NpcPlayCard(0)); // same leftmost card
            return s;
        }
        Assert.Equal(StateJson(Auto()), StateJson(Manual()));
    }
}
