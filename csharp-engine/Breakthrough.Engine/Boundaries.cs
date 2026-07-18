// Turn boundaries (v1.4 §4) and the Check state (v1.4 §6.1).
//
// 1:1 C# port of src/engine/boundaries.ts. ONE Handoff() implements §4.2→§4.3
// and §4.4→§4.1 — every boundary step lives in exactly one place (v1.4 §15.3;
// Brief §7 trap 1). Step ordering is normative: expiry ticks run BEFORE new
// boundary-triggered effects apply (Brief §7 trap 6 — the Distracting Madness
// bug class).

namespace Breakthrough.Engine;

public static class Boundaries
{
    // ── Boundary housekeeping helpers (each used by exactly one step set) ────

    /// <summary>Step: expire modifiers (Restrictions, Replacements) bound to this boundary.</summary>
    private static void ExpireModifiers(CombatState state, string boundary)
    {
        static List<T> Tick<T>(List<T> items, string boundary, Func<T, BoundaryRef?> expiryOf)
        {
            var kept = new List<T>();
            foreach (var item in items)
            {
                var expiry = expiryOf(item);
                if (expiry == null || expiry.Boundary != boundary)
                {
                    kept.Add(item);
                    continue;
                }
                expiry.Occurrences -= 1;
                if (expiry.Occurrences <= 0) continue;
                kept.Add(item);
            }
            return kept;
        }

        int beforeR = state.Restrictions.Count;
        state.Restrictions = Tick(state.Restrictions, boundary, r => r.Expiry);
        if (state.Restrictions.Count != beforeR) Core.Log(state, "expiry", $"Restrictions expired at {boundary}");
        state.Replacements = Tick(state.Replacements, boundary, r => r.Expiry);
    }

    /// <summary>Step: expire the side's untriggered Traps; tick its Impression durations.</summary>
    private static void ExpireTrapsAndTickImpressions(CombatState state, Side side)
    {
        var traps = state.Field.Where(p => p.Kind == PermanentKinds.Trap && p.Owner == side).ToList();
        foreach (var trap in traps)
        {
            // Untriggered traps expire to owner's discard at owner's Turn Start (§3.6).
            Core.Log(state, "trap-expired", $"Trap {Core.GetDef(state, trap.DefinitionId).Name} expires untriggered");
            Core.DestroyPermanent(state, trap.PermanentId, 0, new Core.DestroyOptions { FireLeaveTriggers = false });
        }
        var impressions = state.Field
            .Where(p => p.Kind == PermanentKinds.Impression && p.Owner == side && p.TurnsRemaining != null)
            .ToList();
        foreach (var imp in impressions)
        {
            imp.TurnsRemaining = imp.TurnsRemaining!.Value - 1;
            if (imp.TurnsRemaining <= 0)
            {
                var def = Core.GetDef(state, imp.DefinitionId);
                Core.Log(state, "impression-expired", $"Impression {def.Name} expires");
                Core.DestroyPermanent(state, imp.PermanentId, 0, new Core.DestroyOptions
                {
                    FireLeaveTriggers = true,
                    ToDeck = def.ImpressionDuration?.ReturnToDeck ?? false,
                });
            }
        }
    }

    /// <summary>Step: reset the side's per-turn counters (§4 naming convention).</summary>
    private static void ResetPerTurnCounters(CombatState state, Side side)
    {
        var s = state.SideOf(side);
        s.CardsPlayedThisTurn = 0;
        s.ExtraDrawsThisTurn = 0;
        s.PriorityGainedThisTurn = 0;
        state.AbilityFiresThisTurn = new Dictionary<string, int>();
        if (side == Side.Player)
        {
            // Roll the player's opp-shield counter into its previous-turn mirror (§4.1.5).
            state.OppShieldsBrokenByPlayerPrevTurn = state.OppShieldsBrokenByPlayerThisTurn;
            state.OppShieldsBrokenByPlayerThisTurn = 0;
        }
        else
        {
            state.PlayerShieldsBrokenByNpcThisTurn = 0;
            state.GuardsPlacedByNpcThisTurn = 0;
        }
    }

