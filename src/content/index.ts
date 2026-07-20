/**
 * Content registry — everything the engine consumes as data.
 *
 * Since the Option-B pipeline flip (Ken sign-off, 2026-07-19) the canonical
 * content store is the checked-in JSON at `content/content.json`, edited by
 * the Godot in-game Card Designer (godot/designer/). This module is a thin
 * typed loader over that bundle; the former authored TS files
 * (cards-*.ts, tokens.ts, nuggets.ts, encounters.ts, helpers.ts) are retired
 * and live in git history. Do not re-introduce card data as TS code.
 *
 * The Supabase "Seed" flow and all UI/devtools consume these same exports,
 * unchanged.
 */
import type { CardDefinition, CombinationRecipe, EncounterConfig, InfoNugget } from '../engine';
import bundle from '../../content/content.json';

interface ContentBundle {
  cards: Record<string, CardDefinition>;
  tokens: Record<string, CardDefinition>;
  nuggets: Record<string, InfoNugget>;
  encounters: Record<string, EncounterConfig>;
  recipes: CombinationRecipe[];
  devCollectionIds: string[];
  starterDeckLists: Record<string, string[]>;
}

const content = bundle as unknown as ContentBundle;

/** Full card registry (tokens included — they resolve through getDef too). */
export const ALL_CARDS: Record<string, CardDefinition> = content.cards;

export const TOKENS: Record<string, CardDefinition> = content.tokens;

export const NUGGETS: Record<string, InfoNugget> = content.nuggets;

export const ENCOUNTERS: Record<string, EncounterConfig> = content.encounters;

/** Global Assemble recipes (v1.4 §11). */
export const RECIPES: CombinationRecipe[] = content.recipes;

/** Default player collection for dev playtesting. */
export const DEV_COLLECTION_IDS: string[] = content.devCollectionIds;

/** Curated starter deck lists (20 Skill cards is the design target, §2). */
export const STARTER_DECK_LISTS: Record<string, string[]> = content.starterDeckLists;
