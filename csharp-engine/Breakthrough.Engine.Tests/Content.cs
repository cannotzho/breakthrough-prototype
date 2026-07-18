// Loader for the TS content bundle (content.json, exported by
// ../tools/dump-content.test.ts). Content stays a data layer — the C# tests
// consume the exact JSON the TS content module defines.

using Breakthrough.Engine;
using Breakthrough.Engine.Json;

namespace Breakthrough.Engine.Tests;

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

public static class Content
{
    public static readonly ContentBundle Bundle = Load();

    private static ContentBundle Load()
    {
        string path = Path.Combine(AppContext.BaseDirectory, "content.json");
        return EngineJson.Deserialize<ContentBundle>(File.ReadAllText(path));
    }
}
