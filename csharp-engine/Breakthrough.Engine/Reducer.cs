// The public reducer: Reduce(state, action) → state.
//
// 1:1 C# port of src/engine/reducer.ts. Pure by construction — the incoming
// state is deep-cloned before any mutation (§6.7 inv. 12; the TS engine uses
// structuredClone(prev), mirrored by CombatState.Clone()). Identical
// (state, action) inputs yield identical outputs, which is what makes dual
// playtest byte-identical (Brief §4).

namespace Breakthrough.Engine;

public sealed class IllegalActionException(string message) : Exception(message);

public static class Reducer
{
    private static void AssertPhase(CombatState state, params string[] phases)
    {
        if (!phases.Contains(state.Phase))
        {
            throw new IllegalActionException($"Action not legal in phase {state.Phase} (expected {string.Join("/", phases)})");
        }
    }

    /// <summary>Playability rule (v1.4 §3.1): Priority-spending actions need a positive meter.</summary>
    private static void AssertPositivePriority(CombatState state, Side side)
    {
        if (state.SideOf(side).Priority < 1)
        {
            throw new IllegalActionException($"{side.ToKey()} is locked out: Priority must be ≥ 1 to initiate a Priority-spending action");
        }
    }

    public static CombatState Reduce(CombatState prev, CombatAction action)
    {
        var state = prev.Clone();
        try
        {
            Apply(state, action);
        }
        catch (IllegalActionException e)
        {
            // Illegal actions are rejected without state change (log-only clone).
            var rejected = prev.Clone();
            Core.Log(rejected, "illegal-action", e.Message, new Dictionary<string, object?> { ["action"] = ActionName(action) });
            return rejected;
        }
        return state;
    }

    /// <summary>TS action-type tag for the illegal-action log payload.</summary>
    private static string ActionName(CombatAction action) => action switch
    {
        PlayCard => "PLAY_CARD",
        PlaceShield => "PLACE_SHIELD",
        ActivateAbility => "ACTIVATE_ABILITY",
        Combine => "COMBINE",
        ResequenceShields => "RESEQUENCE_SHIELDS",
        EndTurn => "END_TURN",
        BotmSelect => "BOTM_SELECT",
        Acknowledge => "ACKNOWLEDGE",
        ChooseNumber => "CHOOSE_NUMBER",
        Advance => "ADVANCE",
        NpcPlayCard => "NPC_PLAY_CARD",
        NpcEndTurn => "NPC_END_TURN",
        _ => action.GetType().Name,
    };

