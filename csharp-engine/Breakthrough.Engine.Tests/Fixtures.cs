// Test fixtures: a synthetic card set and encounter factory exercising the
// full v1.4 vocabulary without any real content (tests are content-agnostic,
// like the engine itself).
//
// 1:1 C# port of tests/engine/fixtures.ts.

using Breakthrough.Engine;
using Breakthrough.Engine.Json;

namespace Breakthrough.Engine.Tests;

public static class Fixtures
{
    public static readonly Dictionary<string, CardDefinition> CARDS = BuildCards();
    public static readonly Dictionary<string, CardDefinition> TOKENS = BuildTokens();
    public static readonly Dictionary<string, InfoNugget> NUGGETS = new()
    {
        ["nug_a"] = new InfoNugget("nug_a", "Nugget A", "a"),
        ["nug_b"] = new InfoNugget("nug_b", "Nugget B", "b"),
        ["nug_c"] = new InfoNugget("nug_c", "Nugget C", "c"),
    };

    private static CardDefinition Card(
        string id,
        int cost,
        IReadOnlyList<Effect>? effects = null,
        IReadOnlyList<string>? keywords = null,
        string supertype = Supertypes.Skill,
        string? subtype = null,
        string? nuggetId = null,
        IReadOnlyList<Effect>? shieldTriggerEffects = null,
        IReadOnlyList<Effect>? heavyHandEffects = null,
        TriggerCondition? trapTrigger = null,
        RapportConfig? rapport = null,
        IReadOnlyList<TriggeredAbility>? triggeredAbilities = null,
        IReadOnlyList<ActivatedAbility>? activatedAbilities = null,
        IReadOnlyList<Effect>? turnStartEffects = null,
        IReadOnlyList<ThresholdDef>? thresholds = null,
        IReadOnlyList<Effect>? leaveTriggerEffects = null) => new()
    {
        Id = id,
        Name = id,
        Cost = cost,
        Color = "Colorless",
        Supertype = supertype,
        Subtype = subtype,
        Keywords = keywords ?? [],
        Effects = effects ?? [],
        EffectText = "test",
        NuggetId = nuggetId,
        ShieldTriggerEffects = shieldTriggerEffects,
        HeavyHandEffects = heavyHandEffects,
        TrapTrigger = trapTrigger,
        Rapport = rapport,
        TriggeredAbilities = triggeredAbilities,
        ActivatedAbilities = activatedAbilities,
        TurnStartEffects = turnStartEffects,
        Thresholds = thresholds,
        LeaveTriggerEffects = leaveTriggerEffects,
    };

