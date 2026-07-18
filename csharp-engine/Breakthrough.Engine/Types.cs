// Breakthrough combat engine — type vocabulary.
//
// 1:1 C# port of src/engine/types.ts. Implements Breakthrough_Design_v1.4.md
// exactly, plus the v1.4.1 changes approved by Ken: two-tier opponent shields
// with card-backed Guard Shields, and the CARD_DRAWN canonical event.
//
// The engine layer is pure and framework-agnostic (v1.4 §15.1): state is
// plain serializable data, the reducer never mutates its input, and there is
// no module-level mutable state. No card-ID logic anywhere (§15.2).
//
// String unions from TS are kept as string constants for fidelity; the
// discriminated unions with distinct shapes (Quantity, Condition, Effect,
// CombatAction, PendingBlock) are sealed record hierarchies.

namespace Breakthrough.Engine;

// ── Sides, boundaries, phases ────────────────────────────────────────────────

public enum Side
{
    Player,
    Npc,
}

public static class SideExtensions
{
    public static Side OpponentOf(this Side s) => s == Side.Player ? Side.Npc : Side.Player;

    /// <summary>The TS-side string key ("player" / "npc") used in logs and JSON.</summary>
    public static string ToKey(this Side s) => s == Side.Player ? "player" : "npc";
}

/// <summary>The four canonical turn boundaries (v1.4 §4).</summary>
public static class BoundaryNames
{
    public const string PlayerTurnStart = "PLAYER_TURN_START";
    public const string PlayerTurnEnd = "PLAYER_TURN_END";
    public const string NpcTurnStart = "NPC_TURN_START";
    public const string NpcTurnEnd = "NPC_TURN_END";
}

/// <summary>
/// A named-boundary duration (v1.4 §4: durations are never bare integers).
/// Occurrences = 1 means "the next time this boundary happens".
/// Mutable: expiry ticks decrement Occurrences in place (always on a copy
/// owned by combat state, never on card data).
/// </summary>
public sealed class BoundaryRef
{
    public required string Boundary { get; set; }
    public required int Occurrences { get; set; }

    public BoundaryRef Clone() => new() { Boundary = Boundary, Occurrences = Occurrences };
}

public static class Phases
{
    public const string Check = "Check";
    public const string PlayerPending = "PlayerPending";
    public const string EnemyPending = "EnemyPending";
    public const string RevealPending = "RevealPending";
    public const string ChooseNumberPending = "ChooseNumberPending";
    public const string DeckRevealPending = "DeckRevealPending";
    public const string BotMSelect = "BotMSelect";
    public const string Won = "Won";
    public const string Lost = "Lost";
}

public static class Results
{
    public const string Win = "WIN";
    public const string Lose = "LOSE";
}

public static class LoseReasons
{
    public const string Patience = "PATIENCE";
    public const string Lies = "LIES";
    public const string Shields = "SHIELDS";
}

// ── Canonical event vocabulary (v1.4 §5.1 + v1.4.1 CARD_DRAWN) ──────────────

public static class EventTypes
{
    public const string CardStaged = "CARD_STAGED";
    public const string CardPlayed = "CARD_PLAYED";
    public const string CardResolved = "CARD_RESOLVED";
    public const string CardDrawn = "CARD_DRAWN"; // v1.4.1 — dispatched per card drawn, either side
    public const string ShieldBroken = "SHIELD_BROKEN";
    public const string PatienceChanged = "PATIENCE_CHANGED";
    public const string PriorityChanged = "PRIORITY_CHANGED";
    public const string TokenCreated = "TOKEN_CREATED";
    public const string TokenDestroyed = "TOKEN_DESTROYED";
    public const string PlayerTurnStart = "PLAYER_TURN_START";
    public const string PlayerTurnEnd = "PLAYER_TURN_END";
    public const string NpcTurnStart = "NPC_TURN_START";
    public const string NpcTurnEnd = "NPC_TURN_END";

    public static readonly IReadOnlyList<string> Canonical =
    [
        CardStaged,
        CardPlayed,
        CardResolved,
        CardDrawn,
        ShieldBroken,
        PatienceChanged,
        PriorityChanged,
        TokenCreated,
        TokenDestroyed,
        PlayerTurnStart,
        PlayerTurnEnd,
        NpcTurnStart,
        NpcTurnEnd,
    ];
}

public sealed class EngineEvent
{
    public required string Type { get; init; }

    /// <summary>Controller of the action that caused the event, when applicable.</summary>
    public Side? Controller { get; init; }

    /// <summary>Card payload for CARD_STAGED / CARD_PLAYED / CARD_RESOLVED.</summary>
    public string? CardInstanceId { get; init; }
    public string? CardDefId { get; init; }
    public int? CardCost { get; init; }

    /// <summary>SHIELD_BROKEN payload.</summary>
    public Side? ShieldSide { get; init; }
    public string? ShieldType { get; init; } // 'placeholder' | 'real' | 'core' | 'guard' | 'npcCore'
    public Side? Breaker { get; init; }

    /// <summary>PATIENCE_CHANGED / PRIORITY_CHANGED payload.</summary>
    public int? Delta { get; init; }
    public int? NewValue { get; init; }
    public Side? Side { get; init; }

    /// <summary>TOKEN_CREATED / TOKEN_DESTROYED payload.</summary>
    public string? TokenDefId { get; init; }

    /// <summary>CARD_DRAWN payload: true when the draw was not a turn-start refill.</summary>
    public bool? ExtraDraw { get; init; }
}

public static class ShieldTypes
{
    public const string Placeholder = "placeholder";
    public const string Real = "real";
    public const string Core = "core";
    public const string Guard = "guard";
    public const string NpcCore = "npcCore";
}

