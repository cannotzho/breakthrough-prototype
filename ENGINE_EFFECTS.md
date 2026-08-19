# Engine Effect Reference

Everything the combat engine can currently do, as a designer-facing lookup.
Includes the v1.4.2 additions (Goodwill, Rapport, chosen token destruction,
first-time-this-turn triggers).

**Authority:** the C# engine at `csharp-engine/Breakthrough.Engine/` is the
source of truth (Godot/C# is canonical as of 2026-07-23). The exact wire
format for every effect is defined by `Json/EngineJson.cs`; the shapes are
declared in `Types.cs`. Content lives in `content/content.json` and is edited
with the in-game **Card Designer** (`godot/designer/`), which validates every
change through the engine's own `Validation.ValidateCard`.

Usage counts below are from the current 103-card bundle. "Designer" says
whether the effect is editable with structured widgets or needs the raw-JSON
escape hatch.

---

## Where effects can live on a card

| Slot | Fires when |
| --- | --- |
| `effects` | the card is played (the main list) |
| `shieldTriggerEffects` | the card was a face-down Guard Shield and is broken |
| `heavyHandEffects` | played with Heavy Hand (replaces `effects`) |
| `leaveTriggerEffects` | the permanent leaves the Field (not on transform) |
| `turnStartEffects` | Impressions: at the owner's Turn Start |
| `trapTrigger` + `effects` | Trap subtype: when the trigger's event fires |
| `triggeredAbilities[]` | each has its own trigger + effects |
| `activatedAbilities[]` | paid and activated by the player |
| `thresholds[]` | a counter reaches a value |

---

## Effects (23)

Every effect also accepts the two universal modifiers below.

### Resources

| Type | Parameters | Effect | Used | Designer |
| --- | --- | --- | --- | --- |
| `MODIFY_PATIENCE` | `value` (+restore / −pay), `altValue?`, `altCondition?` | Change shared Patience. **Capped at the starting value** (v1.4.2); overflow → Goodwill or discarded. ≤ 0 is a player loss. | 54 | ✅ (alt-value → raw) |
| `MODIFY_PRIORITY` | `value`, `target?` (`self`\|`opponent`) | Change a side's Priority. Overspend is unbounded; a negative end-of-turn total transfers as debt. | 16 | ✅ |
| `DRAW_CARDS` | `value` | Draw from the top of your deck (recycles discard when empty). | 12 | ✅ |
| `RESHUFFLE_DECK` | — | Shuffle your deck. | 1 | ✅ |
| `MODIFY_GOODWILL` | `value` | Change Goodwill (v1.4.2). Never negative. | 0 | ✅ |

### Shields

| Type | Parameters | Effect | Used | Designer |
| --- | --- | --- | --- | --- |
| `BREAK_SHIELDS` | `target` (`self`\|`opponent`), `count` | Generic breaks hit **Guard Shields only**; NPC Core Shields break solely via key nuggets while zero Guards stand. | 26 | ✅ |
| `PLACE_SHIELDS` | `count` (always `target: self`) | Place Placeholder Shields. | 3 | ✅ |

### Tokens, Impressions & the Field

| Type | Parameters | Effect | Used | Designer |
| --- | --- | --- | --- | --- |
| `CREATE_TOKEN` | `tokenDefinitionId`, `count` | Put tokens on the Field. | 7 | ✅ |
| `DESTROY_TOKENS` | `count`, `tokenDefinitionId?` | Destroy your tokens. **The player chooses which** when they control more than `count` (v1.4.2); the NPC auto-picks earliest-first. Fires leave-triggers. | 3 | ✅ |
| `TRANSFORM_TOKEN` | `fromTokenId`, `toTokenId`, `count?`, `upTo?`, `all?` | Transform tokens. Bypasses leave-triggers. | 6 | ✅ |
| `DESTROY_SELF` | — | Destroy the source permanent. | 3 | ✅ |
| `DESTROY_IMPRESSION` | `owner` (`self`\|`opponent`), `count?` | Destroy Impressions. | 1 | ✅ |
| `APPLY_REPLACEMENT` | `originalTokenId`, `replacementTokenId`, `expiry?` | While active, creating X creates Y instead. | 1 | ✅ |

### Restrictions & scheduling

| Type | Parameters | Effect | Used | Designer |
| --- | --- | --- | --- | --- |
| `APPLY_RESTRICTION` | `restriction { type, target, value?, conditionThreshold?, expiry? }` | Apply a persistent rule (table below). Restrictions from an Impression are removed with it. | 18 | ✅ |
| `SCHEDULE_EFFECTS` | `effects[]`, `at` (boundary) | Run a nested effect list at a later boundary. | 1 | ⚠️ raw JSON (nested) |

### Information & disruption

| Type | Parameters | Effect | Used | Designer |
| --- | --- | --- | --- | --- |
| `COPY_FROM_NPC_DECK` | `count`, `costEquals?`, `searchTopN?`, `withShieldBreak?`, `patienceCostOverride?` | Copy (never steal) cards from the opponent's deck into your hand. `searchTopN` limits the read to the top N cards. | 2 | ✅ |
| `DECK_REVEAL` | `count` | Look at the top N of the opponent's deck. | 1 | ✅ |
| `REVEAL_NPC_HAND` / `HIDE_NPC_HAND` | — | Show/hide the opponent's hand. | 2 / 1 | ✅ |
| `REVEAL_NPC_DECK_TOP` / `HIDE_NPC_DECK_TOP` | — | Show/hide the top card of their deck. | 1 / 1 | ✅ |
| `CANCEL_STAGED_CARD` | — | Cancel the opponent's staged card (it discards once, never resolves). | 2 | ✅ |

### Counters & choices

| Type | Parameters | Effect | Used | Designer |
| --- | --- | --- | --- | --- |
| `INCREMENT_COUNTERS` | `counterName`, `targetDefinitionId`, `amount` | Add counters to a permanent (drives thresholds). | 15 | ✅ |
| `CHOOSE_NUMBER` | `min`, `max` | Ask the player for a number, readable later as `CHOSEN_NUMBER`. **Currently unused** — Green's "choose 1–10" comes from Rapport config instead. | 0 | ✅ |

---

## Universal modifiers: condition & scale

Any effect may carry either or both. Both are editable in the Card Designer
via the **`if/×` expander** on each effect row.

| Field | Meaning |
| --- | --- |
| `condition` | Only apply the effect if the condition holds. |
| `scale` | Repeat/multiply the effect per unit of a quantity ("per shield you broke"). |

```jsonc
{
  "type": "MODIFY_PATIENCE",
  "value": 3,
  "scale":     { "kind": "DECK_CARDS_MATCHING_COST", "side": "opponent",
                 "cost": { "kind": "CHOSEN_NUMBER" } },
  "condition": { "compare": {
      "lhs": { "kind": "DECK_CARDS_MATCHING_COST", "side": "opponent",
               "cost": { "kind": "CHOSEN_NUMBER" } },
      "op": "gte",
      "rhs": { "kind": "CONST", "value": 1 } } }
}
```

### Conditions

- `{ "compare": { "lhs": <quantity>, "op": <comparator>, "rhs": <quantity> } }` — editable
- `{ "all": [ … ] }`, `{ "any": [ … ] }`, `{ "not": … }` — ⚠️ raw JSON

Comparators: `lt` `lte` `gt` `gte` `eq` `neq`.

### Quantities (26)

Anywhere a number is dynamic. `side` is `self` or `opponent` where noted.

| Kind | Reads |
| --- | --- |
| `CONST` | a fixed `value` |
| `PATIENCE` / `MISSING_PATIENCE` | current Patience / how far below the start it is |
| `GOODWILL` | current Goodwill (v1.4.2) |
| `EVENT_OCCURRENCE_THIS_TURN` | times the current event's type has fired this turn, including this one — `eq 1` means "first time this turn" (v1.4.2) |
| `PRIORITY` *(sided)* | a side's Priority |
| `ROUND` | round number |
| `LIE_COUNTER` | lies told |
| `CARDS_PLAYED_THIS_TURN` *(sided)* | cards played this turn |
| `EXTRA_DRAWS_THIS_TURN` *(sided)* | extra (non-turn-start) draws |
| `PRIORITY_GAINED_THIS_TURN` *(sided)* | Priority gained this turn |
| `SHIELDS_STANDING` *(sided)* | shields still standing |
| `NPC_GUARDS_STANDING` | opponent Guard Shields standing |
| `OPP_SHIELDS_BROKEN_BY_PLAYER_THIS_TURN` / `…_PREV_TURN` | your breaks this / last turn |
| `PLAYER_SHIELDS_BROKEN_BY_NPC_THIS_TURN` | their breaks on you this turn |
| `GUARDS_PLACED_BY_NPC_THIS_TURN` | Guards they placed this turn |
| `CHOSEN_NUMBER` | the number chosen for this play |
| `COUNTER` | `counterName` on `permanentDefId` (`"self"` allowed) |
| `DECK_CARDS_MATCHING_COST` *(sided)* | deck cards whose cost equals a nested `cost` quantity |
| `STAGED_CARD_COST` / `STAGED_CARD_BREAK_COUNT` | the staged card's cost / its shield-break count |
| `EVENT_DELTA` / `EVENT_DELTA_ABS` / `EVENT_NEW_VALUE` | the triggering event's change / magnitude / new value |
| `EVENT_CARD_COST` | cost of the card in the event |
| `EVENT_IS_OWN_SHIELD` / `EVENT_IS_EXTRA_DRAW` | 1 or 0 flags about the event |

---

## Card-level fields that are NOT effects (v1.4.2)

These live on the card itself, alongside `name` / `cost` / `keywords` — they
are neither entries in `effects` nor trap triggers. All are editable in the
Card Designer's card panel.

| Field | Meaning |
| --- | --- |
| `goodwillCost` | Goodwill required to play at all. A **hard** cost: unlike Priority, Goodwill is never overspent, so the card is unplayable without it. |
| `additionalGoodwillCost` + `additionalEffects` | An **optional** extra payment. Offered only when affordable, never blocks the base play; paying it appends `additionalEffects`. |
| `rapport` = `{ min, max, reward }` | **Rapport X.** On play the player names a cost in `[min, max]`; if the opponent plays a card of that cost during their **next turn**, they gain `reward` Goodwill. `reward` is a Quantity, so it can be a constant or scale (e.g. `CHOSEN_NUMBER`). Pays on the **first match only** and expires at NPC Turn End. Requires the `Rapport` keyword (the designer keeps them in sync). A missing `reward` pays 0 and raises a validation warning. |

Encounter-level toggles: `patienceOverflowToGoodwill` (overflow Patience
becomes Goodwill instead of being discarded) and `startingGoodwill`.

## Restriction types (11)

Used inside `APPLY_RESTRICTION`. `target` is `self`, `opponent` or `both`;
`expiry` is a boundary + occurrence count (durations are never bare integers).

| Type | Effect | Used |
| --- | --- | --- |
| `PREVENT_SHIELD_BREAK` | target can't break shields | 6 |
| `PREVENT_DRAW` | target can't draw | 1 |
| `PREVENT_EXTRA_DRAWS` | no draws beyond turn start | 2 |
| `PREVENT_PATIENCE_GAIN` | target can't gain Patience | 2 |
| `MAX_CARD_COST` | cards cost at most `value` | 0 |
| `INCREASE_CARD_COST` | cards cost `value` more | 3 |
| `MAX_PLAYS_PER_TURN` | at most `value` plays per turn | 1 |
| `MAX_TURN_START_DRAW` | turn-start draw capped at `value` | 1 |
| `PRIORITY_FLOOR` | Priority can't fall below `value` | 1 |
| `PATIENCE_COST_PER_CARD` | each card costs `value` extra Patience | 1 |
| `BOTM_LIMIT_BONUS` | `value` extra Back-of-Mind slots | 0 |

---

## Trigger events (13)

For `trapTrigger` and `triggeredAbilities`. Each trigger takes an `event`, an
optional `controllerFilter` (`self` / `opponent`), and an optional `condition`.

`CARD_STAGED` · `CARD_PLAYED` · `CARD_RESOLVED` · `CARD_DRAWN` ·
`SHIELD_BROKEN` · `PATIENCE_CHANGED` · `PRIORITY_CHANGED` · `TOKEN_CREATED` ·
`TOKEN_DESTROYED` · `PLAYER_TURN_START` · `PLAYER_TURN_END` ·
`NPC_TURN_START` · `NPC_TURN_END`

## Boundaries (4)

For `expiry` and `SCHEDULE_EFFECTS.at`, as `{ "boundary": …, "occurrences": n }`.
`occurrences: 1` means "the next time this happens".

`PLAYER_TURN_START` · `PLAYER_TURN_END` · `NPC_TURN_START` · `NPC_TURN_END`

---

## Designer coverage

101 of 103 cards are fully editable with structured widgets. The exceptions
fall back to the per-row (or whole-card) raw-JSON escape hatch, which
round-trips untouched:

- `SCHEDULE_EFFECTS` — nested effect lists
- `MODIFY_PATIENCE` with `altValue` / `altCondition`
- `all` / `any` / `not` condition trees

Refining generated rules text is tracked in
[issue #179](https://github.com/cannotzho/breakthrough-prototype/issues/179).
