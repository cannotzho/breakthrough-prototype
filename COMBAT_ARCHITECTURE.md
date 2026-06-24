# Combat Architecture

Technical reference for the combat engine's internal systems. For game design rules, see `Breakthrough_Design.md`.

## State Machine

The combat engine is a pure reducer (`CombatState`, `CombatAction`) → `CombatState` with phase-based routing. `checkState()` is the central router that reads the current state and determines the next phase.

```mermaid
stateDiagram-v2
    [*] --> Check
    Check --> PlayerPending : priority > 0
    Check --> BotMSelect : priority ≤ 0 AND hand not empty
    Check --> EnemyPending : priority ≤ 0 AND hand empty
    Check --> EnemyPlay : stagedEnemyCard exists
    Check --> WIN : all opponent shields broken
    Check --> LOSE : patience ≤ 0 / shields lost / lie threshold

    PlayerPending --> Check : PLAY_CARD (effect resolution)
    PlayerPending --> Check : PLACE_SHIELD
    PlayerPending --> Check : END_TURN (priority → 0)
    PlayerPending --> Check : ACTIVATE_ABILITY
    PlayerPending --> RevealPending : effect breaks shield

    BotMSelect --> EnemyPending : CONFIRM_BOTM (handoff bonus applied)

    EnemyPending --> FieldTriggerCheck : TRIGGER_ENEMY_ACTION (selectEnemyCard)
    FieldTriggerCheck --> EnemyPlay : RESOLVE_FIELD_TRIGGERS
    EnemyPlay --> Check : RESOLVE_ENEMY_CARD

    RevealPending --> Check : DISMISS_REVEAL (resume effects)
```

## Effect Resolution

Effects are resolved via `resolveEffectList(state, effects, card, onComplete)`. Each effect is applied via `applyEffect(state, effect, controller, sourceCard)`. The system supports interrupts — if a `pendingReveal` is set mid-resolution, remaining effects are queued and resumed after the player dismisses the reveal.

```mermaid
flowchart TD
    A[resolveEffectList] --> B{For each effect}
    B --> C[applyEffect]
    C --> D{pendingReveal set?}
    D -->|Yes| E[Pause: queue remaining effects → RevealPending]
    D -->|No| B
    B -->|All done| F[onComplete callback]
    F --> G[resolveFieldTriggerCheck]
    G --> H[checkState]
```

### Effect Types

| Effect | Description |
|--------|-------------|
| `MODIFY_PRIORITY` | Adjust shared priority meter (frame) or player meter (classic) |
| `MODIFY_PATIENCE` | Adjust NPC patience |
| `DRAW_CARDS` | Draw N cards from player deck |
| `BREAK_OPPONENT_SHIELD` | Break next shield on controller's opponent side |
| `PLACE_AS_SHIELD` | Flag card for shield placement (pending UI) |
| `INCREMENT_LIE_COUNTER` | +1 to lie counter |
| `PLACE_IMPRESSION` | Place card as persistent impression on field |
| `CREATE_TOKEN` | Create token instance(s) from registry + dispatch `TOKEN_CREATED` |
| `DESTROY_SELF` | Destroy the source card (token or impression) — routes through `destroyToken` for tokens |

## Token Lifecycle

Tokens are persistent field cards created by `CREATE_TOKEN` effects and stored in `CombatState.fieldTokens`. They support activated abilities (player-initiated) and leave-the-battlefield triggers (automatic on destruction).

```mermaid
flowchart TD
    A[CREATE_TOKEN effect] --> B[Token added to fieldTokens]
    B --> C[dispatchGameEvent: TOKEN_CREATED]

    D[Token destroyed] --> E{Destruction path}
    E -->|destroyToken| F[Remove from fieldTokens]
    F --> G[Resolve leavesTriggerEffects]
    G --> H[dispatchGameEvent: TOKEN_DESTROYED]

    E -->|removeTokenRaw| I[Remove from fieldTokens only]
    I --> J[No triggers, no events]

    style I fill:#555,color:#fff
    style J fill:#555,color:#fff
```

### Two Removal Paths (by design)

- **`destroyToken(state, instanceId)`** — Full lifecycle: removes the token, fires its `leavesTriggerEffects`, then dispatches `TOKEN_DESTROYED` to passive listeners. Used by: `DESTROY_SELF` effect, `DESTROY_TOKEN` action, and any future forced-destruction effects.