// ── Quantities & conditions ──────────────────────────────────────────────────

/// <summary>Owner-relative side reference ('self' = the effect's controller).</summary>
public enum RelSide
{
    Self,
    Opponent,
}

/// <summary>
/// A quantity is a readable number in combat state, used by scales and
/// conditions. Side references are owner-relative so the same card text works
/// for either side (v1.4 §5.1 filters).
/// </summary>
public abstract record Quantity;

public sealed record ConstQ(int Value) : Quantity;
public sealed record PatienceQ : Quantity;
public sealed record MissingPatienceQ : Quantity; // starting patience − current (min 0)
public sealed record PriorityQ(RelSide Side) : Quantity;
public sealed record RoundQ : Quantity;
public sealed record LieCounterQ : Quantity;
public sealed record CardsPlayedThisTurnQ(RelSide Side) : Quantity;
public sealed record ExtraDrawsThisTurnQ(RelSide Side) : Quantity;
public sealed record PriorityGainedThisTurnQ(RelSide Side) : Quantity;
public sealed record OppShieldsBrokenByPlayerThisTurnQ : Quantity;
public sealed record OppShieldsBrokenByPlayerPrevTurnQ : Quantity;
public sealed record PlayerShieldsBrokenByNpcThisTurnQ : Quantity;
public sealed record GuardsPlacedByNpcThisTurnQ : Quantity;
public sealed record NpcGuardsStandingQ : Quantity;
public sealed record ChosenNumberQ : Quantity;
public sealed record CounterQ(string CounterName, string PermanentDefId) : Quantity; // PermanentDefId may be "self"
public sealed record DeckCardsMatchingCostQ(RelSide Side, Quantity Cost) : Quantity;
public sealed record ShieldsStandingQ(RelSide Side) : Quantity; // all types
public sealed record StagedCardCostQ : Quantity;
public sealed record StagedCardBreakCountQ : Quantity; // shield-break effects on the staged card
public sealed record EventDeltaQ : Quantity; // current event payload delta
public sealed record EventDeltaAbsQ : Quantity; // |delta| — e.g. "for every Priority spent"
public sealed record EventNewValueQ : Quantity;
public sealed record EventCardCostQ : Quantity;
public sealed record EventIsOwnShieldQ : Quantity; // 1 if the event's shieldSide is the subscriber's side
public sealed record EventIsExtraDrawQ : Quantity; // 1 if a CARD_DRAWN event was an extra draw

public static class Comparators
{
    public const string Lt = "lt";
    public const string Lte = "lte";
    public const string Gt = "gt";
    public const string Gte = "gte";
    public const string Eq = "eq";
    public const string Neq = "neq";
}

public abstract record Condition;

public sealed record CompareCondition(Quantity Lhs, string Op, Quantity Rhs) : Condition;
public sealed record AllCondition(IReadOnlyList<Condition> Items) : Condition;
public sealed record AnyCondition(IReadOnlyList<Condition> Items) : Condition;
public sealed record NotCondition(Condition Inner) : Condition;

// ── Restrictions, replacements, scheduled effects (v1.4 §9) ─────────────────

public static class RestrictionTypes
{
    public const string PreventShieldBreak = "PREVENT_SHIELD_BREAK"; // target side cannot break shields
    public const string PreventDraw = "PREVENT_DRAW";
    public const string PreventExtraDraws = "PREVENT_EXTRA_DRAWS";
    public const string PreventPatienceGain = "PREVENT_PATIENCE_GAIN";
    public const string MaxCardCost = "MAX_CARD_COST";
    public const string IncreaseCardCost = "INCREASE_CARD_COST";
    public const string MaxPlaysPerTurn = "MAX_PLAYS_PER_TURN";
    public const string MaxTurnStartDraw = "MAX_TURN_START_DRAW";
    public const string PriorityFloor = "PRIORITY_FLOOR";
    public const string PatienceCostPerCard = "PATIENCE_COST_PER_CARD";
    public const string BotmLimitBonus = "BOTM_LIMIT_BONUS"; // Blue planning identity (v1.4 §3.11)

    public static readonly IReadOnlyList<string> All =
    [
        PreventShieldBreak, PreventDraw, PreventExtraDraws, PreventPatienceGain,
        MaxCardCost, IncreaseCardCost, MaxPlaysPerTurn, MaxTurnStartDraw,
        PriorityFloor, PatienceCostPerCard, BotmLimitBonus,
    ];
}

/// <summary>Restriction target relative sides ("self" / "opponent" / "both").</summary>
public static class RelTargets
{
    public const string Self = "self";
    public const string Opponent = "opponent";
    public const string Both = "both";
}

public sealed record RestrictionDef(string Type, string Target)
{
    public int? Value { get; init; }
    public int? ConditionThreshold { get; init; }
    /// <summary>Named-boundary expiry; null for "while linked Impression remains".</summary>
    public BoundaryRef? Expiry { get; init; }
}

/// <summary>Target here is absolute: "player" / "npc" / "both".</summary>
public sealed class ActiveRestriction
{
    public required string Id { get; set; }
    public required string Type { get; set; }
    public required string Target { get; set; }
    public int? Value { get; set; }
    public int? ConditionThreshold { get; set; }
    public BoundaryRef? Expiry { get; set; }
    public string? LinkedPermanentId { get; set; }

    public ActiveRestriction Clone() => new()
    {
        Id = Id,
        Type = Type,
        Target = Target,
        Value = Value,
        ConditionThreshold = ConditionThreshold,
        Expiry = Expiry?.Clone(),
        LinkedPermanentId = LinkedPermanentId,
    };
}

