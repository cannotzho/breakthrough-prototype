/**
 * Authoritative combination recipe table for Breakthrough.
 *
 * Each recipe is an unordered pair of ingredient card IDs that combine into
 * a result card. The combination logic in combatEngine.ts reads this array;
 * the `combinesFrom` field on CardDef is kept as an informational annotation only.
 *
 * To add a new recipe: append an entry here. The combat engine will pick it up
 * automatically — no changes to CardDef or the reducer are needed.
 */

export interface CombinationRecipe {
  ingredients: [string, string];
  result: string;
}

export const COMBINATIONS: CombinationRecipe[] = [
  // "A Better Way Out" — She Doesn't Want This + Persuade
  { ingredients: ['maryannInsightReluctance', 'persuade'], result: 'promiseCard' },

  // TODO (#64): { ingredients: ['maryannInsightObligation', 'persuade'], result: 'promiseCardObligation' }
  //             once the Shield-2 locked mechanic is implemented
];
