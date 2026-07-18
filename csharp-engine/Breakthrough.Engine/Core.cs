// Engine core: mutation helpers, event dispatch, shield procedures, the
// generic effect stack (single suspension mechanism, v1.4 §15.4), and card
// play sequencing (§6.3 / §6.6).
//
// 1:1 C# port of src/engine/core.ts. Functions here mutate a working-copy
// state owned by the reducer. The reducer clones the incoming state first, so
// the public API stays pure (§6.7 inv. 12 — no module-level mutable state
// anywhere in this file).

namespace Breakthrough.Engine;

public static class Core
{
    // Combat constants (v1.2 carry-overs referenced by v1.4; not encounter-tunable).
    public const int HandLimit = 5;
    public const int RealShieldPlacementCost = 2; // v1.4 §3.4
    public const int TriggerDepthCap = 20; // v1.4 §5.4
    public const int BotmBaseLimit = 1; // v1.4 §3.11

    // ── Small helpers ────────────────────────────────────────────────────────

    public static string NewId(CombatState state, string prefix)
    {
        state.NextId += 1;
        return $"{prefix}_{state.NextId}";
    }

    public static void Log(CombatState state, string type, string message, Dictionary<string, object?>? data = null)
    {
        state.LogSeq += 1;
        state.Log.Add(new LogEntry { Seq = state.LogSeq, Type = type, Message = message, Data = data });
    }

    public static CardDefinition GetDef(CombatState state, string definitionId)
    {
        var def = state.Cards.GetValueOrDefault(definitionId) ?? state.Tokens.GetValueOrDefault(definitionId);
        if (def == null) throw new InvalidOperationException($"Unknown card definition \"{definitionId}\"");
        return def;
    }

    public static CardDefinition PonderDef(CombatState state)
    {
        var def = state.Cards.GetValueOrDefault("ponder");
        if (def == null) throw new InvalidOperationException("Ponder definition missing from card registry");
        return def;
    }

    private static List<T> ShuffleInState<T>(CombatState state, IReadOnlyList<T> items)
    {
        var r = Rng.ShuffleWithRng(items, state.RngState);
        state.RngState = r.RngState;
        return r.Items;
    }

    private static int RandomIndex(CombatState state, int length)
    {
        var r = Rng.ShuffleWithRng(Enumerable.Range(0, length).ToList(), state.RngState);
        state.RngState = r.RngState;
        return r.Items.Count > 0 ? r.Items[0] : 0;
    }

    /// <summary>The event payload spread ({ ...event }) used by the dispatch log.</summary>
    private static Dictionary<string, object?> EventData(EngineEvent e)
    {
        var d = new Dictionary<string, object?> { ["type"] = e.Type };
        if (e.Controller != null) d["controller"] = e.Controller.Value.ToKey();
        if (e.CardInstanceId != null) d["cardInstanceId"] = e.CardInstanceId;
        if (e.CardDefId != null) d["cardDefId"] = e.CardDefId;
        if (e.CardCost != null) d["cardCost"] = e.CardCost.Value;
        if (e.ShieldSide != null) d["shieldSide"] = e.ShieldSide.Value.ToKey();
        if (e.ShieldType != null) d["shieldType"] = e.ShieldType;
        if (e.Breaker != null) d["breaker"] = e.Breaker.Value.ToKey();
        if (e.Delta != null) d["delta"] = e.Delta.Value;
        if (e.NewValue != null) d["newValue"] = e.NewValue.Value;
        if (e.Side != null) d["side"] = e.Side.Value.ToKey();
        if (e.TokenDefId != null) d["tokenDefId"] = e.TokenDefId;
        if (e.ExtraDraw != null) d["extraDraw"] = e.ExtraDraw.Value;
        return d;
    }

    // ── Restrictions ─────────────────────────────────────────────────────────

    public static List<ActiveRestriction> RestrictionsFor(CombatState state, Side side, string type) =>
        state.Restrictions.Where(r => r.Type == type && (r.Target == side.ToKey() || r.Target == "both")).ToList();

    public static bool HasRestriction(CombatState state, Side side, string type) =>
        RestrictionsFor(state, side, type).Count > 0;

    public static int EffectiveBotmLimit(CombatState state)
    {
        int bonus = RestrictionsFor(state, Side.Player, RestrictionTypes.BotmLimitBonus).Sum(r => r.Value ?? 0);
        return state.BackOfMindLimitBase + bonus;
    }

    public static int EffectiveCardCost(CombatState state, Side side, int baseCost, bool heavyHand)
    {
        int cost = heavyHand ? baseCost * 2 : baseCost;
        foreach (var r in RestrictionsFor(state, side, RestrictionTypes.IncreaseCardCost)) cost += r.Value ?? 0;
        return cost;
    }

    public static bool MaxPlaysReached(CombatState state, Side side)
    {
        var caps = RestrictionsFor(state, side, RestrictionTypes.MaxPlaysPerTurn);
        if (caps.Count == 0) return false;
        int cap = caps.Min(r => r.Value ?? int.MaxValue);
        return state.SideOf(side).CardsPlayedThisTurn >= cap;
    }

    public static bool CostCapViolated(CombatState state, Side side, int cost)
    {
        var caps = RestrictionsFor(state, side, RestrictionTypes.MaxCardCost);
        if (caps.Count == 0) return false;
        return cost > caps.Min(r => r.Value ?? int.MaxValue);
    }

    // ── Priority & Patience ──────────────────────────────────────────────────

    /// <summary>
    /// Change a side's Priority meter by delta. PRIORITY_FLOOR restrictions
    /// clamp decreases. Dispatches PRIORITY_CHANGED (resolution-time changes
    /// only — boundary housekeeping sets the meter directly and does not
    /// dispatch).
    /// </summary>
    public static void ModifyPriority(CombatState state, Side side, int delta, bool dispatch = true)
    {
        if (delta == 0) return;
        int next = state.SideOf(side).Priority + delta;
        if (delta < 0)
        {
            var floors = RestrictionsFor(state, side, RestrictionTypes.PriorityFloor);
            if (floors.Count > 0)
            {
                int floor = floors.Max(r => r.Value ?? int.MinValue);
                if (next < floor) next = floor;
            }
        }
        int applied = next - state.SideOf(side).Priority;
        if (applied == 0) return;
        state.SideOf(side).Priority = next;
        if (applied > 0) state.SideOf(side).PriorityGainedThisTurn += applied;
        Log(state, "priority", $"{side.ToKey()} priority {(applied > 0 ? "+" : "")}{applied} → {next}",
            new Dictionary<string, object?> { ["side"] = side.ToKey(), ["delta"] = applied, ["newValue"] = next });
        if (dispatch)
        {
            DispatchEvent(state,
                new EngineEvent { Type = EventTypes.PriorityChanged, Side = side, Delta = applied, NewValue = next, Controller = side }, 0);
        }
    }