public sealed class ActiveReplacement
{
    public required string Id { get; set; }
    public required string OriginalTokenId { get; set; }
    public required string ReplacementTokenId { get; set; }
    public BoundaryRef? Expiry { get; set; }
    public string? LinkedPermanentId { get; set; }

    public ActiveReplacement Clone() => new()
    {
        Id = Id,
        OriginalTokenId = OriginalTokenId,
        ReplacementTokenId = ReplacementTokenId,
        Expiry = Expiry?.Clone(),
        LinkedPermanentId = LinkedPermanentId,
    };
}

public sealed class ScheduledEffectEntry
{
    public required string Id { get; set; }
    public required IReadOnlyList<Effect> Effects { get; set; }
    public required Side Controller { get; set; }
    public required BoundaryRef At { get; set; }

    public ScheduledEffectEntry Clone() => new()
    {
        Id = Id,
        Effects = Effects, // effect lists are immutable card data — shared
        Controller = Controller,
        At = At.Clone(),
    };
}

// ── Effects ──────────────────────────────────────────────────────────────────

/// <summary>
/// Effect base: every effect may carry a resolution-time condition (skipped
/// unless it holds) and a scale quantity (multiplies value/count, min 0).
/// </summary>
public abstract record Effect
{
    public Condition? Condition { get; init; }
    public Quantity? Scale { get; init; }
}

public sealed record ModifyPatienceEffect(int Value) : Effect
{
    public int? AltValue { get; init; }
    public Condition? AltCondition { get; init; }
}

public sealed record ModifyPriorityEffect(int Value) : Effect
{
    public RelSide Target { get; init; } = RelSide.Self;
}

public sealed record DrawCardsEffect(int Value) : Effect;

/// <summary>
/// Break shields owned by Target. Player→opponent hits Guard Shields only
/// (v1.4 §3.3); NPC→opponent hits the player row leftmost-first; NPC→self
/// hits its own Guards only (§6.6.3); player→self breaks own row
/// leftmost-first.
/// </summary>
public sealed record BreakShieldsEffect(RelSide Target, int Count) : Effect;

/// <summary>
/// Place the side's free shield type: Placeholder Shields (player) or dummy
/// Guard Shields (npc — guard restoration, v1.4 §3.3). Target is always self.
/// </summary>
public sealed record PlaceShieldsEffect(int Count) : Effect;

public sealed record CreateTokenEffect(string TokenDefinitionId, int Count) : Effect;

public sealed record DestroyTokensEffect(int Count) : Effect // own, oldest first
{
    public string? TokenDefinitionId { get; init; }
}

public sealed record TransformTokenEffect(string FromTokenId, string ToTokenId) : Effect // bypasses leave-triggers (v1.4 §3.7)
{
    public int? Count { get; init; }
    public bool UpTo { get; init; }
    public bool All { get; init; }
}

public sealed record DestroySelfEffect : Effect; // the source permanent

public sealed record DestroyImpressionEffect(RelSide Owner) : Effect
{
    public int? Count { get; init; }
}

public sealed record ApplyRestrictionEffect(RestrictionDef Restriction) : Effect;

public sealed record ApplyReplacementEffect(string OriginalTokenId, string ReplacementTokenId) : Effect
{
    public BoundaryRef? Expiry { get; init; }
}

public sealed record ScheduleEffectsEffect(IReadOnlyList<Effect> Effects, BoundaryRef At) : Effect;

public sealed record ChooseNumberEffect(int Min, int Max) : Effect;

public sealed record CopyFromNpcDeckEffect(int Count) : Effect // v1.4 §8.5 — copies, never steals
{
    public Quantity? CostEquals { get; init; }
    public bool WithShieldBreak { get; init; }
    public Quantity? PatienceCostOverride { get; init; }
}

public sealed record RevealNpcHandEffect : Effect;
public sealed record HideNpcHandEffect : Effect;
public sealed record RevealNpcDeckTopEffect : Effect;
public sealed record HideNpcDeckTopEffect : Effect;

public sealed record DeckRevealEffect(int Count) : Effect; // blocking peek; side: 'opponent'

public sealed record CancelStagedCardEffect : Effect; // only meaningful in the CARD_STAGED window

public sealed record IncrementCountersEffect(string CounterName, string TargetDefinitionId, int Amount) : Effect; // TargetDefinitionId may be "self"

public sealed record ReshuffleDeckEffect : Effect; // controller's discard shuffles into its deck

// ── Cards ────────────────────────────────────────────────────────────────────

public static class Keywords
{
    public const string Safety = "Safety";
    public const string Assemble = "Assemble";
    public const string ShieldTrigger = "Shield Trigger";
    public const string Lie = "Lie";
    public const string Trap = "Trap";
    public const string Rapport = "Rapport";
    public const string HeavyHand = "Heavy Hand";
}

public static class Supertypes
{
    public const string Skill = "Skill";
    public const string Information = "Information";
}

public static class Subtypes
{
    public const string Impression = "Impression";
    public const string Trap = "Trap";
    public const string Token = "Token";
}

public sealed record TriggerCondition(string Event)
{
    /// <summary>Owner-relative controller filter ("self" / "opponent"; v1.4 §5.1).</summary>
    public string? ControllerFilter { get; init; }
    public Condition? Condition { get; init; }
}

public sealed record TriggeredAbility(string Id, TriggerCondition Trigger, IReadOnlyList<Effect> Effects)
{
    public int? MaxTimesPerPlay { get; init; }
    public int? MaxTimesPerTurn { get; init; }
}

