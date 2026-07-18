// Initial combat state construction. Validates config (v1.4 §15.5), seeds the
// RNG, auto-fills Placeholder Shields (§3.4), builds the Guard row (v1.4.1 —
// card-backed guards shuffled among dummies, face-down), sets aside scheduled
// plays (§10), and runs the starting side's Turn Start boundary.
//
// 1:1 C# port of src/engine/setup.ts.

namespace Breakthrough.Engine;

public sealed class PersistentInput
{
    public IReadOnlyList<string>? DiscoveredNuggetIds { get; init; }
    public IReadOnlyList<string>? PlayedNonRelevantCards { get; init; }
    public IReadOnlyList<string>? DiscoveredTraitIds { get; init; }

    /// <summary>Persistent opponent-core-shield breaks for retryable encounters.</summary>
    public IReadOnlyList<string>? BrokenCoreShieldCardIds { get; init; }
}

public sealed class SetupInput
{
    public required EncounterConfig Config { get; init; }
    public required IReadOnlyDictionary<string, CardDefinition> Cards { get; init; }
    public required IReadOnlyDictionary<string, CardDefinition> Tokens { get; init; }
    public required IReadOnlyDictionary<string, InfoNugget> Nuggets { get; init; }

    /// <summary>The player's Conversation Deck as definition ids.</summary>
    public required IReadOnlyList<string> PlayerDeckCardIds { get; init; }

    /// <summary>The player's Collection (for Core Shield auto-placement, §3.4.3).</summary>
    public required IReadOnlyList<string> CollectionCardIds { get; init; }

    /// <summary>Global Assemble recipes (v1.4 §11).</summary>
    public IReadOnlyList<CombinationRecipe>? Recipes { get; init; }

    public required int Seed { get; init; }

    /// <summary>Persisted cross-session state (v1.4 §12).</summary>
    public PersistentInput? Persistent { get; init; }
}