    /// <summary>
    /// Change shared Patience (no cap — v1.4 §3.2). Source is the controller
    /// of the causing effect: PREVENT_PATIENCE_GAIN nullifies gains by that side.
    /// </summary>
    public static void ModifyPatience(CombatState state, int delta, Side source, int depth = 0)
    {
        if (delta == 0) return;
        if (delta > 0 && HasRestriction(state, source, RestrictionTypes.PreventPatienceGain))
        {
            Log(state, "patience-blocked", $"Patience gain by {source.ToKey()} prevented by restriction",
                new Dictionary<string, object?> { ["delta"] = delta });
            return;
        }
        state.Patience += delta;
        Log(state, "patience", $"Patience {(delta > 0 ? "+" : "")}{delta} → {state.Patience}",
            new Dictionary<string, object?> { ["delta"] = delta, ["newValue"] = state.Patience, ["source"] = source.ToKey() });
        DispatchEvent(state,
            new EngineEvent { Type = EventTypes.PatienceChanged, Delta = delta, NewValue = state.Patience, Controller = source }, depth);
        // Impressions with destroy-below-Patience thresholds (v1.4 §3.8).
        var doomed = state.Field.Where(p =>
            p.Kind == PermanentKinds.Impression &&
            GetDef(state, p.DefinitionId).ImpressionDestroyBelowPatience != null &&
            state.Patience < GetDef(state, p.DefinitionId).ImpressionDestroyBelowPatience!.Value).ToList();
        foreach (var p in doomed) DestroyPermanent(state, p.PermanentId, depth, new DestroyOptions { FireLeaveTriggers = true });
    }

    // ── Drawing ──────────────────────────────────────────────────────────────

    public sealed class DrawOptions
    {
        public bool TurnStart { get; init; }
    }

    /// <summary>
    /// Draw with deck recycle (v1.4 §3.12). Dispatches CARD_DRAWN per card
    /// drawn (v1.4.1 canonical event; extraDraw = not a turn-start refill).
    /// </summary>
    public static int Draw(CombatState state, Side side, int count, DrawOptions? opts = null)
    {
        opts ??= new DrawOptions();
        if (count <= 0) return 0;
        if (HasRestriction(state, side, RestrictionTypes.PreventDraw))
        {
            Log(state, "draw-blocked", $"{side.ToKey()} draw prevented by restriction");
            return 0;
        }
        int n = count;
        if (opts.TurnStart)
        {
            var caps = RestrictionsFor(state, side, RestrictionTypes.MaxTurnStartDraw);
            if (caps.Count > 0) n = Math.Min(n, caps.Min(r => r.Value ?? int.MaxValue));
        }
        else if (HasRestriction(state, side, RestrictionTypes.PreventExtraDraws))
        {
            Log(state, "draw-blocked", $"{side.ToKey()} extra draw prevented by restriction");
            return 0;
        }
        int drawn = 0;
        var s = state.SideOf(side);
        for (int i = 0; i < n; i++)
        {
            if (s.Deck.Count == 0 && s.Discard.Count > 0)
            {
                s.Deck = ShuffleInState(state, s.Discard);
                s.Discard = [];
                Log(state, "recycle", $"{side.ToKey()} deck recycled from discard");
            }
            if (s.Deck.Count == 0) break; // both piles empty: draw stops short, no side effect (§3.12)
            var card = s.Deck[0];
            s.Deck.RemoveAt(0);
            s.Hand.Add(card);
            drawn += 1;
            if (!opts.TurnStart) s.ExtraDrawsThisTurn += 1;
            DispatchEvent(state, new EngineEvent
            {
                Type = EventTypes.CardDrawn,
                Controller = side,
                CardInstanceId = card.InstanceId,
                CardDefId = card.DefinitionId,
                ExtraDraw = !opts.TurnStart,
            }, 0);
        }
        if (drawn > 0)
            Log(state, "draw", $"{side.ToKey()} drew {drawn} card(s)",
                new Dictionary<string, object?> { ["side"] = side.ToKey(), ["count"] = drawn });
        return drawn;
    }

    // ── Frames & event dispatch ──────────────────────────────────────────────

    public static EffectFrame PushFrame(CombatState state, EffectFrame frame)
    {
        frame.FrameId = NewId(state, "frame");
        frame.Index = 0;
        if (frame.Depth > TriggerDepthCap)
        {
            // Fail-safe, not a gameplay limit (v1.4 §5.4): halt and log an error.
            state.ResolutionHalted = true;
            Log(state, "error", $"Trigger depth cap ({TriggerDepthCap}) reached — resolution halted",
                new Dictionary<string, object?> { ["kind"] = frame.Kind });
            return frame;
        }
        state.EffectStack.Add(frame);
        return frame;
    }

    private static bool MatchesControllerFilter(string? filter, Side owner, EngineEvent evt)
    {
        if (filter == null) return true;
        if (evt.Controller == null) return false;
        return filter == "self" ? evt.Controller == owner : evt.Controller == owner.OpponentOf();
    }

    /// <summary>
    /// Canonical event dispatch — the single integration point for Traps,
    /// Shield Triggers, and triggered abilities (v1.4 §15.5). Matching traps
    /// fire first (play order), then triggered abilities (Field arrival
    /// order); the caller interleaves Shield Trigger frames where §5.4
    /// requires. Nested triggers resolve immediately as sub-steps via the
    /// stack (depth-capped).
    /// </summary>
    public static void DispatchEvent(CombatState state, EngineEvent evt, int depth)
    {
        Log(state, "event", $"event {evt.Type}", EventData(evt));

        var traps = new List<(Permanent Perm, IReadOnlyList<Effect> Effects)>();
        var abilities = new List<(Permanent Perm, string AbilityKey, IReadOnlyList<Effect> Effects, int? Chosen)>();

        var ordered = state.Field.OrderBy(p => p.ArrivalOrder).ToList();
        foreach (var perm in ordered)
        {
            var def = GetDef(state, perm.DefinitionId);
            if (perm.Kind == PermanentKinds.Trap && def.TrapTrigger != null && def.TrapTrigger.Event == evt.Type &&
                !perm.FiredThisResolution &&
                MatchesControllerFilter(def.TrapTrigger.ControllerFilter, perm.Owner, evt))
            {
                var ctx = new EvalContext
                {
                    Controller = perm.Owner,
                    Event = evt,
                    ChosenNumber = perm.RapportPrediction,
                    SourcePermanentId = perm.PermanentId,
                };
                if (def.TrapTrigger.Condition == null || Quantities.EvalCondition(def.TrapTrigger.Condition, state, ctx))
                {
                    traps.Add((perm, def.Effects));
                }
            }
            if (perm.Kind != PermanentKinds.Trap)
            {
                foreach (var ab in def.TriggeredAbilities ?? [])
                {
                    if (ab.Trigger.Event != evt.Type) continue;
                    if (!MatchesControllerFilter(ab.Trigger.ControllerFilter, perm.Owner, evt)) continue;
                    string key = $"{perm.PermanentId}:{ab.Id}";
                    if (ab.MaxTimesPerPlay != null && state.AbilityFiresThisPlay.GetValueOrDefault(key) >= ab.MaxTimesPerPlay) continue;
                    if (ab.MaxTimesPerTurn != null && state.AbilityFiresThisTurn.GetValueOrDefault(key) >= ab.MaxTimesPerTurn) continue;
                    var ctx = new EvalContext
                    {
                        Controller = perm.Owner,
                        Event = evt,
                        ChosenNumber = perm.RapportPrediction,
                        SourcePermanentId = perm.PermanentId,
                    };
                    if (ab.Trigger.Condition != null && !Quantities.EvalCondition(ab.Trigger.Condition, state, ctx)) continue;
                    state.AbilityFiresThisPlay[key] = state.AbilityFiresThisPlay.GetValueOrDefault(key) + 1;
                    state.AbilityFiresThisTurn[key] = state.AbilityFiresThisTurn.GetValueOrDefault(key) + 1;
                    abilities.Add((perm, key, ab.Effects, perm.RapportPrediction));
                }
            }
        }

        // LIFO stack: push abilities first (reverse order), then traps (reverse
        // order) so traps pop first, oldest-first within each class (v1.4 §5.4).
        for (int i = abilities.Count - 1; i >= 0; i--)
        {
            var a = abilities[i];
            PushFrame(state, new EffectFrame
            {
                FrameId = "",
                Kind = FrameKinds.Ability,
                Controller = a.Perm.Owner,
                Effects = a.Effects,
                Depth = depth + 1,
                SourcePermanentId = a.Perm.PermanentId,
                ChosenNumber = a.Chosen,
            });
        }
        for (int i = traps.Count - 1; i >= 0; i--)
        {
            var t = traps[i];
            t.Perm.FiredThisResolution = true;
            Log(state, "trap-fired", $"Trap {GetDef(state, t.Perm.DefinitionId).Name} fires",
                new Dictionary<string, object?> { ["permanentId"] = t.Perm.PermanentId, ["event"] = evt.Type });
            PushFrame(state, new EffectFrame
            {
                FrameId = "",
                Kind = FrameKinds.Trap,
                Controller = t.Perm.Owner,
                Effects = t.Effects,
                Depth = depth + 1,
                SourcePermanentId = t.Perm.PermanentId,
                ChosenNumber = t.Perm.RapportPrediction,
            });
        }
    }