    private static void Apply(CombatState state, CombatAction action)
    {
        // Blocking sub-states freeze all combat state (v1.4 §6.4/§6.7.1): only
        // the matching resume action is accepted while a block is pending.
        if (state.PendingBlock != null && action is not Acknowledge && action is not ChooseNumber)
        {
            throw new IllegalActionException($"Combat is suspended on {PendingBlockName(state.PendingBlock)} — acknowledge it first");
        }
        if (state.Result != null)
        {
            throw new IllegalActionException("The encounter has ended");
        }
        switch (action)
        {
            case PlayCard a:
            {
                AssertPhase(state, Phases.PlayerPending);
                AssertPositivePriority(state, Side.Player);
                var card = a.HandIndex >= 0 && a.HandIndex < state.Player.Hand.Count ? state.Player.Hand[a.HandIndex] : null;
                if (card == null) throw new IllegalActionException("No such hand card");
                var def = Core.GetDef(state, card.DefinitionId);
                bool heavyHand = a.HeavyHand;
                if (heavyHand && !def.Keywords.Contains(Keywords.HeavyHand))
                {
                    throw new IllegalActionException("Card has no Heavy Hand mode");
                }
                if (Core.MaxPlaysReached(state, Side.Player)) throw new IllegalActionException("Max plays per turn reached");
                var eff = Core.ResolveEffectivePlay(state, card, heavyHand);
                int cost = Core.EffectiveCardCost(state, Side.Player, eff.Cost, heavyHand);
                if (Core.CostCapViolated(state, Side.Player, cost)) throw new IllegalActionException("Cost exceeds MAX_CARD_COST restriction");

                state.Player.Hand.RemoveAt(a.HandIndex);
                Core.BeginPlay(state, Side.Player, card, heavyHand);
                Core.RunStack(state);
                Core.FinishPlayIfDone(state);
                Boundaries.Check(state);
                return;
            }

            case PlaceShield a:
            {
                // Placement-only sequence (v1.4 §6.2): fixed 2 Priority,
                // printed effects do not resolve.
                AssertPhase(state, Phases.PlayerPending);
                AssertPositivePriority(state, Side.Player);
                if (a.HandIndex < 0 || a.HandIndex >= state.Player.Hand.Count) throw new IllegalActionException("No such hand card");
                Core.ModifyPriority(state, Side.Player, -Core.RealShieldPlacementCost);
                Core.PlaceRealShield(state, a.HandIndex);
                Core.RunStack(state); // PRIORITY_CHANGED may have armed subscribers
                Boundaries.Check(state);
                return;
            }

            case ActivateAbility a:
            {
                // v1.4 §5.3 — controller's turn only.
                AssertPhase(state, Phases.PlayerPending, Phases.EnemyPending);
                var perm = state.Field.Find(p => p.PermanentId == a.PermanentId);
                if (perm == null) throw new IllegalActionException("No such permanent");
                if (perm.Owner != state.ActiveTurn) throw new IllegalActionException("Not this permanent controller’s turn");
                var def = Core.GetDef(state, perm.DefinitionId);
                var ability = (def.ActivatedAbilities ?? []).FirstOrDefault(x => x.Id == a.AbilityId);
                if (ability == null) throw new IllegalActionException("No such ability");
                var side = perm.Owner;

                if (ability.Cost.Priority is > 0)
                {
                    AssertPositivePriority(state, side); // unusable at ≤ 0 (§5.3)
                }
                if (ability.Cost.Patience != null && state.Patience - ability.Cost.Patience.Value <= 0)
                {
                    throw new IllegalActionException("Cannot pay Patience cost that would reach ≤ 0");
                }
                int sac = ability.Cost.SacrificeShields ?? 0;
                if (side == Side.Player && sac > state.PlayerShields.Count)
                {
                    throw new IllegalActionException("Not enough shields to sacrifice");
                }
                var discards = a.DiscardIndices ?? [];
                if ((ability.Cost.DiscardCards ?? 0) != discards.Count)
                {
                    throw new IllegalActionException("Must choose exactly the required discards");
                }

                // Pay costs (step 0; never repeats).
                if (ability.Cost.Priority is not null and not 0) Core.ModifyPriority(state, side, -ability.Cost.Priority.Value);
                if (ability.Cost.Patience is not null and not 0) Core.ModifyPatience(state, -ability.Cost.Patience.Value, side);
                for (int i = 0; i < sac; i++)
                {
                    if (side == Side.Player) Core.BreakOnePlayerShield(state, side, 0);
                }
                if (discards.Count > 0)
                {
                    var sorted = discards.OrderByDescending(x => x).ToList();
                    foreach (int idx in sorted)
                    {
                        var c = idx >= 0 && idx < state.SideOf(side).Hand.Count ? state.SideOf(side).Hand[idx] : null;
                        if (c == null) throw new IllegalActionException("Bad discard index");
                        state.SideOf(side).Hand.RemoveAt(idx);
                        state.SideOf(side).Discard.Add(c);
                    }
                }
                Core.Log(state, "ability", $"{side.ToKey()} activates {ability.Name} on {def.Name}");
                Core.PushFrame(state, new EffectFrame
                {
                    FrameId = "",
                    Kind = FrameKinds.Activated,
                    Controller = side,
                    Effects = ability.Effects,
                    Depth = 0,
                    SourcePermanentId = perm.PermanentId,
                    ChosenNumber = perm.RapportPrediction,
                });
                Core.RunStack(state);
                Core.FinishPlayIfDone(state);
                Boundaries.Check(state);
                return;
            }

            case Combine a:
            {
                // v1.4 §11 — exactly two Assemble cards, recipe-based, free, no
                // state transition. Failed combinations leave the hand unchanged.
                AssertPhase(state, Phases.PlayerPending);
                var cardA = a.HandIndexA >= 0 && a.HandIndexA < state.Player.Hand.Count ? state.Player.Hand[a.HandIndexA] : null;
                var cardB = a.HandIndexB >= 0 && a.HandIndexB < state.Player.Hand.Count ? state.Player.Hand[a.HandIndexB] : null;
                if (cardA == null || cardB == null || a.HandIndexA == a.HandIndexB) throw new IllegalActionException("Bad combine indices");
                var defA = Core.GetDef(state, cardA.DefinitionId);
                var defB = Core.GetDef(state, cardB.DefinitionId);
                if (!defA.Keywords.Contains(Keywords.Assemble) || !defB.Keywords.Contains(Keywords.Assemble))
                {
                    throw new IllegalActionException("Both cards must have Assemble");
                }
                var recipe = state.Recipes.FirstOrDefault(r =>
                    (r.Ingredients[0] == cardA.DefinitionId && r.Ingredients[1] == cardB.DefinitionId) ||
                    (r.Ingredients[0] == cardB.DefinitionId && r.Ingredients[1] == cardA.DefinitionId));
                if (recipe == null)
                {
                    Core.Log(state, "combine-failed", $"No recipe for {defA.Name} + {defB.Name} — hand unchanged");
                    return;
                }
                int hi = Math.Max(a.HandIndexA, a.HandIndexB);
                int lo = Math.Min(a.HandIndexA, a.HandIndexB);
                state.Player.Hand.RemoveAt(hi);
                state.Player.Hand.RemoveAt(lo);
                var combined = new CardInstance
                {
                    InstanceId = Core.NewId(state, "card"),
                    DefinitionId = recipe.ResultCardId,
                    Owner = Side.Player,
                    Components = new List<CardInstance> { cardA, cardB },
                };
                state.Player.Hand.Add(combined);
                Core.Log(state, "combine", $"{defA.Name} + {defB.Name} → {Core.GetDef(state, recipe.ResultCardId).Name}");
                return;
            }

            case ResequenceShields a:
            {
                // Free action, own turn, no state transition (v1.4 §3.4/§6.2).
                AssertPhase(state, Phases.PlayerPending);
                int n = state.PlayerShields.Count;
                var order = a.Order;
                bool badPermutation = order.Count != n || order.OrderBy(x => x).Where((v, i) => v != i).Any();
                if (badPermutation)
                {
                    throw new IllegalActionException("Order must be a permutation of current slots");
                }
                state.PlayerShields = order.Select(i => state.PlayerShields[i]).ToList();
                Core.Log(state, "resequence", "Player resequenced shield row");
                return;
            }

            case EndTurn:
            {
                // §4.2 step 1 — the player's explicit acknowledgement; legal at
                // any Priority value (no automatic handoff, §3.1).
                AssertPhase(state, Phases.PlayerPending);
                state.TurnEndPending = true;
                Core.DispatchEvent(state, new EngineEvent { Type = EventTypes.PlayerTurnEnd, Controller = Side.Player }, 0);
                Core.RunStack(state);
                if (state.PendingBlock != null) return; // resume via ACK/CHOOSE, then continue below
                ContinueEndTurn(state);
                return;
            }

            case BotmSelect a:
            {
                // §4.2 step 2 — fires ONLY from Player Turn End (§6.5).
                AssertPhase(state, Phases.BotMSelect);
                int limit = Core.EffectiveBotmLimit(state);
                var keep = a.KeepHandIndices.Distinct().ToList();
                if (keep.Count > limit) throw new IllegalActionException($"Back of Mind limit is {limit}");
                if (keep.Any(i => i < 0 || i >= state.Player.Hand.Count)) throw new IllegalActionException("Bad hand index");
                var kept = new List<CardInstance>();
                var rest = new List<CardInstance>();
                for (int i = 0; i < state.Player.Hand.Count; i++)
                {
                    (keep.Contains(i) ? kept : rest).Add(state.Player.Hand[i]);
                }
                state.BackOfMind = kept;
                state.Player.Discard.AddRange(rest);
                state.Player.Hand = [];
                Core.Log(state, "botm", $"Kept {kept.Count} card(s) in Back of Mind; discarded {rest.Count}");
                state.TurnEndPending = false;
                Boundaries.Handoff(state, Side.Player); // §4.2.3 → §4.3
                Boundaries.Check(state);
                return;
            }

            case Acknowledge:
            {
                if (state.PendingBlock is not RevealBlock and not DeckRevealBlock)
                {
                    throw new IllegalActionException("Nothing to acknowledge");
                }
                state.PendingBlock = null;
                ResumeAfterUnblock(state);
                return;
            }

            case ChooseNumber a:
            {
                if (state.PendingBlock is not ChooseNumberBlock block)
                {
                    throw new IllegalActionException("No number choice pending");
                }
                if (a.Value < block.Min || a.Value > block.Max)
                    throw new IllegalActionException($"Choose between {block.Min} and {block.Max}");
                var frame = state.EffectStack.Find(f => f.FrameId == block.FrameId);
                if (frame != null) frame.ChosenNumber = a.Value;
                if (state.PendingPlay != null) state.PendingPlay.ChosenNumber = a.Value;
                Core.Log(state, "choose-number", $"Number chosen: {a.Value}");
                state.PendingBlock = null;
                ResumeAfterUnblock(state);
                return;
            }

            case Advance:
            {
                // Drive the NPC turn one play (auto policy: leftmost hand card, §10).
                AssertPhase(state, Phases.EnemyPending);
                NpcStep(state, 0);
                return;
            }

            case NpcPlayCard a:
            {
                // Manual enemy / dual playtest: human choice replaces the
                // leftmost-play policy; all other transitions identical
                // (v1.4 §10, Brief §4).
                AssertPhase(state, Phases.EnemyPending);
                if (a.HandIndex < 0 || a.HandIndex >= state.Npc.Hand.Count) throw new IllegalActionException("No such NPC hand card");
                NpcStep(state, a.HandIndex);
                return;
            }

            case NpcEndTurn:
            {
                // The NPC turn ends automatically (§4.4); an explicit end is
                // only a no-op safety for manual mode when the NPC genuinely
                // cannot act.
                AssertPhase(state, Phases.EnemyPending);
                if (Core.NpcCanAct(state)) throw new IllegalActionException("NPC can still act — its turn ends automatically (§4.4)");
                Boundaries.Check(state);
                return;
            }
        }
    }