    /// <summary>Step: fire scheduled effects due at this boundary (§9.4).</summary>
    private static void FireScheduledEffects(CombatState state, string boundary)
    {
        var due = new List<ScheduledEffectEntry>();
        var kept = new List<ScheduledEffectEntry>();
        foreach (var entry in state.ScheduledEffects)
        {
            if (entry.At.Boundary != boundary)
            {
                kept.Add(entry);
                continue;
            }
            entry.At.Occurrences -= 1;
            if (entry.At.Occurrences <= 0)
            {
                due.Add(entry);
                continue;
            }
            kept.Add(entry);
        }
        state.ScheduledEffects = kept;
        foreach (var entry in due)
        {
            Core.Log(state, "scheduled-fired", $"Scheduled effects fire at {boundary}");
            Core.PushFrame(state, new EffectFrame
            {
                FrameId = "",
                Kind = FrameKinds.Scheduled,
                Controller = entry.Controller,
                Effects = entry.Effects,
                Depth = 0,
            });
        }
        Core.RunStack(state);
    }

    /// <summary>Turn-start Priority formula (v1.4 §3.1).</summary>
    private static void SetTurnStartPriority(CombatState state, Side side)
    {
        var cfg = state.Config;
        int debt = state.SideOf(side).IncomingDebt;
        int value = Math.Min(cfg.MaxPriority, cfg.MinTurnStartPriority + debt);
        if (!state.FirstTurnOfCombatDone)
        {
            value += cfg.FirstTurnBonusPriority;
            state.FirstTurnOfCombatDone = true;
        }
        state.SideOf(side).IncomingDebt = 0; // consumed on use; never banked
        state.SideOf(side).Priority = value;
        Core.Log(state, "turn-start-priority",
            $"{side.ToKey()} priority set to {value}{(debt > 0 ? $" (incl. {debt} transferred debt)" : "")}",
            new Dictionary<string, object?> { ["side"] = side.ToKey(), ["value"] = value, ["debt"] = debt });
    }

    /// <summary>Turn-end settlement (v1.4 §3.1 / §4.2.3 / §4.4.3).</summary>
    private static void SettlePriority(CombatState state, Side side)
    {
        int p = state.SideOf(side).Priority;
        if (p < 0)
        {
            state.SideOf(side.OpponentOf()).IncomingDebt = -p;
            Core.Log(state, "debt-transfer", $"{side.ToKey()} ends at {p}: {-p} debt transfers to opponent",
                new Dictionary<string, object?> { ["side"] = side.ToKey(), ["debt"] = -p });
        }
        else if (p > 0)
        {
            state.SideOf(side).LastUnspentPriority = p; // tracked, no mechanical effect (§15.7)
        }
        state.SideOf(side).Priority = 0;
    }

    /// <summary>Impression turn-start effects for the side (§4.1.9 / §4.3.9).</summary>
    private static void FireImpressionTurnStartEffects(CombatState state, Side side)
    {
        var impressions = state.Field
            .Where(p => p.Kind == PermanentKinds.Impression && p.Owner == side)
            .OrderBy(p => p.ArrivalOrder)
            .ToList();
        foreach (var imp in impressions)
        {
            var def = Core.GetDef(state, imp.DefinitionId);
            if (def.TurnStartEffects is { Count: > 0 })
            {
                Core.PushFrame(state, new EffectFrame
                {
                    FrameId = "",
                    Kind = FrameKinds.TurnStartEffects,
                    Controller = side,
                    Effects = def.TurnStartEffects,
                    Depth = 0,
                    SourcePermanentId = imp.PermanentId,
                });
            }
        }
        Core.RunStack(state);
    }

    // ── The four boundaries ──────────────────────────────────────────────────

