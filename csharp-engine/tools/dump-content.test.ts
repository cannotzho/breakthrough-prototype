/**
 * Content export for the C# engine port (csharp-engine/).
 *
 * Serializes the bundled TS content layer (cards, tokens, nuggets, encounters,
 * recipes, dev collection, starter deck lists) to
 * csharp-engine/Breakthrough.Engine.Tests/content.json so the ported C# test
 * suite consumes the exact same data the TS suite does — content stays a data
 * layer, never re-expressed as code.
 *
 * Run with:  npx vitest run csharp-engine/tools/dump-content.test.ts
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import {
  ALL_CARDS,
  DEV_COLLECTION_IDS,
  ENCOUNTERS,
  NUGGETS,
  RECIPES,
  STARTER_DECK_LISTS,
  TOKENS,
} from '../../src/content';

it('exports the content bundle for the C# test suite', () => {
  const bundle = {
    cards: ALL_CARDS,
    tokens: TOKENS,
    nuggets: NUGGETS,
    encounters: ENCOUNTERS,
    recipes: RECIPES,
    devCollectionIds: DEV_COLLECTION_IDS,
    starterDeckLists: STARTER_DECK_LISTS,
  };
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'Breakthrough.Engine.Tests', 'content.json');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(bundle, null, 2));
  expect(Object.keys(ALL_CARDS).length).toBeGreaterThan(0);
});
