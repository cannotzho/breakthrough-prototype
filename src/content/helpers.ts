/** Authoring shorthands for content files (data only — no logic). */
import type { BoundaryRef, Comparator, Condition, Quantity } from '../engine';

export const K = (value: number): Quantity => ({ kind: 'CONST', value });

export const cmp = (lhs: Quantity, op: Comparator, rhs: Quantity | number): Condition => ({
  compare: { lhs, op, rhs: typeof rhs === 'number' ? K(rhs) : rhs },
});

export const at = (boundary: BoundaryRef['boundary'], occurrences = 1): BoundaryRef => ({
  boundary,
  occurrences,
});

export const PATIENCE: Quantity = { kind: 'PATIENCE' };
export const CHOSEN: Quantity = { kind: 'CHOSEN_NUMBER' };
export const SELF_PRIORITY: Quantity = { kind: 'PRIORITY', side: 'self' };
export const SELF_CARDS_PLAYED: Quantity = { kind: 'CARDS_PLAYED_THIS_TURN', side: 'self' };
export const OPP_DECK_MATCHING_CHOSEN: Quantity = {
  kind: 'DECK_CARDS_MATCHING_COST',
  side: 'opponent',
  cost: { kind: 'CHOSEN_NUMBER' },
};
