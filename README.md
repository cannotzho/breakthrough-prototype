# Breakthrough Prototype

A detective card game prototype featuring a 2D top-down overworld and card-based conversation combat.

**[Live Demo](https://cannotzho.github.io/breakthrough-prototype/)**

## Overview

Breakthrough is a detective game where you explore a top-down world and engage NPCs in conversation combat. Instead of swords and spells, you wield arguments, observations, and psychological pressure. Each encounter is a card-based dialogue battle where reading the opponent and managing your deck determines whether you crack the case.

The current prototype includes two NPCs with distinct personalities, dispositions, and card sets — enough to experience the full overworld → combat loop.

## Tech Stack

- **React + Vite + TypeScript** — UI and game logic
- **Tailwind CSS** — styling
- **GitHub Actions + GitHub Pages** — CI/CD and hosting

## Local Development

**Prerequisites:** Node.js 20+

```bash
cd BreakthroughPrototype
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

## How to Play

### Overworld
- Move with **WASD** / arrow keys, or the on-screen joystick on mobile
- Walk up to an NPC to start an encounter

### Combat (Conversation Phase)
Each turn represents a round of dialogue. The goal is to reduce the opponent's resolve to zero.

- **Priority** — higher priority card goes first each exchange
- **Patience** — your resource; cards cost patience to play
- **Personal cards** — cards unique to your detective, always available
- **World cards** — cards drawn from the shared world deck, relevant to the current NPC and location
- **Shields** — defensive responses that block incoming pressure; break them to deal bonus damage
- **Deck builder** — your hand is drawn from a shuffled deck; the discard reshuffles when the deck runs out

NPCs have their own decks, dispositions, and trigger dialogue based on how the conversation unfolds.

## Project Structure

```
BreakthroughPrototype/
├── src/
│   ├── data/          # Card definitions, NPC data, world deck configs
│   ├── combat/        # Combat engine: turn logic, targeting, deck management
│   └── components/    # React UI components (overworld, combat HUD, cards)
```

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via GitHub Actions. No manual steps required.
