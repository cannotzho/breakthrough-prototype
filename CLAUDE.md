# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from `BreakthroughPrototype/` (Node.js is installed in user scope — if `npm` isn't found in PowerShell, run `$env:PATH += ";$env:APPDATA\npm"` first, or use `start-dev.cmd` in that folder).

```
npm run dev       # dev server at http://localhost:5173
npm run build     # tsc -b + vite build
npm run lint      # eslint .
npm run preview   # serve the dist/ build locally
```

There are no tests. Type-check alone: `npx tsc --noEmit`.

Dev tools route (dev build only): navigate to `http://localhost:5173/dev` — skips the game and opens the Card/Encounter/Playtest authoring UI.

## Project Overview

> **Design authority:** `Breakthrough_Design.md` is the authoritative source of truth for all game design decisions. This file (`CLAUDE.md`) documents code structure only.

Breakthrough is a detective card game. The original prototype is `breakthrough.html` (vanilla JS, single file). The active codebase is `BreakthroughPrototype/` — Vite + React 19 + TypeScript + Tailwind CSS v4.

The core mechanic: the player conducts interrogations using cards. Both sides have **shields** (hidden information slots). Breaking all opponent shields wins the conversation. Losing all player shields or draining the opponent's **patience** to zero ends it badly.

## Architecture

### App flow

`App.tsx` is a flat screen router (`AppScreen` union). Screens advance in this order:

1. **`overworld`** — canvas-rendered top-down map (`Overworld.tsx`); player walks to NPCs and items
2. **`deckbuilder`** — shown only if compendium exceeds 15 cards; player trims their world deck
3. **`deckpreview`** — review final deck before combat
4. **`shieldselector`** — pre-place world cards behind shields
5. **`combat`** — the full combat screen

`App.tsx` owns all persistent state (compendium, collectedCards, completedEncounters, personalDeck) and passes it down. On every page load, all `bt_*` localStorage keys are cleared so each session starts fresh.

### Combat engine

The combat engine is intentionally split across three files:

| File | Role |
|------|------|
| `src/combat/types.ts` | All TypeScript types: `CombatState`, `CombatAction`, `CardDef`, `EncounterConfig`, etc. |
| `src/combat/combatEngine.ts` | Pure reducer (`combatReducer`) and initialization (`initCombat`). Zero React imports. |
| `src/combat/effects.ts` | Pure helper functions: `shuffle`, `drawFromDeck`, `resolvePlayerEffect`, `resolveOpponentEffect`, `computeCardCost`. |
| `src/combat/Combat.ts` | `useCombat` hook — wires the reducer into `useReducer`, owns the opponent-action `setTimeout`, and exposes stable callbacks. |

`combatReducer` is a large switch over `CombatAction` types. It always returns a new `CombatState` — no mutations. `checkEndCondition` and `updatePhase` are called after every state-changing action; `recomputeCombinations` runs after any hand change.