public sealed record ActivatedAbilityCost
{
    public int? Priority { get; init; }
    public int? Patience { get; init; }
    public int? SacrificeShields { get; init; } // own, leftmost
    public int? DiscardCards { get; init; } // chosen
}

public sealed record ActivatedAbility(string Id, string Name, ActivatedAbilityCost Cost, IReadOnlyList<Effect> Effects);

public sealed record ThresholdDef(string CounterName, int Value, bool Consume, IReadOnlyList<Effect> Effects)
{
    /// <summary>Default AFTER_NPC_PLAY (v1.4 §3.10).</summary>
    public string? CheckPoint { get; init; } // 'AFTER_NPC_PLAY' | 'AFTER_ANY_PLAY'
}

public static class CheckPoints
{
    public const string AfterNpcPlay = "AFTER_NPC_PLAY";
    public const string AfterAnyPlay = "AFTER_ANY_PLAY";
}

public sealed record TransformConditionDef(Condition Condition, string IntoDefinitionId);

/// <summary>Static amplifier for counter gains (v1.4 §3.10 "amplified by other permanents").</summary>
public sealed record CounterAmplifier(string CounterName, int Extra)
{
    /// <summary>Limit to increments targeting this definition id; null for any target.</summary>
    public string? TargetDefinitionId { get; init; }
}

public sealed record RapportConfig(int Min, int Max, Quantity Checked);

public sealed record ImpressionDuration(int Turns)
{
    public bool ReturnToDeck { get; init; }
}

public sealed class CardDefinition
{
    public required string Id { get; init; }
    public required string Name { get; init; }
    public required int Cost { get; init; }
    public string Color { get; init; } = "Colorless";
    public string Supertype { get; init; } = Supertypes.Skill;
    public string? Subtype { get; init; }
    public IReadOnlyList<string> Keywords { get; init; } = [];
    public IReadOnlyList<Effect> Effects { get; init; } = [];
    public string EffectText { get; init; } = "";
    public string? LongDescription { get; init; }

    public IReadOnlyList<Effect>? ShieldTriggerEffects { get; init; }
    public IReadOnlyList<Effect>? HeavyHandEffects { get; init; }

    public TriggerCondition? TrapTrigger { get; init; }
    public bool TrapPersistent { get; init; }

    public IReadOnlyList<TriggeredAbility>? TriggeredAbilities { get; init; }
    public IReadOnlyList<ActivatedAbility>? ActivatedAbilities { get; init; }

    /// <summary>Tokens &amp; Impressions: fire when the permanent is destroyed (not transformed).</summary>
    public IReadOnlyList<Effect>? LeaveTriggerEffects { get; init; }
    /// <summary>Impressions: fire at the owner's Turn Start (v1.4 §3.8).</summary>
    public IReadOnlyList<Effect>? TurnStartEffects { get; init; }

    public IReadOnlyList<ThresholdDef>? Thresholds { get; init; }
    public TransformConditionDef? TransformCondition { get; init; }
    public IReadOnlyList<CounterAmplifier>? CounterAmplifiers { get; init; }

    public ImpressionDuration? ImpressionDuration { get; init; }
    public int? ImpressionDestroyBelowPatience { get; init; }

    public RapportConfig? Rapport { get; init; }

    /// <summary>Information Cards only (v1.4 §3.9).</summary>
    public string? NuggetId { get; init; }

    /// <summary>After play, shuffle into its owner's deck instead of discarding.</summary>
    public bool ReturnToDeck { get; init; }
}

/// <summary>Immutable after creation — clones share instances.</summary>
public sealed class CardInstance
{
    public required string InstanceId { get; init; }
    public required string DefinitionId { get; init; }
    public required Side Owner { get; init; }

    /// <summary>Set for player-hand copies created by COPY_FROM_NPC_DECK (v1.4 §8.5).</summary>
    public int? PatienceCostOverride { get; init; }

    /// <summary>
    /// Assemble result (v1.4 §11): the combined card is virtual; its
    /// components are discarded (recyclable) when the combined card's play
    /// completes.
    /// </summary>
    public IReadOnlyList<CardInstance>? Components { get; init; }
}

// ── Info nuggets (v1.4 §3.9) ─────────────────────────────────────────────────

public sealed record InfoNugget(string Id, string Name, string Description);

public sealed record NuggetOverride(string NuggetId, int Cost, IReadOnlyList<Effect> Effects, string EffectText);

// ── Encounter configuration (v1.4 §7 + v1.4.1 guard cards) ──────────────────

public sealed class NpcCoreShieldDef
{
    public required string CardId { get; init; }
    public required bool IsHint { get; init; }
    public string? HintText { get; init; }
    public required string LoreDescription { get; init; }
    public IReadOnlyList<string> KeyNuggetIds { get; init; } = []; // ≥ 1, validated
}

public sealed record CoreShieldDef(string CardId, int PatienceCostOnBreak);

public sealed record Trait(string Id, string Name, string Description);

public sealed record ScheduledPlayDef(string CardId, int AfterTurn); // injected at NPC Turn Start of rounds > afterTurn

/// <summary>
/// Immutable input to the engine (§6.7 inv. 12). Mutable properties exist only
/// so authoring tools / test fixtures can compose configs before combat.
/// </summary>
public sealed class EncounterConfig
{
    public required string Id { get; set; }
    public required string DisplayName { get; set; }
    public int MinTurnStartPriority { get; set; } = EncounterDefaults.MinTurnStartPriority;
    public int FirstTurnBonusPriority { get; set; } = EncounterDefaults.FirstTurnBonusPriority;
    public int MaxPriority { get; set; } = EncounterDefaults.MaxPriority;
    public Side StartingSide { get; set; } = EncounterDefaults.StartingSide;
    public required int OpponentPatience { get; set; }