    private static string PendingBlockName(PendingBlock block) => block switch
    {
        RevealBlock => "reveal",
        ChooseNumberBlock => "chooseNumber",
        DeckRevealBlock => "deckReveal",
        _ => block.GetType().Name,
    };

    /// <summary>Stage + resolve one NPC play (§6.6). Shared by auto and manual paths.</summary>
    private static void NpcStep(CombatState state, int handIndex)
    {
        if (!Core.NpcCanAct(state))
        {
            Boundaries.Check(state); // routes to NPC Turn End
            return;
        }
        bool survived = Core.StageNpcCard(state, handIndex);
        if (state.PendingBlock != null) return; // rare: trap suspension inside staged window
        if (!survived)
        {
            Boundaries.Check(state); // cancelled: skip directly to Check (§6.6)
            return;
        }
        var card = state.StagedCard!;
        state.StagedCard = null;
        Core.BeginPlay(state, Side.Npc, card, false);
        Core.RunStack(state);
        Core.FinishPlayIfDone(state);
        Boundaries.Check(state);
    }

    /// <summary>Continue an END_TURN once the event window has fully resolved.</summary>
    private static void ContinueEndTurn(CombatState state)
    {
        if (state.Player.Hand.Count > 0)
        {
            state.Phase = Phases.BotMSelect; // §4.2.2 (blocking)
            return;
        }
        state.TurnEndPending = false;
        Boundaries.Handoff(state, Side.Player);
        Boundaries.Check(state);
    }

