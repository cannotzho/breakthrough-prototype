# FCP Encounter — Handoff Status

## Status: Complete

All 9 FCP phases implemented, CI green as of `3c677ef`.

## Commits (chronological)

| Commit | Phase | Cards |
|--------|-------|-------|
| `9175e41` | FCP-1 | You're a Hindrance, Panicked Memories, Moment of Clarity |
| `c36bed6` | FCP-2 | Idol's Favor (stub), I'm His, Blind Loyalty |
| `32fbc91` | FCP-3 | He Loves Me, He Really Loves Me, I'm Never Alone, FANtasy |
| `6a2c6fd` | FCP-4 | Idol's Favor (full threshold), My Idol |
| `56f47a9` | FCP-5 | Complete Devotion, His Loyal Fan, Deranged Witness, My Only Meaning |
| `250a88f` | FCP-6 | And He's Mine, Impenetrable Insanity |
| `1dd84ed` | FCP-7 | Lunatic Love, Distracting Madness, Unhinged Focus |
| `aefb377` | FCP-8+9 | You'll Never Tear Us Apart, Fan's Solace, Crippling Fear, It Wasn't Me |
| `fead8d9` | FCP-9 | Encounter definition + NPC shield triggers + startingImpressions |
| `3c677ef` | fix | Correct CardEffect/TrapTrigger field names |

## Engine Work Delivered

### New effect types
- `INCREMENT_IMPRESSION_COUNTERS` — target impression by definition ID, add counters (supports scale multiplier + Complete Devotion amplifier)
- `TRANSFORM_IMPRESSION` — replace impression definition preserving counters
- `BREAK_NPC_SHIELDS` — break N unbroken NPC shields
- `RESHUFFLE_NPC_DECK` — shuffle NPC discard back into deck
- `BREAK_PLAYER_SHIELD` — now supports value/scale for multi-break

### New restriction types
- `PATIENCE_COST_PER_NPC_CARD` — deduct patience each NPC card play
- `DEVOTION_PAYS_PRIORITY` — NPC spends devotion counters as priority
- `PREVENT_EXTRA_DRAWS` — block player card-effect draws (turn-start refill unaffected)

### New scale sources
- `NPC_SHIELDS_BROKEN_THIS_TURN`, `DEVOTION_COUNTER`, `NPC_SHIELDS_PLACED_THIS_TURN`

### NPC capabilities
- NPC-owned impressions and traps (RESOLVE_ENEMY_CARD places them)
- `drawEnemyCards()` — NPC draw with discard-to-deck recycling
- `selectEnemyCard` — scheduledPlays system (turn-gated card plays)
- `processNpcTurnStartEffects` — fires turnStartEffects from NPC impressions
- NPC shield triggers — broken NPC shields fire shieldTriggerEffects via tokenRegistry lookup
- NPC dummy shield placement via `PLACE_DUMMY_SHIELDS` with controller='npc'

### State tracking
- `turnNumber` — incremented at turn boundaries
- `npcShieldsPlacedThisTurn` — reset each turn
- `END_OF_PLAYER_TURN` trap trigger type

### buildInitialCombatState enhancements
- `startingImpressions` — places NPC impressions at combat start
- Opponent shield card definitions auto-populate tokenRegistry
- Enemy deck resolution searches FAN_CLUB_PRESIDENT_CARDS + DEV_TOKEN_DEFINITIONS

## Encounter Definition

`FAN_CLUB_PRESIDENT_ENCOUNTER` in `src/data/encounterDefs.ts`:
- 18-card NPC deck (random play + My Only Meaning scheduled after turn 5)
- 5 NPC dummy shields + 4 core shields (Fan's Solace, Moment of Clarity, Crippling Fear, It Wasn't Me)
- Idol's Favor starts on field via startingImpressions
- Frame priority mode, 15 patience, lieThreshold 3

## Design Decisions Applied
- **F1**: NPC decks work like player decks (discard reshuffles when empty)
- **F2**: Devotion threshold consume-and-fire post-resolution
- **F3**: Shield reversion DEFERRED — You'll Never Tear Us Apart is +2 devotion only
- **F4**: My Idol breaks player shields only
- **F5**: Random play + scheduledPlays system for turn-gated cards

## Known Issues
- GitHub Pages deploy occasionally flakes (infrastructure, not code)
- `tsc -b` cache can mask type errors; use `tsc -b --force` or delete `node_modules/.tmp` for reliable checks