    // ── Permanents: create / destroy / transform ────────────────────────────

    public static Permanent AddPermanent(
        CombatState state,
        string kind,
        string definitionId,
        Side owner,
        string? permanentId = null,
        string? cardInstanceId = null,
        int? rapportPrediction = null)
    {
        var def = GetDef(state, definitionId);
        state.NextArrivalOrder += 1;
        var perm = new Permanent
        {
            PermanentId = permanentId ?? NewId(state, "perm"),
            Kind = kind,
            DefinitionId = definitionId,
            Owner = owner,
            ArrivalOrder = state.NextArrivalOrder,
            CardInstanceId = cardInstanceId,
            RapportPrediction = rapportPrediction,
        };
        if (kind == PermanentKinds.Impression && def.ImpressionDuration != null)
        {
            perm.TurnsRemaining = def.ImpressionDuration.Turns;
        }
        state.Field.Add(perm);
        Log(state, "permanent-added", $"{kind} {def.Name} enters the Field ({owner.ToKey()})",
            new Dictionary<string, object?>
            {
                ["permanentId"] = perm.PermanentId,
                ["definitionId"] = definitionId,
                ["owner"] = owner.ToKey(),
                ["kind"] = kind,
            });
        return perm;
    }

    public static void CreateToken(CombatState state, string tokenDefinitionId, Side owner, int depth)
    {
        // Replacements checked at creation (v1.4 §9.3); transform effects bypass.
        string defId = tokenDefinitionId;
        var repl = state.Replacements.Find(r => r.OriginalTokenId == defId);
        if (repl != null)
        {
            Log(state, "replacement", $"Token creation replaced: {defId} → {repl.ReplacementTokenId}");
            defId = repl.ReplacementTokenId;
        }
        AddPermanent(state, PermanentKinds.Token, defId, owner);
        DispatchEvent(state, new EngineEvent { Type = EventTypes.TokenCreated, TokenDefId = defId, Controller = owner }, depth);
    }

    public sealed class DestroyOptions
    {
        public bool FireLeaveTriggers { get; init; } = true;
        public bool ToDeck { get; init; }
    }

    public static void DestroyPermanent(CombatState state, string permanentId, int depth, DestroyOptions? opts = null)
    {
        opts ??= new DestroyOptions();
        int idx = state.Field.FindIndex(p => p.PermanentId == permanentId);
        if (idx == -1) return;
        var perm = state.Field[idx];
        var def = GetDef(state, perm.DefinitionId);
        state.Field.RemoveAt(idx);

        // Restrictions/replacements linked to this permanent leave with it (§3.8).
        state.Restrictions = state.Restrictions.Where(r => r.LinkedPermanentId != permanentId).ToList();
        state.Replacements = state.Replacements.Where(r => r.LinkedPermanentId != permanentId).ToList();

        Log(state, "permanent-removed", $"{perm.Kind} {def.Name} leaves the Field",
            new Dictionary<string, object?> { ["permanentId"] = permanentId, ["definitionId"] = perm.DefinitionId });

        // Card behind an Impression/Trap goes to its owner's discard (or deck).
        if (perm.CardInstanceId != null)
        {
            var card = new CardInstance { InstanceId = perm.CardInstanceId, DefinitionId = perm.DefinitionId, Owner = perm.Owner };
            var side = state.SideOf(perm.Owner);
            if (opts.ToDeck)
            {
                var combined = new List<CardInstance>(side.Deck) { card };
                side.Deck = ShuffleInState(state, combined);
            }
            else
            {
                side.Discard.Add(card);
            }
        }

        if (opts.FireLeaveTriggers && def.LeaveTriggerEffects is { Count: > 0 })
        {
            PushFrame(state, new EffectFrame
            {
                FrameId = "",
                Kind = FrameKinds.LeaveTrigger,
                Controller = perm.Owner,
                Effects = def.LeaveTriggerEffects,
                Depth = depth + 1,
                SourcePermanentId = permanentId,
                ChosenNumber = perm.RapportPrediction,
            });
        }
        if (perm.Kind == PermanentKinds.Token)
        {
            DispatchEvent(state, new EngineEvent { Type = EventTypes.TokenDestroyed, TokenDefId = perm.DefinitionId, Controller = perm.Owner }, depth);
        }
    }

    /// <summary>TRANSFORM bypasses leave-triggers (v1.4 §3.7 / §3.10).</summary>
    public static void TransformPermanent(CombatState state, string permanentId, string intoDefinitionId)
    {
        var perm = state.Field.Find(p => p.PermanentId == permanentId);
        if (perm == null) return;
        string from = GetDef(state, perm.DefinitionId).Name;
        perm.DefinitionId = intoDefinitionId;
        Log(state, "transform", $"{from} transforms into {GetDef(state, intoDefinitionId).Name}",
            new Dictionary<string, object?> { ["permanentId"] = permanentId, ["intoDefinitionId"] = intoDefinitionId });
    }

    // ── Shields ──────────────────────────────────────────────────────────────

    private static void ArmShieldLossIfNeeded(CombatState state)
    {
        if (!state.ShieldLossArmed && state.PlayerShields.Count > 0)
        {
            state.ShieldLossArmed = true; // v1.4 §3.4: arms on first non-empty row
            Log(state, "shield-loss-armed", "Player shield-loss condition armed");
        }
    }

    public static void PlacePlaceholderShields(CombatState state, int count)
    {
        for (int i = 0; i < count; i++)
        {
            state.PlayerShields.Add(new PlayerShieldSlot
            {
                SlotId = NewId(state, "shield"),
                ShieldType = ShieldTypes.Placeholder,
                PatienceCostOnBreak = 1,
            });
        }
        if (count > 0)
            Log(state, "shields-placed", $"{count} Placeholder Shield(s) placed",
                new Dictionary<string, object?> { ["count"] = count });
        ArmShieldLossIfNeeded(state);
    }

    /// <summary>Guard restoration places dummy guards (v1.4 §3.3 / v1.4.1).</summary>
    public static void PlaceGuardShields(CombatState state, int count)
    {
        if (count <= 0) return;
        for (int i = 0; i < count; i++)
        {
            state.NpcGuards.Add(new NpcGuard { GuardId = NewId(state, "guard") });
        }
        state.NpcGuardsStanding = state.NpcGuards.Count;
        state.GuardsPlacedByNpcThisTurn += count;
        Log(state, "guards-placed", $"NPC places {count} Guard Shield(s) ({state.NpcGuardsStanding} standing)",
            new Dictionary<string, object?> { ["count"] = count });
    }

