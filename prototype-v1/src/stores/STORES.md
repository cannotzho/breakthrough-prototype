# Zustand Stores

## Dev tool stores (active)

`collectionStore.ts` — `useDevCardStore`: persistent store for cards created/edited via Dev tools. Persists to the `cards` table in Supabase (jsonb `data` column). Hydrates on page load; writes are optimistic. Includes `importFromLocalStorage()` for one-time migration from the old `btdev-cards` localStorage key.

`encounterStore.ts` — `useDevEncounterStore`: persistent store for encounter configs created/edited via Dev tools. Persists to the `encounters` table in Supabase (jsonb `data` column). Hydrates on page load; writes are optimistic. Includes `importFromLocalStorage()` for one-time migration from the old `btdev-encounters` localStorage key.

## Game session stores (integration stubs)

`saveStore.ts` — persists per-encounter save data (broken shield indices, played non-relevant cards). Intended to support save/restore of encounter progress so a player can retry an encounter with the same state it was left in. Not yet wired into the game loop.
