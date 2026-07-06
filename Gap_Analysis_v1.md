# Breakthrough — Gap Analysis: Design Doc (v1.2/v1.3) vs Current Implementation

> Prepared July 4, 2026. Scope: core gameplay mechanics only. `legacy/` excluded.
> Purpose: input for ironing out the design document before a from-scratch rebuild.

---

## 1. The design doc contradicts itself (fix before anything else)

The v1.3 changelog was added but the document body was never updated. Anyone (human or Claude) implementing from the body will re-introduce mechanics v1.3 removed.

1. **Patience overflow still described in the body.** v1.3 says card cost never spills into Patience, but §4.3 Player Play step 1 ("pay `max(0, cost − currentPriority)` from NPC Patience"), Sequencing Invariant 9, and the Player Pending shield-placement note ("with Patience overflow in Frame Priority Mode") all still describe the removed overflow rule.
2. **Version desync.** Header says "Draft v1.2", footer says "End of document — v1.2", changelog says v1.3.
3. **Priority clamp underspecified.** The body says the Frame meter is "clamped to −10 to +10", but v1.3 allows player plays to go "arbitrarily negative". These interact badly: NPC gains ARE clamped, so from −15 a single 3-cost NPC play snaps priority to −10 (the clamp eats 8 points of the player's deficit for free). The doc needs to state exactly which operations clamp and what happens below −10.
4. **"No automatic turn-ending" is false in Frame mode.** §3/§4 state the player must always click End Turn, "even if Priority reaches zero." But Check rule 6–8 routes to the NPC whenever Priority ≤ 0 — so playing a card that drops Priority to ≤ 0 hands the turn over with no End Turn click. The implementation does exactly this too. The guarantee only holds while Priority > 0; the doc should scope the claim (or the design should change — see Open Decision #3).
5. **BotM trigger contradiction.** §BotM Select says it fires "when the player explicitly ends their turn." Check rule 7 (doc AND code) fires it whenever Priority ≤ 0 with a non-empty hand — including *mid-NPC-turn* if the player gains cards during the opponent's turn (e.g. Disarming Word copies cards to the player's hand). Result: a second forced BotM prompt in the middle of the NPC's turn that discards the newly gained cards. The doc rule needs a "only at the player→NPC handoff" qualifier and the engine needs a flag for it.
6. **`relevantCards` no longer exists.** The doc's Information Card model (§3, §5, §6.1, §7) is written around `relevantCards`. The codebase replaced this wholesale with the **Info Nugget system** (`info_nuggets` table, `nuggetOverrides` on encounters, `nuggetId` on cards, discovery store). The nugget model is arguably better (a nugget is the abstract knowledge; cards are per-encounter manifestations), but it is documented nowhere. The doc must adopt or reject it explicitly.

---

## 2. Implementation bugs / misunderstandings (engine)

These are places where the code deviates from any reasonable reading of the doc — the "Opus misunderstandings."

### 2.1 `defaultRestorePriority` is never used — Priority Restore is wrong
`priorityRestore()` sets priority to **current priority + 3**, not `defaultRestorePriority + 3` (§Priority Restore). The config field exists only in the type.
**Consequences:**
- Restore value depends on how far the NPC happened to push the meter, not on encounter tuning.
- **Soft-lock:** if the NPC deck exhausts while priority ≤ −3, restore leaves priority ≤ 0 → Check routes back to the NPC → BotM Select fires again (fresh hand was drawn), each BotM confirm applies −3, each exhaustion applies +3 → the player is trapped in a BotM/handoff loop, burning their deck.

### 2.2 Trap "cancel" doesn't cancel — and duplicates the card
`RESOLVE_ENEMY_CARD` captures the staged card, runs the trap check (`OPPONENT_PLAYS_CARD`), then **unconditionally resolves the captured card's effects** and pushes it to `enemyDiscard` in its completion step. If a trap fired `CANCEL_STAGED_ENEMY_CARD` or `INTERCEPT_SHIELD_BREAKS` (which already moved the card to discard):
- the "cancelled" card's effects resolve anyway, and
- the card ends up in the NPC discard **twice**.
Green's *Disarming Word* and *Gross Oversight* are both broken as printed.

### 2.3 Three of six trap trigger types are dead code
Only `OPPONENT_PLAYS_CARD` and `END_OF_PLAYER_TURN` events are ever dispatched. `OPPONENT_BREAKS_SHIELD`, `PATIENCE_CHANGE`, and `PRIORITY_CHANGE` are never fired anywhere — traps authored with them (e.g. Green's *Sensitive Deflection*) silently never trigger. `COMPOUND_NPC_TURN` piggybacks on `OPPONENT_PLAYS_CARD` and does work.

### 2.4 `END_OF_PLAYER_TURN` fires at the *start* of the player's turn
It is dispatched inside `priorityRestore()` / `classicTurnStart()` — i.e. at the NPC→player handoff (end of the **NPC's** turn). Two knock-on bugs:
- NPC traps like *His Loyal Fan* ("end of opponent's turn: +1 devotion per shield they broke") fire at the wrong boundary.
- *Distracting Madness* applies a 1-turn `PREVENT_EXTRA_DRAWS` restriction on the player — and `tickRestrictions()` runs **immediately after** the trap check in the same handoff sequence, decrementing it to 0 and deleting it before it ever applies. The card does nothing.
Also: "opponent" in trap trigger names is not owner-relative. NPC-owned traps watching player actions can never fire on player plays, because `completePlayerPlay` calls the field trigger check with **no event**.

### 2.5 The Field Trigger Check *phase* is inert
The `FieldTriggerCheck` phase (with its 400ms UI delay) dispatches `RESOLVE_FIELD_TRIGGERS`, which calls `resolveFieldTriggerCheck(state)` **without an event** — so no traps are ever evaluated there. The real trap check lives inside `RESOLVE_ENEMY_CARD`. The doc's "pre-play trigger check when staging" (§Enemy Pending → Field Trigger Check → Enemy Play) effectively doesn't exist.

### 2.6 Dummy shield cards vanish from the game on break
`breakPlayerShieldAutomatic` sends **core** shield cards to the discard but not dummy ones — a real card placed as a dummy shield is removed from the encounter entirely when broken. Doc §11.5 explicitly lists "Shield → Discard (break)". This silently shrinks the player's deck every time a shield breaks.

### 2.7 Reveal during enemy play skips the enemy completion step
If an NPC card triggers Reveal Pending mid-effects, `DISMISS_REVEAL`'s resume path discards the staged card but **skips** the NPC-impression/NPC-trap placement and the devotion-threshold check that the normal `RESOLVE_ENEMY_CARD` completion performs.

### 2.8 Degenerate win/loss checks
- Win = `opponentShields.every(broken)` → an encounter with zero opponent shields is an **instant win** at the first Check.
- Loss (all player shields broken) is gated by `shieldsEverPlaced > 0`. Combined with the auto-filled placeholder shields (see §3.2), a config with `playerDummyShieldSlots: 0` produces a player who can **never** lose by shields. The doc has no such guard; neither behavior is a documented decision.

### 2.9 Mid-play Priority Restore refills the hand
A player card whose cost drops priority ≤ 0 and whose effect pushes it back > 0 triggers a **full Priority Restore mid-play** — BotM returns, hand refills to limit. The doc technically says restore fires "regardless of cause," but this enables hand-refill engines and already forced a hack (trap expiry gated on `npcCardsPlayedThisTurn` with a long apology comment). Needs an explicit design ruling (Open Decision #4).

### 2.10 Engine purity violations & hardcoded card IDs
- Module-level mutable `shieldBreakCounter` (persists across encounters/hot reloads; breaks reducer purity).
- Card-specific logic hardcoded in the generic engine: `green_genuine_enjoyment`, `green_to_truly_know`, `fcp_idols_favor`, `fcp_my_idol`, `fcp_complete_devotion`, and the `sensitive` trait check inside `MODIFY_PATIENCE`. Cards authored via Supabase can never use these mechanics, and renaming an ID silently breaks them. The rebuild needs a data-driven pattern (e.g. keyword/ability flags instead of ID matching).
- Trait discovery mutates `state.config.traits` (config should be immutable input) and is never persisted.

### 2.11 UI vestige of the removed interrupt system
The Back-of-Mind zone offers a "Play" context-menu action, but `PLAY_CARD` only searches the hand → silent no-op. Doc removed BotM-play in v1.1; the UI didn't get the memo.

---

## 3. Doc features that were never implemented

1. **Core Shields — entirely missing.** `allowedCoreShields` is never read; `buildInitialCombatState` hardcodes `coreSlots = []`. The break-path supports `'core'` but nothing ever creates one. No Collection-based auto-placement.
2. **Pre-encounter Shield Card Selection (§6.2) — replaced by free placeholder shields.** Instead of the player sacrificing real deck cards into shield slots, every dummy slot is auto-filled with a free synthetic "Dummy Shield" card. This deletes a core economic decision (shields cost you deck quality) and, combined with §2.6, changes the shield game completely.
3. **Info Card selection & Case 2 Ponder substitution (§6.1)** — no pre-encounter phase exists. (Case 1 play-time Ponder conversion IS implemented, via the nugget system.)
4. **Dynamic combining (§10.4)** — only exact two-card recipes; `COMBINATIONS` is empty, so the entire Assemble/combine system is currently unreachable in play.
5. **Blue's BotM capacity increase** — no effect type can modify `backOfMindLimit`.
6. **Trait system** — only `sensitive` works (hardcoded). No trait vocabulary, no persistence of discovery, `Fearless`/Intimidate doesn't exist as a mechanic.
7. **Persistent state (§7)** — `saveStore` unwired; no persistent shield breaks, no retry flow at all (WIN/LOSE screens dead-end to exit). Nugget discovery IS persisted (Supabase).
8. **Hints** — partially implemented (lore reveal works); "hint text remains visible in the shield zone" is cosmetic-only at best.

---

## 4. Implemented systems the doc knows nothing about

The code has grown far past the doc. Each of these needs a keep/cut decision, then documentation:

| System | What it is |
|---|---|
| **Info Nuggets** | Replaces `relevantCards`. Nugget = abstract knowledge; cards reference `nuggetId`; encounters override the card def per-nugget; discovery tracked globally. |
| **NPC dummy shields** | `npcDummyShieldSlots` (10 in test encounters!) prepends free unbreakable-lore-less shields to the opponent. Winning "The Informant" means breaking **13** shields, not 3. Huge pacing change, undocumented. |
| **Tokens** | `fieldTokens`, `CREATE_TOKEN` / `TRANSFORM_TOKEN` / `DESTROY_TOKENS`, token registry (Logical Chain → Impactful Conclusion economy, etc.). |
| **Triggered abilities** | GameEvent bus (`CARD_PLAYED`, `SHIELD_BROKEN`, `TOKEN_CREATED/DESTROYED`) with per-play/per-turn fire limits. |
| **Activated abilities** | On-field cards with costs (priority / patience / sacrifice shields / discard). |
| **Restrictions & replacements** | 22 `RestrictionType`s (a full status-effect system) + token replacement effects, with turn-based expiry. |
| **Scheduled effects** | Delayed effect queues (`SCHEDULE_EFFECTS`, `scheduledPlays` on encounters). |
| **New keywords** | `Rapport` (choose-a-number trap gating), `Heavy Hand` (pay double cost for upgraded effect). |
| **Devotion** | FCP encounter engine: counters on an idol impression, threshold effects, transform-at-threshold. Largely hardcoded to `fcp_*` IDs. |
| **NPC impressions/traps** | NPC can place field permanents; NPC turn-start effects. |
| **Steal-as-copy** | `COPY_FROM_NPC_DECK` with `patienceCostOverride` (copied cards cost Patience to play). Presumably Black's "steal," but it *copies* (NPC deck unchanged). |
| **Dual playtest** | Full 2-player mode over a realtime channel (`DualSetupScreen`, action broadcast, role gating). Not in the doc or CLAUDE.md. |
| **Manual enemy mode** | Dev tool: human picks NPC plays. |

Also undocumented smaller deltas: NPC deck is a flat `enemyDeckCardIds` list played **top-down deterministically** (first playable card — there is no NPC hand or AI selection policy in either doc or code, beyond `scheduledPlays`); `REVEAL_NPC_HAND` exists but the NPC has no hand.

---

## 5. Design pitfalls to resolve in the doc rewrite

1. **Frame mode NPC turn length is emergent, not authored.** The NPC keeps playing until its own costs push priority > 0. With cheap NPC cards and the ±10 clamp, turn length swings wildly; `defaultRestorePriority` (if actually used) plus the handoff bonus is the only tuning lever. Consider documenting expected NPC turn-length math per encounter.
2. **Turn-handoff bonus is duplicated across four reducer sites** (play-to-empty, place-shield-to-empty, End Turn, BotM confirm). The rebuild should have a single `handOff(to)` transition function — most of §2's bugs live at this seam.
3. **"This turn" counters are ambiguous.** `playerShieldsBrokenThisTurn` counts *opponent* shields broken by the player; `playerShieldsBrokenByNpcThisTurn` counts the player's own. Naming caused at least one authoring confusion already. The rebuild should name counters by (whose shields, broken by whom, which window).
4. **Trap trigger vocabulary needs owner-relative semantics** ("controller's opponent does X"), and every trigger type must map to an actual dispatched event — the doc should list the canonical event set the engine emits.
5. **Reveal/suspend machinery is the most fragile part of the engine** (pendingEffects splicing across RevealPending / ChooseNumberPending / DeckRevealPending, with special-case resumption in four reducer arms). The doc's "suspend and resume" invariant is right; the rebuild should implement it once, generically (an effect-stack), not per-modal.
6. **Two extra blocking states exist** (`ChooseNumberPending`, `DeckRevealPending`) that violate the doc's "state machine is stable" principle — they were added without a doc version bump. Fine mechanics, but per the doc's own rule §4.1(4), they must be logged as state-machine changes.
7. **Classic mode is second-class.** Several systems (handoff bonus, restore, trap expiry timing) were designed Frame-first and patched into Classic. Decide whether Classic is a real shipping mode or a dev experiment; it doubles the test surface of every mechanic.

---

## 6. Recommended doc-rewrite order

1. Resolve the Open Decisions (below) with Ken.
2. Fold v1.3 into the body; fix §4.3, Invariant 9, §Player Pending; bump to v1.4.
3. Adopt/adapt the Info Nugget model as the official Information Card system (replacing `relevantCards`).
4. Add a **canonical event vocabulary** section (what the engine dispatches, when) — traps, triggered abilities, and shield triggers all hang off it.
5. Add sections for each kept system from §4 (tokens, restrictions, abilities, keywords, devotion-style counters as a *generic* mechanic).
6. Specify the handoff transition as a single named procedure (bonus, BotM, trap expiry, restriction ticks, counter resets — in one ordered list).
7. Rewrite §6.2 shields decision (real cards vs free placeholders) per Ken's call.

## Open Decisions (provisional answers — awaiting Ken's confirmation)

1. **Undocumented systems** — canonize, trim, or case-by-case? (§4 table)
   *Provisional: case-by-case — Claude proposes keep/cut per system, Ken approves each.*
2. **NPC dummy shields** — keep (and document pacing math) or cut?
   *Provisional: keep & document as an intended pacing buffer.*
3. **Frame-mode auto-handoff at ≤ 0** — keep (current) or require explicit End Turn always?
   *Provisional: End Turn remains an explicit player acknowledgement of turn end, even with no legal moves left (i.e. no silent auto-handoff).*
4. **Player shields** — is "never placed any shields = can't lose by shields" intended? Free placeholder shields vs. real-card shields?
   *Provisional: hybrid — free placeholder shields at encounter start (configured count), real-card placements mid-combat, both go to discard on break.*
5. **Mid-play Priority Restore** — should a player's own effect crossing 0 trigger a full restore (hand refill)?
   *Provisional: no — Priority Restore (hand refill) fires only on a genuine NPC→player handoff; a player effect crossing 0 mid-turn just continues the turn.*
