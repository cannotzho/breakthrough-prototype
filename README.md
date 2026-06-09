# Breakthrough Prototype

A detective card game prototype — 2D top-down overworld plus card-based conversation combat.

**[Live Demo](https://cannotzho.github.io/breakthrough-prototype/)**

---

## Overview

Breakthrough is a detective game where you explore a top-down world and engage NPCs in conversation combat. Instead of swords and spells, you wield arguments, observations, and psychological pressure. Each encounter is a card-based dialogue battle where reading the opponent and managing your deck determines whether you crack the case.

The current prototype includes two NPCs with distinct personalities, dispositions, and card sets — enough to experience the full overworld → pre-combat setup → combat loop.

---

## Tech Stack

- **React + Vite + TypeScript** — UI and game logic
- **Tailwind CSS** — styling
- **GitHub Actions + GitHub Pages** — CI/CD and hosting

---

## Local Development

**Prerequisites:** Node.js 20+

```bash
cd BreakthroughPrototype
npm install
npm run dev        # http://localhost:5173
npm run build      # production build
```

---

## How to Play

### Overworld

- Move with **WASD** / arrow keys, or the on-screen joystick on mobile
- Walk up to an NPC and interact to trigger the pre-combat flow
- Interacting with objects in the world adds cards to your **Compendium** (see below)

### Pre-Combat Flow

Before every fight, three screens appear in sequence:

1. **Deck Builder** — choose which world-deck cards (drawn from your Compendium) to bring into this encounter. Personal cards are always included automatically.
2. **Deck Preview** — a read-only preview of your full personal deck so you can plan before the cards are shuffled.
3. **Shield Selector** — place your starting shields. Shields are the defensive responses that block incoming pressure; choose their positions before combat begins.

### Combat (Conversation Phase)

Each turn represents a round of dialogue. The goal is to drain the opponent's **Patience** (their resolve) to zero.

| Term | Meaning |
|---|---|
| **Priority** | Your resource — cards cost Priority to play. You spend it, then regain it on your next turn. |
| **Patience** | The opponent's resolve. Drain it to zero to win. |
| **Personal cards** | Cards unique to your detective, always in your deck. |
| **World cards** | Cards drawn from the deck you assembled in the Deck Builder. |
| **Shields** | Defensive responses that block incoming pressure. Breaking an opponent's shield deals bonus damage and restores Priority. |
| **Disposition** | The NPC's emotional state — shifts based on the conversation and affects card effects. |

NPCs play from their own decks and trigger dialogue based on how the conversation unfolds.

### Back of Mind

When you **lose Priority** (the opponent seizes the floor), you must choose up to 3 cards from your hand to keep — the rest are discarded. During the opponent's turn you can still play **Instant** cards from your kept hand. When you **regain Priority** you draw 3 fresh cards. (`BackOfMindPicker.tsx` handles the selection UI.)

### Card Combinations

**Right-click a card in hand** to combine it with another card, producing a more powerful combined card. For example, in Mary-Ann's encounter two insight cards can be combined into `promiseCard`. The combination UI is handled in `HandArea.tsx` via `CardInspectModal.tsx`.

---

## Card Compendium

Cards are discovered by interacting with objects and locations in the overworld. Each discovery adds the card to your **Compendium** — a persistent collection that persists across sessions. The Compendium is the pool from which you build your world deck in the Deck Builder before each fight. Starter cards are defined in `STARTER_COMPENDIUM` in `src/data/cards.ts`.

---

## Project Structure

```
BreakthroughPrototype/
├── src/
│   ├── combat/
│   │   ├── combatEngine.ts      # Pure engine — no React imports; all turn/state logic
│   │   ├── effects.ts           # Card effect resolvers, deck helpers
│   │   ├── types.ts             # CombatState, EncounterConfig, CombatConfig, CardDef, etc.
│   │   └── Combat.ts            # useCombat hook — bridges engine ↔ React
│   ├── components/
│   │   ├── Overworld.tsx        # Top-down world, NPC interaction, compendium triggers
│   │   ├── DeckBuilder.tsx      # Pre-combat world-deck selection
│   │   ├── DeckPreviewScreen.tsx # Read-only personal deck preview before combat
│   │   ├── ShieldSelector.tsx   # Pre-combat shield placement
│   │   ├── CombatScreen.tsx     # Main combat HUD orchestrator
│   │   ├── Battlefield.tsx      # Card play area and NPC display
│   │   ├── CombatHUD.tsx        # Priority/Patience bars, turn indicator
│   │   ├── HandArea.tsx         # Player hand, card combining (right-click)
│   │   ├── BackOfMindPicker.tsx # UI for keeping cards on priority loss
│   │   ├── CardInspectModal.tsx # Card detail / combine confirmation modal
│   │   ├── CardComponent.tsx    # Shared card rendering
│   │   └── DevTools.tsx         # In-game authoring panel (see /dev)
│   ├── hooks/
│   │   └── useCombatTimers.ts   # Animation and timing hooks for combat
│   └── data/
│       ├── cards.ts             # Card definitions, DETECTIVE_PERSONAL_DECK, STARTER_COMPENDIUM
│       └── encounters.ts        # EncounterConfig definitions for each NPC fight
```

### `combatEngine.ts` — React-free engine module

`src/combat/combatEngine.ts` contains all turn resolution, deck management, priority, shield, and end-condition logic with **zero React imports**. It is a pure state machine (`(CombatState, CombatAction) → CombatState`) that can be imported by a future non-React game engine adapter without modification. The `DEFAULT_COMBAT_CONFIG` object exported from this file controls all tunable balance parameters.

### Encounter-scoped Personal Deck (`EncounterConfig.personalDeck`)

`EncounterConfig` has an optional `personalDeck?: string[]` field. Cards listed there are added to the player's personal deck **for that encounter only**, on top of `DETECTIVE_PERSONAL_DECK`. This is used, for example, to give the player Mary-Ann-specific insight cards that only appear in her fight.

---

## `/dev` Authoring Tool

In development mode, navigating to `/dev` (e.g. `http://localhost:5173/dev`) opens the **DevTools** panel — an in-game authoring environment for designing and playtesting content without touching source files. It is not available in production builds.

### Tabs

| Tab | What it does |
|---|---|
| **Card Creator** | Build a new `CardDef` — set name, cost, effects, supertype, flavour text. Generates copy-pasteable JSON for `cards.ts`. |
| **Encounter Creator** | Compose an `EncounterConfig` — NPC stats, opponent deck, world deck pool, personal deck overrides, disposition. Generates JSON for `encounters.ts`. |
| **Playtest** | Run a full combat session against any encounter directly in the browser. Includes **Dev Settings** sliders (see below). |
| **Notes** | Two sub-editors: **Objective Override** (sets the objective text shown to the player in-game, persisted to `localStorage`) and **Notes Panel Editor** (edits the player's Case Notes panel at runtime, also `localStorage`-persisted). |

### Dev Settings Sliders (Playtest tab)

These sliders control live combat parameters for the current playtest session, all mapped to `CombatConfig`:

| Slider | Default | Meaning |
|---|---|---|
| Starting hand | 4 | Cards in opening hand |
| Cards drawn per play | 1 | Auto-draw after playing a card (0 = no auto-draw) |
| Priority on shield break | 1 | Priority restored when a shield is broken (valuable shields add 4 more) |
| Max shields | 0 | Cap on player shields (0 = no cap) |
| Draw on priority | 3 | Cards drawn when regaining priority |

---

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via GitHub Actions. No manual steps required.
