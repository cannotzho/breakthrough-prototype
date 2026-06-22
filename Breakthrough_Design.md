# Breakthrough — Game Design Document

> **Status:** Draft v1.2 — All v1.1 open questions resolved: priority mode naming, automatic shield targeting, Field zone, per-shield Patience cost, structured trap triggers, BotM rationale, nested trigger resolution, required encounter fields. See Changelog.

---

## Changelog

Changes are listed in reverse chronological order. Each entry describes what changed in the design; the body of the document always reflects the current state of the design.

### v1.3 — 2026-06-22

- **Frame mode priority overflow allowed.** Player card plays now deduct their full cost from the shared Priority meter without a floor — Priority can go arbitrarily negative from player plays. The previous behaviour split excess cost into Patience damage; that no longer occurs. NPC card costs remain clamped (±10) to preserve the self-limiting turn mechanic.
- **Turn-handoff bonus introduced.** When a turn handoff occurs in Frame Priority Mode, the side receiving initiative gets a flat 3-point Priority bonus in their favourable direction. When the NPC receives the turn (player ends turn or BotM concludes), Priority shifts 3 further negative. When the player receives the turn via Priority Restore, Priority is set to `defaultRestorePriority + 3`. This applies symmetrically.
- **Card cost no longer spills into Patience.** In Frame mode, the full card cost is paid from Priority. If the player's Priority is less than the card's cost, the difference pushes Priority negative rather than reducing Patience.

### v1.2 — 2026-06-22