    private static Dictionary<string, CardDefinition> BuildCards()
    {
        var cards = new List<CardDefinition>
        {
            Card("ponder", 1, effects: [new DrawCardsEffect(1)]),

            // Player-side skills
            Card("p_noop", 1),
            Card("p_free", 0),
            Card("p_break", 2, effects: [new BreakShieldsEffect(RelSide.Opponent, 1)]),
            Card("p_break3", 1, effects: [new BreakShieldsEffect(RelSide.Opponent, 3)]),
            Card("p_gain_priority", 0, effects: [new ModifyPriorityEffect(3)]),
            Card("p_expensive", 9),
            Card("p_draw", 1, effects: [new DrawCardsEffect(2)]),
            Card("p_patience_up", 1, effects: [new ModifyPatienceEffect(3)]),
            Card("p_patience_down", 1, effects: [new ModifyPatienceEffect(-3)]),
            Card("p_lie", 0, keywords: [Keywords.Lie]),
            Card("p_safety", 1, keywords: [Keywords.Safety]),
            Card("p_shield_trigger", 1,
                keywords: [Keywords.ShieldTrigger],
                shieldTriggerEffects: [new ModifyPatienceEffect(2)]),
            Card("p_heavy", 2,
                keywords: [Keywords.HeavyHand],
                effects: [new ModifyPatienceEffect(-1)],
                heavyHandEffects: [new ModifyPatienceEffect(-1), new BreakShieldsEffect(RelSide.Opponent, 1)]),
            Card("p_choose", 1, effects:
            [
                new ChooseNumberEffect(1, 10),
                new ModifyPatienceEffect(1) { Scale = new ChosenNumberQ() },
            ]),
            Card("p_trap_cancel", 2,
                keywords: [Keywords.Trap],
                subtype: Subtypes.Trap,
                trapTrigger: new TriggerCondition(EventTypes.CardStaged) { ControllerFilter = "opponent" },
                effects: [new CancelStagedCardEffect()]),
            Card("p_trap_rapport", 2,
                keywords: [Keywords.Trap, Keywords.Rapport],
                subtype: Subtypes.Trap,
                rapport: new RapportConfig(1, 10, new StagedCardCostQ()),
                trapTrigger: new TriggerCondition(EventTypes.CardStaged)
                {
                    ControllerFilter = "opponent",
                    Condition = new CompareCondition(new StagedCardCostQ(), Comparators.Eq, new ChosenNumberQ()),
                },
                effects: [new CancelStagedCardEffect(), new ModifyPatienceEffect(1) { Scale = new ChosenNumberQ() }]),
            Card("p_trap_on_patience", 1,
                keywords: [Keywords.Trap],
                subtype: Subtypes.Trap,
                trapTrigger: new TriggerCondition(EventTypes.PatienceChanged)
                {
                    Condition = new CompareCondition(new EventNewValueQ(), Comparators.Lt, new ConstQ(5)),
                },
                effects: [new ModifyPriorityEffect(2)]),
            // NPC trap that responds to PLAYER_TURN_START (a player-owned trap
            // cannot: it expires at §4.1 step 4, before the step-9 dispatch).
            Card("n_trap_pts", 1,
                keywords: [Keywords.Trap],
                subtype: Subtypes.Trap,
                trapTrigger: new TriggerCondition(EventTypes.PlayerTurnStart),
                effects:
                [
                    new ApplyRestrictionEffect(new RestrictionDef(RestrictionTypes.PreventDraw, RelTargets.Opponent)
                    {
                        Expiry = new BoundaryRef { Boundary = BoundaryNames.PlayerTurnStart, Occurrences = 1 },
                    }),
                    new ModifyPatienceEffect(-1),
                ]),
            Card("p_impression_on_break", 2,
                subtype: Subtypes.Impression,
                triggeredAbilities:
                [
                    new TriggeredAbility("gain_on_break",
                        new TriggerCondition(EventTypes.ShieldBroken) { ControllerFilter = "self" },
                        [new ModifyPriorityEffect(1)]),
                ]),
            Card("p_token_maker", 1, effects: [new CreateTokenEffect("tok_chain", 1)]),
            Card("p_token_smash", 1, effects: [new DestroyTokensEffect(2)]),
            Card("p_replacer", 1, effects:
            [
                new ApplyReplacementEffect("tok_chain", "tok_boom")
                {
                    Expiry = new BoundaryRef { Boundary = BoundaryNames.PlayerTurnEnd, Occurrences = 1 },
                },
            ]),
            Card("p_scheduler", 1, effects:
            [
                new ScheduleEffectsEffect(
                    [new ModifyPriorityEffect(4)],
                    new BoundaryRef { Boundary = BoundaryNames.PlayerTurnStart, Occurrences = 1 }),
            ]),
            Card("p_copy", 1, effects:
            [
                new CopyFromNpcDeckEffect(1) { PatienceCostOverride = new ConstQ(2) },
            ]),
            Card("p_counter_feeder", 0, effects:
            [
                new IncrementCountersEffect("devotion", "n_counter_impression", 2),
            ]),

            Card("p_trap_draw", 1,
                keywords: [Keywords.Trap],
                subtype: Subtypes.Trap,
                trapTrigger: new TriggerCondition(EventTypes.CardPlayed) { ControllerFilter = "opponent" },
                effects: [new DrawCardsEffect(1)]),
            Card("p_impression_battery", 1,
                subtype: Subtypes.Impression,
                activatedAbilities:
                [
                    new ActivatedAbility("surge", "Surge",
                        new ActivatedAbilityCost { Patience = 1 },
                        [new ModifyPriorityEffect(6)]),
                ]),

            // Information cards
            Card("info_a", 0, supertype: Supertypes.Information, nuggetId: "nug_a"),
            Card("info_b", 0, supertype: Supertypes.Information, nuggetId: "nug_b"),
            Card("info_c", 0, supertype: Supertypes.Information, nuggetId: "nug_c"),

            // Core-shield lore cards
            Card("lore_1", 0),
            Card("lore_2", 0),

            // NPC cards
            Card("n_noop", 1),
            Card("n_free", 0),
            Card("n_break", 1, effects: [new BreakShieldsEffect(RelSide.Opponent, 1)]),
            Card("n_break2", 1, effects: [new BreakShieldsEffect(RelSide.Opponent, 2)]),
            Card("n_break5", 1, effects: [new BreakShieldsEffect(RelSide.Opponent, 5)]),
            Card("n_patience_drain", 1, effects: [new ModifyPatienceEffect(-2)]),
            Card("n_guards_up", 1, effects: [new PlaceShieldsEffect(2)]),
            Card("n_self_break", 1, effects: [new BreakShieldsEffect(RelSide.Self, 1)]),
            Card("n_draw_blocker", 1, effects:
            [
                new ApplyRestrictionEffect(new RestrictionDef(RestrictionTypes.PreventDraw, RelTargets.Opponent)
                {
                    Expiry = new BoundaryRef { Boundary = BoundaryNames.PlayerTurnEnd, Occurrences = 1 },
                }),
            ]),
            Card("n_impression_ts", 1,
                subtype: Subtypes.Impression,
                turnStartEffects: [new ModifyPatienceEffect(-1)]),
            Card("n_counter_impression", 0,
                subtype: Subtypes.Impression,
                thresholds:
                [
                    new ThresholdDef("devotion", 4, true, [new BreakShieldsEffect(RelSide.Opponent, 1)])
                    {
                        CheckPoint = CheckPoints.AfterAnyPlay,
                    },
                ]),
            Card("n_trap_on_play", 1,
                keywords: [Keywords.Trap],
                subtype: Subtypes.Trap,
                trapTrigger: new TriggerCondition(EventTypes.CardPlayed) { ControllerFilter = "opponent" },
                effects: [new ModifyPatienceEffect(-1)]),
        };
        var dict = cards.ToDictionary(c => c.Id);
        // Token defs must also be resolvable through the card registry used by GetDef.
        foreach (var t in BuildTokens().Values) dict[t.Id] = t;
        return dict;
    }

