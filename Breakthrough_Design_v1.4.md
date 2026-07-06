# Breakthrough — Game Design Document

> **Status:** Draft v1.4 — Full rewrite. Two-meter Priority model with debt transfer, canonical turn boundaries, unified event vocabulary, hybrid shield economy, Info Nugget system canonized, Classic mode removed. Supersedes v1.2/v1.3 entirely.

---

## Changelog

### v1.4 — 2026-07-05

- **Priority rebuilt as a two-meter debt-transfer system.** Each side has its own Priority meter. The shared-meter "Frame mode" and the separate-meter "Classic mode" are both removed; there is now exactly one priority system (§3.1). The UI still presents a single bar swinging between the two sides — that is presentation only.
- **No automatic turn handoff.** Reaching 0 or negative Priority locks the player out of further plays but never ends the turn. The player always clicks End Turn. The NPC's turn ends automatically when it can no longer act (§3.1, §4).
- **Overspend and debt transfer.** A card may be played whenever the actor's Priority is positive, even if its cost exceeds the current value — the meter goes negative (unbounded). At turn end, the negative balance transfers to the opponent as bonus starting Priority, clamped by their maximum. Symmetrical for both sides.
- **Turn-start Priority formula.** `min(maxPriority, minTurnStartPriority + opponent's transferred debt)`, with a configurable first-turn bonus. This replaces both `defaultRestorePriority` and the v1.3 ±3 turn-handoff bonus. The "Priority Restore" event no longer exists; its duties (BotM return, hand refill) belong to Player Turn Start.
- **Canonical turn boundaries.** "Turn" and "Round" are formally defined. All timed mechanics (trap expiry, restriction durations, scheduled effects, counter resets) are assigned to exactly one of four named boundaries, each with an ordered housekeeping list (§4). Durations are never authored as bare integers.
- **Unified event vocabulary.** Traps, Shield Triggers, and passive triggered abilities all consume one canonical set of engine events with owner-relative filters (§5). Every authorable trigger must map to a dispatched event.
- **Trap cancellation fixed by design.** A `CARD_STAGED` event opens a pre-resolution window; a trap that cancels the staged card prevents its effects from ever resolving (§3.6).
- **Hybrid shield economy.** Encounters auto-fill the player's dummy slots with free placeholder shields (removed from the game on break). Mid-combat placements use real hand cards (discarded on break). Core Shields retained as designed (§3.4).
- **NPC Guard Shields canonized.** The prototype's "NPC dummy shields" are kept as an intentional pacing buffer and renamed **Guard Shields** (§3.3).
- **Info Nugget system canonized.** Replaces `relevantCards` as the Information Card model (§3.9).
- **New systems documented:** Tokens (§3.7), Impressions incl. NPC-owned (§3.8), Counters & Thresholds (§3.10), Triggered Abilities (§5.2), Activated Abilities (§5.3), Restrictions & Replacements (§9), Scheduled Effects (§9.4), keywords **Rapport** and **Heavy Hand** (§8.3), Copy effects (§8.5), NPC play policy (§10).
- **NPC hand.** The NPC now mirrors the player: shuffled deck, random draw to a hand (`npcHandLimit`, default 5) at NPC Turn Start, plays the leftmost hand card while its Priority is positive, discards its remaining hand at turn end, deck recycles as normal. `scheduledPlays` are excluded from normal draws and injected directly into the hand when their round arrives (§10).
- **Lock-and-keys opponent shields.** `shieldBreakOrder` is removed. Generic shield-break effects hit Guard Shields only. NPC Core Shields each list one or more **key nuggets**; while zero Guards stand, playing any Information Card of a matching nugget breaks that shield. Break order is therefore determined by the player's key plays, not authored sequence. NPC effects may restore Guard Shields mid-combat, re-gating the locks (§3.3).
- **Patience goal asymmetry clarified.** Patience is a shared quantity the player wants to keep high (it hits 0 → player loses) and the NPC works to deplete. Player cards that reduce Patience are paying a *cost*, not dealing damage. Color text (Red, White) reworded accordingly (§3.2, §8.4).
- **Cut:** Classic Priority Mode, `priorityMode`, `startingPriority`, `defaultRestorePriority`, `shieldBreakOrder`, mid-play Priority Restore, patience overflow (already removed in v1.3, body now agrees), hardcoded card-ID logic in the engine, playing from Back of Mind, the deprecated `description` field. (`REVEAL_NPC_HAND` becomes designable again now that the NPC has a hand — future effect, not in the v1.4 build target.)

*(Earlier changelog history lives in the v1.2 document; it is superseded, not amended.)*

---

## 1. Overview

Breakthrough is a single-player detective card game. The Detective engages in conversation-based encounters with NPCs, modelled as card combat: the player plays cards to break the NPC's information shields while managing **Priority** (initiative/tempo) and the NPC's **Patience**.

This document is the authoritative source of truth for the combat system. Any implementation must conform to it. Where the previous prototype disagrees with this document, this document wins.

**Win:** break all opponent shields — Guard Shields by pressure, NPC Core Shields by playing the right knowledge (lock-and-keys, §3.3).
**Lose:** the NPC's Patience reaches 0, the Lie Counter exceeds the encounter threshold, or all player shields are broken (when the encounter uses player shields).

---

## 2. Glossary