    /// <summary>
    /// Total Guard Shields (null for the default of 10 — v1.4.1). Card-backed
    /// guards from NpcGuardShieldCardIds count toward this total; the
    /// difference is made up by dummy guards. Breaking an opponent Guard never
    /// costs Patience.
    /// </summary>
    public int? NpcGuardShieldCount { get; set; }

    /// <summary>Card-backed Guard Shields (Shield Trigger carriers), shuffled into the row.</summary>
    public IReadOnlyList<string>? NpcGuardShieldCardIds { get; set; }

    public IReadOnlyList<NpcCoreShieldDef> OpponentShields { get; set; } = [];
    public int NpcHandLimit { get; set; } = EncounterDefaults.NpcHandLimit;
    public int? PlayerDummyShieldSlots { get; set; } // null for the default of 10 (v1.4.1)
    public IReadOnlyList<CoreShieldDef> AllowedCoreShields { get; set; } = []; // required (empty allowed)
    public bool UnbreakablePlayerShields { get; set; }
    public IReadOnlyList<NuggetOverride> NuggetOverrides { get; set; } = [];
    public IReadOnlyList<Trait> Traits { get; set; } = [];
    public IReadOnlyList<string> EnemyDeckCardIds { get; set; } = [];
    public IReadOnlyList<ScheduledPlayDef>? ScheduledPlays { get; set; }
    public IReadOnlyList<string>? StartingImpressions { get; set; }
    public int? LieThreshold { get; set; } // 0/null disables
    public bool Retryable { get; set; }
    public bool TutorialMode { get; set; }
    public IReadOnlyList<string>? ScriptedDrawOrder { get; set; }
    public IReadOnlyList<string>? ScriptedOpponentPlays { get; set; }
    public IReadOnlyList<string>? PlayedNonRelevantCards { get; set; }

    /// <summary>Shallow copy for authoring/test composition (the engine never mutates configs).</summary>
    public EncounterConfig With(Action<EncounterConfig>? mutate = null)
    {
        var copy = new EncounterConfig
        {
            Id = Id,
            DisplayName = DisplayName,
            MinTurnStartPriority = MinTurnStartPriority,
            FirstTurnBonusPriority = FirstTurnBonusPriority,
            MaxPriority = MaxPriority,
            StartingSide = StartingSide,
            OpponentPatience = OpponentPatience,
            NpcGuardShieldCount = NpcGuardShieldCount,
            NpcGuardShieldCardIds = NpcGuardShieldCardIds,
            OpponentShields = OpponentShields,
            NpcHandLimit = NpcHandLimit,
            PlayerDummyShieldSlots = PlayerDummyShieldSlots,
            AllowedCoreShields = AllowedCoreShields,
            UnbreakablePlayerShields = UnbreakablePlayerShields,
            NuggetOverrides = NuggetOverrides,
            Traits = Traits,
            EnemyDeckCardIds = EnemyDeckCardIds,
            ScheduledPlays = ScheduledPlays,
            StartingImpressions = StartingImpressions,
            LieThreshold = LieThreshold,
            Retryable = Retryable,
            TutorialMode = TutorialMode,
            ScriptedDrawOrder = ScriptedDrawOrder,
            ScriptedOpponentPlays = ScriptedOpponentPlays,
            PlayedNonRelevantCards = PlayedNonRelevantCards,
        };
        mutate?.Invoke(copy);
        return copy;
    }
}

public static class EncounterDefaults
{
    public const int MinTurnStartPriority = 3;
    public const int FirstTurnBonusPriority = 2;
    public const int MaxPriority = 10;
    public const Side StartingSide = Side.Player;
    public const int NpcHandLimit = 5;
    public const int NpcGuardShieldCount = 10; // v1.4.1
    public const int PlayerDummyShieldSlots = 10; // v1.4.1

    /// <summary>Resolve optional encounter counts against the defaults.</summary>
    public static int ResolvedGuardCount(EncounterConfig c) => c.NpcGuardShieldCount ?? NpcGuardShieldCount;

    public static int ResolvedDummySlots(EncounterConfig c) => c.PlayerDummyShieldSlots ?? PlayerDummyShieldSlots;
}

// ── Combat state ─────────────────────────────────────────────────────────────

/// <summary>Immutable after creation — clones share instances.</summary>
public sealed class PlayerShieldSlot
{
    public required string SlotId { get; init; }
    public required string ShieldType { get; init; } // 'placeholder' | 'real' | 'core'
    /// <summary>Absent for placeholders (they are synthetic, not cards — v1.4 §3.4).</summary>
    public string? CardInstanceId { get; init; }
    public string? CardDefinitionId { get; init; }
    public required int PatienceCostOnBreak { get; init; }
}

/// <summary>One standing opponent Guard Shield; card-backed guards carry a CardId.</summary>
public sealed class NpcGuard
{
    public required string GuardId { get; init; }
    public string? CardId { get; init; }
}

public sealed class NpcCoreShieldState
{
    public required string CardId { get; init; }
    public required bool IsHint { get; init; }
    public string? HintText { get; init; }
    public required string LoreDescription { get; init; }
    public IReadOnlyList<string> KeyNuggetIds { get; init; } = [];
    public bool Broken { get; set; }

    public NpcCoreShieldState Clone() => new()
    {
        CardId = CardId,
        IsHint = IsHint,
        HintText = HintText,
        LoreDescription = LoreDescription,
        KeyNuggetIds = KeyNuggetIds,
        Broken = Broken,
    };
}