    private static Dictionary<string, CardDefinition> BuildTokens() => new()
    {
        ["tok_chain"] = Card("tok_chain", 0,
            subtype: Subtypes.Token,
            leaveTriggerEffects: [new DrawCardsEffect(1)]),
        ["tok_boom"] = Card("tok_boom", 0,
            subtype: Subtypes.Token,
            leaveTriggerEffects: [new BreakShieldsEffect(RelSide.Opponent, 1)]),
    };

    public static EncounterConfig MakeEncounter(Action<EncounterConfig>? overrides = null)
    {
        var config = new EncounterConfig
        {
            Id = "test",
            DisplayName = "Test Encounter",
            MinTurnStartPriority = 3,
            FirstTurnBonusPriority = 2,
            MaxPriority = 10,
            StartingSide = Side.Player,
            OpponentPatience = 10,
            NpcGuardShieldCount = 2,
            OpponentShields =
            [
                new NpcCoreShieldDef { CardId = "lore_1", IsHint = false, LoreDescription = "lore one", KeyNuggetIds = ["nug_a"] },
                new NpcCoreShieldDef { CardId = "lore_2", IsHint = true, HintText = "hint", LoreDescription = "lore two", KeyNuggetIds = ["nug_b"] },
            ],
            NpcHandLimit = 5,
            PlayerDummyShieldSlots = 3,
            AllowedCoreShields = [],
            NuggetOverrides =
            [
                new NuggetOverride("nug_a", 1, [new DrawCardsEffect(1)], "draw 1"),
                new NuggetOverride("nug_b", 0, [], "nothing"),
            ],
            Traits = [],
            EnemyDeckCardIds = ["n_noop", "n_noop", "n_noop", "n_noop", "n_noop", "n_noop"],
            LieThreshold = 2,
        };
        overrides?.Invoke(config);
        return config;
    }