| Term | Definition |
|---|---|
| **Priority** | Per-side resource governing action availability. Each side has its own meter; the UI displays them as one bar. Playing a card costs Priority; overspending drives the meter negative and the debt transfers to the opponent at turn end. |
| **Patience** | The NPC's tolerance for the conversation — a shared quantity with asymmetric goals: the player wants it high, the NPC depletes it. Per-encounter starting value, no maximum cap. ≤ 0 ends the encounter as a **player loss**. |
| **Turn** | One side's window of control, from its Turn Start boundary to its Turn End boundary. |
| **Round** | One Player Turn plus the following NPC Turn. The round counter increments at Player Turn Start. If the NPC takes the very first turn of combat, that turn belongs to Round 0. |
| **Transferred Debt** | The absolute value of a side's negative Priority at its turn end, credited to the opponent's next turn-start Priority. |
| **Opponent Shield** | A face-down shield belonging to the NPC. Breaking all of them (Guards and NPC Core Shields alike) wins the encounter. |
| **Guard Shield** | An NPC-side buffer shield with no card, lore, or keys behind it. The only opponent shield that generic break effects can hit. Formerly "NPC dummy shield." |
| **NPC Core Shield** | An authored opponent shield with lore and one or more **key nuggets**. Breaks only when a key is played, and only after all Guard Shields are down. May be a Hint. |
| **Key** | An Information Card whose `nuggetId` appears in an NPC Core Shield's key list. Playing it (guards down, lock intact) breaks that shield. One lock, many possible keys; any single key suffices. |
| **Hint** | An NPC Core Shield that displays lore but adds no card to the player's Collection. Its text remains visible in the shield zone after breaking. |
| **Player Shield** | A face-down card in the player's shield row: Placeholder, Real-card, or Core. |
| **Placeholder Shield** | A free synthetic shield auto-filling the player's dummy slots at encounter start. Removed from the game on break (no discard). |
| **Dummy Shield** | Collective term for Placeholder Shields and Real-card Shields — anything in the shield row that is not a Core Shield. All Dummy Shields must break before Core Shields are targetable. |
| **Core Shield** | Encounter-configured shield auto-placed from the player's Collection, with per-shield `patienceCostOnBreak`. Targetable only after all Dummy Shields are broken. |
| **Shield Trigger** | Keyword. When a shield bearing it is broken, its trigger effects resolve before the break outcome. |
| **Safety** | Keyword. No effect when played. As a broken Dummy Shield: Effective Break (0 Patience instead of 1). |
| **Trap** | Card subtype. Played to the Field; fires when its trigger condition (a canonical event + filters) is met; expires untriggered at its owner's next Turn Start. |
| **Field** | Shared persistent battlefield zone holding Traps, Impressions, and Tokens. Distinct from hand, deck, discard. |
| **Impression** | Card subtype. Sits on the Field providing a persistent passive effect. Either side may own Impressions. Available to any color; most prevalent in Orange's playstyle. |
| **Token** | A Field-only card created by effects (never played from hand, never in a deck). Has a registry definition; may carry abilities and leave-triggers. |
| **Counter** | A named integer accumulated on a Field permanent. Thresholds may consume counters to fire effects or transform the permanent (§3.10). |
| **Back of Mind (BotM)** | Card(s) retained across the turn transition when the player ends their turn. Default capacity 1. The only carry-over mechanism, since hands refresh each turn. |
| **Lie** | Keyword (Black). Increments the Lie Counter; exceeding `lieThreshold` loses the encounter. |
| **Assemble** | Keyword. The card may combine with another Assemble card via recipe (§11). |
| **Rapport** | Keyword (Green). The card requires predicting a value when played; its trigger/bonus applies only when the prediction is correct (§8.3). |
| **Heavy Hand** | Keyword. The card may optionally be played for double cost to use its upgraded effect list (§8.3). |
| **Info Nugget** | An abstract piece of world knowledge. Information Cards reference a nugget; encounters override the card's behaviour per-nugget (§3.9). |
| **Discovered** | A nugget whose encounter-specific effect has been revealed. Persists globally. |
| **Ponder** | The colorless fallback card (cost 1, draw 1). Non-overridden nugget cards convert to Ponder when played. |
| **Staged Card** | The card the NPC has loaded from its hand, pending resolution. Exists from `CARD_STAGED` until resolution completes or a trap cancels it. |
| **NPC Hand** | The NPC's randomly drawn hand (limit `npcHandLimit`, default 5), refilled at NPC Turn Start, discarded at NPC Turn End. Hidden from the player. |
| **Skill Card / Information Card** | The two supertypes; see §8.1. |
| **Conversation Deck / Skill Deck / Collection** | As in v1.2: Collection = all owned cards; Skill Deck = 20 chosen Skill cards; Conversation Deck = Skill Deck + selected Information Cards. |
| **Restriction** | A temporary rule modification targeting one side, with a named expiry boundary (§9). |
| **Replacement** | A temporary substitution rule: "whenever you would create token X, create token Y instead" (§9.3). |
| **Scheduled Effect** | An effect list queued to fire at a named future boundary (§9.4). |
| **Retryable / Persistent Break / Deck Recycle** | As in v1.2 (§7, §3.12). |

---

## 3. Core Concepts

### 3.1 Priority

Each side owns an independent Priority meter. **Presentation:** the UI renders a single horizontal bar; during the player's turn it shows the player's meter extending toward the player's side, during the NPC's turn the NPC's meter toward theirs. Debt (negative values) renders as an inverted/hollow segment on the owner's side. This is a display convention — the meters never share state.

**Playability rule.** An actor may initiate a card play, shield placement, or Priority-costed ability **only while their meter is positive (≥ 1)**. The cost may exceed the current value: the full cost is always deducted, and the meter may go arbitrarily negative (no floor). After each play **fully resolves** (all effects, triggers, and blocking acknowledgements), the engine re-evaluates: at ≤ 0 the actor is locked out of further Priority-spending actions. Priority-gaining effects can re-open the window mid-turn — regaining a positive meter re-enables plays without any turn-transition semantics.

**No automatic handoff.** The player retains control at any meter value and must explicitly click **End Turn** — this is the player's acknowledgement that their turn is over, even when no legal moves remain. Free actions (shield resequencing, combining, inspecting) remain available while locked out.

**Turn-start value.** At each side's Turn Start:

```
priority = min(maxPriority, minTurnStartPriority + opponentTransferredDebt)
```

- `minTurnStartPriority` — encounter-configurable, default **3**. This replaces the v1.3 turn-handoff bonus.
- `opponentTransferredDebt` — the opponent's negative balance from their just-ended turn (0 if they ended at ≥ 0). Consumed on use; never banked.
- `maxPriority` — encounter-configurable cap, default **10**. Debt transfer is clamped here, not at the moment of overspend: a player may drive their own meter to −20, but the NPC's next turn starts at most at `maxPriority`.
- **First turn of combat only:** add `firstTurnBonusPriority` (encounter-configurable, default **2**) — the first turn has no incoming debt, and the bonus buys setup room. Applies to whichever side takes the first turn (`startingSide`, default player).