    /// <summary>
    /// Break one player shield: leftmost eligible — Dummy Shields
    /// (placeholders + real cards) before Core Shields (v1.4 §3.4). Returns
    /// what broke, or null.
    /// </summary>
    public static PlayerShieldSlot? BreakOnePlayerShield(CombatState state, Side breaker, int depth)
    {
        if (HasRestriction(state, breaker, RestrictionTypes.PreventShieldBreak))
        {
            Log(state, "break-prevented", $"Shield break by {breaker.ToKey()} prevented by restriction");
            return null;
        }
        if (state.Config.UnbreakablePlayerShields && breaker == Side.Npc)
        {
            Log(state, "break-prevented", "Player shields are unbreakable in this encounter");
            return null;
        }
        int dummyIdx = state.PlayerShields.FindIndex(s => s.ShieldType != ShieldTypes.Core);
        int idx = dummyIdx != -1 ? dummyIdx : state.PlayerShields.Count > 0 ? 0 : -1;
        if (idx == -1) return null;
        var slot = state.PlayerShields[idx];
        state.PlayerShields.RemoveAt(idx);

        var def = slot.CardDefinitionId != null ? GetDef(state, slot.CardDefinitionId) : null;
        bool safety = def?.Keywords.Contains(Engine.Keywords.Safety) ?? false;
        int patienceCost = slot.ShieldType == ShieldTypes.Core ? slot.PatienceCostOnBreak : safety ? 0 : slot.PatienceCostOnBreak;

        if (breaker == Side.Npc) state.PlayerShieldsBrokenByNpcThisTurn += 1;
        Log(state, "shield-broken", $"Player {slot.ShieldType} shield broken by {breaker.ToKey()}",
            new Dictionary<string, object?>
            {
                ["shieldType"] = slot.ShieldType,
                ["cardDefinitionId"] = slot.CardDefinitionId,
                ["safety"] = safety,
            });

        // Order (v1.4 §5.4): traps → this shield's Shield Trigger → abilities →
        // break outcome. LIFO push: outcome first, then the shield trigger, then
        // dispatch (which pushes abilities then traps on top → traps pop first).
        PushFrame(state, new EffectFrame
        {
            FrameId = "",
            Kind = FrameKinds.BreakOutcome,
            Controller = breaker,
            Effects = [],
            Depth = depth + 1,
            BreakOutcome = new BreakOutcomePayload(Side.Player, slot.ShieldType, patienceCost)
            {
                CardInstanceId = slot.CardInstanceId,
                CardDefinitionId = slot.CardDefinitionId,
                Safety = safety,
            },
        });
        if (def?.Keywords.Contains(Engine.Keywords.ShieldTrigger) == true)
        {
            var effects = def.ShieldTriggerEffects ?? def.Effects;
            if (effects.Count > 0)
            {
                PushFrame(state, new EffectFrame
                {
                    FrameId = "",
                    Kind = FrameKinds.ShieldTrigger,
                    Controller = Side.Player,
                    Effects = effects,
                    Depth = depth + 1,
                });
            }
        }
        DispatchEvent(state, new EngineEvent
        {
            Type = EventTypes.ShieldBroken,
            ShieldSide = Side.Player,
            ShieldType = slot.ShieldType,
            Breaker = breaker,
            Controller = breaker,
        }, depth);
        return slot;
    }

    /// <summary>
    /// Break one NPC Guard Shield — leftmost first (generic break effects hit
    /// Guards only, §3.3). v1.4.1: guards may be card-backed; their Shield
    /// Trigger resolves before the (patience-free) break outcome and the card
    /// goes to the NPC discard. Breaking an opponent Guard never costs
    /// Patience.
    /// </summary>
    public static bool BreakOneNpcGuard(CombatState state, Side breaker, int depth)
    {
        if (HasRestriction(state, breaker, RestrictionTypes.PreventShieldBreak))
        {
            Log(state, "break-prevented", $"Shield break by {breaker.ToKey()} prevented by restriction");
            return false;
        }
        if (state.NpcGuards.Count == 0)
        {
            Log(state, "break-fizzle", "No Guard Shields standing — generic break fizzles (v1.4 §3.3)");
            return false;
        }
        var guard = state.NpcGuards[0];
        state.NpcGuards.RemoveAt(0);
        state.NpcGuardsStanding = state.NpcGuards.Count;
        if (breaker == Side.Player) state.OppShieldsBrokenByPlayerThisTurn += 1;

        var def = guard.CardId != null ? GetDef(state, guard.CardId) : null;
        Log(state, "shield-broken",
            $"NPC Guard Shield broken by {breaker.ToKey()}{(def != null ? $" — {def.Name}" : "")} ({state.NpcGuardsStanding} standing)",
            new Dictionary<string, object?> { ["shieldType"] = "guard", ["breaker"] = breaker.ToKey(), ["cardId"] = guard.CardId });

        if (guard.CardId != null)
        {
            // Card-backed guard: card → NPC discard (recyclable), trigger fires.
            state.Npc.Discard.Add(new CardInstance { InstanceId = NewId(state, "card"), DefinitionId = guard.CardId, Owner = Side.Npc });
            if (def?.Keywords.Contains(Engine.Keywords.ShieldTrigger) == true)
            {
                var effects = def.ShieldTriggerEffects ?? def.Effects;
                if (effects.Count > 0)
                {
                    PushFrame(state, new EffectFrame
                    {
                        FrameId = "",
                        Kind = FrameKinds.ShieldTrigger,
                        Controller = Side.Npc,
                        Effects = effects,
                        Depth = depth + 1,
                    });
                }
            }
        }
        DispatchEvent(state, new EngineEvent
        {
            Type = EventTypes.ShieldBroken,
            ShieldSide = Side.Npc,
            ShieldType = "guard",
            Breaker = breaker,
            Controller = breaker,
        }, depth);
        return true;
    }

    /// <summary>
    /// Lock-and-keys core shield break (v1.4 §3.3 / §6.3 step 4). Caller has
    /// already verified guards are down and the key matches. Sets Reveal
    /// Pending.
    /// </summary>
    public static void BreakNpcCoreShield(CombatState state, int shieldIndex, int depth)
    {
        var shield = shieldIndex >= 0 && shieldIndex < state.NpcCoreShields.Count ? state.NpcCoreShields[shieldIndex] : null;
        if (shield == null || shield.Broken) return;
        shield.Broken = true;
        state.OppShieldsBrokenByPlayerThisTurn += 1;
        Log(state, "shield-broken", $"NPC Core Shield broken (key played): {shield.CardId}",
            new Dictionary<string, object?> { ["shieldType"] = "npcCore", ["cardId"] = shield.CardId, ["isHint"] = shield.IsHint });

        // Shield Trigger on NPC Information Shields (v1.4 §3.5).
        var def = state.Cards.GetValueOrDefault(shield.CardId);
        if (def?.Keywords.Contains(Engine.Keywords.ShieldTrigger) == true)
        {
            var effects = def.ShieldTriggerEffects ?? def.Effects;
            if (effects.Count > 0)
            {
                PushFrame(state, new EffectFrame
                {
                    FrameId = "",
                    Kind = FrameKinds.ShieldTrigger,
                    Controller = Side.Npc,
                    Effects = effects,
                    Depth = depth + 1,
                });
            }
        }
        DispatchEvent(state, new EngineEvent
        {
            Type = EventTypes.ShieldBroken,
            ShieldSide = Side.Npc,
            ShieldType = "npcCore",
            Breaker = Side.Player,
            Controller = Side.Player,
        }, depth);

        // Reveal Pending fires with the shield's lore; non-Hint shields add
        // their card to the Collection (persistence layer reads gainedCardIds).
        if (!shield.IsHint) state.GainedCardIds.Add(shield.CardId);
        state.PendingBlock = new RevealBlock(shield.LoreDescription, shield.IsHint, shield.CardId)
        {
            HintText = shield.HintText,
            GainedCardId = shield.IsHint ? null : shield.CardId,
        };
    }