    private static void PlayerTurnStart(CombatState state)
    {
        // §4.1 — steps in listed order (normative).
        state.ActiveTurn = Side.Player; // 1
        state.Round += 1;
        Core.Log(state, "boundary", $"— Player Turn Start (Round {state.Round}) —");
        SetTurnStartPriority(state, Side.Player); // 2
        ExpireModifiers(state, BoundaryNames.PlayerTurnStart); // 3
        ExpireTrapsAndTickImpressions(state, Side.Player); // 4
        Core.RunStack(state); // expiry leave-triggers resolve within step 4
        ResetPerTurnCounters(state, Side.Player); // 5
        // 6 — BotM cards return to hand, before the draw.
        if (state.BackOfMind.Count > 0)
        {
            state.Player.Hand.AddRange(state.BackOfMind);
            Core.Log(state, "botm-return", $"{state.BackOfMind.Count} Back of Mind card(s) return to hand");
            state.BackOfMind = [];
        }
        // 7 — draw up to handLimit (respecting draw restrictions).
        int need = Math.Max(0, Core.HandLimit - state.Player.Hand.Count);
        Core.Draw(state, Side.Player, need, new Core.DrawOptions { TurnStart = true });
        FireScheduledEffects(state, BoundaryNames.PlayerTurnStart); // 8
        Core.DispatchEvent(state, new EngineEvent { Type = EventTypes.PlayerTurnStart, Controller = Side.Player }, 0); // 9
        Core.RunStack(state);
        FireImpressionTurnStartEffects(state, Side.Player);
        // 10 → Check (caller).
    }

    private static void PlayerTurnEndSettle(CombatState state)
    {
        // §4.2 step 3 (steps 1–2 — event dispatch and BotM Select — run in the
        // reducer before handoff is invoked, since BotM Select blocks).
        ExpireModifiers(state, BoundaryNames.PlayerTurnEnd);
        FireScheduledEffects(state, BoundaryNames.PlayerTurnEnd);
        SettlePriority(state, Side.Player);
    }

    private static void NpcTurnStart(CombatState state)
    {
        // §4.3 — steps in listed order.
        state.ActiveTurn = Side.Npc; // 1
        Core.Log(state, "boundary", "— NPC Turn Start —");
        SetTurnStartPriority(state, Side.Npc); // 2
        ExpireModifiers(state, BoundaryNames.NpcTurnStart); // 3
        ExpireTrapsAndTickImpressions(state, Side.Npc); // 4
        Core.RunStack(state); // expiry leave-triggers resolve within step 4
        ResetPerTurnCounters(state, Side.Npc); // 5
        // 6 — inject due scheduledPlays into the NPC's hand, leftmost (§10).
        var due = state.NpcScheduledAside.Where(sp => state.Round > sp.AfterTurn).ToList();
        state.NpcScheduledAside = state.NpcScheduledAside.Where(sp => state.Round <= sp.AfterTurn).ToList();
        for (int i = due.Count - 1; i >= 0; i--)
        {
            var sp = due[i];
            state.Npc.Hand.Insert(0, sp.Card);
            Core.Log(state, "scheduled-play",
                $"Scheduled card {Core.GetDef(state, sp.Card.DefinitionId).Name} injected into NPC hand");
        }
        // 7 — draw up to npcHandLimit (deck recycles; set-aside cards excluded).
        int need = Math.Max(0, state.Config.NpcHandLimit - state.Npc.Hand.Count);
        Core.Draw(state, Side.Npc, need, new Core.DrawOptions { TurnStart = true });
        FireScheduledEffects(state, BoundaryNames.NpcTurnStart); // 8
        Core.DispatchEvent(state, new EngineEvent { Type = EventTypes.NpcTurnStart, Controller = Side.Npc }, 0); // 9
        Core.RunStack(state);
        FireImpressionTurnStartEffects(state, Side.Npc);
        // 10 → Check (caller).
    }

