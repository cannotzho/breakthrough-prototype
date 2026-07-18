// In-Godot smoke harness for the ported engine. Deliberately PURE C# — no
// Godot API anywhere in this file — so the exact same driver runs under a
// plain .NET host and inside the Godot runtime; any behavioral difference
// between the two is by definition an interop problem, which is what step 1
// of the integration roadmap is meant to surface.
//
// What it does:
//  1. Loads the real content bundle (content.json, exported from the TS
//     content layer) through EngineJson — exercising deserialization in-proc.
//  2. Boots the fan_club_president encounter with a starter deck and drives
//     three full scripted rounds through Reducer.Reduce — the same policy as
//     ContentTests.FcpEncounter_BootsAndSurvivesThreeFullRounds.
//  3. Replays the identical script and byte-compares the serialized final
//     states — determinism proof inside whatever runtime is hosting us.
//  4. Times every Reduce call (clone-per-action cost) and full-state JSON
//     serialization (the GDScript bridge cost).

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using Breakthrough.Engine;
using Breakthrough.Engine.Json;

namespace Breakthrough.GodotHost;

/// <summary>
/// Deserialization target for content.json. Mirrors the DTO the engine test
/// suite uses (Breakthrough.Engine.Tests.ContentBundle) — duplicated here
/// because the Godot host should not reference the test assembly.
/// </summary>
public sealed class ContentBundle
{
    public required Dictionary<string, CardDefinition> Cards { get; init; }
    public required Dictionary<string, CardDefinition> Tokens { get; init; }
    public required Dictionary<string, InfoNugget> Nuggets { get; init; }
    public required Dictionary<string, EncounterConfig> Encounters { get; init; }
    public required List<CombinationRecipe> Recipes { get; init; }
    public required List<string> DevCollectionIds { get; init; }
    public required Dictionary<string, List<string>> StarterDeckLists { get; init; }
}

public static class EngineHarness
{
    public sealed record HarnessResult(string Report, bool Passed);

    /// <summary>
    /// Finds content.json given the Godot project directory: prefers the copy
    /// the SyncContentBundle build target places next to project.godot, falls
    /// back to the canonical copy in the engine test project (useful before
    /// the first build, or when running the harness outside Godot).
    /// </summary>
    public static string ResolveContentPath(string projectDir)
    {
        string local = Path.Combine(projectDir, "content.json");
        if (File.Exists(local)) return local;
        return Path.GetFullPath(Path.Combine(
            projectDir, "..", "csharp-engine", "Breakthrough.Engine.Tests", "content.json"));
    }

    public static ContentBundle LoadContent(string projectDir) =>
        EngineJson.Deserialize<ContentBundle>(File.ReadAllText(ResolveContentPath(projectDir)));

    public static HarnessResult RunSmokeGame(string projectDir)
    {
        var sb = new StringBuilder();
        bool passed = true;
        void Fail(string msg)
        {
            passed = false;
            sb.AppendLine("FAIL: " + msg);
        }

        ContentBundle content;
        var loadWatch = Stopwatch.StartNew();
        try
        {
            content = LoadContent(projectDir);
        }
        catch (Exception e)
        {
            return new HarnessResult($"FAIL: could not load content bundle: {e.Message}", false);
        }
        loadWatch.Stop();
        sb.AppendLine(
            $"content: {content.Cards.Count} cards, {content.Tokens.Count} tokens, " +
            $"{content.Nuggets.Count} nuggets, {content.Encounters.Count} encounters, " +
            $"{content.StarterDeckLists.Count} starter decks (loaded in {loadWatch.ElapsedMilliseconds} ms)");

        string deckName = content.StarterDeckLists.Keys.OrderBy(k => k, StringComparer.Ordinal).First();

        var timings = new List<double>();
        var final1 = RunScriptedGame(content, deckName, seed: 2026, timings, sb, Fail);
        if (final1 == null) return new HarnessResult(sb.ToString(), false);

        // Determinism inside this runtime: identical (seed, action sequence)
        // must yield a byte-identical serialized state.
        var final2 = RunScriptedGame(content, deckName, seed: 2026, timings: null, sb: null, fail: Fail);
        string json1 = EngineJson.Serialize(final1);
        string json2 = final2 == null ? "" : EngineJson.Serialize(final2);
        if (json1 == json2)
            sb.AppendLine($"determinism: replay is byte-identical ({json1.Length:N0} chars of state JSON)");
        else
            Fail("replaying the identical script produced a different state — determinism broken in this runtime");

        // Bridge cost: how expensive is handing the full state across the
        // GDScript boundary as JSON?
        var serWatch = Stopwatch.StartNew();
        const int serReps = 50;
        for (int i = 0; i < serReps; i++) _ = EngineJson.Serialize(final1);
        serWatch.Stop();
        sb.AppendLine(
            $"bridge cost: full-state JSON = {json1.Length:N0} chars, " +
            $"serialize avg {serWatch.Elapsed.TotalMilliseconds / serReps:F2} ms");

        if (timings.Count > 0)
        {
            var sorted = timings.OrderBy(t => t).ToList();
            sb.AppendLine(
                $"Reduce() cost (clone-per-action): {sorted.Count} actions, " +
                $"avg {sorted.Average():F3} ms, p50 {sorted[sorted.Count / 2]:F3} ms, max {sorted[^1]:F3} ms");
        }

        sb.AppendLine(passed
            ? "RESULT: PASS — engine behaves correctly inside this runtime"
            : "RESULT: FAIL — see lines above");
        return new HarnessResult(sb.ToString(), passed);
    }