**Turn-end settlement.** At a side's Turn End: if the meter is negative, its absolute value becomes the opponent's transferred debt. If positive, the surplus is recorded in that side's `lastUnspentPriority` (a tracked variable with **no mechanical effect yet** — reserved for future mechanics; overwritten at that side's next Turn End). The meter then zeroes.

**Symmetry.** Every rule above applies identically to the NPC. The NPC plays while positive, may overspend, gets locked out at ≤ 0, and transfers debt to the player. The NPC's turn ends automatically (§4.4).

### 3.2 Patience

Per-encounter starting value (default 10), no maximum cap. Patience ≤ 0 at a Check is a **player loss** (win-before-loss ordering applies, §6.1). Card costs never spill into Patience — overspend is handled entirely by the debt mechanism.

**Goal asymmetry (normative for card design and all rules text):** Patience is a shared quantity with opposite stakes. The **player** wants it high — it is a budget they manage and protect; player cards that reduce Patience are paying a *cost* for power, never "dealing damage." The **NPC** wants it depleted — draining Patience is the NPC's primary route to defeating the player. Rules text, card text, and UI copy must never imply the player benefits from low Patience per se (specific payoff cards like White's low-Patience scalers are deliberate risk/reward exceptions, framed as such). This asymmetry also constrains **Copy effects** (§8.5): an NPC card whose purpose is Patience depletion is strategically useless in the player's hand as-is; copy design may need such effects to invert (e.g. restore instead of deplete) when controller changes. The general rule is deferred to card design — but any copy mechanic must be checked against this asymmetry.

### 3.3 Opponent Shields — Guards and Lock-and-Keys

The opponent's shield row = **Guard Shields** (count from `npcGuardShieldCount`) in front of authored **NPC Core Shields** (`opponentShields`). There is no authored break order — the two tiers break by entirely different mechanisms:

**Guard Shields** are the only opponent shields that generic shield-break effects (`BREAK_OPPONENT_SHIELD` and kin) can hit. They carry no card, no lore, no keys — pacing armor that sets how much raw pressure the encounter absorbs before its secrets become reachable. While no Guards stand, generic break effects have no valid opponent target and fizzle — but Guards are **restorable**: NPC card effects may place new Guard Shields mid-combat, re-gating the locks (keys only work while zero Guards stand) and restoring the relevance of the player's break effects. Guard restoration is a core NPC defensive tool, not an edge case.

**NPC Core Shields** follow a **lock-and-keys** principle. Each core shield lists one or more **key nugget IDs** (one lock, many possible keys). A core shield breaks when, with **all Guard Shields already broken**, the player plays any Information Card whose `nuggetId` matches its key list. The break resolves as an automatic step after the played card's own effects (§6.3): Reveal Pending fires with the shield's lore; Hints leave their text permanently visible; non-Hint core shields add their card to the player's Collection. Consequences:

- **Break order is player-determined** — whichever lock's key you play first breaks first. No `shieldBreakOrder` exists.
- **Keys are never wasted permanently.** A key played while Guards still stand, or one keying an already-broken lock, simply resolves its nugget override effect (or Ponder conversion) with no break; the card discards and recycles normally, replayable later.
- **Knowledge gates winning.** An encounter is unwinnable without at least one key per lock in the Conversation Deck — intentional: overworld investigation is a hard gate, and Hints exist to signpost missing knowledge.
- Encounter pacing has two phases by construction: a pressure phase (clear Guards) and an unlock phase (present the right knowledge) — mirroring the player's own Dummy-before-Core protection.

**Validation:** every encounter defines at least one opponent shield (guards + cores ≥ 1); every NPC Core Shield lists at least one key nugget. An empty shield row or keyless lock is a config error, not a gameplay state.

### 3.4 Player Shields

Three kinds, one row, broken left-to-right:

1. **Placeholder Shields** — at encounter start, all `playerDummyShieldSlots` are auto-filled with free synthetic Placeholder Shields. On break: owner loses 1 Patience; the placeholder is **removed from the game** (it was never a real card).
2. **Real-card Shields** — during their turn the player may place any hand card as a shield into an empty slot for a fixed **2 Priority** (subject to the playability rule; printed effects do not resolve). On break: owner loses 1 Patience (0 with **Safety**); the card goes to the **player's discard pile**.
3. **Core Shields** — encounter-configured (`allowedCoreShields`); auto-placed if the player's Collection contains the card; not player-chosen; no substitution if unowned. Each defines its own `patienceCostOnBreak` (may be 0). Targetable only after all Dummy Shields (placeholders + real cards) are broken. On break the card goes to discard. A single effect may break multiple Dummy Shields but **never more than one Core Shield** (hard invariant).

**Targeting is automatic:** the leftmost eligible shield is always broken. The player's lever is **free resequencing** of the shield row during their own turn (no cost, no state transition).

**Shield-loss condition:** the condition **arms** the first time the player's shield row is non-empty during the encounter, and **fires** (loss) at any later Check where the row is empty, unless `unbreakablePlayerShields` is set. Consequences: encounters defining no player shields at all never arm it; an encounter whose only configured shields are core cards the player doesn't own also never arms it (no instant loss on an empty starting row); and any encounter with dummy slots arms it immediately at start, since placeholders auto-fill. Note that mid-combat real-card placement can re-arm pressure but also means an armed, emptied row is a loss even if the player still holds placeable cards — placing shields before the row empties is the player's responsibility.

### 3.5 Shield Triggers

Keyword on cards used as shields (either side). When the shield breaks, its **`shieldTriggerEffects`** (falling back to its printed effects if absent) resolve as a sub-sequence before the break outcome. Multiple triggers resolve in break order. Shield Trigger resolution never causes an intermediate Check evaluation (§6.7, Invariant 8). NPC Information Shields may also carry Shield Trigger.

### 3.6 Traps

Card subtype. Played from hand to the Field (cost paid normally, effects deferred). Either side may own Traps.