    /// <summary>Multi-break helper honouring §6.7 inv. 7: never more than one Core per effect.</summary>
    public static void BreakPlayerShields(CombatState state, int count, Side breaker, int depth)
    {
        int coresBroken = 0;
        for (int i = 0; i < count; i++)
        {
            bool dummyLeft = state.PlayerShields.Any(s => s.ShieldType != ShieldTypes.Core);
            if (!dummyLeft && coresBroken >= 1)
            {
                Log(state, "break-capped", "Core single-break invariant: further breaks from this effect stop (§6.7.7)");
                break;
            }
            var broken = BreakOnePlayerShield(state, breaker, depth);
            if (broken == null) break;
            if (broken.ShieldType == ShieldTypes.Core) coresBroken += 1;
        }
    }

    // ── Real-card shield placement (player action, §3.4) ─────────────────────

    public static void PlaceRealShield(CombatState state, int handIndex)
    {
        var card = handIndex >= 0 && handIndex < state.Player.Hand.Count ? state.Player.Hand[handIndex] : null;
        if (card == null) throw new InvalidOperationException("No such hand card");
        state.Player.Hand.RemoveAt(handIndex);
        state.PlayerShields.Add(new PlayerShieldSlot
        {
            SlotId = NewId(state, "shield"),
            ShieldType = ShieldTypes.Real,
            CardInstanceId = card.InstanceId,
            CardDefinitionId = card.DefinitionId,
            PatienceCostOnBreak = 1,
        });
        ArmShieldLossIfNeeded(state);
        Log(state, "shields-placed", $"Real-card shield placed: {GetDef(state, card.DefinitionId).Name}");
    }

    // ── Effect execution ─────────────────────────────────────────────────────

    private static int Scaled(CombatState state, int baseValue, Effect effect, EvalContext ctx)
    {
        if (effect.Scale == null) return baseValue;
        int factor = Math.Max(0, Quantities.EvalQuantity(effect.Scale, state, ctx));
        return baseValue * factor;
    }

    private static EvalContext FrameContext(CombatState state, EffectFrame frame) => new()
    {
        Controller = frame.Controller,
        ChosenNumber = frame.ChosenNumber ?? state.PendingPlay?.ChosenNumber,
        SourcePermanentId = frame.SourcePermanentId,
    };

