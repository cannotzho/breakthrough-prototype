# Breakthrough Prototype

A detective card game prototype where you crack cases through card-based conversation combat.

**[Live Demo](https://cannotzho.github.io/breakthrough-prototype/)**

---

## Overview

Breakthrough is a detective game where every interrogation is a card battle. Instead of swords and spells, you wield arguments, observations, and psychological pressure. Each encounter is a tactical dialogue where reading the opponent, managing your deck, and breaking through their defenses determines whether you crack the case.

The prototype is a fully playable combat sandbox with a dev tool suite for authoring cards, encounters, and decks — all persisted to a Supabase backend.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 19 + TypeScript 5.6 |
| Build | Vite 6 |
| Styling | Tailwind CSS 3.4 |
| Animations | Framer Motion 12 |
| State | Zustand 5 (stores) + `useReducer` (combat engine) |
| Database | Supabase (PostgreSQL) |
| Deployment | GitHub Actions + GitHub Pages |

---

## Local Development

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # tsc -b + vite build
npm run lint       # eslint
npm run preview    # serve dist/ locally
```

> **Known issue:** Supabase credentials are currently hardcoded in `src/lib/supabaseClient.ts`. This is fine for the public prototype (anon key only), but should be moved to environment variables before any production use.

---

## App Flow

`App.tsx` is a flat screen router over five screens:

| Screen | Component | Purpose |
|--------|-----------|---------|
| `title` | `TitleScreen` | Main menu with Playtest button and dev tool navigation |
| `combat` | `CombatScreen` | Full combat encounter |
| `cardCollection` | `CardCollectionScreen` | Browse and author cards |
| `encounterGallery` | `EncounterGalleryScreen` | Create, edit, and playtest encounters |
| `deckBuilder` | `DeckBuilderScreen` | Build curated decks from the card pool |

From the title screen, "Playtest" launches combat with the default test encounter. The three dev tool screens (Card Collection, Encounter Gallery, Deck Builder) each wrap a corresponding component from `src/components/dev/`.

---

## Combat System

### Core Loop

The goal is to drain the opponent's **Patience** (their resolve) to zero by playing cards. The opponent plays from their own deck and can break your shields in return.

### Key Concepts

| Term | Meaning |
|------|---------|
| **Priority** | Your action resource. Cards cost Priority to play. How it works depends on the Priority Mode (see below). |
| **Patience** | The opponent's resolve meter. Drain it to zero to win the encounter. |
| **Shields** | Defensive slots on both sides. Breaking an opponent shield reveals lore and can trigger effects. Losing a player shield costs Patience. |
| **Back of Mind (BotM)** | When you lose priority, you keep a limited number of cards (default 1). The rest are discarded. BotM cards can still be played during the opponent's turn. |
| **Lie Counter** | Cards with the **Lie** keyword increment a counter. Exceed the encounter's lie threshold and you lose. |
| **Traits** | Hidden NPC properties (e.g. "Nervous") that modify combat behavior. Traits are revealed when their trigger condition fires. |
| **Info Nuggets** | Discoverable lore pieces tied to opponent shields. Breaking a shield can reveal a nugget, which is tracked in the nugget discovery store. |
| **Field Traps** | Cards with the **Trap** keyword are placed on the field instead of being discarded. They trigger automatically when a configured condition is met (e.g. opponent plays a card, shield breaks, patience/priority changes). |

### Priority Modes

The combat engine supports two distinct priority systems, configured per encounter:

**Frame Mode** (`priorityMode: 'frame'`):
- Single shared priority meter ranging from -10 to +10
- Priority > 0 = player's turn; priority <= 0 = opponent's turn
- Card costs deduct from priority; opponent plays increase it (self-limiting)
- When priority drops to 0 or below, a priority restore fires: resets to the encounter's `defaultRestorePriority`, merges BotM back, draws cards, and expires field traps

**Classic Mode** (`priorityMode: 'classic'`):
- Separate priority meters for player and NPC, each starting at `startingPriority`
- Explicit turn alternation via `activeTurn` flag (`'player'` | `'npc'`)
- Each play deducts from the active player's meter; can't play if cost exceeds remaining priority
- Turn switches when the active player's priority hits 0 or below

### Shields

- **Dummy Shields**: Basic shields. Cost 1 Patience when broken (0 if the card has the Safety keyword).
- **Core Shields**: Configurable shields with a custom `patienceCostOnBreak` value, defined in the encounter's `allowedCoreShields`.
- **Shield Triggers**: Cards with the `Shield Trigger` keyword queue for automatic effect resolution when their shield is broken.

### Keywords

| Keyword | Effect |
|---------|--------|
| **Safety** | Dummy shield costs 0 Patience when broken |
| **Assemble** | Can be combined with another Assemble card via the combination system |
| **Shield Trigger** | Effects fire automatically when this card's shield is broken |
| **Lie** | Increments the lie counter when played |
| **Trap** | Placed on the field; triggers when its condition is met |

### Card Effects

Cards can have one or more effects: `BREAK_OPPONENT_SHIELD`, `BREAK_PLAYER_SHIELD`, `MODIFY_PRIORITY`, `MODIFY_PATIENCE`, `DRAW_CARDS`, `PLACE_AS_SHIELD`, `INCREMENT_LIE_COUNTER`, `PLACE_IMPRESSION`.

---

## Persistence

### Supabase (primary)

All dev-authored content is persisted to Supabase via Zustand stores:

| Table | Store | Content |
|-------|-------|---------|
| `cards` | `useDevCardStore` | Card definitions (JSONB) |
| `encounters` | `useDevEncounterStore` | Encounter configs (JSONB) |
| `info_nuggets` | `useNuggetStore` | Discoverable lore pieces |
| `decks` | `useDeckStore` | Curated card decks |
| `encounter_relevant_cards` | `useEncounterRelevantCardStore` | Nugget-to-card override mappings per encounter |
| `nugget_discovery` | `useNuggetDiscoveryStore` | Runtime nugget discovery tracking |

Schema is in `supabase/schema.sql`. All tables use permissive RLS (anon key access).

### Local-only

`useSaveStore` uses Zustand's `persist` middleware with `localStorage` (key: `breakthrough-saves`) for per-encounter save state. Not yet wired into the main game loop.

### Legacy localStorage migration

`collectionStore` and `encounterStore` expose `importFromLocalStorage()` for migrating from the old `btdev-cards` / `btdev-encounters` localStorage keys.

---

## Project Structure

```
src/
├── App.tsx                          # Screen router
├── main.tsx                         # React entry point
├── index.css                        # Tailwind + custom animations
│
├── combat/
│   ├── types.ts                     # CombatState, CardDefinition, EncounterConfig, etc.
│   ├── combatReducer.ts             # Pure reducer (CombatState, CombatAction) → CombatState
│   └── effectHandlers.ts            # shuffle, drawCards, applyEffect, breakPlayerShield, etc.
│
├── screens/
│   ├── TitleScreen.tsx              # Main menu
│   ├── CombatScreen.tsx             # Combat orchestrator (~1370 lines)
│   ├── CardCollectionScreen.tsx     # Card browser wrapper
│   ├── EncounterGalleryScreen.tsx   # Encounter editor wrapper
│   └── DeckBuilderScreen.tsx        # Deck builder wrapper
│
├── components/
│   ├── combat/
│   │   ├── PriorityBar.tsx          # Priority meter visualization
│   │   └── PatienceDisplay.tsx      # Opponent patience bar
│   └── dev/
│       ├── DevPanel.tsx             # Tabbed dev overlay (slides in during combat)
│       ├── CardEditorForm.tsx       # Card creation/editing form
│       ├── CardGalleryGrid.tsx      # Paginated card grid with filtering
│       ├── CardCollection.tsx       # Card CRUD manager
│       ├── DeckBuilder.tsx          # Deck composition tool
│       ├── EncounterEditor.tsx      # Encounter CRUD + shield/trait/nugget editors
│       ├── SupabaseStatus.tsx       # Connection status + localStorage import
│       └── IssueSubmitButton.tsx    # Floating GitHub issue reporter
│
├── data/
│   ├── devCards.ts                  # DEV_SKILL_CARDS, DEV_ENEMY_CARDS, PONDER_DEFINITION
│   ├── encounterDefs.ts            # TEST_ENCOUNTER, CLASSIC_TEST_ENCOUNTER, buildInitialCombatState()
│   └── combinations.ts             # COMBINATIONS[] (card merge recipes, currently empty)
│
├── stores/
│   ├── collectionStore.ts           # useDevCardStore — card CRUD + Supabase sync
│   ├── encounterStore.ts            # useDevEncounterStore — encounter CRUD + Supabase sync
│   ├── nuggetStore.ts               # useNuggetStore — info nugget CRUD + Supabase sync
│   ├── deckStore.ts                 # useDeckStore — deck CRUD + Supabase sync
│   ├── nuggetDiscoveryStore.ts      # useNuggetDiscoveryStore — discovery tracking
│   ├── encounterRelevantCardStore.ts # useEncounterRelevantCardStore — nugget overrides
│   └── saveStore.ts                 # useSaveStore — localStorage-only encounter saves
│
└── lib/
    └── supabaseClient.ts            # Supabase client singleton
```

### Combat Engine

The combat engine is intentionally framework-agnostic — `combatReducer.ts` and `effectHandlers.ts` have zero React imports. The reducer is a pure function `(CombatState, CombatAction) → CombatState` that can be ported to any runtime.

`CombatScreen.tsx` wires the reducer into React via `useReducer`, owns phase-transition timers (via `useEffect`), and handles all drag-and-drop card interactions.

---

## Dev Panel

During combat, pressing the dev toggle opens a slide-in panel with six tabs:

| Tab | Purpose |
|-----|---------|
| **State** | Combat state manipulation: encounter preset switcher (Frame/Classic), manual enemy mode, phase selector, priority/patience/lie sliders, shield break buttons, quick-add cards to hand, set staged enemy card |
| **Cards** | Inline card creator (name, cost, color, keywords, effects) |
| **Nuggets** | Info nugget override creator |
| **Encounters** | Full encounter editor with shield/trait/nugget-override sub-editors, JSON import/export, playtest launcher |
| **Collection** | Card gallery with create/edit/duplicate, filtering, Supabase status |
| **Decks** | Deck selector with card list management |

The dev panel also has a collapsible log drawer showing the combat action log.

---

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via `.github/workflows/deploy.yml`.