- **Trigger condition:** a structured reference to one canonical event (§5.1) plus optional filters (comparator + value, compound conditions, Rapport prediction). Authoring a condition against an event the engine does not dispatch is a validation error — no silent dead traps.
- **Owner-relative wording:** conditions are phrased as "the controller's opponent does X." A player trap watching `CARD_STAGED` fires on NPC plays; an NPC trap watching `CARD_PLAYED` fires on player plays. Both directions must work.
- **Cancellation window:** the `CARD_STAGED` event fires when the NPC loads a card, **before** any of its costs or effects resolve. A trap that cancels the staged card in this window moves it to the NPC discard and its resolution **never begins** — no effects, no double-discard. (Player plays have no staged window in v1; a symmetric mechanism is a future extension.)
- **Firing:** on a matching event, the trap's effects resolve immediately (nested, depth-capped, §5.4), then the trap moves to its owner's discard — unless marked `trapPersistent`, in which case it stays but cannot re-fire within the same resolution cycle.
- **Expiry:** untriggered traps expire to their owner's discard at their **owner's next Turn Start** (boundary step, §4).
- **Ordering:** multiple traps triggered by one event fire in play order (oldest first). All applicable traps fire before any Shield Triggers from the same event (§5.4).

### 3.7 Tokens

Tokens are Field-only cards instantiated from a **token registry** of definitions. They are never drawn, held, or played from hand. Effects create them (`CREATE_TOKEN`), transform them (`TRANSFORM_TOKEN` — bypasses leave-triggers), and destroy them (`DESTROY_TOKENS`, or their own `DESTROY_SELF`). Destruction fires the token's leave-trigger effects and dispatches `TOKEN_DESTROYED`. Tokens may carry triggered abilities (§5.2) and activated abilities (§5.3). Tokens are the backbone of Blue's build-up economy (e.g. Logical Chain → Impactful Conclusion).

### 3.8 Impressions

Card subtype, available to any color (Orange simply uses them most heavily — a card-design matter, not a rules restriction). When played, the card moves to the Field instead of the discard and provides a persistent passive effect (typically expressed as linked Restrictions, triggered abilities, or turn-start effects). Optional per-card lifecycle fields: limited duration (expires at owner's Turn Start after N of the owner's turns), return-to-deck instead of discard on expiry, destroy-below-Patience threshold. **NPC-owned Impressions** are legal and may define turn-start effects that fire at NPC Turn Start. Restrictions created by an Impression are linked to it and removed when it leaves the Field. Encounters may define `startingImpressions`.

### 3.9 Information Cards and Info Nuggets

The **Info Nugget** system replaces v1.2's `relevantCards`.