- **`removeTokenRaw(state, instanceId)`** — Silent removal: removes the token without firing any triggers or events. Used exclusively by transform effects, where the token is being converted to another type, not leaving the battlefield.

This separation is structural, not conditional — transform must never accidentally route through `destroyToken`.

### Token Definition Fields

```typescript
interface CardDefinition {
  // ... existing fields ...
  leavesTriggerEffects?: CardEffect[];    // fired when token is destroyed (not transformed)
  activatedAbilities?: ActivatedAbility[]; // player-initiated abilities with costs
  triggeredAbilities?: TriggeredAbility[]; // passive listeners for game events
}
```

## Game Event Dispatch

Field cards (impressions and tokens) can declare passive `triggeredAbilities` that react to game-wide events. When a game event occurs, `dispatchGameEvent(state, event)` scans all field cards for matching triggers and resolves their effects.

```mermaid
flowchart TD
    A[Game Event occurs] --> B[dispatchGameEvent]
    B --> C{Scan fieldImpressions + fieldTokens}
    C --> D{Card has triggeredAbility matching event?}
    D -->|No| C
    D -->|Yes| E{controllerFilter matches?}
    E -->|No| C
    E -->|Yes| F[Resolve ability effects]
    F --> G[triggerDepth++ for recursion protection]
    G --> C
    C -->|All cards checked| H[Return updated state]
```

### Event Types

| Event | Fired when | Used by |
|-------|-----------|---------|
| `TOKEN_DESTROYED` | `destroyToken()` completes | Eloquence, Lingering Words |
| `TOKEN_CREATED` | `CREATE_TOKEN` effect resolves | (reserved for future use) |
| `CARD_PLAYED` | (not yet wired) | (reserved for future use) |
| `SHIELD_BROKEN` | (not yet wired) | (reserved for future use) |

### Triggered Ability Definition

```typescript
interface TriggeredAbility {
  id: string;
  trigger: GameEventType;        // which event to listen for
  controllerFilter?: CardOwner;  // if set, only fires when event source matches controller
  effects: CardEffect[];         // effects to resolve
}
```

Example — Eloquence: "Every time a token is destroyed, draw a card"
```typescript
triggeredAbilities: [{
  id: 'eloquence_draw',
  trigger: 'TOKEN_DESTROYED',
  effects: [{ type: 'DRAW_CARDS', value: 1 }],
}]
```

Example — Lingering Words: "Every time a token you control is destroyed, create a Logical Chain"
```typescript
triggeredAbilities: [{
  id: 'lingering_words_chain',
  trigger: 'TOKEN_DESTROYED',
  controllerFilter: 'player',
  effects: [{ type: 'CREATE_TOKEN', tokenDefinitionId: 'logical_chain', value: 1 }],
}]
```

## Recursion Protection

All trigger-based systems share the `triggerDepth` counter on `CombatState`, capped at `MAX_TRIGGER_DEPTH` (20). This prevents infinite loops from:
- Trap → effect → trap chains
- Shield trigger → effect → shield trigger chains
- Token leave trigger → create token → destroy token → leave trigger chains
- Passive listener → create token → listener chains

## Priority Modes

### Frame Mode (`'frame'`)

Single shared priority meter (clamped −10 to +10). Priority > 0 = player's turn; ≤ 0 = NPC's turn.

- Card costs deduct from priority
- NPC card costs push priority positive (self-limiting)
- `applyTurnHandoffBonus(priority, side)` adds ±3 on turn switch
- `priorityRestore` fires when priority flips from ≤ 0 to > 0: applies handoff bonus, returns BotM cards, draws to hand limit, expires traps

### Classic Mode (`'classic'`)

Separate priority meters. Explicit turn alternation via `activeTurn` flag.

## File Map

| File | Role |
|------|------|
| `src/combat/types.ts` | All TypeScript types |
| `src/combat/combatReducer.ts` | Pure reducer + `checkState` router |
| `src/combat/effectHandlers.ts` | Effect application, token lifecycle, event dispatch, priority/shield helpers |
| `src/data/devCards.ts` | Test card/token definitions |
| `src/data/encounterDefs.ts` | Test encounter configs + `buildInitialCombatState()` |