    public static void ExecuteEffect(CombatState state, Effect effect, EffectFrame frame)
    {
        var ctx = FrameContext(state, frame);
        var controller = frame.Controller;
        int depth = frame.Depth;

        if (effect.Condition != null && !Quantities.EvalCondition(effect.Condition, state, ctx)) return;

        switch (effect)
        {
            case ModifyPatienceEffect e:
            {
                int value = e.Value;
                if (e.AltValue != null && e.AltCondition != null && Quantities.EvalCondition(e.AltCondition, state, ctx))
                {
                    value = e.AltValue.Value;
                }
                ModifyPatience(state, Scaled(state, value, effect, ctx), controller, depth);
                break;
            }
            case ModifyPriorityEffect e:
            {
                var side = e.Target == RelSide.Opponent ? controller.OpponentOf() : controller;
                ModifyPriority(state, side, Scaled(state, e.Value, effect, ctx));
                break;
            }
            case DrawCardsEffect e:
                Draw(state, controller, Scaled(state, e.Value, effect, ctx));
                break;
            case BreakShieldsEffect e:
            {
                int count = Scaled(state, e.Count, effect, ctx);
                var targetSide = e.Target == RelSide.Self ? controller : controller.OpponentOf();
                if (targetSide == Side.Player)
                {
                    BreakPlayerShields(state, count, controller, depth);
                }
                else
                {
                    // NPC-owned shields: guards only, from either side (§3.3 / §6.6.3).
                    for (int i = 0; i < count; i++)
                    {
                        if (!BreakOneNpcGuard(state, controller, depth)) break;
                    }
                }
                break;
            }
            case PlaceShieldsEffect e:
            {
                int count = Scaled(state, e.Count, effect, ctx);
                if (controller == Side.Player) PlacePlaceholderShields(state, count);
                else PlaceGuardShields(state, count);
                break;
            }
            case CreateTokenEffect e:
            {
                int count = Scaled(state, e.Count, effect, ctx);
                for (int i = 0; i < count; i++) CreateToken(state, e.TokenDefinitionId, controller, depth);
                break;
            }
            case DestroyTokensEffect e:
            {
                int count = Scaled(state, e.Count, effect, ctx);
                var own = state.Field
                    .Where(p => p.Kind == PermanentKinds.Token && p.Owner == controller &&
                                (e.TokenDefinitionId == null || p.DefinitionId == e.TokenDefinitionId))
                    .OrderBy(p => p.ArrivalOrder)
                    .ToList();
                foreach (var perm in own.Take(count)) DestroyPermanent(state, perm.PermanentId, depth);
                break;
            }
            case TransformTokenEffect e:
            {
                var matching = state.Field
                    .Where(p => p.Kind == PermanentKinds.Token && p.Owner == controller && p.DefinitionId == e.FromTokenId)
                    .OrderBy(p => p.ArrivalOrder)
                    .ToList();
                int n = e.All ? matching.Count : Math.Min(e.Count ?? 1, matching.Count);
                foreach (var perm in matching.Take(n)) TransformPermanent(state, perm.PermanentId, e.ToTokenId);
                break;
            }
            case DestroySelfEffect:
                if (frame.SourcePermanentId != null) DestroyPermanent(state, frame.SourcePermanentId, depth);
                break;
            case DestroyImpressionEffect e:
            {
                var owner = e.Owner == RelSide.Self ? controller : controller.OpponentOf();
                int count = e.Count ?? 1;
                var targets = state.Field
                    .Where(p => p.Kind == PermanentKinds.Impression && p.Owner == owner)
                    .OrderBy(p => p.ArrivalOrder)
                    .Take(count)
                    .ToList();
                foreach (var t in targets) DestroyPermanent(state, t.PermanentId, depth);
                break;
            }
            case ApplyRestrictionEffect e:
            {
                var r = e.Restriction;
                string target = r.Target == RelTargets.Both
                    ? "both"
                    : r.Target == RelTargets.Self ? controller.ToKey() : controller.OpponentOf().ToKey();
                string? linked =
                    frame.Kind == FrameKinds.Play && state.PendingPlay?.Destination == PlayDestinations.FieldImpression
                        ? state.PendingPlay.ReservedPermanentId
                        : frame.SourcePermanentId != null &&
                          state.Field.Any(p => p.PermanentId == frame.SourcePermanentId && p.Kind == PermanentKinds.Impression)
                            ? frame.SourcePermanentId
                            : null;
                state.Restrictions.Add(new ActiveRestriction
                {
                    Id = NewId(state, "restr"),
                    Type = r.Type,
                    Target = target,
                    Value = r.Value,
                    ConditionThreshold = r.ConditionThreshold,
                    Expiry = r.Expiry?.Clone(),
                    LinkedPermanentId = linked,
                });
                Log(state, "restriction", $"Restriction {r.Type} applied to {target}",
                    new Dictionary<string, object?> { ["type"] = r.Type, ["target"] = target, ["value"] = r.Value });
                break;
            }
            case ApplyReplacementEffect e:
            {
                string? linked =
                    frame.Kind == FrameKinds.Play && state.PendingPlay?.Destination == PlayDestinations.FieldImpression
                        ? state.PendingPlay.ReservedPermanentId
                        : null;
                state.Replacements.Add(new ActiveReplacement
                {
                    Id = NewId(state, "repl"),
                    OriginalTokenId = e.OriginalTokenId,
                    ReplacementTokenId = e.ReplacementTokenId,
                    Expiry = e.Expiry?.Clone(),
                    LinkedPermanentId = linked,
                });
                Log(state, "replacement", $"Replacement {e.OriginalTokenId} → {e.ReplacementTokenId} active");
                break;
            }
            case ScheduleEffectsEffect e:
                state.ScheduledEffects.Add(new ScheduledEffectEntry
                {
                    Id = NewId(state, "sched"),
                    Effects = e.Effects,
                    Controller = controller,
                    At = e.At.Clone(),
                });
                Log(state, "scheduled", $"Effects scheduled for {e.At.Boundary} (+{e.At.Occurrences})");
                break;
            case ChooseNumberEffect e:
                state.PendingBlock = new ChooseNumberBlock(e.Min, e.Max, frame.FrameId);
                break;
            case CopyFromNpcDeckEffect e:
            {
                int? wantCost = e.CostEquals != null ? Quantities.EvalQuantity(e.CostEquals, state, ctx) : null;
                var candidates = state.Npc.Deck.Where(c =>
                {
                    var def = GetDef(state, c.DefinitionId);
                    if (wantCost != null && def.Cost != wantCost) return false;
                    if (e.WithShieldBreak && !def.Effects.Any(x => x is BreakShieldsEffect { Target: RelSide.Opponent }))
                        return false;
                    return true;
                }).ToList();
                int copies = Math.Max(0, Scaled(state, e.Count, effect, ctx));
                int? overrideCost = e.PatienceCostOverride != null ? Quantities.EvalQuantity(e.PatienceCostOverride, state, ctx) : null;
                for (int i = 0; i < copies && candidates.Count > 0; i++)
                {
                    var pick = candidates[RandomIndex(state, candidates.Count)];
                    state.Player.Hand.Add(new CardInstance
                    {
                        InstanceId = NewId(state, "card"),
                        DefinitionId = pick.DefinitionId,
                        Owner = Side.Player,
                        PatienceCostOverride = overrideCost,
                    });
                    Log(state, "copy", $"Copied {GetDef(state, pick.DefinitionId).Name} from NPC deck",
                        new Dictionary<string, object?>
                        {
                            ["definitionId"] = pick.DefinitionId,
                            ["patienceCostOverride"] = overrideCost,
                        });
                }
                break;
            }
            case RevealNpcHandEffect:
                state.NpcHandRevealed = true;
                Log(state, "reveal-hand", "NPC hand revealed");
                break;
            case HideNpcHandEffect:
                state.NpcHandRevealed = false;
                Log(state, "reveal-hand", "NPC hand hidden");
                break;
            case RevealNpcDeckTopEffect:
                state.NpcDeckTopRevealed = true;
                break;
            case HideNpcDeckTopEffect:
                state.NpcDeckTopRevealed = false;
                break;
            case DeckRevealEffect e:
            {
                var side = controller.OpponentOf();
                var cards = state.SideOf(side).Deck.Take(e.Count).Select(c => c.DefinitionId).ToList();
                state.PendingBlock = new DeckRevealBlock(cards);
                break;
            }
            case CancelStagedCardEffect:
                if (state.StagedCard != null && !state.StagedCancelled)
                {
                    state.StagedCancelled = true;
                    Log(state, "cancel", $"Staged card {GetDef(state, state.StagedCard.DefinitionId).Name} cancelled",
                        new Dictionary<string, object?> { ["definitionId"] = state.StagedCard.DefinitionId });
                }
                break;
            case IncrementCountersEffect e:
            {
                int amount = Scaled(state, e.Amount, effect, ctx);
                if (amount <= 0) break;
                // Static amplifiers on other permanents (v1.4 §3.10).
                foreach (var p in state.Field)
                {
                    foreach (var amp in GetDef(state, p.DefinitionId).CounterAmplifiers ?? [])
                    {
                        if (amp.CounterName != e.CounterName) continue;
                        if (amp.TargetDefinitionId != null && e.TargetDefinitionId != "self" && amp.TargetDefinitionId != e.TargetDefinitionId)
                            continue;
                        amount += amp.Extra;
                    }
                }
                var targets = e.TargetDefinitionId == "self"
                    ? state.Field.Where(p => p.PermanentId == frame.SourcePermanentId).ToList()
                    : state.Field.Where(p => p.DefinitionId == e.TargetDefinitionId).ToList();
                foreach (var t in targets)
                {
                    t.Counters[e.CounterName] = t.Counters.GetValueOrDefault(e.CounterName) + amount;
                    Log(state, "counters",
                        $"+{amount} {e.CounterName} on {GetDef(state, t.DefinitionId).Name} ({t.Counters[e.CounterName]})",
                        new Dictionary<string, object?>
                        {
                            ["permanentId"] = t.PermanentId,
                            ["counterName"] = e.CounterName,
                            ["total"] = t.Counters[e.CounterName],
                        });
                }
                break;
            }
            case ReshuffleDeckEffect:
            {
                var s = state.SideOf(controller);
                var combined = new List<CardInstance>(s.Deck);
                combined.AddRange(s.Discard);
                s.Deck = ShuffleInState(state, combined);
                s.Discard = [];
                Log(state, "recycle", $"{controller.ToKey()} discard reshuffled into deck");
                break;
            }
        }
    }

    // ── Thresholds & transform conditions (v1.4 §3.10) ──────────────────────

    public static void RunThresholdChecks(CombatState state, Side afterController, int depth)
    {
        var ordered = state.Field.OrderBy(p => p.ArrivalOrder).ToList();
        foreach (var perm in ordered)
        {
            if (!state.Field.Contains(perm)) continue; // may have transformed/left
            var def = GetDef(state, perm.DefinitionId);
            foreach (var th in def.Thresholds ?? [])
            {
                string point = th.CheckPoint ?? CheckPoints.AfterNpcPlay;
                if (point == CheckPoints.AfterNpcPlay && afterController != Side.Npc) continue;
                if (perm.Counters.GetValueOrDefault(th.CounterName) >= th.Value)
                {
                    if (th.Consume)
                    {
                        perm.Counters[th.CounterName] = perm.Counters.GetValueOrDefault(th.CounterName) - th.Value;
                    }
                    Log(state, "threshold", $"Threshold fires on {def.Name} ({th.CounterName} ≥ {th.Value})",
                        new Dictionary<string, object?> { ["permanentId"] = perm.PermanentId });
                    PushFrame(state, new EffectFrame
                    {
                        FrameId = "",
                        Kind = FrameKinds.Threshold,
                        Controller = perm.Owner,
                        Effects = th.Effects,
                        Depth = depth + 1,
                        SourcePermanentId = perm.PermanentId,
                    });
                }
            }
            if (def.TransformCondition != null)
            {
                var ctx = new EvalContext { Controller = perm.Owner, SourcePermanentId = perm.PermanentId };
                if (Quantities.EvalCondition(def.TransformCondition.Condition, state, ctx))
                {
                    TransformPermanent(state, perm.PermanentId, def.TransformCondition.IntoDefinitionId);
                }
            }
        }
    }

    // ── The run loop ─────────────────────────────────────────────────────────

