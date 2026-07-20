// The state seam (post-port step 2): CombatView is the ONLY shape of engine
// state that crosses into the scene layer. Pure C#, no Godot API.
//
// Seam rules, decided from the step-1 findings and mirrored on the React UI
// (src/ui/screens/CombatScreen.tsx — the seam this replaces for Godot):
//
//  1. The scene layer NEVER touches CombatState. It renders CombatView
//     snapshots and calls typed dispatch methods on CombatSession/CombatBridge.
//     Step-3 art swaps presentation without touching engine access.
//  2. Hidden information is filtered HERE, not in the scene: NPC hand/deck
//     contents (unless NpcHandRevealed), which guards are card-backed
//     (face-down by design, v1.4.1), and unbroken core-shield lore never
//     cross. A scene cannot leak what it never receives.
//  3. Every view carries NewLog — the log entries appended since the previous
//     emission. Step-3 animation sequencing keys off these events instead of
//     diffing snapshots.
//  4. Playability gating matches the React UI: overspend is unbounded (§3.1),
//     so there is no per-card cost gate — only the global CanPlay
//     (player turn, no pending block, priority ≥ 1).

using System;
using System.Collections.Generic;
using System.Linq;
using Breakthrough.Engine;

namespace Breakthrough.GodotHost;

public sealed record HandCardView(
    int HandIndex,
    string InstanceId,
    string DefinitionId,
    string Name,
    int EffectiveCost,          // after nugget override / Ponder conversion (§3.9)
    string Color,
    string Supertype,
    string EffectText,
    bool HasHeavyHand,          // def has HeavyHandEffects → offer the doubled-cost play
    bool ConvertsToPonder,      // Information Card with no nugget override here
    bool IsAssembled);          // virtual combined card (v1.4 §11)

public sealed record ShieldSlotView(
    int Index,
    string SlotId,
    string ShieldType,          // ShieldTypes.Placeholder | Real | Core
    string? CardName,           // null for placeholders
    int PatienceCostOnBreak);

public sealed record CoreShieldView(int Index, bool IsHint, bool Broken);

public sealed record AbilityView(string Id, string Name, string CostText, int DiscardCardsRequired);

public sealed record PermanentView(
    string PermanentId,
    string Kind,                // PermanentKinds.*
    string DefinitionId,
    string Name,
    string OwnerKey,            // "player" | "npc"
    string EffectText,
    IReadOnlyDictionary<string, int> Counters,
    int? TurnsRemaining,
    IReadOnlyList<AbilityView> Abilities);

/// <summary>
/// Data is the engine's structured payload (side, delta, shieldType,
/// definitionId, …) — primitives only. Animation layers key off Type + Data;
/// Message is for humans.
/// </summary>
public sealed record LogView(int Seq, string Type, string Message, IReadOnlyDictionary<string, object?>? Data);

// ── Prompts: exactly one may be non-null per view ───────────────────────────

public abstract record PromptView;

public sealed record RevealPromptView(string Lore, bool IsHint, string? HintText, string? GainedCardName) : PromptView;

public sealed record ChooseNumberPromptView(int Min, int Max) : PromptView;

public sealed record DeckRevealPromptView(IReadOnlyList<string> CardNames) : PromptView;

/// <summary>Back-of-Mind select (fires only from Player Turn End, §6.5).</summary>
public sealed record BotmPromptView(int Limit, IReadOnlyList<HandCardView> Hand) : PromptView;

public sealed record ResultView(string Result, string? LoseReason);

public sealed record CombatView
{
    public required string Phase { get; init; }
    public required int Round { get; init; }
    public required string ActiveTurnKey { get; init; }
    public required int Patience { get; init; }
    public required int StartingPatience { get; init; }
    public required int LieCounter { get; init; }
    public int? LieThreshold { get; init; }

    public required int PlayerPriority { get; init; }
    public required int NpcPriority { get; init; }
    public required int PlayerIncomingDebt { get; init; }
    public required int MaxPriority { get; init; }

    public required int PlayerDeckCount { get; init; }
    public required int PlayerDiscardCount { get; init; }
    public required int NpcHandCount { get; init; }
    public required int NpcDeckCount { get; init; }
    public required int NpcDiscardCount { get; init; }

