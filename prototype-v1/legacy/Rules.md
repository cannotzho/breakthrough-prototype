# Breakthrough — Combat Rules Reference

> **Audience:** developers and game designers. This document is derived from the live codebase (`src/combat/combatEngine.ts`, `types.ts`, `effects.ts`, `data/cards.ts`, `data/combinations.ts`, `data/encounters.ts`) and describes what the engine actually does, not what it is intended to do. Where implementation and intent diverge, the code wins.

---

## Table of Contents

1. [Overview](#overview)
2. [Win and Loss Conditions](#1-win-and-loss-conditions)
3. [Priority](#2-priority)
4. [Turn Structure](#3-turn-structure)
5. [Playing a Card](#4-playing-a-card)
6. [Opponent Shield Mechanics](#5-opponent-shield-mechanics)
7. [Player Shield Mechanics](#6-player-shield-mechanics)
8. [Back of Mind](#7-back-of-mind)
9. [Interrupt Cards](#8-interrupt-cards)
10. [Patience](#9-patience)
11. [Combinations](#10-combinations)
12. [Card Types and Information Visibility](#11-card-types-and-information-visibility)
13. [Sequencing Invariants](#12-sequencing-invariants)
14. [Appendix: CombatConfig Defaults](#appendix-combatconfig-defaults)

---

## Overview

A Breakthrough combat encounter is a conversation between the player (a detective) and an NPC. Both sides hold **shields** — hidden positions the other side can break through — and the NPC has **patience** measuring willingness to engage. The player wins by breaking all opponent shields; the player loses if their own shields are all broken or if the opponent's patience reaches zero.

The entire combat state is a pure-data `CombatState` value managed by `combatReducer` — an immutable reducer with no side effects. React state lives in the `useCombat` hook, which wraps `useReducer` and schedules the opponent's automated actions via `setTimeout`. The engine is deterministic: given the same state and action, it always produces the same next state.

---

## 1. Win and Loss Conditions

`checkEndCondition` is called after every state-modifying action. It tests three conditions in order, and the first one that applies wins.

**All player shields broken (opponent wins).** If the encounter gave the player at least one shield slot (`playerShields > 0` in `EncounterConfig`) and every slot is now broken, the game ends with the opponent as winner. Encounters configured with `playerShields: 0` (tutorials 1 and 2) are entirely exempt from this check — they cannot trigger a shield-loss defeat regardless of what happens.

**All opponent shields broken (player wins).** If every opponent shield slot is broken, the player wins. This check runs before the patience check, so breaking the last opponent shield wins even at zero patience.

**Opponent patience reaches zero (opponent wins).** If `oppPatience ≤ 0`, the opponent shuts down the conversation and wins. There is no warning state or grace period.

Once `gameOver` is true, all further reducer actions are ignored except `OPPONENT_ACT` (which can still resolve pending shield-choice state) and the configuration / meta actions (`RESET`, `UPDATE_CONFIG`, `UNDERSTAND_CARD`).

---

## 2. Priority

Priority (`CombatState.priority`) is a single shared integer, clamped to the range **−10 to +10**. It is the central resource governing whose initiative it is and what actions are permitted.

### Phase derivation

The current phase is derived from priority at all times: `priority > 0` = **attack phase** (player acts); `priority ≤ 0` = **defense phase** (opponent acts). Phase is not stored independently — `updatePhase` recalculates and updates `CombatState.phase` whenever priority may have changed. When phase actually changes, `updatePhase` triggers the appropriate boundary sequence (see §3).

### Spending priority

Playing a card deducts the card's effective cost from priority. Placing a shield costs 2 priority. Ending the turn explicitly sets priority to exactly 0. Each opponent action (the `OPPONENT_ACT` handler) deducts 3 from the player's current priority, regardless of what card the opponent plays.

### Restoring priority

Priority can increase through card effects (`priority: N` in `CardEffects`), through the tiered player-shield-break bonuses (see §6), and when the defense-to-attack transition fires (new cards drawn, not directly a priority number change — but priority must already be above 0 for the transition to have occurred).

### Disposition modifiers on Personal cards

The opponent's `Disposition` record carries two card-ID lists: `vulnerable` and `resistant`. When the player plays a Personal card whose ID appears in either list, the following adjustments apply to that card's effect resolution:

- **Vulnerable:** the card's `priority` delta receives +1. If the card has no explicit priority effect, priority still increases by 1. Patience drain is unmodified.
- **Resistant:** the card's `priority` delta is reduced by up to 1 (floored at 0). If the card has no explicit priority effect, priority decreases by 1. Patience drain is halved (ceiling division).

These modifiers apply only to Personal cards. Information cards are never affected by disposition, regardless of content.

---

## 3. Turn Structure

Breakthrough does not have discrete turns in the traditional sense. The shared priority counter drives a continuous flow of initiative. "Turn boundaries" are the moments priority crosses zero in either direction.

### Attack phase (priority > 0)

During the attack phase the player may play cards, place shields, or end their turn. After any of these actions, `checkEndCondition` and then `updatePhase` are called. If a shield reveal popup was triggered during the action, the `updatePhase` call is deferred until the popup is dismissed (see §12).

When the player **ends their turn** explicitly (`END_TURN`), priority is set to 0, two cards are drawn, and the attack-to-defense transition fires.

### Attack-to-defense transition

When `updatePhase` detects that priority has dropped to 0 or below and the current phase was `attack`, the transition sequence runs:

1. If the player's hand is empty, the opponent is triggered immediately (no picker) and `awaitingOpponentAck` is set.
2. If the player has cards in hand, `awaitingBackOfMindChoice` is set and the Back of Mind picker opens (see §7). The opponent trigger fires only after the player confirms their selection.

### Defense phase (priority ≤ 0)

The `useCombat` hook watches `opponentActionTrigger` and `awaitingOpponentAck`. When the trigger increments and the ack gate clears, a timer fires after 800ms and dispatches `OPPONENT_ACT`. All four blocking gates must be false before the timer is scheduled: `awaitingShieldChoice`, `awaitingBackOfMindChoice`, `revealedShieldCard`, and `awaitingOpponentAck`.

Each opponent action costs the player 3 priority. If priority remains ≤ 0 after the action, the opponent continues acting by re-triggering itself. The opponent loop stops only when priority rises above 0 (phase transition) or all opponent cards are exhausted.

If the opponent's hand and deck are both empty when `OPPONENT_ACT` fires, priority is set to 1 and the defense-to-attack transition fires immediately.

### Defense-to-attack transition

When `updatePhase` detects that priority has risen above 0 and the current phase was `defense`:

1. Any active `playerShieldImmune` flag is cleared.
2. `awaitingOpponentAck` is cleared.
3. `backOfMind` is cleared.
4. The player draws `combatConfig.drawOnPriority` cards (default 3) from the combined deck.

No cards are auto-drawn during the defense phase — the `drawPerPlay` mechanic is explicitly suppressed for defense-phase plays.

---

## 4. Playing a Card

The `PLAY_CARD` action runs the following sequence. Any check failure returns the state unchanged (usually with a log message).

**Guard checks.** The card must be present in `hand`. If the current phase is defense, the card must also be present in `backOfMind`, and the card must be either `type: 'instant'` or carry `isInterrupt: true`. Failing either check rejects the play.

**Cost check.** For non-interrupt cards, `priority` must be ≥ the card's effective cost. Effective cost is computed by `computeCardCost`: Personal cards always use their base `cost`; Information cards have their cost reduced by the Vampire Network enchantment if it is active on the field (`reduceInfoCost` of 1, floored at 0). Interrupt cards bypass this check entirely and are played at no priority cost.

**Hand removal.** The first occurrence of the card ID is spliced from `hand`.

**Priority deduction.** For non-interrupt cards, the effective cost is subtracted from `priority`. Interrupt cards leave `priority` unchanged by the act of playing — only the card's own `priority` effect delta (if any) will move the meter.

**Card understanding.** The card is added to `understoodCards` if not already present. Its effect text becomes visible for the rest of the encounter.

**Play-count increment.** `cardPlayCounts[cardId]` is incremented before effect resolution so that `autoBreakAfterPlays` reads the post-increment count.

**Effect resolution.** `resolvePlayerEffect` applies effects in this sub-order: disposition dialogue trigger, `breakShield`, `breakShieldChance`, `shieldBreakPatience`, `opponentPatience`, `priority`, `restoreShield` / `playerPatience`, `shieldImmunityUntilPriority`, `surrenderPriority`, `autoBreakAfterPlays`, `drawCards`, `peekShield`. See §5 for details on the various break effects.

**Zone placement.** Enchantments move to `field` and persist until the encounter ends. Information cards that directly broke a shield are consumed entirely — they do not go to discard and cannot be redrawn. All other played cards move to the worldDeck discard pile.

**Auto-draw.** During the attack phase only, `drawPerPlay` cards (default 1) are drawn from the combined deck after the card resolves. If the `streetSmarts` enchantment is active, one additional card is drawn per copy on the field. No auto-draw fires during the defense phase.

**End condition and phase.** `checkEndCondition` runs. If the game is not over and no shield reveal is pending (`revealedShieldCard` is null), `updatePhase` is called. If priority is still ≤ 0 after `updatePhase` (e.g. the phase remains defense because the player played an instant that did not restore priority), `triggerOpponentAction` re-queues the opponent.

---

## 5. Opponent Shield Mechanics

### Break targeting order

Every encounter specifies a `shieldBreakOrder` array — an ordered list of opponent shield indices indicating the sequence in which shields should be broken. This defaults to `[0, 1, 2, …]` if not configured. When a break effect fires, the engine walks this order looking for a valid target.

The targeting logic runs in two passes. First, if the breaking card has an ID, the engine looks for any intact shield whose `requiresCardId` matches that card ID exactly — a "locked shield" that can only be opened by a specific card. If no such match is found, the second pass looks for the first intact shield with no `requiresCardId` restriction. If neither pass finds a target, the break is a no-op.

### Reveal popup gate

When an opponent shield with a `linkedCardId` breaks (regardless of which break mechanism triggered it), the following occurs atomically within that reducer call:

1. The linked card ID is added to `collectedInfo`.
2. `revealedShieldCard` is set to the linked card ID, triggering the UI reveal popup.
3. The linked card is added to `understoodCards` so its effect text appears if it is drawn later.
4. If the encounter has `onShieldBreak` dialogue lines, the appropriate indexed line is queued in `pendingShieldBreakLine`. It is not yet shown.
5. **Phase transition is deferred.** `updatePhase` is not called while `revealedShieldCard` is set. The reducer returns without advancing the phase.

When the player dismisses the reveal (`DISMISS_REVEAL`):

1. `revealedShieldCard` is cleared.
2. If `pendingShieldBreakLine` is set, it is promoted to `activeDialogue` (the NPC reaction), then cleared.
3. `updatePhase` is called — the deferred transition now proceeds normally.
4. If priority is still ≤ 0 and the phase remains defense (e.g. an interrupt broke a shield mid-opponent-turn), `triggerOpponentAction` re-queues the opponent.

### Card fate after breaking a shield

Non-Information cards that break a shield go to the worldDeck discard pile after the break and can be redrawn. Information cards (`supertype === 'Information'`) that directly break a shield are consumed — removed from play entirely.

### Probabilistic break (`breakShieldChance`)

A card with `breakShieldChance` has a starting decimal probability of breaking a shield on play. On failure, the chance increases by `breakShieldChanceIncrement` for subsequent plays of the same card. On success, the chance resets to the base value. Current chances are tracked in `cardBreakChances` keyed by card ID.

### Patience-cost break (`shieldBreakPatience`)

This break also costs the opponent N patience in addition to forcing a shield open. Against a `fearless` opponent, the effect is a complete no-op: the shield is not broken and no patience is lost.

### Auto-break after N plays (`autoBreakAfterPlays`)

The shield breaks automatically when the cumulative play count for the card equals or exceeds the configured threshold. The count resets to 0 on a successful break.

---

## 6. Player Shield Mechanics

### Placing shields

`PLACE_SHIELD` is only available in the attack phase. It costs 2 priority, draws 2 cards, and optionally consumes an Information card from hand as shield material. The engine takes the first Information card it finds in `hand`, removes it, and sends it to discard — the card's ID is stored in the slot's `usedCardId`. If no Information card is in hand, the shield is placed with `usedCardId: undefined`.

The new shield occupies the first broken slot if one exists (repairing it in place), or appends a new slot if the slot count is below `maxPlayerShields` (0 = no cap). If the cap is already reached, the action is rejected.

### Shield break flow (when the opponent attacks)

When `OPPONENT_ACT` resolves a card with `breakShield: true`, the engine first checks several conditions:

- If `unbreakablePlayerShields` is true for this encounter, the attack is a no-op (log only); the action falls through to the standard 3-priority cost.
- If the player has no intact shields, the attack is a no-op (log only).
- If `playerShieldImmune` is true, the attack is deflected and priority returns to 1 (defense-to-attack transition).
- If no intact shield passes the `requiresCardId` filter (the opponent's card can only target shields with a matching requirement), all valid targets are blocked and priority returns to 1.
- Otherwise, the engine pauses: `awaitingShieldChoice` is set to true, `pendingOppCardId` records the opponent's card, and the reducer returns early. No further effects resolve until the player responds.

The player then selects which intact shield to sacrifice via `CHOOSE_SHIELD_TO_BREAK`. After selection, the break resolves with one of three outcome tiers:

**Effective shield.** The backing card (`usedCardId`) has `effectiveShield: true` in its effects. Priority is hard-clamped to 5. Opponent patience is unchanged.

**Valuable shield.** The backing card's ID is in the encounter's `valuableShields` list. The player receives `priorityOnShieldBreak + 4` priority. Opponent patience increases by 2 (the NPC finds what was hidden interesting; capped at `oppMaxPatience`).

**Plain shield.** Any other break. The player receives `priorityOnShieldBreak` (default 1) priority. Opponent patience decreases by 1.

After the tier bonus is applied, the opponent's pending card is discarded and the opponent draws a replacement. Then `checkEndCondition` runs and `updatePhase` fires normally.

### Shield restoration

Two effects can restore broken player shields. `restoreShield: true` repairs the first broken slot, marking it intact with `usedCardId: 'smallTalk'` and `isDummyShield: true`. `playerPatience: N` restores up to N broken slots in order. Restored slots behave identically to normal shields when broken — `smallTalk` is not in any encounter's `valuableShields` list and has no `effectiveShield` effect, so restored shields always resolve as plain breaks.

---

## 7. Back of Mind

Back of Mind governs hand management at the attack-to-defense boundary.

### Trigger

When `updatePhase` detects the attack-to-defense transition and the player has cards in hand, it sets `awaitingBackOfMindChoice: true` instead of immediately triggering the opponent. The opponent action trigger does not increment at this point — it fires only after the player confirms.

### Selection

The player submits a `CONFIRM_BACK_OF_MIND` action with a list of card IDs to keep. The engine validates each ID against the current hand, deduplicates, and clamps the list to `backOfMindLimit` (default 1). Kept cards become `backOfMind` and remain in `hand`. All other hand cards are discarded to the worldDeck discard pile. After confirmation, `awaitingBackOfMindChoice` is cleared, `opponentActionTrigger` increments, and `awaitingOpponentAck` is set.

### During the defense phase

`backOfMind` acts as an eligibility filter. The `PLAY_CARD` guard requires the card to be in `backOfMind` (in addition to the type/interrupt check). Only cards that pass both checks can be played. Auto-draw (`drawPerPlay`) does not fire after any defense-phase play.

### Clearing

When the defense-to-attack transition fires, `backOfMind` is set to an empty array. The player then draws `drawOnPriority` new cards as a fresh hand for the attack phase.

---

## 8. Interrupt Cards

An interrupt card carries `isInterrupt: true` in its `CardEffects`. This flag grants two properties that work together with the Back of Mind system:

**Free cost.** The priority cost of playing the card is zero. The priority meter is unaffected by the act of playing — only the card's own `priority` effect delta (if any) changes the meter.

**Defense-phase eligibility.** When the engine checks whether a defense-phase play is legal, it accepts cards that are either `type: 'instant'` or carry `isInterrupt`. The interrupt card must still be in `backOfMind` to be playable — `isInterrupt` bypasses the type check but not the BotM inclusion check.

The practical design intent of interrupt cards is to carry a large positive `priority` effect, restoring the player's initiative mid-opponent-turn. If the card's `priority` effect pushes priority above 0, `updatePhase` fires immediately after resolution and transitions to the attack phase. There is no "interrupt target" — the player does not cancel an opponent card. The opponent's previously scheduled action may already have fired; the interrupt produces priority that will affect the *next* scheduled opponent action.

Cards with `isInterrupt` in the current card database: `offerHelp`, `composure`, `empathize`, and `slap`.

---

## 9. Patience

`oppPatience` tracks the NPC's willingness to continue the conversation. It starts at `EncounterConfig.patience` and is bounded between 0 and `oppMaxPatience`.

### Draining patience

Cards with a negative `opponentPatience` effect drain patience by that magnitude. The disposition system modifies the drain: resistant opponents take `ceil(drain / 2)` damage; vulnerable opponents take full damage (their bonus is the +1 priority, not a patience multiplier).

### Restoring patience

Opponent patience can increase in two ways. When the player breaks a **valuable** player shield, the opponent gains 2 patience (capped at `oppMaxPatience`). Opponent cards with a positive `opponentPatience` effect can also restore patience, though this is rare by design.

### Fearless flag

The `fearless` boolean on `EncounterConfig` (currently set for Mary-Ann) makes the opponent entirely immune to `shieldBreakPatience` effects — both the patience cost and the shield break are suppressed. Standard `opponentPatience` drain from other card effects is unaffected by fearlessness.

### Zero condition

When patience reaches 0, `checkEndCondition` immediately declares an opponent win. There is no grace period or further action.

---

## 10. Combinations

The `COMBINATIONS` array in `src/data/combinations.ts` is the sole authoritative source for combination recipes. Each entry holds two ingredient card IDs and a result card ID. The `combinesFrom` annotation on `CardDef` is informational only and has no effect on game logic.

### Availability tracking

`recomputeCombinations` runs after every hand change. A combination is listed in `availableCombinations` when all three conditions hold: both ingredients are in the player's current `hand`, and both ingredients exist somewhere in the current combat pool (hand + draw pile + discard pile). The combat-pool check filters out recipes whose ingredients are not reachable in this encounter.

### Combining

`COMBINE_CARDS` removes the first occurrence of each ingredient from `hand` and pushes the result card onto the hand. Combinations cannot be performed during the defense phase. The result card is immediately available for play on the same turn. `checkEndCondition` runs after combining.

---

## 11. Card Types and Information Visibility

### Supertypes

**Personal cards** represent the detective's own social abilities. They always come from `DETECTIVE_PERSONAL_DECK` or an encounter's `personalDeck`. Personal cards are never subject to the Ponder conversion filter, never start as `???`, and are never discarded from the deck by the encounter relevance check. Disposition applies to their effects.

**Information cards** represent evidence, connections, and clues. They come from the player's chosen world deck. At combat init, any Information card whose ID is not in the encounter's `worldDeck` relevance list is silently replaced with a `ponder` card in the combined draw pile. Disposition never applies to Information cards.

### Card understanding

The `understoodCards` set tracks which card IDs have had their effect text revealed this encounter. Information cards begin as unknown: the `cardForDisplay` function returns `'???'` as the `effectText` for unrecognized Information cards. A card becomes understood when any of the following happen:

- The card is played (any play, including zero-cost plays).
- The card is revealed as the `linkedCardId` behind a broken opponent shield.
- The card ID is listed in `EncounterConfig.preUnderstoodCards`.
- The card ID was flagged via the `bt_understood_cards` localStorage key (set by overworld events before combat starts).

Personal cards are always understood at init. The understood set does not persist between encounters.

### Enchantments

Enchantments (`type: 'enchantment'`) are placed on the `field` array and remain active until the encounter ends. Multiple copies of the same enchantment stack on field and their effects accumulate. Currently: `streetSmarts` (draw +1 card on each attack-phase play) and `vampireNetwork` (Information cards cost 1 less, floored at 0).

### Hidden info cards

Several cards have `cost: 0` and empty effects. These are "obtained intelligence" cards — they represent evidence extracted from broken opponent shields. They populate `collectedInfo` on break and are displayed in the reveal popup, but they are normal card objects in the engine and can theoretically be drawn or played. In practice they appear only in `shieldLinks`, never in any draw pile.

### Encounter-specific card overrides

`EncounterConfig.cardOverrides` patches any card's `effectText` and/or `effects` for the duration of that encounter. The override is applied by `resolveCardDef` wherever the card definition is looked up — which includes effect resolution in the reducer, cost computation, and display. The base `CardDef` in `CARDS` is never mutated.

### Opponent cards

Opponent cards resolve through `resolveOpponentEffect`, which handles only `priority` and `opponentPatience` effects. The `breakShield` effect on an opponent card is handled directly in the `OPPONENT_ACT` case rather than through `resolveOpponentEffect`. The special effects `breakOwnShields` (opponent breaks all their own shields, winning for the player) and `targetEffectiveShield` (opponent prefers a player shield backed by an `effectiveShield` card) are also handled inline in `OPPONENT_ACT`.

---

## 12. Sequencing Invariants

These are the hard ordering rules enforced by the engine. Violating any of them produces incorrect or broken state.

**Shield reveal is a hard gate before any phase transition.** When `revealedShieldCard` is non-null, `PLAY_CARD` (and `PLACE_SHIELD`, `END_TURN`) skip the `updatePhase` call and return immediately after setting the reveal. The phase can only advance after `DISMISS_REVEAL` clears `revealedShieldCard` and explicitly calls `updatePhase`. This means: a shield break that occurs during the attack phase will not trigger the BotM picker or the opponent until after the reveal is dismissed. A shield break during the defense phase will not re-trigger the opponent until after the reveal is dismissed.

**BotM picker and reveal popup are mutually exclusive.** `awaitingBackOfMindChoice` is only set inside `updatePhase`. `updatePhase` is only called after `revealedShieldCard` is null. Therefore `awaitingBackOfMindChoice` and `revealedShieldCard` can never both be true simultaneously.

**Opponent timer is blocked by four independent gates.** The `useCombat` hook's `useEffect` will not schedule `OPPONENT_ACT` while any of the following are true: `awaitingShieldChoice`, `awaitingBackOfMindChoice`, `revealedShieldCard`, or `awaitingOpponentAck`. The `OPPONENT_ACT` reducer case additionally guards on `awaitingShieldChoice` and `phase !== 'defense'`.

**Win condition check always precedes phase transitions.** `checkEndCondition` runs before `updatePhase` in every code path that calls both. If the game ends, `updatePhase` is not called — no BotM picker opens and no draw occurs on a winning or losing action.

**`revealedShieldCard` is cleared on `gameOver`.** If the last opponent shield breaks, `checkEndCondition` sets `gameOver: true`, and the reducer immediately clears `revealedShieldCard` so the win screen takes priority over the reveal popup.

**NPC shield-break dialogue shows after the reveal, not during.** `pendingShieldBreakLine` is never promoted to `activeDialogue` inside `PLAY_CARD`. It is promoted only inside `DISMISS_REVEAL`. The guaranteed order is: card played → shield breaks → reveal popup → player dismisses → NPC reacts → game continues.

**Opponent acknowledgment (`awaitingOpponentAck`) gates the timer, not the reducer.** The `ACKNOWLEDGE_OPPONENT` action only clears the `awaitingOpponentAck` flag. It does not fire an opponent action itself. The action reschedules naturally because the hook's `useEffect` depends on `awaitingOpponentAck` clearing and the `opponentActionTrigger` already having been incremented.

**`PLAY_CARD` during defense re-triggers the opponent if phase does not change.** If the player plays a Back of Mind card during the defense phase and priority remains ≤ 0 after the card resolves (i.e. the phase stays `defense`), `triggerOpponentAction` is called to re-increment `opponentActionTrigger`. This keeps the opponent loop running without requiring a separate phase transition.

---

## Appendix: CombatConfig Defaults

All numeric tuning values live in `CombatState.combatConfig` and can be overridden per-encounter via `EncounterConfig.initialCombatConfig` or changed at runtime via the `UPDATE_CONFIG` action (used by dev tools).

| Field | Default | Meaning |
|---|---|---|
| `drawOnPriority` | 3 | Cards drawn when entering the attack phase from the defense phase |
| `startingCards` | 4 | Cards dealt at combat init |
| `maxPlayerShields` | 0 | Maximum player shield slots; 0 means no cap |
| `drawPerPlay` | 1 | Cards auto-drawn after playing a card in the attack phase; 0 = disabled |
| `priorityOnShieldBreak` | 1 | Base priority restored to player when their shield is broken (plain break tier) |
| `animDelay` | 1 | Animation speed multiplier (0 = instant, 1 = normal, 2 = slow-motion) |
| `backOfMindLimit` | 1 | Maximum cards the player may retain in Back of Mind |

The valuable-break bonus is always `priorityOnShieldBreak + 4`. The effective-break priority is always a hard clamp to 5, regardless of `priorityOnShieldBreak`.