- **Priority modes renamed.** "Standard Priority Mode" → **Frame Priority Mode** (shared meter, carry-over, inspired by fighting-game frame advantage). "Fixed Priority Mode" → **Classic Priority Mode** (separate meters, full replenishment each turn, named for genre convention). Frame remains the default.
- **Player Shield Choice is now fully automatic.** The leftmost eligible shield is always broken; the player's only lever is pre-arranging shield order via free resequencing. The `PlayerShieldChoice` blocking state is collapsed into a non-blocking resolution step within Enemy Play.
- **"Trap Zone" renamed to "Field."** The Field is a shared persistent zone (modeled on MTG/Hearthstone battlefields) where both Trap cards and Impression cards reside while active. All references to "Trap Zone" replaced.
- **Core Shield Patience cost is per-shield configurable.** Each Core Shield definition specifies its own `patienceCostOnBreak` value. Dummy Shields remain a flat 1 Patience on break.
- **Trap trigger conditions use structured fields.** Trigger conditions are authored via fixed structured fields (type, target, comparator, value), not a freeform DSL. A DSL remains a possible future expansion.
- **Traps are hand-only, mid-combat.** Trap cards can only be played from hand during combat; there is no pre-encounter placement option.
- **BotM rationale updated.** BotM's purpose is now solely limited card retention across turns (since hands refresh each turn). The "Blue increases BotM capacity" mechanic remains relevant for strategic carry-over depth.
- **Nested trigger resolution confirmed with depth guard.** When a trigger's resolution causes another trigger, it resolves immediately as a sub-step (genuinely nested/recursive, not flat queuing). A hard depth cap of 20 nested triggers is required as a safety guard.
- **New encounter config fields are required.** `allowedCoreShields`, `playerDummyShieldSlots`, and `priorityMode` are required fields on encounter definitions — no backwards-compatibility shim, since there are no production-ready encounters.
- **Priority Restore decoupled from shield breaks.** Breaking a player shield (Dummy or Core) no longer triggers Priority Restore. Shield breaks now resolve only their Patience cost and Shield Trigger effects. Priority Restore still fires from other causes (NPC deck exhaustion, card effects that push Priority above 0).
- **Priority meter structure differs by mode.** Frame Priority Mode uses a single shared Priority meter (positive = player's turn, ≤ 0 = NPC's turn). Classic Priority Mode gives player and NPC each their own independent Priority meter with full reset per turn.
- **Frame mode initiative recovery resolved (Open Question #3).** Card costs are sign-directional: NPC card costs push the shared Priority meter toward positive (player territory), self-limiting the NPC's turn. No separate restore mechanic is needed — the NPC's own spending is the mechanism that returns initiative to the player.
- **Classic Priority Mode fully implemented (Open Questions #1–#2 resolved).** Classic mode is no longer a stub — it uses an `activeTurn` flag (`'player' | 'npc'`) for explicit turn ownership. Check State routes by `activeTurn` instead of shared-meter sign. Each side's Priority fully resets at their turn start (no carry-over). NPC card costs deduct from `npcPriority`; when it hits 0, Classic Turn Start fires: player Priority resets, BotM returns to hand, fresh draw up to hand limit, Field traps expire. The player cannot be auto-ended at 0 Priority — they must click End Turn. MODIFY_PRIORITY effects during the NPC's turn write to the player meter but do not flip `activeTurn` (intentional asymmetry). NPC deck exhaustion in Classic mode zeros `npcPriority` and routes to Check (triggering Classic Turn Start).

### v1.1 — 2026-06-21

- **Interrupts removed.** The Interrupt keyword, Interrupt Check state, Interrupt state, and Interrupt Play state are all removed. Players no longer receive input prompts during the opponent's turn. Field trigger checks (Shield Triggers, Trap triggers) replace the interrupt-checking model.
- **No automatic turn-ending.** The player must always explicitly click "End Turn" to end their turn, even if Priority reaches zero and no valid moves remain.
- **Alternative game mode: Fixed Priority Mode.** A new mode where Priority resets to 10 at the start of each player turn (no carry-over, no overflow). Cards whose cost exceeds current Priority cannot be played unless a specific effect grants an exception.
- **Dummy Shields and Core Shields.** New shield taxonomy replacing the flat player shield model. All Dummy Shields must be broken before Core Shields become targetable. Breaking a Dummy Shield reduces the shield owner's Patience by 1. Core Shields are encounter-configured (not player-chosen) and carry powerful Shield Triggers.
- **Counter renamed to Shield Trigger.** The "Counter" keyword is now called "Shield Trigger." The mechanic is unchanged in principle but now fires in shield-break order (see trigger resolution ordering below).
- **Dummy shield multi-break allowed; Core shield single-break enforced.** A single card effect may break multiple Dummy Shields but may never break more than one Core Shield. This is a hard design invariant.
- **Trap cards introduced.** A new card category that persists on the battlefield through the opponent's next turn and triggers only when a defined condition is met. Untriggered Traps expire to discard when it is the player's turn again.
- **Free shield resequencing.** Players may freely reorder their shield row at any time during their turn. Shields always trigger/break left-to-right.
- **Multi-effect trigger priority ordering.** When a single card triggers multiple effects, resolution order is: Traps first, then Shield Triggers. Among multiple Shield Triggers, order follows shield-break order. Among multiple Traps, order follows play order (oldest first).
- **Patience has no maximum cap.** There is a default starting Patience per encounter but no upper bound. Patience-restoring effects can exceed the starting value.

---

## 1. Overview

Breakthrough is a single-player detective card game. The player character (the Detective) engages in conversation-based encounters with NPCs. Each encounter is modelled as a card game: the Detective plays cards to break the NPC's information shields, while managing a shared resource called Priority and the NPC's Patience.

This document defines the authoritative rules for the combat system. The state machine described here is the source of truth; any implementation must conform to it.

---

## 2. Glossary

This game is keyword-driven. All mechanical terms should be used precisely and consistently across rules text, card text, and UI copy.

| Term | Definition |
|---|---|
| **Priority** | The resource governing turn order. In Frame Priority Mode, a single shared signed integer (positive = Detective's turn; ≤ 0 = NPC's turn). In Classic Priority Mode, player and NPC each have their own independent Priority meter. |
| **Patience** | The NPC's tolerance for the conversation. Has a starting value per encounter but no maximum cap. Reaching zero or below ends the encounter as a loss. |
| **Shield Trigger** | A keyword on certain cards used as Player Shields. When a shield with Shield Trigger is broken, its printed effects resolve before the break outcome fires. Formerly called "Counter." |
| **Opponent Shield** | A face-down card belonging to the NPC. Breaking all opponent shields wins the encounter. |
| **Dummy Shield** | A Player Shield that must be broken before Core Shields become targetable. Breaking a Dummy Shield costs the shield's owner 1 Patience. |
| **Core Shield** | A Player Shield configured per-encounter. Core Shields are automatically slotted if the player's Collection contains the required card. Core Shields frequently carry powerful Shield Triggers. Cannot be targeted until all Dummy Shields are broken. |
| **Player Shield** | A face-down card placed by the Detective for protection. Composed of Dummy Shields and Core Shields. |
| **Hint** | A special type of Opponent Shield. When broken, displays lore text but adds no cards to the player's deck. Hint text remains visible in the shield zone after breaking. |
| **Skill Card** | A card type representing the Detective's learned abilities. Effects are always known. Kept in the Skill Deck. |
| **Information Card** | A card type representing knowledge about the world. Effects are unknown until discovered and vary across encounters — the effect is defined per-encounter in the encounter's `relevantCards` config, not globally. Kept in the Collection. |
| **Back of Mind (BotM)** | A card retained from the player's hand across the turn transition when Priority shifts to the NPC. BotM is the mechanism that controls what carries over between turns, since hands refresh each turn. |
| **Trap** | A card category. When played, Trap cards persist on the battlefield through the opponent's next turn. They trigger their effects only when a defined condition is met during that window. If not triggered, they expire to the discard pile when it is the player's turn again. |
| **Lie** | A keyword on certain Black cards. When a card with Lie is played, the encounter's Lie Counter increases by 1. If the Lie Counter exceeds the encounter's `lieThreshold`, the encounter ends immediately as a loss. Some NPC Traits and cards interact with the Lie Counter to impose additional penalties. |
| **Safety** | A keyword on certain cards. Has no effect when played normally. When a card with Safety is used as a Player Shield and that shield is broken, a more favourable break outcome resolves (Effective Break — NPC loses 0 Patience instead of 1). |
| **Assemble** | A keyword on certain cards. Cards with Assemble may be combined with other Assemble cards. Combining is performed from the player's hand and does not trigger a state machine transition, but does change the state of the hand. |
| **Color Identity** | The color or colors assigned to a card, determining its mechanical and thematic character. Cards may be single-colored or colorless. Color identity affects deck-building, dynamic combination naming, and certain Trait interactions. |
| **Trait** | A passive modifier on an NPC that affects combat behaviour throughout the encounter. Applied via encounter configuration. Traits are **discoverable**: before a trait's effect is triggered for the first time, it appears as a question mark icon in the UI. Once triggered, the icon changes to the trait's proper icon and hovering over it displays its passive effect description. |
| **Relevant Cards** | Information Cards listed in an encounter's config, each paired with an encounter-specific effect definition. Only Relevant Cards reveal their effects when first played in that encounter. |
| **Conversation Deck** | The deck the player prepares upon entering an encounter. Consists of the player's Skill Deck combined with a selection of Information Cards taken from the Collection. |
| **Collection** | A database of all cards the player has obtained. Cards are divided into Skill Cards and Information Cards. The Collection is the source from which the player builds their Conversation Deck. |
| **Skill Deck** | A 20-card deck built from Skill Cards chosen by the player. Combined with Information Cards to form the Conversation Deck. |
| **Discovered** | The state of an Information Card whose effect has been revealed. Discovery persists across encounters. |
| **Impression** | A card subtype native to Orange. When played, an Impression card is placed on the Field rather than discarded, providing a persistent passive effect for the remainder of the encounter. |
| **Priority Restore** | (Frame Priority Mode) The event that occurs whenever the shared Priority meter transitions from ≤ 0 to > 0. Triggers a fresh hand draw and sets Priority to `defaultRestorePriority + 3` (base restore value plus the turn-handoff bonus). Does **not** fire on shield breaks — only on NPC deck exhaustion or card effects that push Priority positive. |
| **Turn-Handoff Bonus** | (Frame Priority Mode) A flat 3-point Priority bonus applied in the favourable direction whenever a turn handoff occurs. When the NPC receives the turn (player ends turn or confirms Back of Mind), Priority shifts 3 further negative. When the player receives the turn via Priority Restore, the bonus is added to the restore value. |
| **Staged Card** | The NPC's currently loaded card, pending resolution. Exists between Enemy Pending and the end of Enemy Play. |
| **Retryable** | An encounter property. If true, the player may restart the encounter after losing. |
| **Persistent Break** | An opponent shield that remains broken when a retryable encounter is restarted. |
| **Deck Recycle** | When the draw pile is empty, the discard pile is reshuffled to form a new draw pile. |
| **Field** | The persistent battlefield zone where Trap cards and Impression cards reside while active. Modeled on the "permanents on a battlefield" concept from games like MTG and Hearthstone. Distinct from hand, deck, and discard pile. |
| **Field Trigger Check** | The engine step that evaluates whether any Trap triggers or Shield Triggers should fire after a card resolves. Replaces the former interrupt-checking model. |
| **Classic Priority Mode** | An alternative game mode where player and NPC each have their own independent Priority meter, each resetting to its full value at the start of that side's turn. No carry-over, no overflow, no shared meter. Named for the genre convention — most card games give each player a separate resource pool per turn. |
| **Frame Priority Mode** | The default game mode using a single shared Priority meter between player and NPC. Positive Priority = player's turn; zero or negative = NPC's turn. Priority carries over between turns and playing cards pushes the meter toward the opponent's territory. Named after the concept of "frame advantage" in fighting games — both sides contest a single momentum resource, and the tug-of-war over that resource determines who acts. |

---

## 3. Core Concepts

### Priority

Priority governs turn order and action availability. Its structure differs fundamentally between the two priority modes — see Priority Modes below.

Playing a card costs the Priority value printed on the card. The player must explicitly click "End Turn" to pass initiative to the NPC — there is no automatic turn-ending even when Priority reaches zero or no valid moves remain.

**Priority Restore does not fire on shield breaks.** Breaking a player shield (Dummy or Core) has no effect on Priority. Shield breaks resolve only their Patience cost and any Shield Trigger effects. Priority Restore fires only from other causes: NPC deck exhaustion or card effects that push Priority above 0 (Frame mode) or the start of a new turn (Classic mode).

#### Priority Modes

An encounter selects one of two priority modes via the `priorityMode` config field:

**Frame Priority Mode** (default): A single shared Priority meter between player and NPC, represented as a signed integer clamped to −10 to +10. Positive values mean it is the player's turn; zero or negative values mean it is the NPC's turn. Both sides' actions modify the same meter — playing a card pushes the meter toward the opponent's territory. **Card costs are sign-directional:** when the player plays a card, the cost pushes Priority toward negative (NPC territory); when the NPC plays a card, the cost pushes Priority toward positive (player territory). This is the self-balancing mechanism that prevents the NPC from playing indefinitely — the NPC's own card costs erode its initiative, and without any restore effect, the NPC's spending is what eventually flips the sign back to positive and returns initiative to the player.

Playing a card deducts its full cost from Priority — Priority can go arbitrarily negative from player plays (no floor, no overflow into Patience). For NPC card plays, the card's cost is added to Priority (toward positive, clamped to ±10) before effects resolve. When a turn handoff occurs, a flat 3-point bonus is applied in the direction that favours the receiving side: −3 when the NPC receives the turn, +3 when the player receives the turn. The name reflects "frame advantage" from fighting games — both sides contest a single momentum resource, and the tug-of-war over that resource determines who acts.

**Priority Restore event (Frame mode):** Triggered whenever the shared Priority meter transitions from ≤ 0 to > 0, regardless of cause (NPC deck exhaustion, card effects that add Priority). When triggered:
1. Priority is set to `defaultRestorePriority + 3` (base restore value plus the turn-handoff bonus).
2. The player draws a fresh hand (up to the hand limit). If a BotM card exists, it is returned to hand first.

**Classic Priority Mode**: Player and NPC each have their own independent Priority meter. Each meter resets to its full value (e.g. 10) at the start of that side's turn. There is no carry-over between turns — unspent Priority is lost. There is no overflow mechanic — if a card's Priority cost exceeds the player's current Priority, the card simply cannot be played unless a specific card effect grants an exception. Turns alternate: the player takes their full turn (spending from their own meter), then the NPC takes their full turn (spending from theirs). Named for the genre convention — most card games give each side a separate resource pool per turn.

### Patience

Patience is the NPC's tolerance for the conversation. It starts at a per-encounter value (default: 10). **There is no maximum Patience cap** — effects that restore or grant Patience can exceed the starting value without limit. If Patience reaches zero or below, the conversation ends immediately as a loss. Patience is modified by card effects and shield break outcomes.

### Opponent Shields

Opponent shields are face-down cards placed by the NPC. They hide information. Breaking all opponent shields is the win condition.

When an opponent shield is broken:
- Its lore description is revealed via the Reveal Pending state (not its combat effect).
- If the shield is a **Hint**, no card is added to the player's deck; the lore text remains visible in the shield zone.
- Otherwise, the shield card becomes an Information Card in the player's deck for future encounters.

### Player Shields

Player shields use a two-tier taxonomy: **Dummy Shields** and **Core Shields**.

#### Dummy Shields

Dummy Shields are cards placed by the Detective during their turn (or pre-placed during the Shield Card Selection phase). **Shield Placement** is a universal Player action available for any hand card — it is not gated by card type, keyword, or supertype. Placing a card as a shield costs **2 Priority** (a fixed cost, independent of the card's printed cost) and does not resolve the card's printed effects.

All Dummy Shields must be broken before any Core Shield can be targeted. When a Dummy Shield is broken, the shield's owner loses **1 Patience**.

The player can always see their own shields face-up (the card's name, cost, keywords, and type are visible).

#### Core Shields

Core Shields are **not chosen by the player**. Each encounter defines a set of allowed Core Shield card IDs in its configuration. If the player's Collection contains any of the allowed Core Shield cards, those cards are automatically placed as Core Shields for the encounter. If the player does not own any allowed Core Shields, they simply play without them — there is no substitution mechanic.

Core Shields frequently carry powerful **Shield Trigger** effects. Core Shields can only be targeted after all Dummy Shields have been broken.

#### Shield Row Composition and Ordering

The player's shield row is laid out left-to-right with Dummy Shields first, then Core Shields. During their own turn, the player may **freely resequence** (reorder) their entire shield row at any time. Shields are always broken left-to-right when targeted by the opponent — so resequencing determines the order in which shields are broken.

When the NPC breaks a player shield, the leftmost eligible shield is targeted:
- If any Dummy Shields remain, the leftmost Dummy Shield is broken.
- Once all Dummy Shields are broken, the leftmost Core Shield is broken.

#### Shield Break Outcomes

Breaking a player shield does **not** trigger Priority Restore or any Priority change. Shield breaks affect only Patience (and any Shield Trigger effects).

Two break outcomes exist for Dummy Shields:

- **Effective Break** — triggered if the broken shield has the **Safety** keyword. Outcome: shield owner loses **0 Patience** (instead of the normal 1).
- **Plain Break** — all other Dummy Shields. Outcome: shield owner loses **1 Patience**.

For Core Shields: each Core Shield specifies its own `patienceCostOnBreak` value in the encounter configuration, allowing designers to set different Patience costs for different Core Shields (including 0). This cost is independent of any Shield Trigger effects the Core Shield may also carry.

> **Safety keyword clarification:** The Safety keyword has no mechanical effect when a card bearing it is played normally (i.e. not placed as a shield). Its sole purpose is to upgrade the break outcome from Plain Break to Effective Break when the card is used as a Dummy Shield.

### Shield Triggers

**Shield Trigger** (formerly "Counter") is a keyword on certain cards. When a shield with the Shield Trigger keyword is broken, its printed effects resolve as a sub-sequence before the break outcome fires.

Shield Triggers resolve in **break order**: if multiple shields with Shield Trigger are broken by the same card effect (possible for Dummy Shields), they trigger in the order their shields were broken (left-to-right, since breaks proceed left-to-right).

Shield Trigger effects do not trigger an intermediate Check State evaluation — see Sequencing Invariants.

### Trap Cards

Trap cards are a card category representing prepared responses that await specific conditions. Traps can only be played from hand during combat — there is no pre-encounter or Shield Selection phase placement option for Traps.

**Playing a Trap:** When played from hand, a Trap card is placed on the **Field** rather than resolving its effects immediately. The Trap's Priority cost is paid normally. The Trap card remains on the Field through the opponent's entire next turn.

**Trigger condition:** Each Trap card defines a specific trigger condition authored via structured fields — a fixed set of condition parameters (e.g., trigger type, target, comparator, value) rather than a freeform string or DSL. Example conditions: "opponent plays a card that would break a shield," "opponent plays a card costing more than 3 Priority." If the condition is met at any point during the opponent's turn, the Trap **triggers** — its effects resolve immediately at the point the condition was satisfied. This structured-field approach mirrors how card effects are already defined (typed fields, not arbitrary strings) and is a deliberate v1 scoping decision — a DSL-based approach remains a possible future expansion if trigger complexity grows beyond what structured fields can cleanly express.

**Expiry:** If the opponent's turn ends without the Trap's condition being met, the Trap expires and moves to the player's discard pile untriggered when it becomes the player's turn again.

**Post-trigger:** After a Trap triggers and its effects resolve, the Trap card moves to the player's discard pile.

**Multiple Traps:** Multiple Trap cards may be on the Field simultaneously. If multiple Traps' conditions are satisfied by the same event, they trigger in **play order** (the Trap played earliest triggers first).

### Field Trigger Check

After any card resolves (player or NPC), the engine performs a **Field Trigger Check**. This replaces the former interrupt-checking model. The Field Trigger Check evaluates:

1. Whether any Trap card on the Field has had its trigger condition met.
2. Whether any Shield Trigger should fire (from shields broken during the resolving card's effects).

If triggers are found, they resolve according to the trigger resolution ordering (see §4.5). No player input is required — triggers fire automatically based on game state.

**Nested trigger resolution:** If a trigger's resolution (Trap or Shield Trigger) causes another trigger to fire (e.g., a Trap effect breaks a shield that has a Shield Trigger), the new trigger resolves **immediately as a sub-step** before returning to the outer resolution. This is genuinely nested/recursive resolution, not flat queuing — the inner trigger fully completes before the outer resolution continues. If the sub-step causes yet another trigger, it spawns another sub-step, and so on. A hard depth cap of **20 nested triggers** is enforced as a safety guard against malformed card combos causing infinite loops; this is not an expected gameplay limit but a fail-safe that halts resolution and logs an error if reached.

### Trigger Resolution Ordering

When a single card or event triggers multiple effects, they resolve in this fixed priority order:

1. **Trap triggers** — resolved in play order (oldest-played Trap first).
2. **Shield Triggers** — resolved in break order (the order in which their shields were broken during this resolution).

This ordering is absolute: all pending Trap triggers resolve before any Shield Triggers, regardless of the chronological order in which conditions were met.

If any trigger's resolution causes a new trigger to fire, the new trigger resolves immediately as a nested sub-step (see Field Trigger Check above). The Trap-before-Shield ordering applies within each nesting level independently.

### Skill Cards

Skill cards represent the Detective's learned abilities. Their effects are always visible — the `???` / Discovered system does not apply to Skill cards.

### Information Cards

Information cards represent knowledge about the world. Their combat effects are hidden by default, displayed as "Unknown Effect." An Information Card's effect is **Discovered** when:

1. The card is played for the first time in an encounter where it appears in that encounter's `relevantCards` list. Each encounter defines the card's effect independently — the same card may behave differently in different encounters. A reveal animation plays and the effect is shown. Discovery persists globally.
2. An external trigger from the overworld marks the card as discovered ahead of time.

Once Discovered, the card's effect is visible in all future encounters. **Important:** An Information Card has no defined combat effect in any encounter where it does not appear in that encounter's `relevantCards`. The effect vocabulary on an Information Card is always and only defined by `relevantCards` for a specific encounter. There is no "underlying" or "actual" effect to fall back to — the card is simply not meaningful in that context.

When a non-relevant Information Card is in the player's Conversation Deck, its behaviour at pre-encounter and in-encounter depends on whether it has been previously played in this encounter (tracked in `playedNonRelevantCards`):

**Case 1 — Not previously played (not in `playedNonRelevantCards`):**
- Pre-encounter Info Card selection: the card shows a `???` / Unknown effect indicator, identical to an undiscovered relevant card in appearance, but for a different reason.
- Deck construction: the card enters the Conversation Deck unchanged.
- In encounter, when played: the card converts to Ponder (pay 1 Priority, draw 1 card) at that moment. Its card ID is added to `playedNonRelevantCards` after this conversion.

**Case 2 — Previously played (in `playedNonRelevantCards`):**
- Pre-encounter Info Card selection: the card displays the text **"Will be converted to Ponder"** as a warning.
- Deck construction: the card is replaced by Ponder in the Conversation Deck before the encounter begins. A conversion animation plays to remind the player which cards were substituted.
- In encounter: the card no longer exists in the deck — only Ponder remains in its slot.

The play-time Ponder conversion logic (Case 1) should be implemented as a single replaceable function so that fallback behaviour can be changed without touching card resolution broadly. The deck-construction substitution (Case 2) is a separate step and should be implemented independently.

> **Design note for implementors:** Avoid any language that implies a non-relevant Information Card has an "actual effect" or a "hidden effect." It does not. The only source of truth for an Information Card's effect in any encounter is that encounter's `relevantCards` list. Any code or documentation that references a non-relevant card's "effect" is incorrect.

### Back of Mind (BotM)

When the player explicitly ends their turn (clicking "End Turn"), they must discard their hand but may keep one card in the BotM zone. The BotM card persists through the NPC's turn. When initiative returns to the player (Priority Restore in Frame mode, or the start of the player's next turn in Classic mode), the BotM card returns to the player's hand.

BotM's purpose is **limited card retention across turns**. Since hands refresh at the start of each player turn, BotM is the only mechanism that allows a player to carry a specific card from one turn to the next. This makes BotM strategically important: the player must decide which single card (or more, if Blue's capacity-increasing effects are active) is worth preserving through the opponent's turn.

> **Note:** Unlike previous versions, BotM cards cannot be played during the NPC's turn (interrupts have been removed). The "Blue increases BotM capacity" mechanic (see §8.4, Blue) remains relevant — it increases the number of cards the player may retain across the turn transition, deepening Blue's planning advantage.

### Deck Recycle

When the draw pile contains zero cards and the player would draw, the discard pile is reshuffled to form a new draw pile, then the draw proceeds.

---

## 4. State Machine

### 4.1 Design Principles

1. **No previous-state checks.** No state transition may ask "what was the previous state." All routing decisions are deterministic from current state flags alone (`stagedEnemyCard`, `pendingReveal`, `awaitingBotM`, `pendingTrapTriggers`).

2. **Effect resolution is a sequential list.** Card effects resolve as an ordered list of atomic steps. The Priority cost is always deducted as step 0, before any effects run. Blocking sub-states (Reveal Pending) suspend the list at the triggering step and resume from the next step after the block clears. Player shield breaks resolve automatically as non-blocking steps within the sequence. This means no costs or earlier effects are ever repeated — they have already resolved before the suspension occurred.

3. **No player input during opponent's turn.** The opponent's turn runs to completion without pausing for player decisions. Field Trigger Checks fire automatically. Player shield breaks are resolved automatically (leftmost eligible shield is always targeted) — there is no blocking Player Shield Choice state during the opponent's turn.

4. **The state machine is stable; edge cases are handled at design level.** New mechanics and card effects should be designed to work within the existing state machine rather than requiring changes to it. If a proposed card effect would require a structural state machine change to handle correctly, the card effect should be redesigned first. When a state machine change is genuinely unavoidable, it constitutes a **significant version change** to this document and must be logged as such.

---

### 4.2 State List

| State | Blocking? | Description |
|---|---|---|
| Check | No | Evaluates end conditions and routes |
| Player Pending | Yes | Waits for player action |
| Player Play | No | Resolves the player's card, shield placement, or trap placement |
| Reveal Pending | Yes | Player acknowledges a broken opponent shield's reveal |
| BotM Select | Yes | Player chooses which card to keep in Back of Mind |
| Enemy Pending | No | NPC selects and stages their next card |
| Field Trigger Check | No | Evaluates and resolves any pending Trap or Shield Triggers |
| Enemy Play | No | Resolves the NPC's staged card |

> **Note on Player Shield Choice (removed):** Player Shield Choice was a blocking state in which the player selected which shield to sacrifice. With left-to-right automatic shield targeting and the dummy-before-core constraint, this is now fully automatic — the leftmost eligible shield is always broken. The former Player Shield Choice state has been collapsed into Enemy Play as a non-blocking resolution step.

---

### 4.3 State Definitions

#### Check State

The routing hub. Never blocks. Transitions evaluated top to bottom; first match wins.

Rules 1–4 are mode-independent (win/loss conditions). Rules 5–8 differ by Priority mode.

1. All opponent shields broken → **WIN**
2. All player shields broken *(unless `unbreakablePlayerShields` is set)* → **LOSE**
3. NPC Patience ≤ 0 → **LOSE**
4. Lie Counter > encounter's `lieThreshold` → **LOSE**

**Frame Priority Mode** (rules 5–8, shared meter):

5. Priority > 0 → move any staged enemy card to NPC discard → **Player Pending**
6. Priority ≤ 0 AND staged enemy card exists → **Enemy Play**
7. Priority ≤ 0 AND no staged card AND hand not empty → **BotM Select**
8. Priority ≤ 0 AND no staged card AND hand empty → **Enemy Pending**

**Classic Priority Mode** (rules 5c–8c, alternating turns via `activeTurn` flag):

5c. `activeTurn === 'player'` → move any staged enemy card to NPC discard → **Player Pending** (always, regardless of current Priority value — no auto-end even at 0 Priority)
6c. `activeTurn === 'npc'` AND staged enemy card exists → **Enemy Play**
7c. `activeTurn === 'npc'` AND no staged card AND player hand not empty → **BotM Select**
8c. `activeTurn === 'npc'` AND no staged card AND `npcPriority > 0` → **Enemy Pending**
9c. `activeTurn === 'npc'` AND no staged card AND `npcPriority ≤ 0` → Classic Turn Start → **Player Pending**

> **Win before loss:** Rule 1 is checked before rules 2–4 so that simultaneously breaking the last opponent shield and draining Patience to zero resolves as a win.
>
> **Staged card on Priority Restore (rule 5, Frame mode):** When the shared Priority meter transitions to > 0, the NPC's staged card is cancelled. It is moved to the NPC's discard pile — not removed from the encounter.
>
> **Classic Turn Start (rule 9c):** Set `activeTurn = 'player'`; reset player Priority to `startingPriority`; set `npcPriority = 0`; cancel any staged enemy card to NPC discard; return BotM cards to hand; draw cards up to `handLimit`; expire all Field traps to player discard.
>
> **NPC Turn Start (triggered by player's End Turn action in Classic mode):** Set `activeTurn = 'npc'`; set player Priority to 0; reset `npcPriority` to `startingPriority`; then route to Check (which evaluates rules 6c–9c).

---

#### Player Pending State

Waits for player input. Available actions:

- **Play a card** → load card → **Player Play**
- **Play a Trap card** → load card as trap placement → **Player Play** (card moves to Field instead of resolving effects)
- **Place a shield** (any hand card; costs 2 Priority) → load card as shield placement → **Player Play**
- **Resequence shields** → reorder shield row (no state transition; UI-only action that updates shield ordering in state)
- **End Turn** (sets Priority to 0) → **Check**

The player must always explicitly choose "End Turn" to end their turn. There is no automatic turn-ending — even if Priority is at zero and no valid moves remain, the player retains control until they click End Turn.

> Shield Placement is a distinct Player action. Any hand card may be placed as a shield. The fixed cost of 2 Priority is deducted (with Patience overflow in Frame Priority Mode). The card's printed effects do NOT resolve — only the placement itself happens (card moves from hand to the leftmost empty Dummy Shield slot). This is resolved as a unique effect sequence in Player Play State, separate from the card's own effect list.

---

#### Player Play State

Effect resolution sequence:

1. Deduct the card's Priority cost:
   - **Frame Priority Mode:** Pay `min(cost, currentPriority)` from Priority, then pay `max(0, cost − currentPriority)` from NPC Patience. Both deductions are atomic and this step is never repeated. If NPC Patience reaches ≤ 0 after this deduction, the game proceeds to Check State after all effects resolve.
   - **Classic Priority Mode:** Deduct full cost from Priority. (Cards with cost > currentPriority cannot be played in this mode unless a specific effect grants an exception — this is validated before entering Player Play.)
2. For each effect in the card's effect list, in order:
   a. Resolve the effect.
   b. If the effect breaks an **opponent shield** → suspend here → **Reveal Pending**. After acknowledgement, resume from step 2c.
   c. *(next effect)*
3. Move the card to its destination zone (discard, Field, consumed, or shield slot).
4. Perform **Field Trigger Check** (evaluate any triggers caused by this card's resolution).
5. → **Check**

---

#### Reveal Pending State *(blocking)*

Triggered only when an **opponent shield** is broken. Displays the shield card's lore description (never its combat effect). If the shield is a Hint, the lore text is permanently displayed in the shield zone after this state clears.

The combat state is fully frozen during Reveal Pending. No Priority animation, BotM transition, or turn change may occur.

**On player acknowledgement:** Resume the suspended effect resolution sequence (in Player Play or Enemy Play — whichever was active) from the step immediately after the break that triggered this state.

---

#### Player Shield Break Resolution *(non-blocking — formerly "Player Shield Choice")*

Triggered when the NPC's card effect breaks a player shield. This is a non-blocking resolution step within Enemy Play — it does not suspend the effect sequence for player input.

Shield targeting is fully automatic: the leftmost eligible shield is always broken. The player's only influence on break order is pre-arranging their shield row via free resequencing during their own turn.

Sequence:
1. The leftmost eligible shield is targeted (leftmost Dummy Shield if any remain; otherwise leftmost Core Shield).
2. If the targeted shield has the **Shield Trigger** keyword: its printed effects resolve as a sub-sequence. If a Shield Trigger effect breaks an opponent shield, Reveal Pending fires and suspends the parent sequence until acknowledged. If the Shield Trigger's resolution causes another trigger to fire, it resolves immediately as a nested sub-step (depth cap: 20).
3. Resolve break outcome (Patience only — no Priority Restore fires):
   - For Dummy Shields:
     - **Effective Break** *(Safety keyword present)*: shield owner loses 0 Patience.
     - **Plain Break** *(all others)*: shield owner loses 1 Patience.
   - For Core Shields: The shield's configured `patienceCostOnBreak` is deducted from the shield owner's Patience.
4. Remove shield from player's shield zone.
5. Resume the Enemy Play effect sequence from the step after the break.

---

#### BotM Select State *(blocking)*

Triggered when the player explicitly ends their turn and has cards in hand.

Sequence:
1. Player selects up to one card from hand to keep, or passes (keeps no cards).
2. All other hand cards (or all hand cards, if the player passed) are discarded.
3. If a card was selected, it is placed in the BotM zone.
4. → **Enemy Pending**

---

#### Enemy Pending State

NPC selects their next card. Immediate.

- NPC deck empty → Priority Restore fires (Frame mode) / NPC turn ends (Classic mode) → **Check**
- Otherwise → load top card from NPC deck as the staged card → **Field Trigger Check** (pre-play check for Trap conditions triggered by staging) → **Enemy Play**

---

#### Field Trigger Check State

Immediate (non-blocking). Evaluates whether any field triggers should fire based on the current game event.

Evaluation order (fixed — this is the canonical trigger resolution ordering):
1. **Trap triggers:** Check each Trap on the Field (in play order, oldest first) for whether its trigger condition is met. If met, resolve the Trap's effects, then move it to the player's discard pile. If the Trap's resolution causes another trigger, resolve it immediately as a nested sub-step (depth cap: 20).
2. **Shield Triggers:** Check for any Shield Trigger effects pending from shields broken during this resolution. If pending, resolve them in break order (the order in which their shields were broken). If a Shield Trigger's resolution causes another trigger, resolve it immediately as a nested sub-step (depth cap: 20).

After all triggers resolve:
- If entered from Enemy Pending (pre-play trigger check) → **Enemy Play**
- If entered from Enemy Play (post-effect trigger check) → **Check**
- If entered from Player Play (post-effect trigger check) → **Check**

---

#### Enemy Play State

Effect resolution sequence:

1. For each effect in the NPC card's effect list, in order:
   a. Resolve the effect.
   b. If the effect breaks a **player shield** → resolve via shield targeting rules (leftmost eligible shield). If the shield has a Shield Trigger, queue it for the Field Trigger Check. Perform Patience deduction per break outcome rules.
   c. If the effect breaks an **opponent shield** (self-break effects) → suspend here → **Reveal Pending**. After acknowledgement, resume from step 1d.
   d. *(next effect)*
2. Move the staged card to the NPC's discard pile. Clear `stagedEnemyCard`.
3. Perform **Field Trigger Check** (evaluate Trap triggers and queued Shield Triggers from this card's resolution).
4. Check for Trap expiry: if no more NPC cards are staged (i.e., this was the NPC's last action before initiative returns to the player), expire all remaining untriggered Traps to the player's discard pile.
5. → **Check**

> NPC cards do not have a player-visible Priority cost. The initiative system operates at the Check State routing level.

---

### 4.4 State Diagram

```mermaid
stateDiagram-v2
    direction TB

    [*] --> Check

    Check --> WIN : all opp shields broken
    Check --> LOSE : all player shields broken
    Check --> LOSE : patience ≤ 0
    Check --> LOSE : lie counter exceeded
    Check --> PlayerPending : priority > 0\n(staged card → NPC discard)
    Check --> EnemyPlay : priority ≤ 0\nstaged card exists
    Check --> BotMSelect : priority ≤ 0\nno staged card, hand not empty
    Check --> EnemyPending : priority ≤ 0\nno staged card, hand empty

    PlayerPending --> PlayerPlay : play card / place shield / play trap
    PlayerPending --> Check : end turn (priority = 0)

    PlayerPlay --> RevealPending : opp shield broken\n(suspend effects)
    PlayerPlay --> FieldTriggerCheck : all effects resolved
    FieldTriggerCheck --> Check : triggers resolved

    RevealPending --> PlayerPlay : acknowledged\n(resume effects)
    RevealPending --> EnemyPlay : acknowledged\n(resume effects)

    BotMSelect --> EnemyPending : card selected

    EnemyPending --> FieldTriggerCheck : card staged\n(pre-play trigger check)
    EnemyPending --> Check : no cards\n(Priority Restore / turn end)

    FieldTriggerCheck --> EnemyPlay : pre-play triggers resolved

    EnemyPlay --> RevealPending : opp shield broken\n(suspend effects)
    EnemyPlay --> FieldTriggerCheck : all effects resolved\n(post-play trigger check)

    note right of EnemyPlay : Player shield breaks resolve\nautomatically (leftmost eligible)\nas a non-blocking step within\nEnemy Play — no separate state.
```

---

### 4.5 Sequencing Invariants

1. **Reveal Pending is a hard gate on opponent shield breaks only.** No Priority animation, BotM transition, or turn change may occur while `pendingReveal` is set. Player shield breaks do not trigger Reveal Pending — they are resolved via the shield targeting and break outcome rules.

2. **BotM Select and Reveal Pending are mutually exclusive.** If an effect simultaneously drains Priority to ≤ 0 and breaks an opponent shield, Reveal Pending takes precedence. BotM Select fires only after acknowledgement re-enters Check State.

3. **Player shield breaks resolve automatically within Enemy Play.** The leftmost eligible shield is always targeted. Shield Trigger effects (if any) resolve as a sub-sequence before the break outcome fires; nested triggers resolve as immediate sub-steps (depth cap: 20). The effect sequence continues without player input.

4. **Win is checked before loss.** All opponent shields broken (rule 1) is evaluated before player shields broken (rule 2) and patience (rule 3).

5. **Staged card cancelled on turn transition goes to NPC discard.** When initiative returns to the player (Priority Restore in Frame mode, or the start of the player's turn in Classic mode), the NPC's staged card is cancelled and moved to NPC discard. It is not removed from the encounter.

6. **Enemy Play is entered from:** Field Trigger Check (pre-play path from Enemy Pending) or Check State (rule 6, staged card persists). No other state transitions to Enemy Play.

7. **No player input during opponent's turn.** The opponent's turn runs without interruption. Field Trigger Checks fire automatically. Player shield breaks resolve automatically (leftmost eligible shield). There are no blocking states during the opponent's turn.

8. **Effect resolution sequences are never restarted.** Blocking sub-states (Reveal Pending) suspend and resume a sequence; they do not restart it. Player shield breaks resolve automatically within the sequence without suspension. Priority costs are always the first step and are never repeated.

9. **Patience overflow is deducted in step 0 of Player Play (Frame Priority Mode only), not checked mid-resolution.** If paying Patience overflow brings NPC Patience to ≤ 0, the loss condition is not evaluated until Check State after all effects resolve. The win-before-loss invariant (rule 4) still applies.

10. **Shield Trigger effects do not trigger a Check State evaluation mid-sequence.** Shield Trigger effects resolve as a sub-sequence within the shield break resolution. No Check State evaluation occurs between the conclusion of Shield Trigger effects and the resumption of the parent effect sequence. Consequently:
    - Win and loss conditions altered by Shield Trigger effects (e.g. opponent shields broken, Patience reduced) are evaluated in Check State only after the parent play state completes fully.
    - If a Shield Trigger effect includes a card effect that modifies Priority (e.g. adds Priority via its effect list), the Priority change takes effect immediately, but the routing consequence (transitioning to Player Pending if Priority becomes positive) does not occur until Check State is reached. Note: the shield break itself does not restore Priority — only explicit Priority-modifying effects within the Shield Trigger can do this.
    - The win-before-loss ordering in Check State (rule 1 before rules 2–4) still applies.

11. **Dummy shield multi-break; Core shield single-break.** A single card effect may break multiple Dummy Shields in one resolution. A single card effect may **never** break more than one Core Shield — this is a hard design invariant enforced at card design time. Combined cards produced by Assemble must also respect this constraint.

12. **Trigger resolution ordering is absolute.** When multiple triggers fire from a single event: Traps resolve first (in play order), then Shield Triggers (in break order). This ordering cannot be overridden by card effects.

13. **Trap expiry occurs at turn transition.** Untriggered Traps are moved from the Field to discard only when initiative returns to the player (Priority Restore in Frame mode, or the start of the player's turn in Classic mode), not mid-sequence.

14. **Shield resequencing is free during player's turn.** Resequencing does not consume Priority, does not trigger state transitions, and does not interact with any trigger evaluation. It only affects the physical ordering of shields for future break-targeting.

15. **Nested trigger resolution with hard depth cap.** When a trigger's resolution (Trap or Shield Trigger) causes another trigger to fire, the new trigger resolves immediately as a sub-step — genuinely nested/recursive, not flat queuing. The engine enforces a hard nesting depth cap of **20**. If the cap is reached, resolution halts at that depth and logs an error. This is a safety guard against malformed card combos, not an expected gameplay limit. The Trap-before-Shield ordering (invariant 12) applies independently within each nesting level.

---

## 5. Encounter / NPC Configuration

Each encounter corresponds to a specific NPC. The encounter config and NPC definition are unified — the encounter *is* the character.

| Parameter | Type | Description |
|---|---|---|
| `id` | string | Unique encounter identifier |
| `displayName` | string | NPC's display name |
| `startingPriority` | number | Initial Priority value. In Frame mode, positive = player goes first. In Classic mode, determines each side's starting meter value. |
| `defaultRestorePriority` | number | (Frame mode) Priority value set on every Priority Restore event. Not used in Classic mode (meters reset to full each turn). |
| `priorityMode` | `"frame"` \| `"classic"` | **Required.** Which priority model this encounter uses. `"frame"` = shared meter, carry-over, overflow (default gameplay); `"classic"` = separate meters, full replenishment each turn. |
| `opponentPatience` | number | NPC's starting Patience (no maximum cap) |
| `opponentShields` | ShieldSlot[] | Ordered list of NPC shield definitions (see below) |
| `shieldBreakOrder` | number[] | Indices into `opponentShields` defining break sequence |
| `playerDummyShieldSlots` | number | **Required.** Number of Dummy Shield slots available to the player. |
| `allowedCoreShields` | CoreShieldDef[] | **Required.** Core Shield definitions for this encounter (see CoreShieldDef below). If the player's Collection contains the specified cards, they are automatically placed. Empty array if no Core Shields. |
| `unbreakablePlayerShields` | boolean | If true, NPC effects cannot break player shields |
| `relevantCards` | RelevantCard[] | Information Cards this NPC recognises (see below) |
| `traits` | Trait[] | Passive combat modifiers applied throughout the encounter |
| `retryable` | boolean | Whether the player may restart after losing |
| `tutorialMode` | boolean | Enables scripted draw and NPC plays |
| `scriptedDrawOrder` | string[][] | Fixed hands per draw step (tutorialMode only) |
| `scriptedOpponentPlays` | string[] | Fixed NPC play sequence (tutorialMode only) |
| `lieThreshold` | number | Maximum Lie Counter value before the encounter ends as a loss. Set to 0 or omit to disable the Lie mechanic for this encounter. |
| `playedNonRelevantCards` | string[] | IDs of Information Cards that have been played in this encounter at play-time (whether relevant or not). Persists across retries. |

### ShieldSlot

```
{
  cardId: string       // The card behind the shield
  isHint: boolean      // If true, this shield is a Hint (see §3, Hints)
}
```

### CoreShieldDef

```
{
  cardId: string              // Must match a card ID in the player's Collection
  patienceCostOnBreak: number // Patience deducted from shield owner when this Core Shield is broken (may be 0)
}
```

Each Core Shield specifies its own Patience cost on break, allowing per-shield tuning. This is independent of any Shield Trigger effects the card may carry. Dummy Shields always cost a flat 1 Patience on break (or 0 for Effective Break via the Safety keyword).

### RelevantCard

```
{
  cardId: string             // Must match an Information Card ID
  effects: CardEffect[]      // This card's effect definition in this encounter
  effectDescription: string  // Human-readable description shown on discovery
  discovered: boolean        // Whether the effect has already been revealed
}
```

When an undiscovered Relevant Card is played in this encounter for the first time, a reveal animation plays showing `effectDescription`, and `discovered` is set to true, persisting globally. The same card may have different `effects` and `effectDescription` in different encounters.

### Traits

Traits are named passive modifiers. They are evaluated at the points in the state machine where they apply.

**Discoverability:** Each trait has two UI states:
- **Undiscovered** — displayed as a `?` icon in the NPC trait zone. The player knows the NPC has a special behaviour but not what it is.
- **Discovered** — displayed as the trait's proper icon. Hovering over the icon shows the trait's passive effect description. Discovery is triggered the first time the trait's effect fires during an encounter.

Discovery of traits is persistent: once a trait is discovered on a given NPC, it is shown as discovered in all future encounters with that NPC.

Examples:

| Trait | Effect |
|---|---|
| `Fearless` | Cards with the Intimidate effect deal no damage / have no effect |
| `Sensitive` | Cards that cause Patience loss deal 1 additional Patience loss |

*(Full trait vocabulary defined in §9 — NPC Traits and Modifiers)*

---

## 6. Pre-Encounter Phase

The pre-encounter phase occurs before the combat state machine starts. It consists of two stages. Both stages are skipped for tutorial encounters where configuration is fully scripted.

### 6.1 Information Card Selection *(Advanced — Placeholder)*

When the player's Collection contains more Information Cards than a defined threshold, a pre-encounter selection screen allows the player to review and choose which Information Cards to include in their Conversation Deck for the upcoming encounter.

Cards in the Info Card selection screen are displayed in one of three states:
- **Relevant** (`relevantCards` contains this card): highlighted. Effect will be revealed on first play.
- **Non-relevant, not previously played** (not in `relevantCards`, not in `playedNonRelevantCards`): displays `???` / Unknown effect. The player does not yet know whether this card will be useful. If brought into the encounter and played, it converts to Ponder at that moment.
- **Non-relevant, previously played** (not in `relevantCards`, present in `playedNonRelevantCards`): displays **'Will be converted to Ponder'**. If confirmed in the Conversation Deck, this card is substituted to Ponder at deck construction (before the encounter begins), accompanied by a conversion animation.

This stage is deferred until the Collection mechanic is fully designed. It is listed here to define its position in the game flow and the data it depends on.

### 6.2 Shield Card Selection

Before the encounter begins, the player selects which cards from their Conversation Deck to place as starting **Dummy Shields**. Any card may be placed as a Dummy Shield — this is not restricted by supertype, keyword, or color.

- The encounter config's `playerDummyShieldSlots` defines how many Dummy Shield positions are available.
- The player fills available Dummy Shield slots from their Conversation Deck.
- The player may leave Dummy Shield slots empty.
- Cards placed as starting shields are removed from the draw pile before the Conversation Deck is shuffled. They are placed face-up in the player's shield zone.
- **Core Shields** are automatically placed based on `allowedCoreShields` config and the player's Collection. The player does not choose or interact with Core Shield placement.
- This stage is always shown (unless the encounter has `unbreakablePlayerShields` set, in which case the stage may be simplified or skipped).

---

## 7. Persistent State

Some combat state persists between attempts and across sessions.

### Persistent Shield Breaks

If a retryable encounter is restarted after a loss, any opponent shields that were broken in the previous attempt remain broken. The encounter loads its initial state from a global save that records which shields have been broken per encounter.

If `retryable` is false, the encounter does not save broken shield state — a loss ends that encounter permanently.

### Information Card Discovery

The `discovered` flag on each `RelevantCard` entry is stored globally (not per-encounter-attempt). Once an Information Card is discovered in any encounter, it remains discovered in all future contexts.

### Played Non-Relevant Cards

`playedNonRelevantCards` records the IDs of Information Cards that have been played during a given encounter, including those not in `relevantCards`. This list persists across retries of retryable encounters.

Its purpose is to power the warning display in the §6.1 pre-encounter Info Card selection screen: if a card appears in `playedNonRelevantCards` and is not in `relevantCards`, the player is warned that it will resolve as Ponder in this encounter.

If `retryable` is false, `playedNonRelevantCards` is not persisted — there are no future attempts in which the warning would be relevant.

---

## 8. Card Types and Subtypes

### 8.1 Supertypes

Every card belongs to exactly one supertype.

**Skill Cards** represent the Detective's learned conversational abilities. Their effects are always visible. Skill cards are chosen from the player's Skill Deck and form the backbone of every Conversation Deck. Skill cards have a fixed color identity.

**Information Cards** represent knowledge the Detective has gathered about the world and its inhabitants. Their effects are hidden until discovered in a relevant encounter (see §3). Information Cards are colorless by default. Their effect is defined per-encounter in `relevantCards` config, not globally.

### 8.2 Subtypes

Subtypes are supplemental classifications within a supertype.

**Impression** (subtype of Skill): When played, an Impression card is placed on the Field rather than being discarded. It provides a persistent passive effect for the remainder of the encounter. Impressions are removed from the Field when the encounter ends. Impressions are native to Orange.

**Trap** (subtype of Skill): When played from hand during combat, a Trap card is placed on the Field rather than resolving its effects immediately. Traps persist through the opponent's next turn and trigger only when their defined condition is met. If untriggered, they expire to the player's discard pile at the start of the player's next turn. Traps cannot be placed during pre-encounter phases. See §3 (Trap Cards) for full rules.

Additional subtypes will be defined as the card vocabulary expands.

### 8.2.1 Card Text Fields

Every card has two text display fields:

**Effect Text** — A short description of the card's mechanical effect. This text is displayed on the card face during combat. For Skill cards, Effect Text is also displayed on the card face within the Card Collection gallery view. When rendered on the card face, the card's keywords are automatically prepended as separate lines above the Effect Text (computed at render time, not stored in data).

**Long Description** — A longer flavour or explanatory description. This text is NOT shown on the card face by default. It is accessible via:
- A "Details" entry in the card's context menu, which opens a detail modal showing the card's full information (name, keywords, cost, Effect Text, and Long Description).
- A hover tooltip that appears when the cursor rests over the card.

The `CardDefinition` type stores these as `effectText` and `longDescription`, both optional strings. The deprecated `description` field is retained for backward compatibility but should not be used in new card data.

### 8.3 Keywords

Keywords are mechanical terms that appear on card text. All keywords expose their definitions via tooltip on hover (see §10.2).

| Keyword | Applies to | Effect |
|---|---|---|
| **Safety** | Skill | No effect when played normally. When a card with Safety is used as a Player Shield (Dummy) and that shield is broken, triggers an Effective Break — shield owner loses 0 Patience instead of 1. |
| **Assemble** | Skill / Information | This card may participate in a combination with another Assemble card. |
| **Shield Trigger** | Skill (Player Shield) | When a shield with Shield Trigger is broken, its printed effects resolve as a sub-sequence before the break outcome fires. Shield Trigger effects do not trigger an intermediate Check State evaluation — see Invariant 10. |
| **Lie** | Skill (Black) | Playing this card increments the encounter's Lie Counter by 1. If the counter exceeds the encounter's `lieThreshold`, the encounter ends as a loss. |
| **Trap** | Skill | This card is placed on the Field when played from hand during combat. It persists through the opponent's next turn and triggers only when its defined condition is met. Cannot be placed during pre-encounter phases. |

> **Removed keyword:** The **Interrupt** keyword has been removed from the game. Cards formerly bearing Interrupt no longer have special play-during-opponent-turn capability. The interrupt-checking model has been replaced by the Field Trigger Check system. Implementation note: the `isInstant`/`isInterrupt` field naming in the codebase will need cleanup during implementation.

### 8.4 Color Identities

Color identity is a property of Skill Cards (and a small number of rare cards) that reflects the Detective's personality and conversational style. Information Cards and Ponder are colorless. Color identity informs mechanical theme, Trait interactions, and dynamic combination naming (see §10.4).

---

#### Red

Red represents a passionate, impulsive person who speaks before thinking and imposes their will with little consideration. Red gets straight to the point and hates waiting.

Mechanically, Red cards have low Priority costs and are fast to play. Red excels at eroding the NPC's Patience quickly and has tools for aggressive shield-breaking pressure, enabling a fast playstyle that overwhelms opponents before they can respond. Red players go after shields by burning through Patience and maintaining constant pressure.

---

#### Blue

Blue represents a logical, collected person who relies on reason and can articulate complex ideas convincingly — but tends to ignore the human element and can come across as cold.

Mechanically, Blue cards have higher average Priority costs but greater effects. Blue has deep access to the **Shield Trigger** keyword, reflecting the color's defensive intelligence. **Assemble** is native to Blue, representing the assembly of complex arguments from simpler components. Blue also has cards that increase BotM capacity, representing superior memory and long-term planning. Blue players invest heavily upfront for outsized payoffs.

---

#### Green

Green represents an empathetic, emotional person who cares deeply about how others feel. Considerate and patient, Green is the best listener — and understands that understanding someone takes time.

Mechanically, Green emphasizes preservation and restoration of NPC Patience, and has the best tools for discovering opponent Traits and Hints early. Green players place their own shields frequently and have access to cards with incremental effects that grow stronger the more times they are played in an encounter. Green expects long conversations and is built to sustain them.

---

#### White

White represents a spiritual or religious person whose reasoning is rooted in faith and conviction. White's perspective can seem unfathomable to outsiders, but those who share the same beliefs find White deeply resonant.

Mechanically, White has cards that allow the player to ignore the effects of certain enemy cards entirely. White also has cards that leverage low NPC Patience — their effectiveness increases as the NPC grows less tolerant. White has increased effectiveness against NPCs with the **Spiritual** Trait. White meshes well with other White cards but may struggle to convince certain personality types.

---

#### Black

Black represents an unscrupulous, cunning person who believes the ends justify the means. Black speakers manipulate, lie, and implicate others without hesitation to achieve their goals.

Mechanically, Black houses some of the strongest individual card effects in the game, offset by heavy penalties for repeated use. Black cards frequently carry the **Lie** keyword, incrementing the encounter's Lie Counter — exceeding the threshold ends the encounter as a loss. Black also has cards that reverse the negative effects of incoming enemy cards and cards that steal enemy cards within an encounter for the player's use. Black rewards risk and punishes recklessness.

---

#### Orange

Orange represents a person who appeals to authority, leverages their associations, and cultivates a specific image of themselves in the world. At their best they command an imposing presence; at their worst they are followers incapable of original thought.

Mechanically, Orange is built around **Impressions** — a card subtype that remains on the Field when played, providing persistent passive effects (see §8.2). The Orange playstyle requires setup time and is context-dependent: the player performs Overworld quests to acquire Impression cards tailored to specific NPCs, building an advantageous image before the encounter begins. Orange also has powerful Skill cards that strip away enemy Traits, and is effective at detecting and countering Lie cards.

---

#### Purple

Purple represents a chaotic, theatrical, and unpredictable person — a jester, a joker, or simply someone whose behavior defies logic.

Mechanically, Purple cards lean into random chance effects. Purple also has the unique ability to permanently remove cards from both the player's Conversation Deck and the NPC's deck during an encounter, resulting in smaller deck sizes than normally possible. This is a temporary change scoped to the encounter.

---

#### Colorless

Colorless is the default identity for Information Cards and Ponder. A small number of rare Skill Cards are also colorless, representing the dry, apathetic person who offers no opinions and dampens every room they enter — difficult to get along with, yet their detachment can be tactically useful.

Colorless Skill cards (excluding Ponder and Information Cards) are characterized by effects that can end encounters early, convert both player and opponent cards into low-value filler (reducing the potential of both decks), and other effects that impose mutual costs. These cards are rare and often difficult to obtain.

---

---

## 9. NPC Traits and Modifiers

*(Placeholder — full trait vocabulary, modifier stacking rules, interaction with card effects)*

---

## 10. Combinations

The combining mechanic allows Assemble cards in the player's hand to be merged into a new, composite card. Combining does not trigger any state machine transition — the state remains in Player Pending — but the change to the hand must be communicated with a clear animation.

### 10.1 Combining Rules

- Only cards with the **Assemble** keyword may participate in a combination. A combination always involves **exactly two** Assemble cards.
- Combining is initiated by the player from the hand during Player Pending. The player selects exactly two Assemble cards and attempts to combine them.
- A combination **succeeds** if a valid recipe exists for the selected components (see §10.2).
- On success: the component cards are removed from the Conversation Deck and replaced in the hand by a single new combined card with its own effects and name.
- A combination **fails** if no valid recipe exists for the selected components. The component cards remain in hand unchanged. The player is notified that the combination failed.
- Combining does not consume Priority.

### 10.2 Recipe-Based Combinations

Recipes are predetermined pairings (or larger groupings) of card IDs that produce a specific combined card. Recipes are defined globally — they are not encounter-specific unless otherwise noted.

A recipe specifies:
- The required component card IDs (order-independent)
- The resulting combined card definition (name, effects, cost, keywords)

### 10.3 Combined Card Lifecycle

When a combined card is played:

1. The combined card is removed from the Conversation Deck.
2. Each component card is placed in the discard pile.
3. The combined card's effects resolve normally in Player Play State.

The component cards are not permanently lost — they will return to the draw pile via Deck Recycle and may be drawn and combined again in a later turn.

### 10.4 Dynamic Combining (Skill Cards with Assemble)

A Skill card that acquires the **Assemble** keyword through a card effect or modifier becomes eligible to combine. Dynamic combinations follow different rules from recipe-based combinations:

- **Skill + any Assemble card:** The Skill card's effects are appended to the other card's existing effects. The resulting card retains the other card's name, cost, and base effects, with the Skill's effects added after them.
- **Skill + Skill (both with acquired Assemble):** The two Skill cards' effects are merged. The resulting card's name is determined by the color identities of the component cards. *(Color identity is defined in §8 — Card Types and Subtypes.)* As a placeholder, all such combinations are named **"Rhetoric"**.

Dynamic combinations do not require a recipe. If a Skill card with Assemble is among the selected cards, the dynamic combining rules apply. If neither card is a Skill with acquired Assemble, a recipe is required (§10.2).

When validating a dynamic combination result, designers must verify that the combined card does not contain more than one shield-break effect across the merged effects list (see Invariant 11 — for Dummy Shields, multi-break is now allowed, but Core Shield single-break remains enforced).

### 10.5 Open Design Questions

- Whether recipes can be encounter-specific (i.e., certain combinations only work in certain contexts) is not yet defined.
- The color identity system referenced in §10.4 is pending §8.

---

## 11. UI Design Principles

These rules apply across all game screens and take precedence over convenience shortcuts in implementation. New UI work should be checked against these principles before it is considered done.

### 11.1 State Changes Are Never Silent

Any change to a quantity that affects the player's decision-making must be communicated through a visible animation or transition. Animations for separate events must play sequentially — never concurrently. The player must be able to read each change before the next one begins.

Quantities that always require animated feedback include, but are not limited to:

- **Priority** — cost deduction and any restoration
- **Patience** — any increase or decrease
- **Shield break** — opponent or player shield being broken (distinguish Dummy vs Core visually)
- **Information Card discovery** — reveal animation on first play
- **Priority Restore** — the transition event itself, distinct from the Priority value change
- **Deck Recycle** — discard pile reshuffling into draw pile
- **Priority costs** — the deduction shown at the moment a card is played
- **Trait discovery** — transition from `?` icon to proper trait icon
- **Keyword interactions** — when a keyword modifies or nullifies an effect
- **Trap placement** — card moving to Field
- **Trap trigger** — Trap activating and resolving its effect
- **Trap expiry** — untriggered Trap moving to discard
- **Shield resequencing** — shields sliding to new positions
- **Shield Trigger activation** — visual indicator that a Shield Trigger is firing

This list is non-exhaustive. When in doubt, animate it.

### 11.2 Important Information Must Be Easily Accessible

The player should never have to guess what a mechanic does. All mechanical terms, keywords, and icons should expose their definitions on demand — without navigating away from the current screen.

- **Keyword tooltips:** Keywords appearing in card text and UI copy are rendered as interactive rich text. Hovering or tapping a keyword displays its definition inline.
- **Trait tooltips:** Discovered trait icons display a description of their passive effect on hover or tap.
- **Shield contents:** Player shields are always visible face-up to the player.
- **Trap conditions:** Active Traps on the Field display their trigger condition on hover.

Information should be reachable in at most one interaction from wherever the player currently is.

### 11.3 Detail on Demand — Keep the Screen Clean

The game is information-rich. Surfacing all information at once would create clutter that harms readability. Information should be visible by default only if it is needed for every decision; otherwise it should be accessible on demand.

Guidelines:
- **Favour icons over text** in the primary game view. Labels and descriptions belong in tooltips and inspect panels, not in the default layout.
- **Do not display secondary or contextual information passively.** Card effect text, trait descriptions, and keyword definitions are revealed on hover/tap, not always visible.
- **Keep numerical displays minimal.** Show the current value; show changes via animation; do not show historical values or verbose breakdowns in the main view.
- **Shield type indicators:** Use distinct visual treatments for Dummy Shields vs Core Shields (e.g., different border styles or icons) so the player can immediately distinguish them without hovering.

When adding new UI elements, default to the minimum visible representation (icon or number) and attach detail to a hover or tap interaction.

### 11.4 Player Actions Require Implicit Confirmation

Player actions must never be triggered by a single tap or click on a card alone. All card plays and placements must require one of:
- **Drag-to-zone**: the player drags a card into a designated play zone (e.g. a highlighted "play area" that appears when a card is picked up). Releasing outside the zone cancels the action.
- **Context menu**: a right-click or long-press on a card opens a context menu with explicit options ("Play", "Place as Shield", "Set as Back of Mind", "Play as Trap" for Trap cards). Selecting an option from the menu confirms the action.

This rule exists to prevent accidental plays and to give the player a moment of consideration before committing. Buttons and confirmation dialogs for blocking sub-states (shield sacrifice, reveal dismiss) are exempt — those are already explicit.

### 11.5 Card Zone Transitions Must Be Animated

Every card movement between zones must have an accompanying Framer Motion animation. A card must never teleport between zones. Required animations for each transition:

| Transition | Animation |
|---|---|
| Deck → Hand (draw) | Card slides in from deck position, fanning into hand |
| Hand → Play zone (play) | Card lifts off hand, moves to center play zone, shrinks and dissolves |
| Hand → Shield slot (place as shield) | Card floats to shield slot, clicks into place |
| Hand → Field (play trap) | Card slides to Field, glows to indicate pending state |
| Hand → Back of Mind | Card slides to BotM zone |
| BotM → Hand (restore) | Card slides back into hand |
| Play zone → Discard | Card slides from play zone to discard pile |
| Field → Play zone (trap trigger) | Trap card flashes, moves to play zone, resolves, then to discard |
| Field → Discard (trap expire) | Trap card fades out and slides to discard |
| Enemy card → Enemy play zone (stage) | Card slides in from enemy side |
| Enemy play zone → Enemy discard | Card slides to enemy discard |
| Deck → Deck (reshuffle) | Discard pile cards animate into a stack, stack flips to become deck |
| Shield → Discard (break) | Card cracks/shakes, then slides to discard |
| Shield resequence | Shields slide smoothly to new positions |

Animations within a single turn must be sequential, never concurrent (see §11.1). Each animation should complete before the next begins. Use Framer Motion's `AnimatePresence` and layout transitions for zone entry/exit.

---

## 12. Implementation Impact / Open Questions

This section summarizes what parts of the existing combat engine architecture will require reworking when the v1.1/v1.2 changes are implemented. All 9 open questions from the v1.1 draft have been resolved. A small number of new questions emerged from the v1.2 Priority restructuring (see bottom of section).

### Architecture Impact

1. **Interrupt system removal.** The `Interrupt Check`, `Interrupt`, and `Interrupt Play` states must be removed from the combat phase state machine. All references to the `Interrupt` keyword in card definitions, the `isInstant`/`isInterrupt` fields in the type system, and the interrupt-checking logic in the reducer must be removed or repurposed. The BotM card can no longer be played during the opponent's turn.

2. **Field Trigger Check system.** A new state/step must be added to the state machine that evaluates Trap triggers and Shield Triggers after each card resolves. This requires:
   - A trigger evaluation function that checks all active Traps on the Field against their trigger conditions (authored as structured fields — see §3, Trap Cards)
   - A queue system for pending Shield Triggers (ordered by break sequence)
   - Integration points after Player Play and Enemy Play resolution
   - **Nested trigger resolution with depth guard.** The trigger evaluation must support genuinely recursive/nested resolution: when a trigger's effects cause another trigger, the new trigger resolves immediately as a sub-step. A hard depth cap of 20 nested triggers must be enforced — halt and log an error if reached. This is a safety guard against malformed card combos, not an expected gameplay limit.

3. **Shield zone composition (Dummy vs Core).** New state is needed for:
   - Per-shield metadata: type (dummy/core), current sequence position, Shield Trigger status, broken/intact flag
   - Encounter config: `allowedCoreShields` (array of `CoreShieldDef` — each specifying `cardId` and `patienceCostOnBreak`), `playerDummyShieldSlots` count
   - Auto-placement logic for Core Shields based on player Collection
   - Left-to-right automatic targeting replacing the former manual Player Shield Choice (the `PlayerShieldChoice` blocking state is removed — shield breaks are a non-blocking resolution step within Enemy Play)

4. **Field state.** The Field is the persistent battlefield zone for both Traps and Impressions. New state needed:
   - Active Traps with their structured trigger conditions, play-order timestamp, and owning player
   - Active Impressions with their persistent passive effects
   - Expiry tracking for Traps tied to turn transitions (expire when initiative returns to the player)
   - Trigger condition evaluation integrated into Field Trigger Check

5. **Priority mode selection.** New game-mode state:
   - `priorityMode` field on encounter config (`"frame"` | `"classic"`) — **required field**
   - Frame mode: single shared meter, carry-over, Patience overflow on overspend
   - Classic mode: two independent meters (player + NPC), full reset per turn, no overflow
   - Card playability validation (cannot play if cost > current Priority in Classic mode, unless an exception effect is active)
   - Classic mode requires fundamentally different Check State routing (see Open Questions)

6. **Turn-ending change.** Remove any auto-end-turn logic. The player must always explicitly trigger end turn regardless of Priority value or available moves.

7. **Multi-trigger resolution queue.** When a single card causes multiple triggers:
   - Build a resolution queue ordered by: Traps (play order) → Shield Triggers (break order)
   - Process queue with nested/recursive sub-step resolution (not flat queuing)
   - Enforce depth cap of 20 nested triggers as a safety guard

8. **Shield resequencing.** UI-only action during Player Pending that updates the ordering of the shield array in state without consuming Priority or triggering transitions.

9. **Encounter config schema (breaking change).** The following fields are **required** on all encounter definitions — no backwards-compatibility shim or optional fallback is needed, since there are no production-ready encounters:
   - `allowedCoreShields: CoreShieldDef[]` — Core Shield definitions (empty array if none)
   - `playerDummyShieldSlots: number` — Dummy Shield slot count
   - `priorityMode: "frame" | "classic"` — priority model selection

10. **Trap trigger condition data model.** Trap trigger conditions are authored as structured fields (not a DSL or hardcoded logic). The data shape should mirror the existing card effect field conventions — typed fields with a fixed vocabulary of trigger types, targets, comparators, and values. Exact field names are an implementation detail, but the authoring philosophy is: structured, validatable, and extensible without engine changes. A DSL-based approach is a possible future expansion if trigger complexity outgrows structured fields.

11. **Shield break no longer restores Priority.** All code paths where a player shield break triggers Priority Restore must be removed. Shield breaks now resolve only their Patience cost and Shield Trigger effects. The Priority meter is unaffected by the break itself (though a Shield Trigger's own card effects may still include explicit Priority-modifying effects).

12. **Dual Priority meter structure (Classic mode).** Classic Priority Mode requires a fundamentally different state representation: two independent Priority values instead of one shared meter. The Check State routing (rules 5–8, which check a single shared Priority value) must be branched or replaced for Classic mode with alternating-turn logic. This is a significant engine change — Classic mode's state machine routing may differ substantially from Frame mode's.

### Open Questions (v1.2)

All v1.2 open questions have been resolved:

1. ~~**Classic Priority Mode: Check State routing.**~~ Resolved — uses `activeTurn: 'player' | 'npc'` flag. See changelog entry above.
2. ~~**Classic Priority Mode: turn transition mechanics.**~~ Resolved — Classic Turn Start resets player Priority, returns BotM to hand, draws to hand limit, expires Field traps. NPC Turn Start resets NPC Priority. See changelog entry above.

---

*End of document — v1.2*