    private static void PopFrame(CombatState state)
    {
        if (state.EffectStack.Count == 0) return;
        var frame = state.EffectStack[^1];
        state.EffectStack.RemoveAt(state.EffectStack.Count - 1);
        if (frame.Kind == FrameKinds.Trap && frame.SourcePermanentId != null)
        {
            var perm = state.Field.Find(p => p.PermanentId == frame.SourcePermanentId);
            if (perm != null)
            {
                var def = GetDef(state, perm.DefinitionId);
                if (!def.TrapPersistent)
                {
                    // Fired traps move to their owner's discard (v1.4 §3.6).
                    DestroyPermanent(state, perm.PermanentId, frame.Depth, new DestroyOptions { FireLeaveTriggers = false });
                }
            }
        }
    }

    private static void ApplyBreakOutcome(CombatState state, EffectFrame frame)
    {
        var o = frame.BreakOutcome;
        if (o == null) return;
        if (o.PatienceCost > 0) ModifyPatience(state, -o.PatienceCost, frame.Controller, frame.Depth);
        // Real-card and Core shields discard their card; Placeholders were never
        // real cards and are removed from the game (v1.4 §3.4; Brief §7 trap 7).
        if (o.CardInstanceId != null && o.CardDefinitionId != null)
        {
            state.Player.Discard.Add(new CardInstance
            {
                InstanceId = o.CardInstanceId,
                DefinitionId = o.CardDefinitionId,
                Owner = Side.Player,
            });
            Log(state, "shield-card-discarded", $"Broken shield card {GetDef(state, o.CardDefinitionId).Name} → player discard");
        }
    }

    /// <summary>
    /// Run the effect stack until it suspends (pendingBlock), halts, or
    /// empties. When it empties with an in-flight play, the play's completion
    /// steps run (§6.3.4–6 / §6.6.4–5) — always, on every path (Brief §7 trap 2).
    /// </summary>
    public static void RunStack(CombatState state)
    {
        int guard = 0;
        while (state.PendingBlock == null && !state.ResolutionHalted)
        {
            if (++guard > 10000)
            {
                state.ResolutionHalted = true;
                Log(state, "error", "Resolution guard tripped (10000 iterations) — halted");
                return;
            }
            var frame = state.EffectStack.Count > 0 ? state.EffectStack[^1] : null;
            if (frame != null)
            {
                if (frame.Kind == FrameKinds.BreakOutcome)
                {
                    state.EffectStack.RemoveAt(state.EffectStack.Count - 1);
                    ApplyBreakOutcome(state, frame);
                    continue;
                }
                if (frame.Index >= frame.Effects.Count)
                {
                    PopFrame(state);
                    continue;
                }
                var effect = frame.Effects[frame.Index];
                frame.Index += 1;
                ExecuteEffect(state, effect, frame);
                continue;
            }
            // Stack empty: advance play completion if a play is in flight.
            if (state.PendingPlay != null &&
                !(state.PendingPlay.LockCheckDone && state.PendingPlay.Moved &&
                  state.PendingPlay.ResolvedDispatched && state.PendingPlay.ThresholdsDone))
            {
                AdvancePlayCompletion(state);
                continue;
            }
            break;
        }
        if (state.EffectStack.Count == 0 && state.PendingBlock == null)
        {
            // Resolution cycle complete: persistent traps may arm again (§3.6).
            foreach (var p in state.Field) p.FiredThisResolution = false;
        }
    }

    // ── Card play sequencing ─────────────────────────────────────────────────

    public sealed record EffectivePlay(
        CardDefinition Def,
        IReadOnlyList<Effect> Effects,
        int Cost,
        bool ConvertedToPonder,
        string? DiscoveredNuggetId);

    /// <summary>
    /// Resolve the effective definition for a play: nugget override / Ponder
    /// conversion for Information Cards (v1.4 §3.9), Heavy Hand doubling
    /// handled by the caller via EffectiveCardCost.
    /// </summary>
    public static EffectivePlay ResolveEffectivePlay(CombatState state, CardInstance card, bool heavyHand)
    {
        var printed = GetDef(state, card.DefinitionId);
        if (printed.Supertype == Supertypes.Information)
        {
            var over = state.Config.NuggetOverrides.FirstOrDefault(o => o.NuggetId == printed.NuggetId);
            if (over != null)
            {
                bool discovered = printed.NuggetId != null && !state.DiscoveredNuggetIds.Contains(printed.NuggetId);
                return new EffectivePlay(printed, over.Effects, over.Cost, false, discovered ? printed.NuggetId : null);
            }
            var ponder = PonderDef(state);
            return new EffectivePlay(printed, ponder.Effects, ponder.Cost, true, null);
        }
        var effects = heavyHand && printed.HeavyHandEffects != null ? printed.HeavyHandEffects : printed.Effects;
        return new EffectivePlay(printed, effects, printed.Cost, false, null);
    }

    public static string PlayDestination(CardDefinition def, bool convertedToPonder)
    {
        if (convertedToPonder) return PlayDestinations.Discard;
        if (def.Subtype == Subtypes.Impression) return PlayDestinations.FieldImpression;
        if (def.Subtype == Subtypes.Trap) return PlayDestinations.FieldTrap;
        if (def.ReturnToDeck) return PlayDestinations.Deck;
        return PlayDestinations.Discard;
    }

    /// <summary>
    /// Begin a card play (either side) — §6.3 steps 0–3 / §6.6 steps 1–3.
    /// Costs are step 0 and never repeat (§6.7 inv. 6). Caller validates
    /// playability.
    /// </summary>
    public static void BeginPlay(CombatState state, Side controller, CardInstance card, bool heavyHand)
    {
        var eff = ResolveEffectivePlay(state, card, heavyHand);
        int cost = EffectiveCardCost(state, controller, eff.Cost, heavyHand);

        // Step 0/1: deduct full cost — meter may go negative, no floor except
        // PRIORITY_FLOOR restrictions, no Patience spill (v1.4 §3.1/§3.2).
        ModifyPriority(state, controller, -cost);
        state.SideOf(controller).CardsPlayedThisTurn += 1;
        state.AbilityFiresThisPlay = new Dictionary<string, int>();

        // Per-card patience costs from restrictions (v1.4 §9.1).
        foreach (var r in RestrictionsFor(state, controller, RestrictionTypes.PatienceCostPerCard))
        {
            ModifyPatience(state, -(r.Value ?? 0), controller);
        }
        // Copied-card patience rider (v1.4 §8.5).
        if (card.PatienceCostOverride is > 0)
        {
            ModifyPatience(state, -card.PatienceCostOverride.Value, controller);
        }

        string destination = PlayDestination(eff.Def, eff.ConvertedToPonder);
        state.PendingPlay = new PendingPlay
        {
            CardInstanceId = card.InstanceId,
            DefinitionId = eff.Def.Id,
            Controller = controller,
            HeavyHand = heavyHand,
            Destination = destination,
            ReservedPermanentId =
                destination is PlayDestinations.FieldImpression or PlayDestinations.FieldTrap ? NewId(state, "perm") : null,
            Components = card.Components,
            LockCheckDone = controller == Side.Npc, // lock check is a player-play step (§6.3.4)
            Moved = false,
            ResolvedDispatched = false,
            ThresholdsDone = false,
            ChosenNumber = null,
        };

        Log(state, "play",
            $"{controller.ToKey()} plays {eff.Def.Name}{(heavyHand ? " (Heavy Hand)" : "")}{(eff.ConvertedToPonder ? " → Ponder" : "")}",
            new Dictionary<string, object?>
            {
                ["definitionId"] = eff.Def.Id,
                ["controller"] = controller.ToKey(),
                ["cost"] = cost,
                ["heavyHand"] = heavyHand,
                ["convertedToPonder"] = eff.ConvertedToPonder,
            });

        if (eff.ConvertedToPonder && eff.Def.NuggetId != null && !state.PlayedNonRelevantCards.Contains(eff.Def.Id))
        {
            state.PlayedNonRelevantCards.Add(eff.Def.Id);
        }
        if (eff.DiscoveredNuggetId != null)
        {
            state.DiscoveredNuggetIds.Add(eff.DiscoveredNuggetId);
            Log(state, "discovery", $"Nugget discovered: {eff.DiscoveredNuggetId}",
                new Dictionary<string, object?> { ["nuggetId"] = eff.DiscoveredNuggetId });
        }

        // Step 2: dispatch CARD_PLAYED; apply Lie keyword (v1.4 §6.3.2).
        if (eff.Def.Keywords.Contains(Engine.Keywords.Lie) && !eff.ConvertedToPonder)
        {
            state.LieCounter += 1;
            Log(state, "lie", $"Lie Counter → {state.LieCounter}");
        }
        DispatchEvent(state, new EngineEvent
        {
            Type = EventTypes.CardPlayed,
            Controller = controller,
            CardInstanceId = card.InstanceId,
            CardDefId = eff.Def.Id,
            CardCost = cost,
        }, 0);

        // Step 3: the play's effect list. Traps defer their printed effects (§3.6).
        var playEffects = destination == PlayDestinations.FieldTrap ? (IReadOnlyList<Effect>)[] : eff.Effects;
        var frame = PushFrame(state, new EffectFrame
        {
            FrameId = "",
            Kind = FrameKinds.Play,
            Controller = controller,
            Effects = playEffects,
            Depth = 0,
            PlayCardInstanceId = card.InstanceId,
            ChosenNumber = null,
        });

        // Rapport prediction is chosen at play time — including for Traps,
        // whose printed effects are deferred (v1.4 §8.3).
        if (eff.Def.Rapport != null && !eff.ConvertedToPonder)
        {
            state.PendingBlock = new ChooseNumberBlock(eff.Def.Rapport.Min, eff.Def.Rapport.Max, frame.FrameId);
        }
    }

