// Brief §7 trap 11 — grep-level lint: no card-ID string checks inside the
// engine. The engine may reference exactly one content id: 'ponder' (the
// designed colorless fallback, v1.4 §3.9). Anything matching known content
// id prefixes fails the build.
//
// C# equivalent of scripts/lint-no-card-ids.mjs, run as a test so it gates
// `dotnet test`. The engine sources are copied to the test output directory
// (see the csproj's EngineSources items).

using System.Text.RegularExpressions;
using Xunit;

namespace Breakthrough.Engine.Tests;

public class EngineLintTests
{
    private static readonly Regex Banned = new(
        "['\"`](?:red_|blue_|green_|orange_|white_|black_|purple_|fcp_|dev_|info_|tok_|n_|p_)[a-z0-9_]*['\"`]",
        RegexOptions.Compiled);

    [Fact]
    public void Engine_IsFreeOfCardIdLiterals()
    {
        string dir = Path.Combine(AppContext.BaseDirectory, "EngineSources");
        Assert.True(Directory.Exists(dir), $"Engine sources not copied to test output: {dir}");
        var files = Directory.GetFiles(dir, "*.cs", SearchOption.AllDirectories);
        Assert.NotEmpty(files);

        var failures = new List<string>();
        foreach (var file in files)
        {
            var lines = File.ReadAllLines(file);
            for (int i = 0; i < lines.Length; i++)
            {
                var hits = Banned.Matches(lines[i]);
                if (hits.Count > 0)
                {
                    failures.Add($"{Path.GetFileName(file)}:{i + 1}: card-ID literal in engine: " +
                                 string.Join(", ", hits.Select(m => m.Value)));
                }
            }
        }
        Assert.True(failures.Count == 0,
            $"{failures.Count} violation(s) of v1.4 §15.2 (no card-ID logic in the engine):\n{string.Join("\n", failures)}");
    }
}