    /// <summary>
    /// Discard contents in discard order (last = most recent). Public info by
    /// Ken's ruling (2026-07-19): every discarded card was seen in play, so
    /// both piles are browsable. Deck CONTENTS stay hidden — counts only.
    /// </summary>
    public required IReadOnlyList<string> PlayerDiscardNames { get; init; }
    public required IReadOnlyList<string> NpcDiscardNames { get; init; }

    /// <summary>Definition ids parallel to the discard name lists (for rules-text lookup).</summary>
    public required IReadOnlyList<string> PlayerDiscardDefIds { get; init; }
    public required IReadOnlyList<string> NpcDiscardDefIds { get; init; }
    /// <summary>Populated only while an effect has revealed the NPC hand.</summary>
    public IReadOnlyList<string>? NpcHandNames { get; init; }

    public required IReadOnlyList<HandCardView> Hand { get; init; }
    public required IReadOnlyList<string> BackOfMindNames { get; init; }
    public required int BotmLimit { get; init; }

    public required IReadOnlyList<ShieldSlotView> PlayerShields { get; init; }
    /// <summary>Count only — guards are face-down; card backing never crosses the seam.</summary>
    public required int NpcGuardsStanding { get; init; }
    public required IReadOnlyList<CoreShieldView> NpcCoreShields { get; init; }

    public required IReadOnlyList<PermanentView> Field { get; init; }

    // Interaction gates (same derivation as the React UI)
    public required bool CanAct { get; init; }      // player turn, no pending block
    public required bool CanPlay { get; init; }     // CanAct && priority ≥ 1
    public required bool NpcTurnInProgress { get; init; }

    public required int RealShieldPlacementCost { get; init; }
    public required string EncounterName { get; init; }

    public PromptView? Prompt { get; init; }
    public ResultView? Result { get; init; }

    /// <summary>Log entries appended since the previous view emission.</summary>
    public required IReadOnlyList<LogView> NewLog { get; init; }
}

public static class CombatViewBuilder
{
    public static CombatView Build(CombatState s, int lastSeenLogSeq)
    {
        bool isPlayerTurn = s.ActiveTurn == Side.Player && s.Phase == Phases.PlayerPending && s.PendingBlock == null;
        bool canAct = isPlayerTurn && s.Result == null;
        bool canPlay = canAct && s.Player.Priority >= 1;

        var hand = BuildHand(s);

        return new CombatView
        {
            Phase = s.Phase,
            Round = s.Round,
            ActiveTurnKey = s.ActiveTurn.ToKey(),
            Patience = s.Patience,
            StartingPatience = s.StartingPatience,
            LieCounter = s.LieCounter,
            LieThreshold = s.Config.LieThreshold,
            PlayerPriority = s.Player.Priority,
            NpcPriority = s.Npc.Priority,
            PlayerIncomingDebt = s.Player.IncomingDebt,
            MaxPriority = s.Config.MaxPriority,
            PlayerDeckCount = s.Player.Deck.Count,
            PlayerDiscardCount = s.Player.Discard.Count,
            NpcHandCount = s.Npc.Hand.Count,
            NpcDeckCount = s.Npc.Deck.Count,
            NpcDiscardCount = s.Npc.Discard.Count,
            NpcHandNames = s.NpcHandRevealed
                ? s.Npc.Hand.Select(c => NameOf(s, c.DefinitionId)).ToList()
                : null,
            PlayerDiscardNames = s.Player.Discard.Select(c => NameOf(s, c.DefinitionId)).ToList(),
            NpcDiscardNames = s.Npc.Discard.Select(c => NameOf(s, c.DefinitionId)).ToList(),
            PlayerDiscardDefIds = s.Player.Discard.Select(c => c.DefinitionId).ToList(),
            NpcDiscardDefIds = s.Npc.Discard.Select(c => c.DefinitionId).ToList(),
            Hand = hand,
            BackOfMindNames = s.BackOfMind.Select(c => NameOf(s, c.DefinitionId)).ToList(),
            BotmLimit = Core.EffectiveBotmLimit(s),
            PlayerShields = s.PlayerShields
                .Select((slot, i) => new ShieldSlotView(
                    i, slot.SlotId, slot.ShieldType,
                    slot.CardDefinitionId == null ? null : NameOf(s, slot.CardDefinitionId),
                    slot.PatienceCostOnBreak))
                .ToList(),
            NpcGuardsStanding = s.NpcGuardsStanding,
            NpcCoreShields = s.NpcCoreShields
                .Select((cs, i) => new CoreShieldView(i, cs.IsHint, cs.Broken))
                .ToList(),
            Field = s.Field.Select(p => BuildPermanent(s, p)).ToList(),
            CanAct = canAct,
            CanPlay = canPlay,
            NpcTurnInProgress = s.Phase == Phases.EnemyPending,
            RealShieldPlacementCost = Core.RealShieldPlacementCost,
            EncounterName = s.Config.DisplayName,
            Prompt = BuildPrompt(s, hand),
            Result = s.Result == null ? null : new ResultView(s.Result, s.LoseReason),
            NewLog = s.Log
                .Where(l => l.Seq > lastSeenLogSeq)
                .Select(l => new LogView(l.Seq, l.Type, l.Message, l.Data))
                .ToList(),
        };
    }