public static class PermanentKinds
{
    public const string Impression = "impression";
    public const string Token = "token";
    public const string Trap = "trap";
}

public sealed class Permanent
{
    public required string PermanentId { get; init; }
    public required string Kind { get; init; } // 'impression' | 'token' | 'trap'
    public required string DefinitionId { get; set; } // mutable: TRANSFORM rewrites it
    public required Side Owner { get; init; }
    public required int ArrivalOrder { get; init; }
    public Dictionary<string, int> Counters { get; set; } = new();

    /// <summary>The card instance behind an Impression/Trap (goes to discard on leave).</summary>
    public string? CardInstanceId { get; init; }

    /// <summary>Rapport prediction chosen when the card was played (v1.4 §8.3).</summary>
    public int? RapportPrediction { get; init; }

    /// <summary>Trap bookkeeping: cannot re-fire within one resolution cycle (§3.6).</summary>
    public bool FiredThisResolution { get; set; }

    /// <summary>Impression duration bookkeeping (owner turns remaining).</summary>
    public int? TurnsRemaining { get; set; }

    public Permanent Clone() => new()
    {
        PermanentId = PermanentId,
        Kind = Kind,
        DefinitionId = DefinitionId,
        Owner = Owner,
        ArrivalOrder = ArrivalOrder,
        Counters = new Dictionary<string, int>(Counters),
        CardInstanceId = CardInstanceId,
        RapportPrediction = RapportPrediction,
        FiredThisResolution = FiredThisResolution,
        TurnsRemaining = TurnsRemaining,
    };
}

public sealed class SideState
{
    public int Priority { get; set; }

    /// <summary>Debt owed TO this side by the opponent (consumed at this side's turn start).</summary>
    public int IncomingDebt { get; set; }

    public int LastUnspentPriority { get; set; } // tracked, unused (v1.4 §15.7)

    public List<CardInstance> Deck { get; set; } = [];
    public List<CardInstance> Hand { get; set; } = [];
    public List<CardInstance> Discard { get; set; } = [];

    // per-turn counters (§4 naming convention)
    public int CardsPlayedThisTurn { get; set; }
    public int ExtraDrawsThisTurn { get; set; }
    public int PriorityGainedThisTurn { get; set; }

    public SideState Clone() => new()
    {
        Priority = Priority,
        IncomingDebt = IncomingDebt,
        LastUnspentPriority = LastUnspentPriority,
        Deck = [.. Deck],
        Hand = [.. Hand],
        Discard = [.. Discard],
        CardsPlayedThisTurn = CardsPlayedThisTurn,
        ExtraDrawsThisTurn = ExtraDrawsThisTurn,
        PriorityGainedThisTurn = PriorityGainedThisTurn,
    };
}

// ── Effect stack (single generic suspension mechanism, v1.4 §15.4) ──────────

public static class FrameKinds
{
    public const string Play = "play"; // a card play's effect list
    public const string Trap = "trap";
    public const string ShieldTrigger = "shieldTrigger";
    public const string Ability = "ability";
    public const string LeaveTrigger = "leaveTrigger";
    public const string TurnStartEffects = "turnStartEffects";
    public const string Scheduled = "scheduled";
    public const string Threshold = "threshold";
    public const string Activated = "activated";
    public const string BreakOutcome = "breakOutcome";
}

public sealed record BreakOutcomePayload(Side Side, string ShieldType, int PatienceCost)
{
    public string? CardInstanceId { get; init; }
    public string? CardDefinitionId { get; init; }
    public bool Safety { get; init; }
}

public sealed class EffectFrame
{
    public required string FrameId { get; set; }
    public required string Kind { get; set; }
    public required Side Controller { get; set; }
    public required IReadOnlyList<Effect> Effects { get; set; }
    public int Index { get; set; }
    public int Depth { get; set; }

    /// <summary>Source permanent (for DESTROY_SELF / COUNTER 'self' refs).</summary>
    public string? SourcePermanentId { get; set; }

    /// <summary>The play this frame belongs to, when Kind == "play".</summary>
    public string? PlayCardInstanceId { get; set; }

    /// <summary>Chosen number for this frame's Rapport / CHOOSE_NUMBER context.</summary>
    public int? ChosenNumber { get; set; }

    /// <summary>breakOutcome payload.</summary>
    public BreakOutcomePayload? BreakOutcome { get; set; }

    public EffectFrame Clone() => new()
    {
        FrameId = FrameId,
        Kind = Kind,
        Controller = Controller,
        Effects = Effects, // effect lists are immutable card data — shared
        Index = Index,
        Depth = Depth,
        SourcePermanentId = SourcePermanentId,
        PlayCardInstanceId = PlayCardInstanceId,
        ChosenNumber = ChosenNumber,
        BreakOutcome = BreakOutcome,
    };
}

public static class PlayDestinations
{
    public const string Discard = "discard";
    public const string FieldImpression = "field-impression";
    public const string FieldTrap = "field-trap";
    public const string Deck = "deck";
    public const string Removed = "removed";
}

/// <summary>
/// Completion bookkeeping for an in-flight card play (v1.4 §6.3 / §6.6).
/// Sequences suspend and resume — never restart (§6.7 inv. 6); every step flag
/// below is checked so the completion path always runs exactly once, on every
/// path including resumption after a Reveal (§6.6.4 / Brief §7 trap 2).
/// </summary>
public sealed class PendingPlay
{
    public required string CardInstanceId { get; set; }
    public required string DefinitionId { get; set; } // effective definition (after nugget resolution)
    public required Side Controller { get; set; }
    public required bool HeavyHand { get; set; }

