// Quantity and condition evaluation. All scales/conditions in card data reduce
// to these two functions — the engine contains no card-specific logic.
//
// 1:1 C# port of src/engine/quantities.ts.

namespace Breakthrough.Engine;

public sealed class EvalContext
{
    public required Side Controller { get; init; }
    public EngineEvent? Event { get; init; }
    public int? ChosenNumber { get; init; }
    public string? SourcePermanentId { get; init; }
}

public static class Quantities
{
    private static Side ResolveSide(RelSide rel, EvalContext ctx) =>
        rel == RelSide.Self ? ctx.Controller : ctx.Controller.OpponentOf();

    private static int CountBreakEffects(CombatState state, string defId)
    {
        var def = state.Cards.GetValueOrDefault(defId) ?? state.Tokens.GetValueOrDefault(defId);
        if (def == null) return 0;
        int n = 0;
        foreach (var e in def.Effects)
        {
            if (e is BreakShieldsEffect { Target: RelSide.Opponent } b) n += b.Count;
        }
        return n;
    }

    public static int EvalQuantity(Quantity q, CombatState state, EvalContext ctx)
    {
        switch (q)
        {
            case ConstQ c:
                return c.Value;
            case PatienceQ:
                return state.Patience;
            case MissingPatienceQ:
                return Math.Max(0, state.StartingPatience - state.Patience);
            case PriorityQ p:
                return state.SideOf(ResolveSide(p.Side, ctx)).Priority;
            case RoundQ:
                return state.Round;
            case LieCounterQ:
                return state.LieCounter;
            case CardsPlayedThisTurnQ p:
                return state.SideOf(ResolveSide(p.Side, ctx)).CardsPlayedThisTurn;
            case ExtraDrawsThisTurnQ p:
                return state.SideOf(ResolveSide(p.Side, ctx)).ExtraDrawsThisTurn;
            case PriorityGainedThisTurnQ p:
                return state.SideOf(ResolveSide(p.Side, ctx)).PriorityGainedThisTurn;
            case OppShieldsBrokenByPlayerThisTurnQ:
                return state.OppShieldsBrokenByPlayerThisTurn;
            case OppShieldsBrokenByPlayerPrevTurnQ:
                return state.OppShieldsBrokenByPlayerPrevTurn;
            case PlayerShieldsBrokenByNpcThisTurnQ:
                return state.PlayerShieldsBrokenByNpcThisTurn;
            case GuardsPlacedByNpcThisTurnQ:
                return state.GuardsPlacedByNpcThisTurn;
            case NpcGuardsStandingQ:
                return state.NpcGuardsStanding;
            case ChosenNumberQ:
                return ctx.ChosenNumber ?? 0;
            case CounterQ c:
            {
                if (c.PermanentDefId == "self")
                {
                    var perm = state.Field.Find(p => p.PermanentId == ctx.SourcePermanentId);
                    return perm?.Counters.GetValueOrDefault(c.CounterName) ?? 0;
                }
                int total = 0;
                foreach (var p in state.Field)
                {
                    if (p.DefinitionId == c.PermanentDefId) total += p.Counters.GetValueOrDefault(c.CounterName);
                }
                return total;
            }
            case DeckCardsMatchingCostQ d:
            {
                var side = ResolveSide(d.Side, ctx);
                int cost = EvalQuantity(d.Cost, state, ctx);
                return state.SideOf(side).Deck.Count(card =>
                {
                    var def = state.Cards.GetValueOrDefault(card.DefinitionId) ?? state.Tokens.GetValueOrDefault(card.DefinitionId);
                    return def != null && def.Cost == cost;
                });
            }
            case ShieldsStandingQ s:
            {
                var side = ResolveSide(s.Side, ctx);
                if (side == Side.Player) return state.PlayerShields.Count;
                return state.NpcGuardsStanding + state.NpcCoreShields.Count(x => !x.Broken);
            }
            case StagedCardCostQ:
            {
                if (state.StagedCard == null) return 0;
                var def = state.Cards.GetValueOrDefault(state.StagedCard.DefinitionId)
                          ?? state.Tokens.GetValueOrDefault(state.StagedCard.DefinitionId);
                return def?.Cost ?? 0;
            }
            case StagedCardBreakCountQ:
            {
                if (state.StagedCard == null) return 0;
                return CountBreakEffects(state, state.StagedCard.DefinitionId);
            }
            case EventDeltaQ:
                return ctx.Event?.Delta ?? 0;
            case EventDeltaAbsQ:
                return Math.Abs(ctx.Event?.Delta ?? 0);
            case EventNewValueQ:
                return ctx.Event?.NewValue ?? 0;
            case EventCardCostQ:
                return ctx.Event?.CardCost ?? 0;
            case EventIsOwnShieldQ:
                return ctx.Event?.ShieldSide != null && ctx.Event.ShieldSide == ctx.Controller ? 1 : 0;
            case EventIsExtraDrawQ:
                return ctx.Event?.ExtraDraw == true ? 1 : 0;
            default:
                throw new InvalidOperationException($"Unknown quantity kind {q.GetType().Name}");
        }
    }

    public static bool EvalCondition(Condition c, CombatState state, EvalContext ctx)
    {
        switch (c)
        {
            case CompareCondition cmp:
            {
                int lhs = EvalQuantity(cmp.Lhs, state, ctx);
                int rhs = EvalQuantity(cmp.Rhs, state, ctx);
                return cmp.Op switch
                {
                    Comparators.Lt => lhs < rhs,
                    Comparators.Lte => lhs <= rhs,
                    Comparators.Gt => lhs > rhs,
                    Comparators.Gte => lhs >= rhs,
                    Comparators.Eq => lhs == rhs,
                    Comparators.Neq => lhs != rhs,
                    _ => throw new InvalidOperationException($"Unknown comparator {cmp.Op}"),
                };
            }
            case AllCondition all:
                return all.Items.All(x => EvalCondition(x, state, ctx));
            case AnyCondition any:
                return any.Items.Any(x => EvalCondition(x, state, ctx));
            case NotCondition not:
                return !EvalCondition(not.Inner, state, ctx);
            default:
                throw new InvalidOperationException($"Unknown condition {c.GetType().Name}");
        }
    }
}