    /// <summary>
    /// Boots FCP and plays three rounds with the same blind policy as the
    /// engine test suite: play leftmost while affordable, resolve pending
    /// blocks (min for number choices), end turn, keep nothing at BotM,
    /// advance the NPC to completion. Returns null on runaway.
    /// </summary>
    private static CombatState? RunScriptedGame(
        ContentBundle content, string deckName, int seed,
        List<double>? timings, StringBuilder? sb, Action<string> fail)
    {
        var s = Setup.BuildInitialState(new SetupInput
        {
            Config = content.Encounters["fan_club_president"],
            Cards = content.Cards,
            Tokens = content.Tokens,
            Nuggets = content.Nuggets,
            Recipes = content.Recipes,
            PlayerDeckCardIds = content.StarterDeckLists[deckName],
            CollectionCardIds = content.DevCollectionIds,
            Seed = seed,
        });
        sb?.AppendLine(
            $"boot: encounter=fan_club_president deck={deckName} seed={seed} " +
            $"phase={s.Phase} patience={s.Patience} hand={s.Player.Hand.Count}");

        CombatState Apply(CombatState cur, CombatAction action)
        {
            var w = Stopwatch.StartNew();
            var next = Reducer.Reduce(cur, action);
            w.Stop();
            timings?.Add(w.Elapsed.TotalMilliseconds);
            return next;
        }

        int guard = 0;
        for (int round = 0; round < 3 && s.Result == null; round++)
        {
            while (s.Phase == Phases.PlayerPending && s.Player.Priority >= 1 && s.Player.Hand.Count > 0)
            {
                if (++guard > 200) { fail("runaway player loop"); return null; }
                var next = Apply(s, new PlayCard(0));
                if (next.Log.Count > 0 && next.Log[^1].Type == "illegal-action") break;
                s = next;
                while (s.PendingBlock != null)
                {
                    s = s.PendingBlock is ChooseNumberBlock block
                        ? Apply(s, new ChooseNumber(block.Min))
                        : Apply(s, new Acknowledge());
                }
            }
            if (s.Result != null) break;
            s = Apply(s, new EndTurn());
            if (s.Phase == Phases.BotMSelect) s = Apply(s, new BotmSelect([]));
            while (s.Phase == Phases.EnemyPending)
            {
                if (++guard > 400) { fail("runaway npc loop"); return null; }
                s = Apply(s, new Advance());
                while (s.PendingBlock != null) s = Apply(s, new Acknowledge());
            }
            sb?.AppendLine(
                $"round {s.Round}: phase={s.Phase} patience={s.Patience} " +
                $"prio P/N={s.Player.Priority}/{s.Npc.Priority} guards={s.NpcGuardsStanding} " +
                $"hand={s.Player.Hand.Count} log={s.Log.Count}");
        }

        int errors = s.Log.Count(l => l.Type == "error");
        if (errors > 0) fail($"{errors} engine error log entries");
        if (s.ResolutionHalted) fail("resolution halted mid-sequence");
        sb?.AppendLine($"final: phase={s.Phase} result={s.Result ?? "none"} round={s.Round} errors={errors}");
        return s;
    }
}