    private static void NpcTurnEnd(CombatState state)
    {
        // §4.4 — automatic.
        Core.Log(state, "boundary", "— NPC Turn End —");
        Core.DispatchEvent(state, new EngineEvent { Type = EventTypes.NpcTurnEnd, Controller = Side.Npc }, 0); // 1
        Core.RunStack(state);
        ExpireModifiers(state, BoundaryNames.NpcTurnEnd);
        FireScheduledEffects(state, BoundaryNames.NpcTurnEnd);
        // 2 — discard the NPC's remaining hand (no NPC Back of Mind).
        if (state.Npc.Hand.Count > 0)
        {
            state.Npc.Discard.AddRange(state.Npc.Hand);
            Core.Log(state, "npc-discard-hand", $"NPC discards {state.Npc.Hand.Count} remaining hand card(s)");
            state.Npc.Hand = [];
        }
        SettlePriority(state, Side.Npc); // 3
        // 4 → Player Turn Start (via handoff caller).
    }

    /// <summary>
    /// THE handoff procedure (v1.4 §15.3). 'player' ending implements
    /// §4.2→§4.3; 'npc' ending implements §4.4→§4.1. All boundary steps live
    /// here or in the step functions above — nowhere else (Brief §7 trap 1).
    /// </summary>
    public static void Handoff(CombatState state, Side ending)
    {
        if (ending == Side.Player)
        {
            PlayerTurnEndSettle(state);
            NpcTurnStart(state);
        }
        else
        {
            NpcTurnEnd(state);
            PlayerTurnStart(state);
        }
    }

    /// <summary>Entry boundary for the very first turn of combat.</summary>
    public static void StartFirstTurn(CombatState state)
    {
        if (state.Config.StartingSide == Side.Npc)
        {
            // Round 0 NPC opener (v1.4 §2 "Round").
            NpcTurnStart(state);
        }
        else
        {
            PlayerTurnStart(state);
        }
    }

    // ── Check (v1.4 §6.1) — the routing hub; never blocks ────────────────────

    public static void Check(CombatState state)
    {
        if (state.PendingBlock != null || state.ResolutionHalted) return; // blocked states route on resume
        if (state.Result != null) return;

        // 1 — WIN before loss (§6.7 inv. 4).
        bool coresLeft = state.NpcCoreShields.Any(s => !s.Broken);
        int totalConfigured = EncounterDefaults.ResolvedGuardCount(state.Config) + state.Config.OpponentShields.Count;
        if (totalConfigured > 0 && state.NpcGuardsStanding == 0 && !coresLeft)
        {
            state.Result = Results.Win;
            state.Phase = Phases.Won;
            Core.Log(state, "result", "All opponent shields broken — WIN");
            return;
        }
        // 2 — shield-loss (armed only; skipped when unbreakable).
        if (state.ShieldLossArmed && !state.Config.UnbreakablePlayerShields && state.PlayerShields.Count == 0)
        {
            state.Result = Results.Lose;
            state.LoseReason = LoseReasons.Shields;
            state.Phase = Phases.Lost;
            Core.Log(state, "result", "Player shield row empty — LOSE");
            return;
        }
        // 3 — Patience.
        if (state.Patience <= 0)
        {
            state.Result = Results.Lose;
            state.LoseReason = LoseReasons.Patience;
            state.Phase = Phases.Lost;
            Core.Log(state, "result", "Patience exhausted — LOSE");
            return;
        }
        // 4 — Lie Counter.
        if ((state.Config.LieThreshold ?? 0) > 0 && state.LieCounter > state.Config.LieThreshold!.Value)
        {
            state.Result = Results.Lose;
            state.LoseReason = LoseReasons.Lies;
            state.Phase = Phases.Lost;
            Core.Log(state, "result", "Lie threshold exceeded — LOSE");
            return;
        }
        // 5 — player turn: always Player Pending, regardless of Priority (§3.1).
        if (state.ActiveTurn == Side.Player)
        {
            state.Phase = Phases.PlayerPending;
            return;
        }
        // 6/7/8 — NPC turn routing.
        if (state.StagedCard != null)
        {
            state.Phase = Phases.EnemyPending; // staged card resolves via ADVANCE
            return;
        }
        if (Core.NpcCanAct(state))
        {
            state.Phase = Phases.EnemyPending;
            return;
        }
        // 8 — NPC Turn End → Player Turn Start → Check.
        Handoff(state, Side.Npc);
        Check(state);
    }
}
