# Zustand Stores

## Dev tool stores (active)

`collectionStore.ts` — `useDevCardStore`: persistent store for cards created/edited via Dev tools. Uses `btdev-cards` localStorage key. Cards are keyed by ID and survive page reloads. Backs the Card Collection viewer/editor in DevPanel.

`encounterStore.ts` — `useDevEncounterStore`: persistent store for encounter configs created/edited via Dev tools. Uses `btdev-encounters` localStorage key. Encounters are keyed by ID and survive page reloads. Backs the Encounter Config editor in DevPanel.

## Game session stores (integration stubs)

`saveStore.ts` — persists per-encounter save data (broken shield indices, played non-relevant cards). Intended to support save/restore of encounter progress so a player can retry an encounter with the same state it was left in. Not yet wired into the game loop.