    /// <summary>Single resume path for all blocking sub-states (one suspension mechanism).</summary>
    private static void ResumeAfterUnblock(CombatState state)
    {
        Core.RunStack(state);
        if (state.PendingBlock != null) return;

        // A cancelled staged card that suspended mid-window still discards once.
        if (state.StagedCard != null && state.StagedCancelled && state.PendingPlay == null)
        {
            state.Npc.Discard.Add(state.StagedCard);
            Core.Log(state, "cancelled", "Staged card cancelled — moved to NPC discard");
            state.StagedCard = null;
            state.StagedCancelled = false;
            Boundaries.Check(state);
            return;
        }
        // Staged card that survived a suspension window: resolve its play now.
        if (state.StagedCard != null && state.PendingPlay == null && state.ActiveTurn == Side.Npc)
        {
            var card = state.StagedCard;
            state.StagedCard = null;
            Core.BeginPlay(state, Side.Npc, card, false);
            Core.RunStack(state);
            if (state.PendingBlock != null) return;
        }
        Core.FinishPlayIfDone(state);
        if (state.PendingBlock != null) return;
        if (state.TurnEndPending && state.ActiveTurn == Side.Player && state.PendingPlay == null && state.EffectStack.Count == 0)
        {
            ContinueEndTurn(state);
            return;
        }
        Boundaries.Check(state);
    }
}