public static class Setup
{
    public static CombatState BuildInitialState(SetupInput input)
    {
        var config = input.Config;
        var cards = input.Cards;
        var tokens = input.Tokens;
        var nuggets = input.Nuggets;

        var issues = new List<ValidationIssue>();
        issues.AddRange(Validation.ValidateEncounter(config, cards, nuggets));
        foreach (var card in cards.Values) issues.AddRange(Validation.ValidateCard(card));
        Validation.AssertValid(issues);

        var state = new CombatState
        {
            SchemaVersion = 1,
            Phase = Phases.Check,
            Result = null,
            LoseReason = null,
            RngState = input.Seed,
            Round = 0,
            ActiveTurn = config.StartingSide,
            FirstTurnOfCombatDone = false,
            Patience = config.OpponentPatience,
            StartingPatience = config.OpponentPatience,
            LieCounter = 0,
            Player = new SideState(),
            Npc = new SideState(),
            BackOfMind = [],
            BackOfMindLimitBase = Core.BotmBaseLimit,
            PlayerShields = [],
            ShieldLossArmed = false,
            NpcGuards = [],
            NpcGuardsStanding = 0,
            NpcCoreShields = config.OpponentShields.Select(s => new NpcCoreShieldState
            {
                CardId = s.CardId,
                IsHint = s.IsHint,
                HintText = s.HintText,
                LoreDescription = s.LoreDescription,
                KeyNuggetIds = s.KeyNuggetIds,
                Broken = config.Retryable && input.Persistent?.BrokenCoreShieldCardIds?.Contains(s.CardId) == true,
            }).ToList(),
            Field = [],
            NextArrivalOrder = 0,
            Restrictions = [],
            Replacements = [],
            ScheduledEffects = [],
            NpcScheduledAside = [],
            StagedCard = null,
            StagedCancelled = false,
            TurnEndPending = false,
            GainedCardIds = [],
            EffectStack = [],
            PendingPlay = null,
            PendingBlock = null,
            ResolutionHalted = false,
            OppShieldsBrokenByPlayerThisTurn = 0,
            OppShieldsBrokenByPlayerPrevTurn = 0,
            PlayerShieldsBrokenByNpcThisTurn = 0,
            GuardsPlacedByNpcThisTurn = 0,
            AbilityFiresThisPlay = new Dictionary<string, int>(),
            AbilityFiresThisTurn = new Dictionary<string, int>(),
            NpcHandRevealed = false,
            NpcDeckTopRevealed = false,
            DiscoveredNuggetIds = [.. input.Persistent?.DiscoveredNuggetIds ?? []],
            PlayedNonRelevantCards = [.. input.Persistent?.PlayedNonRelevantCards ?? config.PlayedNonRelevantCards ?? []],
            DiscoveredTraitIds = [.. input.Persistent?.DiscoveredTraitIds ?? []],
            Config = config,
            Cards = cards,
            Tokens = tokens,
            Nuggets = nuggets,
            Recipes = input.Recipes ?? [],
            NextId = 0,
            LogSeq = 0,
            Log = [],
        };

        Core.Log(state, "setup", $"Encounter started: {config.DisplayName}",
            new Dictionary<string, object?> { ["encounterId"] = config.Id, ["seed"] = input.Seed });

        // Guard row (v1.4.1): card-backed guards count toward the total; dummies
        // fill the difference. Shields are face-down — shuffle the row (seeded).
        var guardCardIds = config.NpcGuardShieldCardIds ?? [];
        var guards = new List<NpcGuard>();
        foreach (var cardId in guardCardIds)
        {
            guards.Add(new NpcGuard { GuardId = Core.NewId(state, "guard"), CardId = cardId });
        }
        int dummyCount = Math.Max(0, EncounterDefaults.ResolvedGuardCount(config) - guardCardIds.Count);
        for (int i = 0; i < dummyCount; i++)
        {
            guards.Add(new NpcGuard { GuardId = Core.NewId(state, "guard") });
        }
        var shuffledGuards = Rng.ShuffleWithRng(guards, state.RngState);
        state.RngState = shuffledGuards.RngState;
        state.NpcGuards = shuffledGuards.Items;
        state.NpcGuardsStanding = state.NpcGuards.Count;

        // Player deck: scripted order (tutorial) or seeded shuffle.
        var playerDeckIds = config.ScriptedDrawOrder ?? input.PlayerDeckCardIds;
        var playerCards = playerDeckIds.Select(id => new CardInstance
        {
            InstanceId = Core.NewId(state, "card"),
            DefinitionId = id,
            Owner = Side.Player,
        }).ToList();
        if (config.ScriptedDrawOrder != null)
        {
            state.Player.Deck = playerCards;
        }
        else
        {
            var r = Rng.ShuffleWithRng(playerCards, state.RngState);
            state.RngState = r.RngState;
            state.Player.Deck = r.Items;
        }

        // NPC deck: scheduled plays are set aside — excluded from draws (§10).
        var scheduledIds = new HashSet<string>();
        var aside = new List<NpcScheduledEntry>();
        var deckIds = new List<string>();
        foreach (var id in config.EnemyDeckCardIds)
        {
            var sp = (config.ScheduledPlays ?? []).FirstOrDefault(p => p.CardId == id && !scheduledIds.Contains(id));
            if (sp != null)
            {
                scheduledIds.Add(id);
                aside.Add(new NpcScheduledEntry(
                    new CardInstance { InstanceId = Core.NewId(state, "card"), DefinitionId = id, Owner = Side.Npc },
                    sp.AfterTurn));
            }
            else
            {
                deckIds.Add(id);
            }
        }
        var npcCards = deckIds.Select(id => new CardInstance
        {
            InstanceId = Core.NewId(state, "card"),
            DefinitionId = id,
            Owner = Side.Npc,
        }).ToList();
        if (config.ScriptedOpponentPlays != null)
        {
            var order = config.ScriptedOpponentPlays.ToList();
            int Rank(string id)
            {
                int i = order.IndexOf(id);
                return i == -1 ? int.MaxValue : i; // unlisted cards go last
            }
            state.Npc.Deck = npcCards.OrderBy(c => Rank(c.DefinitionId)).ToList(); // stable, like JS sort
        }
        else
        {
            var r = Rng.ShuffleWithRng(npcCards, state.RngState);
            state.RngState = r.RngState;
            state.Npc.Deck = r.Items;
        }
        state.NpcScheduledAside = aside;

        // Player shields: placeholders auto-fill all dummy slots (§3.4.1)…
        Core.PlacePlaceholderShields(state, EncounterDefaults.ResolvedDummySlots(config));
        // …then Core Shields auto-place from the Collection (§3.4.3, no substitution).
        foreach (var coreDef in config.AllowedCoreShields)
        {
            if (!input.CollectionCardIds.Contains(coreDef.CardId)) continue;
            state.PlayerShields.Add(new PlayerShieldSlot
            {
                SlotId = Core.NewId(state, "shield"),
                ShieldType = ShieldTypes.Core,
                CardInstanceId = Core.NewId(state, "card"),
                CardDefinitionId = coreDef.CardId,
                PatienceCostOnBreak = coreDef.PatienceCostOnBreak,
            });
        }
        if (state.PlayerShields.Count > 0) state.ShieldLossArmed = true;

        // Starting Impressions (NPC-owned, §3.8/§7).
        foreach (var id in config.StartingImpressions ?? [])
        {
            Core.AddPermanent(state, PermanentKinds.Impression, id, Side.Npc, cardInstanceId: Core.NewId(state, "card"));
        }

        Boundaries.StartFirstTurn(state);
        Core.RunStack(state);
        Boundaries.Check(state);
        return state;
    }
}