    /// <summary>Destination when the play completes — always runs (§6.6.4).</summary>
    public required string Destination { get; set; }

    /// <summary>Pre-allocated permanent id for field destinations (restriction linking).</summary>
    public string? ReservedPermanentId { get; set; }

    /// <summary>Assemble components carried by a virtual combined card (v1.4 §11).</summary>
    public IReadOnlyList<CardInstance>? Components { get; set; }

    /// <summary>Steps already performed (suspension-safe; sequences never restart).</summary>
    public bool LockCheckDone { get; set; }
    public bool Moved { get; set; }
    public bool ResolvedDispatched { get; set; }
    public bool ThresholdsDone { get; set; }
    public int? ChosenNumber { get; set; }

    public PendingPlay Clone() => new()
    {
        CardInstanceId = CardInstanceId,
        DefinitionId = DefinitionId,
        Controller = Controller,
        HeavyHand = HeavyHand,
        Destination = Destination,
        ReservedPermanentId = ReservedPermanentId,
        Components = Components,
        LockCheckDone = LockCheckDone,
        Moved = Moved,
        ResolvedDispatched = ResolvedDispatched,
        ThresholdsDone = ThresholdsDone,
        ChosenNumber = ChosenNumber,
    };
}

[System.Text.Json.Serialization.JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[System.Text.Json.Serialization.JsonDerivedType(typeof(RevealBlock), "reveal")]
[System.Text.Json.Serialization.JsonDerivedType(typeof(ChooseNumberBlock), "chooseNumber")]
[System.Text.Json.Serialization.JsonDerivedType(typeof(DeckRevealBlock), "deckReveal")]
public abstract record PendingBlock;

public sealed record RevealBlock(string Lore, bool IsHint, string ShieldCardId) : PendingBlock
{
    public string? HintText { get; init; }
    public string? GainedCardId { get; init; }
}

public sealed record ChooseNumberBlock(int Min, int Max, string FrameId) : PendingBlock;

public sealed record DeckRevealBlock(IReadOnlyList<string> CardDefIds) : PendingBlock;

public sealed class LogEntry
{
    public required int Seq { get; init; }
    public required string Type { get; init; }
    public required string Message { get; init; }
    public IReadOnlyDictionary<string, object?>? Data { get; init; }
}

public sealed record NpcScheduledEntry(CardInstance Card, int AfterTurn);

public sealed class CombatState
{
    public int SchemaVersion { get; set; } = 1;
    public string Phase { get; set; } = Phases.Check;
    public string? Result { get; set; } // 'WIN' | 'LOSE' | null
    public string? LoseReason { get; set; } // 'PATIENCE' | 'LIES' | 'SHIELDS' | null

    /// <summary>Seeded PRNG state — all randomness flows through this (determinism).</summary>
    public int RngState { get; set; }

    public int Round { get; set; }
    public Side ActiveTurn { get; set; }
    public bool FirstTurnOfCombatDone { get; set; }

    public int Patience { get; set; }
    public int StartingPatience { get; set; }
    public int LieCounter { get; set; }

    public SideState Player { get; set; } = new();
    public SideState Npc { get; set; } = new();

    public List<CardInstance> BackOfMind { get; set; } = [];
    public int BackOfMindLimitBase { get; set; }

    public List<PlayerShieldSlot> PlayerShields { get; set; } = [];
    public bool ShieldLossArmed { get; set; }

    /// <summary>Standing Guard Shields, in break order (leftmost breaks first).</summary>
    public List<NpcGuard> NpcGuards { get; set; } = [];

    /// <summary>Invariant: always equals NpcGuards.Count (kept for quantities/UI).</summary>
    public int NpcGuardsStanding { get; set; }

    public List<NpcCoreShieldState> NpcCoreShields { get; set; } = [];

    public List<Permanent> Field { get; set; } = [];
    public int NextArrivalOrder { get; set; }

    public List<ActiveRestriction> Restrictions { get; set; } = [];
    public List<ActiveReplacement> Replacements { get; set; } = [];
    public List<ScheduledEffectEntry> ScheduledEffects { get; set; } = [];

    /// <summary>NPC scheduled plays set aside from its deck (v1.4 §10).</summary>
    public List<NpcScheduledEntry> NpcScheduledAside { get; set; } = [];

    public CardInstance? StagedCard { get; set; }
    public bool StagedCancelled { get; set; }

    /// <summary>End Turn in progress but suspended by a blocking sub-state.</summary>
    public bool TurnEndPending { get; set; }

    /// <summary>Cards gained from broken NPC Core Shields (persistence reads these).</summary>
    public List<string> GainedCardIds { get; set; } = [];

    public List<EffectFrame> EffectStack { get; set; } = [];
    public PendingPlay? PendingPlay { get; set; }
    public PendingBlock? PendingBlock { get; set; }

    /// <summary>Set when the trigger depth cap (20) was hit — fail-safe halt (v1.4 §5.4).</summary>
    public bool ResolutionHalted { get; set; }

    // per-turn counters not owned by a side record (§4 naming convention)
    public int OppShieldsBrokenByPlayerThisTurn { get; set; }
    public int OppShieldsBrokenByPlayerPrevTurn { get; set; }
    public int PlayerShieldsBrokenByNpcThisTurn { get; set; }
    public int GuardsPlacedByNpcThisTurn { get; set; }

    /// <summary>Ability fire-count bookkeeping: permanentId+abilityId → count.</summary>
    public Dictionary<string, int> AbilityFiresThisPlay { get; set; } = new();
    public Dictionary<string, int> AbilityFiresThisTurn { get; set; } = new();

    public bool NpcHandRevealed { get; set; }
    public bool NpcDeckTopRevealed { get; set; }

    public List<string> DiscoveredNuggetIds { get; set; } = [];
    public List<string> PlayedNonRelevantCards { get; set; } = [];
    public List<string> DiscoveredTraitIds { get; set; } = [];

    /// <summary>Immutable inputs — shared across clones, never mutated by the engine.</summary>
    public required EncounterConfig Config { get; init; }
    public required IReadOnlyDictionary<string, CardDefinition> Cards { get; init; }
    public required IReadOnlyDictionary<string, CardDefinition> Tokens { get; init; }
    public required IReadOnlyDictionary<string, InfoNugget> Nuggets { get; init; }
    public IReadOnlyList<CombinationRecipe> Recipes { get; init; } = [];

    public int NextId { get; set; }
    public int LogSeq { get; set; }
    public List<LogEntry> Log { get; set; } = [];

    public SideState SideOf(Side side) => side == Side.Player ? Player : Npc;

    /// <summary>
    /// Deep clone — the C# equivalent of the TS reducer's structuredClone(prev).
    /// Mutable containers/objects are cloned; immutable data (card instances,
    /// definitions, config, log entries, pending blocks) is shared.
    /// </summary>
    public CombatState Clone() => new()
    {
        SchemaVersion = SchemaVersion,
        Phase = Phase,
        Result = Result,
        LoseReason = LoseReason,
        RngState = RngState,
        Round = Round,
        ActiveTurn = ActiveTurn,
        FirstTurnOfCombatDone = FirstTurnOfCombatDone,
        Patience = Patience,
        StartingPatience = StartingPatience,
        LieCounter = LieCounter,
        Player = Player.Clone(),
        Npc = Npc.Clone(),
        BackOfMind = [.. BackOfMind],
        BackOfMindLimitBase = BackOfMindLimitBase,
        PlayerShields = [.. PlayerShields],
        ShieldLossArmed = ShieldLossArmed,
        NpcGuards = [.. NpcGuards],
        NpcGuardsStanding = NpcGuardsStanding,
        NpcCoreShields = NpcCoreShields.Select(s => s.Clone()).ToList(),
        Field = Field.Select(p => p.Clone()).ToList(),
        NextArrivalOrder = NextArrivalOrder,
        Restrictions = Restrictions.Select(r => r.Clone()).ToList(),
        Replacements = Replacements.Select(r => r.Clone()).ToList(),
        ScheduledEffects = ScheduledEffects.Select(s => s.Clone()).ToList(),
        NpcScheduledAside = [.. NpcScheduledAside],
        StagedCard = StagedCard,
        StagedCancelled = StagedCancelled,
        TurnEndPending = TurnEndPending,
        GainedCardIds = [.. GainedCardIds],
        EffectStack = EffectStack.Select(f => f.Clone()).ToList(),
        PendingPlay = PendingPlay?.Clone(),
        PendingBlock = PendingBlock,
        ResolutionHalted = ResolutionHalted,
        OppShieldsBrokenByPlayerThisTurn = OppShieldsBrokenByPlayerThisTurn,
        OppShieldsBrokenByPlayerPrevTurn = OppShieldsBrokenByPlayerPrevTurn,
        PlayerShieldsBrokenByNpcThisTurn = PlayerShieldsBrokenByNpcThisTurn,
        GuardsPlacedByNpcThisTurn = GuardsPlacedByNpcThisTurn,
        AbilityFiresThisPlay = new Dictionary<string, int>(AbilityFiresThisPlay),
        AbilityFiresThisTurn = new Dictionary<string, int>(AbilityFiresThisTurn),
        NpcHandRevealed = NpcHandRevealed,
        NpcDeckTopRevealed = NpcDeckTopRevealed,
        DiscoveredNuggetIds = [.. DiscoveredNuggetIds],
        PlayedNonRelevantCards = [.. PlayedNonRelevantCards],
        DiscoveredTraitIds = [.. DiscoveredTraitIds],
        Config = Config,
        Cards = Cards,
        Tokens = Tokens,
        Nuggets = Nuggets,
        Recipes = Recipes,
        NextId = NextId,
        LogSeq = LogSeq,
        Log = [.. Log],
    };
}

// ── Actions ──────────────────────────────────────────────────────────────────

/// <summary>The CombatAction discriminated union — one sealed record per action.</summary>
public abstract record CombatAction;

public sealed record PlayCard(int HandIndex, bool HeavyHand = false) : CombatAction;
public sealed record PlaceShield(int HandIndex) : CombatAction;
public sealed record ActivateAbility(string PermanentId, string AbilityId, IReadOnlyList<int>? DiscardIndices = null) : CombatAction;
public sealed record Combine(int HandIndexA, int HandIndexB) : CombatAction;
public sealed record ResequenceShields(IReadOnlyList<int> Order) : CombatAction;
public sealed record EndTurn : CombatAction;
public sealed record BotmSelect(IReadOnlyList<int> KeepHandIndices) : CombatAction;
public sealed record Acknowledge : CombatAction; // reveal / deck-reveal acknowledgement
public sealed record ChooseNumber(int Value) : CombatAction;
public sealed record Advance : CombatAction; // drive the NPC turn one step (auto policy: leftmost)
public sealed record NpcPlayCard(int HandIndex) : CombatAction; // manual enemy / dual playtest
public sealed record NpcEndTurn : CombatAction; // manual enemy: explicit pass (only when no legal play)

public sealed record CombinationRecipe(IReadOnlyList<string> Ingredients, string ResultCardId);
