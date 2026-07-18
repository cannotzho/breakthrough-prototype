// Cross-engine behavioral parity: replay the exact deterministic game the TS
// engine recorded (csharp-engine/tools/dump-trace.test.ts) and require every
// per-action state snapshot to match line-for-line — including rngState,
// logSeq and nextId, which count every internal engine step. This is the
// byte-level fidelity check between the TS engine and this port.

using System.Text;
using Breakthrough.Engine;
using Xunit;
using static Breakthrough.Engine.Tests.Fixtures;

namespace Breakthrough.Engine.Tests;

public class TraceParityTests
{
    private static string Snap(CombatState s)
    {
        static string Ids(IEnumerable<CardInstance> cards) => string.Join(",", cards.Select(c => c.DefinitionId));
        var sb = new StringBuilder();
        sb.Append(s.Phase).Append('|');
        sb.Append(s.RngState).Append('|');
        sb.Append(s.Patience).Append('|');
        sb.Append(s.Player.Priority).Append('|');
        sb.Append(s.Npc.Priority).Append('|');
        sb.Append(s.Round).Append('|');
        sb.Append(s.LieCounter).Append('|');
        sb.Append(Ids(s.Player.Hand)).Append('|');
        sb.Append(Ids(s.Player.Deck)).Append('|');
        sb.Append(Ids(s.Player.Discard)).Append('|');
        sb.Append(Ids(s.Npc.Hand)).Append('|');
        sb.Append(Ids(s.Npc.Deck)).Append('|');
        sb.Append(Ids(s.Npc.Discard)).Append('|');
        sb.Append(string.Join(",", s.NpcGuards.Select(g => g.CardId ?? "-"))).Append('|');
        sb.Append(s.NpcGuardsStanding).Append('|');
        sb.Append(s.OppShieldsBrokenByPlayerThisTurn).Append('|');
        sb.Append(s.PlayerShields.Count).Append('|');
        sb.Append(string.Join(",", s.Field.Select(p => $"{p.Kind}:{p.DefinitionId}"))).Append('|');
        sb.Append(s.LogSeq).Append('|');
        sb.Append(s.NextId);
        return sb.ToString();
    }

    [Fact]
    public void ReplayingTheTsScript_ReproducesEveryStateSnapshot()
    {
        string path = Path.Combine(AppContext.BaseDirectory, "trace.expected.txt");
        Assert.True(File.Exists(path), $"TS parity trace missing: {path} (run npx vitest run --config csharp-engine/tools/vitest.config.ts)");
        var expected = File.ReadAllLines(path).Where(l => l.Length > 0).ToList();

        var s = Start(new StartOptions
        {
            Seed = 4242,
            Deck =
            [
                "p_break", "p_draw", "p_choose", "p_lie", "p_safety", "p_free",
                "p_heavy", "p_copy", "p_scheduler", "p_replacer", "p_token_maker", "p_noop",
            ],
            Config = c => c.EnemyDeckCardIds = ["n_break", "n_guards_up", "n_patience_drain", "n_noop", "n_noop", "n_noop"],
        });
        var trace = new List<string> { Snap(s) };

        for (int round = 0; round < 4 && s.Result == null; round++)
        {
            while (s.Phase == Phases.PlayerPending && s.Player.Priority >= 1 && s.Player.Hand.Count > 0 && s.Result == null)
            {
                s = Reducer.Reduce(s, new PlayCard(0));
                while (s.PendingBlock != null)
                {
                    s = s.PendingBlock is ChooseNumberBlock block
                        ? Reducer.Reduce(s, new ChooseNumber(block.Min))
                        : Reducer.Reduce(s, new Acknowledge());
                }
                trace.Add(Snap(s));
            }
            if (s.Result != null) break;
            s = Reducer.Reduce(s, new EndTurn());
            trace.Add(Snap(s));
            if (s.Phase == Phases.BotMSelect)
            {
                s = Reducer.Reduce(s, new BotmSelect([]));
                trace.Add(Snap(s));
            }
            while (s.Phase == Phases.EnemyPending)
            {
                s = Reducer.Reduce(s, new Advance());
                while (s.PendingBlock != null) s = Reducer.Reduce(s, new Acknowledge());
                trace.Add(Snap(s));
            }
        }

        Assert.Equal(expected.Count, trace.Count);
        for (int i = 0; i < expected.Count; i++)
        {
            Assert.True(expected[i] == trace[i], $"Trace diverges at step {i}:\nTS: {expected[i]}\nC#: {trace[i]}");
        }
    }
}
