# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

Node.js is installed in user scope — if `npm` isn't found in PowerShell, run `$env:PATH += ";$env:APPDATA\npm"` first.

```
npm run dev       # dev server at http://localhost:5173
npm run build     # tsc -b + vite build
npm run lint      # eslint .
npm run preview   # serve the dist/ build locally
```

There are no tests. Type-check alone: `npx tsc --noEmit`.

## Project Overview

> **Design authority:** `Breakthrough_Design.md` is the authoritative source of truth for all game design decisions. This file (`CLAUDE.md`) documents code structure only.

Breakthrough is a detective card game. The original prototype is `breakthrough.html` (vanilla JS, single file). The active codebase uses Vite + React 19 + TypeScript + Tailwind CSS 3.4.

The core mechanic: the player conducts interrogations using cards. Both sides have **shields**. Draining the opponent's **Patience** to zero wins the encounter. Losing all player shields or exceeding the **Lie** threshold loses.

## Architecture

### App flow

`App.tsx` is a flat screen router over a `Screen` union type:

```
title → combat | cardCollection | encounterGallery | deckBuilder
```

- **`title`** — `TitleScreen.tsx`: main menu with Playtest button and dev tool navigation
- **`combat`** — `CombatScreen.tsx`: full combat encounter (accepts optional `encounterConfig`)
- **`cardCollection`** — `CardCollectionScreen.tsx`: card browser/editor
- **`encounterGallery`** — `EncounterGalleryScreen.tsx`: encounter editor with playtest launcher
- **`deckBuilder`** — `DeckBuilderScreen.tsx`: deck composition tool

### Combat engine

The combat engine is intentionally framework-agnostic — split across three files with zero React imports in the engine layer:

| File | Role |
|------|------|
| `src/combat/types.ts` | All TypeScript types: `CombatState`, `CombatAction`, `CardDefinition`, `EncounterConfig`, etc. |
| `src/combat/combatReducer.ts` | Pure reducer `(CombatState, CombatAction) → CombatState`. Large switch over 24+ action types. |
| `src/combat/effectHandlers.ts` | Pure helpers: `shuffle`, `drawCards`, `applyEffect`, `breakPlayerShieldAutomatic`, `priorityRestore`, `classicTurnStart`, `npcTurnStart`, `resolveFieldTriggerCheck`, etc. |

`CombatScreen.tsx` wires the reducer into React via `useReducer`, owns phase-transition `useEffect` timers, and handles all drag-and-drop card interactions.

**Priority modes:** Two distinct priority systems, configured per encounter via `priorityMode`:

- **Frame** (`'frame'`): Single shared priority meter (−10 to +10). Priority > 0 = player acts; ≤ 0 = opponent acts. Card costs deduct from priority; opponent plays increase it. Priority restore fires on drop to ≤ 0.
- **Classic** (`'classic'`): Separate priority meters for player and NPC. Explicit turn alternation via `activeTurn` flag. Each play deducts from the active player's meter. Turn switches when priority hits 0.

**Shields:** Two types — `dummy` (basic, costs 1 Patience on break, 0 with Safety keyword) and `core` (custom `patienceCostOnBreak`). Cards with the `Shield Trigger` keyword queue effects when their shield is broken.

**Field Traps:** Cards with the `Trap` keyword are placed on the field. Each has a `TrapTriggerCondition` (trigger type + optional comparator/value). Traps fire automatically during `FieldTriggerCheck` phase. Resolved FIFO with `MAX_TRIGGER_DEPTH` (20) recursion protection.

**Back of Mind (BotM):** When the player loses priority, they keep up to `backOfMindLimit` cards (default 1); the rest discard. BotM cards can be played during the opponent's turn.

**Traits:** NPC properties stored in `config.traits[]`. Start hidden (`discovered: false`), revealed when their trigger fires (e.g. the `sensitive` trait adds +1 Patience damage).

**Keywords:** `Safety`, `Assemble`, `Shield Trigger`, `Lie`, `Trap`.

**Combinations:** `COMBINATIONS` in `src/data/combinations.ts` is the recipe list (currently empty). The engine supports combining two `Assemble`-keyword cards via the `COMBINE` action.

### Data layer

