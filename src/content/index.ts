/** Content registry — everything the engine consumes as data. */
import type { CardDefinition, CombinationRecipe } from '../engine';
import { BLUE_STARTER_CARDS, GREEN_STARTER_CARDS, ORANGE_STARTER_CARDS, RED_STARTER_CARDS } from './cards-starters';
import { FCP_CARDS } from './cards-fcp';
import { DEV_ENEMY_CARDS, DEV_SKILL_CARDS, INFORMATION_CARDS, PONDER } from './cards-core';
import { TOKENS } from './tokens';
import { NUGGETS } from './nuggets';
import { ENCOUNTERS, FAN_CLUB_PRESIDENT_ENCOUNTER, TEST_ENCOUNTER } from './encounters';

export { BLUE_STARTER_CARDS, RED_STARTER_CARDS, GREEN_STARTER_CARDS, ORANGE_STARTER_CARDS };
export { FCP_CARDS, DEV_SKILL_CARDS, DEV_ENEMY_CARDS, INFORMATION_CARDS, PONDER };
export { TOKENS, NUGGETS, ENCOUNTERS, TEST_ENCOUNTER, FAN_CLUB_PRESIDENT_ENCOUNTER };

export const CARD_SETS: Record<string, CardDefinition[]> = {
  'Blue Starter Deck': BLUE_STARTER_CARDS,
  'Red Starter Deck': RED_STARTER_CARDS,
  'Green Starter Deck': GREEN_STARTER_CARDS,
  'Orange Starter Deck': ORANGE_STARTER_CARDS,
  'Fan Club President': FCP_CARDS,
  'Dev Cards': DEV_SKILL_CARDS,
  'Dev Enemy Cards': DEV_ENEMY_CARDS,
  'Information Cards': INFORMATION_CARDS,
};

/** Full card registry (tokens included — they resolve through getDef too). */
export const ALL_CARDS: Record<string, CardDefinition> = Object.fromEntries(
  [
    PONDER,
    ...BLUE_STARTER_CARDS,
    ...RED_STARTER_CARDS,
    ...GREEN_STARTER_CARDS,
    ...ORANGE_STARTER_CARDS,
    ...FCP_CARDS,
    ...DEV_SKILL_CARDS,
    ...DEV_ENEMY_CARDS,
    ...INFORMATION_CARDS,
    ...Object.values(TOKENS),
  ].map((c) => [c.id, c]),
);

export const RECIPES: CombinationRecipe[] = [
  // Global Assemble recipes (v1.4 §11). None authored yet.
];

/** Default player collection for dev playtesting. */
export const DEV_COLLECTION_IDS: string[] = Object.keys(ALL_CARDS).filter(
  (id) => ALL_CARDS[id].subtype !== 'Token',
);

/** Curated starter deck lists (20 Skill cards is the design target, §2). */
export const STARTER_DECK_LISTS: Record<string, string[]> = {
  blue: BLUE_STARTER_CARDS.map((c) => c.id),
  red: RED_STARTER_CARDS.map((c) => c.id),
  green: GREEN_STARTER_CARDS.map((c) => c.id),
  orange: ORANGE_STARTER_CARDS.map((c) => c.id),
  dev: [...DEV_SKILL_CARDS, ...DEV_SKILL_CARDS, ...DEV_SKILL_CARDS].map((c) => c.id),
};
