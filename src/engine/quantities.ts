/**
 * Quantity and condition evaluation. All scales/conditions in card data reduce
 * to these two functions — the engine contains no card-specific logic.
 */
import type { CombatState, Condition, EngineEvent, Quantity, Side } from './types';
import { opponentOf } from './types';

export interface EvalContext {
  controller: Side;
  event?: EngineEvent;
  chosenNumber?: number | null;
  sourcePermanentId?: string;
}

function resolveSide(rel: 'self' | 'opponent', ctx: EvalContext): Side {
  return rel === 'self' ? ctx.controller : opponentOf(ctx.controller);
}

function countBreakEffects(state: CombatState, defId: string): number {
  const def = state.cards[defId] ?? state.tokens[defId];
  if (!def) return 0;
  let n = 0;
  for (const e of def.effects) {
    if (e.type === 'BREAK_SHIELDS' && e.target === 'opponent') n += e.count;
  }
  return n;
}

export function evalQuantity(q: Quantity, state: CombatState, ctx: EvalContext): number {
  switch (q.kind) {
    case 'CONST':
      return q.value;
    case 'PATIENCE':
      return state.patience;
    case 'MISSING_PATIENCE':
      return Math.max(0, state.startingPatience - state.patience);
    case 'PRIORITY':
      return state[resolveSide(q.side, ctx)].priority;
    case 'ROUND':
      return state.round;
    case 'LIE_COUNTER':
      return state.lieCounter;
    case 'CARDS_PLAYED_THIS_TURN':
      return state[resolveSide(q.side, ctx)].cardsPlayedThisTurn;
    case 'EXTRA_DRAWS_THIS_TURN':
      return state[resolveSide(q.side, ctx)].extraDrawsThisTurn;
    case 'PRIORITY_GAINED_THIS_TURN':
      return state[resolveSide(q.side, ctx)].priorityGainedThisTurn;
    case 'OPP_SHIELDS_BROKEN_BY_PLAYER_THIS_TURN':
      return state.oppShieldsBrokenByPlayerThisTurn;
    case 'OPP_SHIELDS_BROKEN_BY_PLAYER_PREV_TURN':
      return state.oppShieldsBrokenByPlayerPrevTurn;
    case 'PLAYER_SHIELDS_BROKEN_BY_NPC_THIS_TURN':
      return state.playerShieldsBrokenByNpcThisTurn;
    case 'GUARDS_PLACED_BY_NPC_THIS_TURN':
      return state.guardsPlacedByNpcThisTurn;
    case 'NPC_GUARDS_STANDING':
      return state.npcGuardsStanding;
    case 'CHOSEN_NUMBER':
      return ctx.chosenNumber ?? 0;
    case 'COUNTER': {
      if (q.permanentDefId === 'self') {
        const perm = state.field.find((p) => p.permanentId === ctx.sourcePermanentId);
        return perm?.counters[q.counterName] ?? 0;
      }
      let total = 0;
      for (const p of state.field) {
        if (p.definitionId === q.permanentDefId) total += p.counters[q.counterName] ?? 0;
      }
      return total;
    }
    case 'DECK_CARDS_MATCHING_COST': {
      const side = resolveSide(q.side, ctx);
      const cost = evalQuantity(q.cost, state, ctx);
      return state[side].deck.filter((c) => {
        const def = state.cards[c.definitionId] ?? state.tokens[c.definitionId];
        return def != null && def.cost === cost;
      }).length;
    }
    case 'SHIELDS_STANDING': {
      const side = resolveSide(q.side, ctx);
      if (side === 'player') return state.playerShields.length;
      return state.npcGuardsStanding + state.npcCoreShields.filter((s) => !s.broken).length;
    }
    case 'STAGED_CARD_COST': {
      if (!state.stagedCard) return 0;
      return (state.cards[state.stagedCard.definitionId] ?? state.tokens[state.stagedCard.definitionId])?.cost ?? 0;
    }
    case 'STAGED_CARD_BREAK_COUNT': {
      if (!state.stagedCard) return 0;
      return countBreakEffects(state, state.stagedCard.definitionId);
    }
    case 'EVENT_DELTA':
      return ctx.event?.delta ?? 0;
    case 'EVENT_DELTA_ABS':
      return Math.abs(ctx.event?.delta ?? 0);
    case 'EVENT_NEW_VALUE':
      return ctx.event?.newValue ?? 0;
    case 'EVENT_CARD_COST':
      return ctx.event?.cardCost ?? 0;
    case 'EVENT_IS_OWN_SHIELD':
      return ctx.event?.shieldSide != null && ctx.event.shieldSide === ctx.controller ? 1 : 0;
  }
}

export function evalCondition(c: Condition, state: CombatState, ctx: EvalContext): boolean {
  if ('compare' in c) {
    const lhs = evalQuantity(c.compare.lhs, state, ctx);
    const rhs = evalQuantity(c.compare.rhs, state, ctx);
    switch (c.compare.op) {
      case 'lt':
        return lhs < rhs;
      case 'lte':
        return lhs <= rhs;
      case 'gt':
        return lhs > rhs;
      case 'gte':
        return lhs >= rhs;
      case 'eq':
        return lhs === rhs;
      case 'neq':
        return lhs !== rhs;
    }
  }
  if ('all' in c) return c.all.every((x) => evalCondition(x, state, ctx));
  if ('any' in c) return c.any.some((x) => evalCondition(x, state, ctx));
  return !evalCondition(c.not, state, ctx);
}