| File | Content |
|------|---------|
| `src/data/devCards.ts` | `DEV_SKILL_CARDS` (player cards), `DEV_ENEMY_CARDS` (NPC cards), `PONDER_DEFINITION` (fallback draw card) |
| `src/data/encounterDefs.ts` | `TEST_ENCOUNTER` (Frame mode), `CLASSIC_TEST_ENCOUNTER` (Classic mode), `buildInitialCombatState()` factory |
| `src/data/combinations.ts` | `COMBINATIONS` array — card merge recipes (currently empty) |

### Persistence

**Supabase** is the primary persistence layer. Schema is in `supabase/schema.sql`. Six tables: `cards`, `encounters`, `info_nuggets`, `decks`, `encounter_relevant_cards`, `nugget_discovery`.

**Zustand stores** in `src/stores/` manage all data access:

| Store | File | Table | Purpose |
|-------|------|-------|---------|
| `useDevCardStore` | `collectionStore.ts` | `cards` | Card CRUD with Supabase sync |
| `useDevEncounterStore` | `encounterStore.ts` | `encounters` | Encounter CRUD with Supabase sync |
| `useNuggetStore` | `nuggetStore.ts` | `info_nuggets` | Info nugget CRUD with Supabase sync |
| `useDeckStore` | `deckStore.ts` | `decks` | Deck CRUD with Supabase sync |
| `useEncounterRelevantCardStore` | `encounterRelevantCardStore.ts` | `encounter_relevant_cards` | Nugget override mappings |
| `useNuggetDiscoveryStore` | `nuggetDiscoveryStore.ts` | `nugget_discovery` | Runtime discovery tracking |
| `useSaveStore` | `saveStore.ts` | — (localStorage) | Per-encounter save state (not yet wired) |

The first four stores share a common pattern: fetch-on-init, optimistic set + async Supabase upsert, delete-on-id-change, and (for `collectionStore`/`encounterStore`) `importFromLocalStorage()` for legacy migration.

Supabase credentials are hardcoded in `src/lib/supabaseClient.ts` (anon key only — safe for the public prototype).

### Components

**Combat UI** (`src/components/combat/`):
- `PriorityBar.tsx` — bidirectional priority meter
- `PatienceDisplay.tsx` — opponent patience bar

**Dev tools** (`src/components/dev/`):
- `DevPanel.tsx` — slide-in tabbed overlay during combat (State, Cards, Nuggets, Encounters, Collection, Decks tabs + log drawer)
- `CardEditorForm.tsx` — card creation/editing form with keyword/effect editors
- `CardGalleryGrid.tsx` — paginated card grid with filtering
- `CardCollection.tsx` — card CRUD manager (gallery + create/edit views)
- `DeckBuilder.tsx` — deck composition tool with card gallery
- `EncounterEditor.tsx` — encounter CRUD with shield/trait/nugget-override sub-editors
- `SupabaseStatus.tsx` — connection status + localStorage import
- `IssueSubmitButton.tsx` — floating GitHub issue reporter (global)

## Adding Cards

Cards are now authored via the dev UI (Card Collection screen or DevPanel's Collection tab) and persisted to Supabase — no source file editing required.

To add a card programmatically, use `useDevCardStore.getState().addCard(cardDef)` with a `CardDefinition` object. Required fields: `id` (unique), `name`, `cost`, `color` (ColorIdentity), `supertype` (`'Skill'` | `'Information'`), `effects` (array of `CardEffect`). Optional: `keywords`, `subtype` (`'Impression'` | `'Trap'`), `effectText`, `longDescription`, `nuggetId`, `trapTrigger` (for Trap cards).

For hardcoded test cards, add entries to `DEV_SKILL_CARDS` or `DEV_ENEMY_CARDS` in `src/data/devCards.ts`.

## Adding Encounters

Encounters are authored via the Encounter Gallery screen or DevPanel's Encounters tab and persisted to Supabase.

To add a hardcoded test encounter, add an `EncounterConfig` to `src/data/encounterDefs.ts`. Key fields: `id`, `displayName`, `priorityMode` (`'frame'` | `'classic'`), `startingPriority`, `defaultRestorePriority`, `opponentPatience`, `opponentShields[]`, `playerDummyShieldSlots`, `enemyDeckCardIds[]`, `traits[]`, `lieThreshold`.

## Adding Combination Recipes

Append to `COMBINATIONS` in `src/data/combinations.ts`:

```ts
{ ingredients: ['cardIdA', 'cardIdB'], result: resultCardDefinition }
```

Both ingredient cards must have the `Assemble` keyword. The engine picks up new recipes automatically.