    private static void AdvancePlayCompletion(CombatState state)
    {
        var pp = state.PendingPlay;
        if (pp == null) return;

        // §6.3 step 4 — lock check (player Information Card keys, guards down).
        if (!pp.LockCheckDone)
        {
            pp.LockCheckDone = true;
            var def = GetDef(state, pp.DefinitionId);
            if (def.Supertype == Supertypes.Information && def.NuggetId != null && state.NpcGuardsStanding == 0)
            {
                int idx = state.NpcCoreShields.FindIndex(s => !s.Broken && s.KeyNuggetIds.Contains(def.NuggetId));
                if (idx != -1)
                {
                    BreakNpcCoreShield(state, idx, 0);
                    return; // suspends on Reveal Pending; completion resumes after ACK
                }
            }
            return;
        }

        // §6.3 step 5 / §6.6 step 4 — move the card to its destination. Runs on
        // every path, including resumption after a Reveal (Brief §7 trap 2).
        if (!pp.Moved)
        {
            pp.Moved = true;
            var side = pp.Controller;
            var card = new CardInstance { InstanceId = pp.CardInstanceId, DefinitionId = pp.DefinitionId, Owner = side };
            var printed = GetDef(state, pp.DefinitionId);
            // Assemble results are virtual: their components discard instead (§11).
            var components = pp.Components;
            var sideState = state.SideOf(side);
            switch (pp.Destination)
            {
                case PlayDestinations.Discard:
                    if (components is { Count: > 0 }) sideState.Discard.AddRange(components);
                    else sideState.Discard.Add(card);
                    break;
                case PlayDestinations.Deck:
                {
                    var combined = new List<CardInstance>(sideState.Deck);
                    if (components is { Count: > 0 }) combined.AddRange(components);
                    else combined.Add(card);
                    sideState.Deck = ShuffleInState(state, combined);
                    break;
                }
                case PlayDestinations.FieldImpression:
                    AddPermanent(state, PermanentKinds.Impression, printed.Id, side,
                        permanentId: pp.ReservedPermanentId,
                        cardInstanceId: card.InstanceId,
                        rapportPrediction: pp.ChosenNumber);
                    break;
                case PlayDestinations.FieldTrap:
                    AddPermanent(state, PermanentKinds.Trap, printed.Id, side,
                        permanentId: pp.ReservedPermanentId,
                        cardInstanceId: card.InstanceId,
                        rapportPrediction: pp.ChosenNumber);
                    break;
                case PlayDestinations.Removed:
                    break;
            }
            return;
        }

        // §6.3 step 6 / §6.6 step 5 — CARD_RESOLVED + trigger resolution.
        if (!pp.ResolvedDispatched)
        {
            pp.ResolvedDispatched = true;
            var def = GetDef(state, pp.DefinitionId);
            DispatchEvent(state, new EngineEvent
            {
                Type = EventTypes.CardResolved,
                Controller = pp.Controller,
                CardInstanceId = pp.CardInstanceId,
                CardDefId = def.Id,
                CardCost = def.Cost,
            }, 0);
            return;
        }

        // §6.6 step 5 — threshold checks (v1.4 §3.10).
        if (!pp.ThresholdsDone)
        {
            pp.ThresholdsDone = true;
            RunThresholdChecks(state, pp.Controller, 0);
        }
    }

    /// <summary>True when the in-flight play (if any) has fully completed.</summary>
    public static bool PlayFullyResolved(CombatState state)
    {
        var pp = state.PendingPlay;
        if (pp == null) return true;
        return pp.LockCheckDone && pp.Moved && pp.ResolvedDispatched && pp.ThresholdsDone &&
               state.EffectStack.Count == 0 && state.PendingBlock == null;
    }

    public static void FinishPlayIfDone(CombatState state)
    {
        if (state.PendingPlay != null && PlayFullyResolved(state))
        {
            state.PendingPlay = null;
        }
    }

    // ── NPC staging (v1.4 §6.6 / §3.6) ──────────────────────────────────────

    /// <summary>
    /// Stage an NPC hand card: CARD_STAGED fires before any cost or effect —
    /// cancel traps live in this window. Returns true if the card survived.
    /// </summary>
    public static bool StageNpcCard(CombatState state, int handIndex)
    {
        var card = handIndex >= 0 && handIndex < state.Npc.Hand.Count ? state.Npc.Hand[handIndex] : null;
        if (card == null) throw new InvalidOperationException("No such NPC hand card");
        state.Npc.Hand.RemoveAt(handIndex);
        state.StagedCard = card;
        state.StagedCancelled = false;
        var def = GetDef(state, card.DefinitionId);
        Log(state, "staged", $"NPC stages {def.Name}", new Dictionary<string, object?> { ["definitionId"] = card.DefinitionId });

        DispatchEvent(state, new EngineEvent
        {
            Type = EventTypes.CardStaged,
            Controller = Side.Npc,
            CardInstanceId = card.InstanceId,
            CardDefId = def.Id,
            CardCost = def.Cost,
        }, 0);
        RunStack(state);

        if (state.PendingBlock != null) return true; // caller re-enters after unblock (rare: trap with CHOOSE_NUMBER)

        if (state.StagedCancelled)
        {
            // Cancelled: to NPC discard exactly once; resolution never begins (§6.7.5).
            state.Npc.Discard.Add(card);
            state.StagedCard = null;
            state.StagedCancelled = false;
            Log(state, "cancelled", $"{def.Name} was cancelled — its resolution never begins");
            return false;
        }
        return true;
    }

    /// <summary>NPC can act: positive Priority, non-empty hand, play caps not reached (§4.4/§10).</summary>
    public static bool NpcCanAct(CombatState state) =>
        state.Npc.Priority >= 1 && state.Npc.Hand.Count > 0 && !MaxPlaysReached(state, Side.Npc);
}
