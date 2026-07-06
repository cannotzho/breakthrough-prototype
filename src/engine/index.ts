/**
 * Breakthrough combat engine — public API.
 * Pure, framework-agnostic, no card-ID logic (v1.4 §15).
 */
export * from './types';
export { reduce } from './reducer';
export { buildInitialState, type SetupInput } from './setup';
export { validateCard, validateEncounter, assertValid, type ValidationIssue } from './validation';
export { evalQuantity, evalCondition, type EvalContext } from './quantities';
export {
  HAND_LIMIT,
  REAL_SHIELD_PLACEMENT_COST,
  TRIGGER_DEPTH_CAP,
  BOTM_BASE_LIMIT,
  effectiveBotmLimit,
  effectiveCardCost,
  resolveEffectivePlay,
  npcCanAct,
} from './core';
export { shuffleWithRng, nextRandom } from './rng';