**Priority system:** The shared `priority` counter runs from −10 to +10. Positive = attack phase (player acts); negative/zero = defense phase (opponent acts). Phase transitions fire `updatePhase`, which triggers `opponentActionTrigger` (the signal that `useCombat`'s `useEffect` watches to schedule `OPPONENT_ACT`).

**Back of Mind (BotM):** When the player loses priority, `awaitingBackOfMindChoice` is set — the player picks ≤3 cards to retain; the rest discard. Those retained cards become `backOfMind` and are the only cards playable during the opponent's turn (Instant type only).

**Combination cards:** `COMBINATIONS` in `src/data/combinations.ts` is the authoritative recipe list. `recomputeCombinations` scans it on every hand change to populate `availableCombinations`.

**CombatConfig:** Tunable parameters (starting cards, draw amounts, animation speed) live in `CombatState.combatConfig` and can be changed at runtime via `UPDATE_CONFIG`. Defaults are in `DEFAULT_COMBAT_CONFIG`.

### Data layer

| File | Content |
|------|---------|
| `src/data/cards.ts` | `CARDS` record (all card definitions), `STARTER_COMPENDIUM`, `DETECTIVE_PERSONAL_DECK` |
| `src/data/encounters.ts` | `ENCOUNTERS` record — two encounters: `gutterfang` and `maryann` |
| `src/data/combinations.ts` | `COMBINATIONS` array — recipe table for card combination |

At combat init, the player's chosen world deck is filtered through the encounter's `worldDeck` relevance list — any card not on that list is replaced with `ponder`. Personal cards and world cards are shuffled together into a single `worldDeck` draw pile.

### Overworld system

`Overworld.tsx` is a canvas game loop (`requestAnimationFrame`) with a fixed 1600×1200 map. Buildings, NPCs, and items are static arrays at the top of the file. Items have `lockedUntilEncounter` / `lockedUntilCompendium` gates — they become visible only when those conditions are met. The progressive `NOTE_ENTRIES` array drives what text appears in the player's Case Notes panel (gated by the same compendium conditions). Collected item state is stored under `bt_collected_items`.

### Dev tooling

`DevTools.tsx` is a tabbed authoring UI (Card Creator, Encounter Creator, Playtest, Notes). It's rendered when `window.location.pathname` ends with `/dev`. The Playtest tab renders `PlaytestCombat.tsx`, which runs the full combat engine with manual opponent control and a `CombatConfig` slider panel. Card Creator and Encounter Creator can write directly to source files via `dev-api/*` fetch endpoints (served by a Vite plugin — only available in dev mode).

### localStorage keys

`bt_` prefix — game session state, wiped on every page load by `App.tsx`:
- `bt_compendium` — player's current world card collection
- `bt_collected` — info cards obtained from broken shields
- `bt_beaten_encounters` — set of completed encounter IDs
- `bt_collected_items` — overworld items already picked up
- `bt_intro_seen` — flag suppressing the opening cutscene after first view

`btdev_` prefix — dev tool overrides, never wiped:
- `btdev_notes` — custom text shown in the Case Notes panel (overrides progressive reveal)
- `btdev_objective` — custom objective text shown in the overworld HUD

## Adding Cards

1. Add an entry to `CARDS` in `src/data/cards.ts`. The `id` must be a unique camelCase key. Set `supertype` (`Skill` / `Information`), `keywords` (any combination of `Interrupt` / `Safety` / `Assemble` / `Counter` / `Lie`), and `effects` (see `CardEffect` in `types.ts`).
2. Add the card ID to any encounter's `worldDeck` relevance list in `src/data/encounters.ts` if it should appear in that combat.
3. If it's a hidden info card (revealed when an opponent shield breaks, cost 0, empty effects), also add its ID to the encounter's `shieldLinks` array in the appropriate slot.
4. If it should be in the player's base personal deck, add it to `DETECTIVE_PERSONAL_DECK`; if it's only for a specific encounter, add it to that encounter's `personalDeck` array.

## Adding Encounters

Add an entry to `ENCOUNTERS` in `src/data/encounters.ts`. Required fields:
- `shieldLinks`: one card ID per opponent shield slot — the info card revealed when that shield breaks
- `worldDeck`: the relevance list — only these card IDs survive the Ponder conversion at init
- `disposition.vulnerable` / `resistant`: card IDs that deal double/half patience drain against this opponent
- `dialogue.onVulnerable` / `onResistant` / `onShieldBreak`: NPC reaction lines

To make the encounter accessible from the overworld, add an entry to `NPCS` in `Overworld.tsx` with a matching `encounterId`.

## Adding Combination Recipes

Append an entry to `COMBINATIONS` in `src/data/combinations.ts`:

```ts
{ ingredients: ['cardIdA', 'cardIdB'], result: 'resultCardId' }
```

The result card must exist in `CARDS`. The combat engine picks up new recipes automatically — no reducer changes needed. The `combinesFrom` annotation on `CardDef` is informational only; `combinations.ts` is authoritative.