    private static List<HandCardView> BuildHand(CombatState s) =>
        s.Player.Hand.Select((card, i) =>
        {
            var eff = Core.ResolveEffectivePlay(s, card, heavyHand: false);
            return new HandCardView(
                i, card.InstanceId, card.DefinitionId,
                eff.Def.Name, eff.Cost, eff.Def.Color, eff.Def.Supertype,
                eff.ConvertedToPonder ? "(no matching nugget here — plays as Ponder)" : eff.Def.EffectText,
                eff.Def.HeavyHandEffects != null,
                eff.ConvertedToPonder,
                card.Components != null);
        }).ToList();

    private static PermanentView BuildPermanent(CombatState s, Permanent p)
    {
        var def = DefOf(s, p.DefinitionId);
        var abilities = (def?.ActivatedAbilities ?? [])
            .Select(ab => new AbilityView(ab.Id, ab.Name, CostText(ab.Cost), ab.Cost.DiscardCards ?? 0))
            .ToList();
        return new PermanentView(
            p.PermanentId, p.Kind, p.DefinitionId,
            def?.Name ?? p.DefinitionId, p.Owner.ToKey(),
            def?.EffectText ?? "",
            new Dictionary<string, int>(p.Counters),
            p.TurnsRemaining,
            abilities);
    }

    private static PromptView? BuildPrompt(CombatState s, List<HandCardView> hand)
    {
        switch (s.PendingBlock)
        {
            case RevealBlock r:
                return new RevealPromptView(
                    r.Lore, r.IsHint, r.HintText,
                    r.GainedCardId == null ? null : NameOf(s, r.GainedCardId));
            case ChooseNumberBlock c:
                return new ChooseNumberPromptView(c.Min, c.Max);
            case DeckRevealBlock d:
                return new DeckRevealPromptView(d.CardDefIds.Select(id => NameOf(s, id)).ToList());
        }
        if (s.Phase == Phases.BotMSelect)
            return new BotmPromptView(Core.EffectiveBotmLimit(s), hand);
        return null;
    }

    private static string CostText(ActivatedAbilityCost c)
    {
        var parts = new List<string>();
        if (c.Priority is int pr and > 0) parts.Add($"{pr} Priority");
        if (c.Patience is int pa and > 0) parts.Add($"{pa} Patience");
        if (c.SacrificeShields is int sh and > 0) parts.Add($"sac {sh} shield{(sh == 1 ? "" : "s")}");
        if (c.DiscardCards is int dc and > 0) parts.Add($"discard {dc}");
        return parts.Count == 0 ? "free" : string.Join(", ", parts);
    }

    private static CardDefinition? DefOf(CombatState s, string defId) =>
        s.Cards.TryGetValue(defId, out var d) ? d :
        s.Tokens.TryGetValue(defId, out var t) ? t : null;

    private static string NameOf(CombatState s, string defId) => DefOf(s, defId)?.Name ?? defId;
}