- A **nugget** is an abstract piece of knowledge (id, name, description). Information Cards carry a `nuggetId` — the card is a *manifestation* of that knowledge.
- Each encounter defines **`nuggetOverrides`**: for a given `nuggetId`, the card definition (cost, effects, text) that nugget's cards use *in this encounter*. The same nugget behaves differently across encounters. A nugget has **no effect of its own** outside an override — there is no "underlying" effect to fall back to.
- **Playing a nugget card in an encounter that overrides its nugget:** the override's cost and effects apply. First such play fires a **discovery** event (reveal animation, description shown); discovery persists globally.
- **Playing a nugget card with no override here:** the card converts to **Ponder** at that moment (Ponder's cost and effect). Its id is recorded in `playedNonRelevantCards` (persists across retries of retryable encounters) to power the pre-encounter warning and deck-construction substitution (§6.2 of v1.2 flow, still deferred with the Collection screen).
- Skill cards never use the nugget system; their effects are always visible.

### 3.10 Counters and Thresholds

A generic mechanic: Field permanents may accumulate **named counters** via `INCREMENT_COUNTERS` effects (optionally scaled, optionally amplified by other permanents' triggered abilities). A permanent may define a **threshold**: when its counters reach the threshold at the designated check point (after each NPC play, by default), the threshold cost is consumed and its threshold effects fire. A permanent may also define a **transform condition** (e.g. counters or board state) that replaces its definition with another registry entry.

This is the generic form of the Fan Club President's *devotion*: devotion is counters on the Idol's Favor impression, fed by triggered abilities on other FCP cards, spent by thresholds. **The engine must contain no card-ID-specific logic** — everything the FCP encounter does must be expressible through counters, thresholds, triggered abilities, and restrictions defined in card data.

### 3.11 Back of Mind

When the player ends their turn, BotM Select fires (if the hand is non-empty): keep up to `backOfMindLimit` cards (default 1); all other hand cards discard. BotM cards return to hand at Player Turn Start, before the draw. BotM cards **cannot be played during the NPC's turn** (interrupts remain removed; the UI must not offer a Play action on BotM). Effects that raise `backOfMindLimit` are Blue's planning identity and must be supported by the effect vocabulary.

### 3.12 Deck Recycle

When a draw is required and the draw pile is empty, the discard reshuffles into a new draw pile, then the draw proceeds. Applies to both sides. If both piles are empty mid-draw, the draw simply stops short — for the NPC this means a smaller hand, and an empty hand ends its turn (§4.4); there is no restore side effect.

---

## 4. Turn Structure and Boundaries

A **Turn** is one side's window of control. A **Round** is a Player Turn plus the following NPC Turn; the round counter increments at Player Turn Start. All timed mechanics attach to exactly one of the four boundaries below. **Durations are authored as named boundaries** ("until the start of your next turn", "during the opponent's next turn"), never bare integers.

Each boundary executes its steps **in the listed order**. This ordering is normative — the prototype's Distracting Madness bug (a restriction expiring in the same instant it was applied) is exactly what this section exists to prevent: expiry ticks run **before** new boundary-triggered effects apply.

### 4.1 Player Turn Start
1. Set `activeTurn = player`; increment round counter.
2. Set player Priority per the turn-start formula (§3.1); consume NPC transferred debt.
3. Expire modifiers (Restrictions, Replacements) whose expiry boundary is *this* boundary.
4. Expire the player's untriggered Traps to discard; tick player-owned Impression durations.
5. Reset player per-turn counters; roll `oppShieldsBrokenByPlayerThisTurn` into its "previous turn" mirror.
6. Return BotM cards to hand.
7. Draw up to `handLimit` (respecting draw restrictions).
8. Fire scheduled effects due at this boundary.
9. Dispatch `PLAYER_TURN_START` (traps and triggered abilities may respond).
10. → Check.

### 4.2 Player Turn End (explicit End Turn action)
1. Dispatch `PLAYER_TURN_END`.
2. BotM Select (blocking): keep up to limit, discard the rest of the hand.
3. Settle Priority: record surplus to `lastUnspentPriority` or convert deficit to transferred debt; zero the meter (§3.1).
4. → NPC Turn Start.

### 4.3 NPC Turn Start
1. Set `activeTurn = npc`.
2. Set NPC Priority per the turn-start formula; consume player transferred debt.
3. Expire modifiers bound to this boundary.
4. Expire the NPC's untriggered Traps; tick NPC-owned Impression durations.
5. Reset NPC per-turn counters.
6. Inject any due `scheduledPlays` into the NPC's hand, leftmost (§10).
7. Draw up to `npcHandLimit` (deck recycles as needed; scheduled cards not yet due are excluded from draws).
8. Fire scheduled effects due at this boundary.
9. Dispatch `NPC_TURN_START`; NPC Impression turn-start effects fire.
10. → Check.

### 4.4 NPC Turn End (automatic)
Occurs when, after a play fully resolves (or at NPC Turn Start with nothing to do): NPC Priority ≤ 0, **or** the NPC's hand is empty.
1. Dispatch `NPC_TURN_END`.
2. Discard the NPC's remaining hand (no NPC Back of Mind).
3. Settle NPC Priority (surplus recorded / deficit transferred); zero the meter.
4. → Player Turn Start.

> **Counter naming convention (normative for implementation):** every per-turn counter names *whose* resource, *acted on by whom*, and *the window* — e.g. `playerShieldsBrokenByNpcThisTurn`, `oppShieldsBrokenByPlayerThisTurn`, `oppShieldsBrokenByPlayerPrevTurn`, `npcCardsPlayedThisTurn`. The v1.2 prototype's ambiguous `playerShieldsBrokenThisTurn` must not reappear.

---

## 5. Events, Triggers, and Abilities

### 5.1 Canonical Event Vocabulary

The engine dispatches exactly these events. Traps, Shield Triggers, and triggered abilities may only subscribe to events in this table; authoring tools must validate against it.

| Event | Dispatched when | Payload |
|---|---|---|
| `CARD_STAGED` | NPC loads a card from its hand, before any resolution | staged card |
| `CARD_PLAYED` | Any card play begins resolution (either side) | card, controller |
| `CARD_RESOLVED` | A play fully resolves | card, controller |
| `SHIELD_BROKEN` | Any shield breaks | shield side, shield type, breaker |
| `PATIENCE_CHANGED` | Patience changes | delta, new value, source controller |
| `PRIORITY_CHANGED` | Either meter changes | side, delta, new value |
| `TOKEN_CREATED` / `TOKEN_DESTROYED` | Token lifecycle | token |
| `PLAYER_TURN_START` / `PLAYER_TURN_END` | §4 boundaries | — |
| `NPC_TURN_START` / `NPC_TURN_END` | §4 boundaries | — |

Filters available to subscribers: controller filter (owner-relative: "self" / "opponent"), comparator + value against the payload (e.g. `PATIENCE_CHANGED` with `new value < 5`), compound conditions over per-turn counters, and Rapport prediction matching (§8.3).

### 5.2 Triggered Abilities (passive)

Field permanents (Impressions, Tokens) may define triggered abilities: `{ trigger event, filters, effects, maxTimesPerPlay?, maxTimesPerTurn? }`. On a matching event the effects resolve (nested, depth-capped). Fire-limit windows reset per the §4 boundaries.

### 5.3 Activated Abilities

Field permanents may define activated abilities usable by their controller during that controller's turn: `{ name, cost, effects }`. Costs draw from a fixed vocabulary: Priority (subject to the playability rule — unusable at ≤ 0), Patience (cannot be paid if it would reach ≤ 0), sacrifice N own shields (leftmost), discard N chosen hand cards. Activation is not a card play but is a Priority-spending action for lockout purposes when it has a Priority cost.

### 5.4 Trigger Resolution Ordering

When one event matches multiple subscribers: **Traps first** (play order, oldest first), **then Shield Triggers** (break order), then triggered abilities (Field arrival order). Nested triggers resolve immediately as sub-steps (genuinely recursive, not queued), with a hard depth cap of **20** — reaching the cap halts resolution and logs an error (fail-safe, not a gameplay limit). Ordering applies independently within each nesting level and cannot be overridden by card effects.

---

## 6. State Machine

### 6.1 Check State

The routing hub; never blocks. Evaluated top-down, first match wins:

1. All opponent shields broken → **WIN**
2. Player shield row empty *(only if the shield-loss condition is armed, §3.4; skipped if `unbreakablePlayerShields`)* → **LOSE**
3. Patience ≤ 0 → **LOSE**
4. Lie Counter > `lieThreshold` (when threshold > 0) → **LOSE**
5. `activeTurn = player` → **Player Pending** *(always — regardless of Priority value; no auto-end)*
6. `activeTurn = npc`, staged card exists → **Enemy Play**
7. `activeTurn = npc`, no staged card, NPC can act (Priority > 0 and hand non-empty) → **Enemy Pending**
8. `activeTurn = npc`, otherwise → **NPC Turn End** (§4.4) → Player Turn Start → Check

> Win before loss: rule 1 precedes 2–4, so simultaneously breaking the last opponent shield and draining Patience resolves as a win.

### 6.2 Player Pending *(blocking)*

Available actions — Priority-spending actions require a positive meter (§3.1):

- **Play a card** (incl. Heavy Hand variant) → Player Play
- **Play a Trap** → Player Play (card → Field, effects deferred)
- **Place a shield** (any hand card, 2 Priority) → Player Play (placement-only sequence)
- **Activate an ability** (§5.3)
- **Combine** two Assemble cards (free; no state transition; animated)
- **Resequence shields** (free; no state transition)
- **End Turn** → Player Turn End (§4.2)

### 6.3 Player Play

1. Deduct the card's full Priority cost (meter may go negative; no floor, no Patience spill).
2. Dispatch `CARD_PLAYED`. Apply Lie keyword. Resolve nugget conversion/override (§3.9) before effects.
3. Resolve the effect list in order. Blocking sub-states (Reveal, Choose Number, Deck Reveal) suspend and resume the same sequence — **never restart it** (implemented once, as a generic effect stack).
4. **Lock check:** if the played card is an Information Card whose `nuggetId` keys an unbroken NPC Core Shield and all Guard Shields are broken → break that shield → suspend → **Reveal Pending**; resume after acknowledgement. (Guards standing, or lock already broken: no-op.)
5. Move the card to its destination (discard / Field / shield slot / removed).
6. Dispatch `CARD_RESOLVED`; run pending trigger resolution (§5.4).
7. → Check.

### 6.4 Reveal Pending, Choose Number Pending, Deck Reveal Pending *(blocking)*

Three blocking sub-states sharing one suspension mechanism. Reveal Pending fires only on opponent Information Shield breaks and freezes all combat state. Choose Number Pending services `CHOOSE_NUMBER` effects (incl. Rapport predictions). Deck Reveal Pending services deck-top reveal effects. On acknowledgement each resumes the suspended sequence at the next step. *(Choose Number and Deck Reveal are formally admitted to the state machine here, per the v1.2 rule that state-machine changes require a version bump.)*

### 6.5 BotM Select *(blocking)*

Fires only from Player Turn End step 2 — **never from mid-turn hand/priority conditions.** Cards gained during the NPC's turn (e.g. Copy effects) simply sit in hand until the player's next turn; they do not prompt a BotM selection.

### 6.6 Enemy Pending → Enemy Play

Enemy Pending: the NPC stages the leftmost card in its hand (per §10), dispatches `CARD_STAGED`, and resolves the pre-play trigger window (cancel traps live here). **If the staged card was cancelled, skip directly to Check — its resolution never begins.** Otherwise → Enemy Play:

1. Deduct the card's cost from the NPC meter (overspend allowed; symmetric with the player).
2. Dispatch `CARD_PLAYED`; resolve applicable restrictions (cost increases, per-card Patience costs, etc.).
3. Resolve effects in order. Player shield breaks resolve automatically (leftmost eligible; Shield Triggers queue per §5.4; break outcome Patience applies). NPC self-break effects hit its own Guard Shields only (NPC Core Shields break exclusively via keys); self-breaking a Guard reveals nothing and does not suspend.
4. Move the card to NPC discard — or to the Field if it is an NPC Impression/Trap. **This completion step must run on every path, including resumption after a Reveal** (the v1.2 prototype skipped it).
5. Dispatch `CARD_RESOLVED`; run trigger resolution; run threshold checks (§3.10).
6. → Check (which routes to another Enemy Pending while the NPC can act, else NPC Turn End).

### 6.7 Sequencing Invariants

1. Reveal Pending hard-gates opponent Information Shield breaks only; combat state is frozen during it.
2. BotM Select and Reveal Pending are mutually exclusive; Reveal takes precedence, BotM fires only at Player Turn End.
3. Player shield breaks resolve automatically within Enemy Play — no player input during the opponent's turn, ever.
4. Win is checked before loss.
5. A staged card cancelled by a trap goes to NPC discard exactly once, and its effects never resolve.
6. Effect sequences suspend and resume; they never restart. Costs are step 0 and never repeat.
7. Dummy multi-break allowed; Core single-break enforced (design-time invariant, including Assemble results).
8. Shield Trigger and Trap resolution never causes an intermediate Check; end conditions they alter are evaluated at the next Check after the parent sequence completes.
9. Trigger ordering (Traps → Shield Triggers → abilities) is absolute within each nesting level; depth cap 20.
10. Trap expiry, modifier expiry, counter resets, and scheduled effects each belong to exactly one §4 boundary step and occur nowhere else.
11. Priority lockout is evaluated only between fully-resolved plays — never mid-resolution.
12. The reducer is pure: no module-level mutable state (the prototype's global `shieldBreakCounter` is a defect class, not a pattern).

---

## 7. Encounter / NPC Configuration

The encounter *is* the character. Removed fields: `priorityMode`, `startingPriority`, `defaultRestorePriority`.

| Parameter | Type | Description |
|---|---|---|
| `id`, `displayName` | string | Identity |
| `minTurnStartPriority` | number | Base turn-start Priority for both sides. Default 3. |
| `firstTurnBonusPriority` | number | Extra Priority on the very first turn of combat. Default 2. |
| `maxPriority` | number | Turn-start clamp for both sides. Default 10. |
| `startingSide` | `"player"` \| `"npc"` | Who takes the first turn. Default `"player"`. |
| `opponentPatience` | number | Starting Patience (no cap) |
| `npcGuardShieldCount` | number | **Required.** Guard Shields in front of the core row (may be 0). |
| `opponentShields` | NpcCoreShieldDef[] | Authored NPC Core Shields: `{ cardId, isHint, hintText?, loreDescription, keyNuggetIds[] }` (≥ 1 key each; ≥ 1 total shields incl. guards) |
| `npcHandLimit` | number | NPC hand size drawn at NPC Turn Start. Default 5. |
| `playerDummyShieldSlots` | number | **Required.** Player dummy slots (auto-filled with Placeholders). |
| `allowedCoreShields` | CoreShieldDef[] | **Required** (empty array allowed). `{ cardId, patienceCostOnBreak }`; auto-placed from Collection. |
| `unbreakablePlayerShields` | boolean | NPC effects cannot break player shields; disables shield-loss. |
| `nuggetOverrides` | NuggetOverride[] | `{ nuggetId, overrideCardDef }` — the Information Card model (§3.9) |
| `traits` | Trait[] | Discoverable passive modifiers (§7.1) |
| `enemyDeckCardIds` | string[] | NPC deck, in order (see §10) |
| `scheduledPlays` | `{ cardId, afterTurn }[]` | Locks a card until the given round, then prioritizes it (§10) |
| `startingImpressions` | string[] | NPC Impressions on the Field at combat start |
| `lieThreshold` | number | 0/omitted disables the Lie mechanic |
| `retryable` | boolean | Restart after loss allowed; enables persistent breaks (§12) |
| `tutorialMode`, `scriptedDrawOrder`, `scriptedOpponentPlays` | — | Scripted-encounter support, as v1.2 |
| `playedNonRelevantCards` | string[] | Ponder-conversion memory, persists across retries (§3.9) |

### 7.1 Traits

Discoverable passive modifiers, as v1.2: hidden `?` icon until first triggered, then revealed with tooltip; discovery persists per NPC. **Implementation requirement:** traits are a data-driven vocabulary evaluated at defined hook points — never hardcoded ID checks inside effect handlers, and never mutations of the (immutable) encounter config; discovery state lives in combat/persistent state. Initial vocabulary (e.g. `Sensitive`: +1 Patience loss on Patience-damaging cards; `Fearless`: Intimidate-class effects nullified) to be completed in §13 — still a placeholder, unchanged in scope from v1.2 §9.

---

## 8. Cards

### 8.1 Supertypes

**Skill** (effects always visible; fixed color identity) and **Information** (colorless; behaviour defined per-encounter via nuggets, §3.9). Unchanged from v1.2 in spirit.

### 8.2 Subtypes

**Impression** (§3.8), **Trap** (§3.6), **Token** (§3.7 — registry-only, never deck-legal). Card text fields (`effectText`, `longDescription`, keyword auto-prepending, detail modal/tooltip) carry over from v1.2 §8.2.1; the deprecated `description` field is removed.

### 8.3 Keywords

| Keyword | Effect |
|---|---|
| **Safety** | No effect when played. As a broken Dummy Shield: Effective Break (0 Patience). |
| **Assemble** | May combine with another Assemble card (§11). |
| **Shield Trigger** | On shield break, `shieldTriggerEffects` resolve before the break outcome (§3.5). |
| **Lie** | +1 Lie Counter on play; exceeding `lieThreshold` loses the encounter. |
| **Trap** | Played to the Field; fires on its trigger condition; expires at owner's next Turn Start (§3.6). |
| **Rapport** | On play, the player predicts a value (via Choose Number). The card's trigger or bonus applies only when the prediction matches the checked quantity (e.g. a Rapport Trap on `CARD_STAGED` fires only if the staged card's cost equals the prediction). Rapport successes may feed counters on designated permanents (§3.10) — via data, not hardcoded IDs. Green identity. |
| **Heavy Hand** | Optional mode of play: pay **double cost** to use the card's `heavyHandEffects` instead of its normal effects. The choice is made at play time (context menu / drag modifier). |

The **Interrupt** keyword remains removed. No card may be played during the opponent's turn.

### 8.4 Color Identities

Carried from v1.2 §8.4 in personality and mechanics, with corrections for the Patience goal asymmetry (§3.2):

- **Red** — passionate and impulsive: powerful, fast, low-Priority-cost effects **at the cost of Patience**. Red spends the shared Patience budget recklessly for tempo and Guard-breaking pressure; the risk is running the conversation out, not "eroding" the NPC. (The v1.2 phrasing "Red excels at eroding the NPC's Patience" is repealed as a goal statement.)
- **Blue** — high-cost/high-payoff; Shield Trigger and Assemble native; token build-up economy; BotM capacity increases (§3.11).
- **Green** — Patience preservation and restoration (the color that respects the budget); Rapport; incremental effects that grow over the encounter; frequent shield placement.
- **White** — nullifies enemy effects; deliberate risk/reward cards that scale as Patience runs low (a gamble against the loss condition, framed as such).
- **Black** — Lie keyword; strongest individual effects with heavy penalties; Copy effects (§8.5).
- **Orange** — heaviest Impression use (a prevalence, not a rules restriction); Trait-stripping; Lie detection.
- **Purple** — random-chance effects; permanent in-encounter removal from both decks.
- **Colorless** — Information Cards, Ponder, and rare mutual-cost Skill cards.

### 8.5 Copy Effects

`COPY_FROM_NPC_DECK` adds copies of matching NPC-deck cards to the player's hand (the NPC deck is unchanged — this is copying, not stealing). Copied cards may carry a `patienceCostOverride`: playing them additionally costs that much Patience — Black's risk rider. Filters: chosen cost (Rapport synergy), has-shield-break. True stealing (removing from the NPC deck) is a distinct future effect if ever wanted.

**Asymmetry constraint (§3.2):** NPC cards built to deplete Patience are useless to the player as-is. Copy design must account for controller-relative Patience effects — the working proposal is that such effects invert (deplete → restore) when a copy is player-controlled. Exact rule deferred to card design (§16), but no copy mechanic ships without answering it.

---

## 9. Modifiers

### 9.1 Restrictions

A Restriction is `{ type, target side, value?, conditionThreshold?, expiry boundary, linkedImpressionId? }`. Applied by effects; removed at their named expiry boundary (§4) or when their linked Impression leaves the Field.

**Core vocabulary (v1.4):** `PREVENT_SHIELD_BREAK`, `PREVENT_DRAW`, `PREVENT_EXTRA_DRAWS`, `PREVENT_PATIENCE_GAIN`, `MAX_CARD_COST`, `INCREASE_CARD_COST`, `MAX_PLAYS_PER_TURN`, `MAX_TURN_START_DRAW`, `PRIORITY_FLOOR`, `PATIENCE_COST_PER_CARD`.

The prototype's remaining one-card restriction types (`MIRROR_NPC_PRIORITY_GAIN`, `DEVOTION_PAYS_PRIORITY`, `CONDITIONAL_MAX_*`, `SELF_BREAK_ON_NPC_SHIELD_BREAK`, `PATIENCE_PER_*`, `PRIORITY_PER_*`) are **not** engine vocabulary: those cards are re-expressed as triggered abilities over the §5.1 events. If a re-expression proves impossible, the restriction type may be promoted to core with a doc change.

### 9.2 (reserved)

### 9.3 Replacements

`{ originalTokenId, replacementTokenId, expiry boundary }` — while active, any `CREATE_TOKEN` of the original id creates the replacement instead (checked at creation; transform effects bypass it). Kept as a minor sibling of Restrictions (consumer: Blue's *Timely Follow-up*).

### 9.4 Scheduled Effects

`{ effects, fire boundary }` — an effect list queued to a named future boundary (e.g. "your next Turn Start"). Fired during that boundary's scheduled-effects step (§4).

---

## 10. NPC Behaviour

The NPC mirrors the player's resource loop: shuffled deck, hidden hand, discard pile, deck recycle.

- **Setup:** `enemyDeckCardIds` defines deck contents (order irrelevant except as data); the deck is shuffled at encounter start. Cards referenced by `scheduledPlays` are set aside — excluded from normal draws.
- **NPC Turn Start (§4.3):** any `scheduledPlays` whose round has arrived are injected directly into the NPC's hand, leftmost (guaranteeing the scripted beat regardless of draw luck); then the NPC draws up to `npcHandLimit` (default 5), recycling the discard into the deck if needed.
- **Play policy:** while its Priority is positive and its hand is non-empty, the NPC stages and plays the **leftmost card in hand**. Injected scheduled cards, being leftmost, play first.
- **NPC Turn End (§4.4):** fires when Priority ≤ 0 or the hand is empty; the remaining hand discards (no NPC Back of Mind).

This policy — random hand, deterministic leftmost play — is the intended v1 "AI." Encounter design controls the NPC through deck composition, `scheduledPlays`, Impressions, and Traps. A smarter selection policy is a future, separately-specced feature. NPC card costs are engine-relevant (they drive the NPC's own Priority spend and Rapport predictions) but are not displayed as player-facing costs. The NPC hand is hidden; hand-reveal effects are designable in the future (§16).

Dev tooling (documented in CLAUDE.md, not here): manual enemy mode (a human picks the NPC's play from its hand) and the dual-playtest realtime mode both replace the leftmost-play policy with human choice and must produce identical state transitions.

---

## 11. Combinations

Carried over from v1.2 §10 unchanged in rules: exactly two Assemble cards, recipe-based (global recipes; order-independent ingredients), free (no Priority), no state transition, animated; failed combinations leave the hand unchanged; combined-card play discards the components (recyclable). Dynamic combining (v1.2 §10.4) remains **designed but deferred** — not part of the v1.4 build target. Recipe-encounter-specificity remains an open question.

---

## 12. Pre-Encounter Phase and Persistence

**Shield Card Selection (revised):** with the hybrid economy, dummy slots auto-fill with Placeholders — there is **no mandatory pre-encounter shield stage** in v1.4. The v1.2 option to pre-place real cards is superseded; real-card shields are a mid-combat decision. *(If pre-placement returns later, it re-enters as an encounter option.)*

**Information Card Selection (§6.1 of v1.2):** still deferred with the Collection screen; the nugget model (`???` / "Will be converted to Ponder" states, deck-construction substitution with animation) defines its data dependencies.

**Persistent state:** as v1.2 §7 — persistent opponent-shield breaks for retryable encounters; global nugget discovery; global trait discovery per NPC; `playedNonRelevantCards` per retryable encounter. The rebuild must actually wire the save layer (the prototype's `saveStore` never was).

---

## 13. NPC Traits and Modifiers

*(Placeholder — full trait vocabulary and stacking rules. Unchanged scope from v1.2 §9; see §7.1 for the implementation constraints.)*

---

## 14. UI Design Principles

v1.2 §11 carries over in full (never-silent state changes; sequential animations; detail-on-demand; drag-or-context-menu confirmation; every zone transition animated). Amendments:

- **Priority bar:** one bar, two meters (§3.1). The bar must clearly show: whose turn it is, the active side's current value, debt (negative) as a distinct visual state, and the incoming debt transfer at handoff as its own animation moment.
- **Lockout state:** when the active side is at ≤ 0, unplayable cards visibly dim and the End Turn affordance becomes prominent — the player should never wonder why plays are disabled.
- **Guard vs NPC Core Shields** (opponent) and **Placeholder vs Real vs Core** (player) need distinct visual treatments. Whether key cards should visually signal an unlockable shield is deliberately unresolved — an automatic indicator may spoil the deduction the lock-and-keys system exists to create.
- **Trap conditions** on the Field display their trigger condition on hover, phrased in the owner-relative event vocabulary.
- BotM zone offers **no Play action**.

---

## 15. Implementation Directives (rebuild)

1. Engine layer stays framework-agnostic and pure. No module-level mutable state; encounter config is immutable input.
2. **No card-ID checks in the engine.** Every mechanic a card needs must be expressible in card data (effects, abilities, counters, restrictions). If it isn't, extend the vocabulary — don't special-case the card.
3. One `handoff()` procedure implements §4.2→§4.3 and §4.4→§4.1. All boundary steps live in exactly one place each.
4. One generic suspension mechanism (effect stack) serves Reveal / Choose Number / Deck Reveal.
5. Event dispatch is the single integration point for traps, shield triggers, and abilities; authoring-time validation rejects subscriptions to non-existent events.
6. Counter names follow the §4 convention.
7. `lastUnspentPriority` is tracked per side from day one, unused.

---

## 16. Open Questions

1. Encounter-specific combination recipes (carried from v1.2).
2. Dynamic combining — deferred; revisit after the core rebuild.
3. Player-side staged window (symmetric cancel-traps for the NPC) — future extension noted in §3.6.
4. ~~Shield-loss rule codification (§3.4)~~ — resolved: arm-on-first-shield / fire-on-empty-row rule.
5. Unspent-Priority mechanics (§3.1) — variable reserved, design TBD.
6. Trait vocabulary (§13).
7. Copy-effect Patience inversion (§3.2, §8.5) — controller-relative effect polarity, rule TBD at card-design level.
8. NPC hand-reveal effects (§10) — designable now that the NPC has a hand; not in the v1.4 build target.

---

*End of document — v1.4*