    public sealed class StartOptions
    {
        public Action<EncounterConfig>? Config { get; init; }
        public IReadOnlyList<string>? Deck { get; init; }
        public IReadOnlyList<string>? Collection { get; init; }
        public int Seed { get; init; } = 42;
        public PersistentInput? Persistent { get; init; }
    }

    public static CombatState Start(StartOptions? opts = null)
    {
        opts ??= new StartOptions();
        return Setup.BuildInitialState(new SetupInput
        {
            Config = MakeEncounter(opts.Config),
            Cards = CARDS,
            Tokens = TOKENS,
            Nuggets = NUGGETS,
            PlayerDeckCardIds = opts.Deck ?? Enumerable.Repeat("p_noop", 12).ToList(),
            CollectionCardIds = opts.Collection ?? [],
            Seed = opts.Seed,
            Persistent = opts.Persistent,
        });
    }

    /// <summary>Play the hand card with the given definition id (must be in hand).</summary>
    public static CombatState PlayCardByDef(CombatState state, string defId, bool heavyHand = false)
    {
        int idx = state.Player.Hand.FindIndex(c => c.DefinitionId == defId);
        if (idx == -1)
            throw new InvalidOperationException(
                $"{defId} not in hand: {string.Join(",", state.Player.Hand.Select(c => c.DefinitionId))}");
        return Reducer.Reduce(state, new PlayCard(idx, heavyHand));
    }

    public static CombatState Act(CombatState state, CombatAction action) => Reducer.Reduce(state, action);

    /// <summary>End the player turn, auto-completing BotM with an empty keep.</summary>
    public static CombatState EndPlayerTurn(CombatState state)
    {
        var s = Reducer.Reduce(state, new EndTurn());
        if (s.Phase == Phases.BotMSelect) s = Reducer.Reduce(s, new BotmSelect([]));
        return s;
    }

    /// <summary>Run the whole NPC turn via ADVANCE until control returns to the player or the game ends.</summary>
    public static CombatState RunNpcTurn(CombatState state)
    {
        var s = state;
        int guard = 0;
        while (s.Phase == Phases.EnemyPending)
        {
            if (++guard > 50) throw new InvalidOperationException("NPC turn did not terminate");
            s = Reducer.Reduce(s, new Advance());
            while (s.PendingBlock is RevealBlock or DeckRevealBlock)
            {
                s = Reducer.Reduce(s, new Acknowledge());
            }
        }
        return s;
    }

    // ── Assertion helpers (JSON.stringify / log-query equivalents) ───────────

    /// <summary>Canonical JSON of the full state (the tests' JSON.stringify(s) equivalent).</summary>
    public static string StateJson(CombatState s) => EngineJson.Serialize(s);

    /// <summary>Canonical JSON of any engine value (the tests' JSON.stringify(x) equivalent).</summary>
    public static string ToJson<T>(T value) => EngineJson.Serialize(value);

    /// <summary>JSON of the state with the log ignored ({ ...s, log: null, logSeq: 0 }).</summary>
    public static string StateJsonIgnoringLog(CombatState s)
    {
        var clone = s.Clone();
        clone.Log = [];
        clone.LogSeq = 0;
        return EngineJson.Serialize(clone);
    }

    public static LogEntry? LastLog(CombatState s) => s.Log.Count > 0 ? s.Log[^1] : null;

    public static bool HasLog(CombatState s, string type) => s.Log.Any(l => l.Type == type);

    public static object? Data(LogEntry? entry, string key) =>
        entry?.Data != null && entry.Data.TryGetValue(key, out var v) ? v : null;

    public static bool DataEquals(LogEntry? entry, string key, object? expected) => Equals(Data(entry, key), expected);
}
