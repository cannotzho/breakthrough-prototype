# Zustand Stores

This directory contains two Zustand stores that are currently integration stubs and are not yet wired into the game loop.

`collectionStore.ts` — manages the player's persistent card collection (skill cards, info cards, and discovered card IDs). Intended to replace the `bt_compendium` / `bt_collected` localStorage keys currently managed in `App.tsx`, once a full collection-management flow is implemented.

`saveStore.ts` — persists per-encounter save data (broken shield indices, played non-relevant cards). Intended to support save/restore of encounter progress so a player can retry an encounter with the same state it was left in.

Both stores will be wired in when collection management and encounter save/restore are implemented (tracked in issue #120).
