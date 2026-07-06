# Content Porting Notes (Brief §6)

Status of the re-expression from `prototype-v1` data into the v1.4 vocabulary.
**Items marked ASK-KEN need your call before they're final.**

## Ported cleanly

- Ponder, dev cards, dev enemy cards.
- Blue starter (16/16) — tokens, replacements, traps re-authored onto canonical events.
- Red starter (16/16) — scaled effects use engine quantities; `Vindication` uses the
  §4-named `oppShieldsBrokenByPlayerPrevTurn` (the old ambiguous counter is gone).
- Green starter (15/15 ported; 2 with caveats below) — Rapport is now real prediction
  config; Disarming Word and Sensitive Deflection sit on canonical events and
  genuinely cancel (tested, Brief §6.3/§6.5).
- Orange starter (12/14 ported; 2 dropped, riders trimmed — below).
- FCP set (22/22) — devotion is generic counters/thresholds/amplifiers on
  `fcp_idols_favor`; the engine has no knowledge of any FCP card (§3.10 verified
  by the no-card-ID lint).
- Mistimed `END_OF_PLAYER_TURN` traps (His Loyal Fan, Distracting Madness,
  Unhinged Focus) re-authored per printed intent (Brief §6.4): His Loyal Fan →
  `PLAYER_TURN_END`; the two restriction traps → `PLAYER_TURN_START` so their
  "this turn" restrictions cover the full player turn.

## ASK-KEN — key-nugget assignments & encounter redesign (Brief §6.6, §8)

Draft assignments live in `src/content/encounters.ts`, marked `DRAFT`:

**The Informant** — guards: **3** (old dev value was 10 — looked like a test
setting, proposed 3 for pacing); locks: warehouse shield ← `warehouse_activity`;
personal hint ← `personal_troubles`; witness shield ← `witnessed_incident` OR
`personal_troubles` (two keys, one lock, to demo the mechanic).

**Fan Club President** — guards: **5** (from old `npcDummyShieldSlots`); locks:
Fan's Solace ← `fcp_fan_letters`; Moment of Clarity (hint) ← `fcp_idol_schedule`;
Crippling Fear ← `fcp_passcode_knowledge` OR `fcp_physical_traces` (the old card
text said "requires passcode knowledge + physical traces" — modelled as either
key sufficing per §3.3 "one lock, many keys"; if you want BOTH required, that's
a design change to §3.3); It Wasn't Me ← `fcp_witness_statements`.

New Information Cards + nuggets + per-encounter overrides were authored to make
these winnable (v1.4 §3.3: unwinnable without keys is intentional, but the dev
decks need key access — the dev Collection includes all Information Cards).

## ASK-KEN — cards that couldn't be faithfully re-expressed

1. **orange_equal_exchange** (`MIRROR_NPC_PRIORITY_GAIN`) — "schedule the same
   amount for you next turn" needs value-capture at schedule time; scheduled
   effects currently evaluate scales at fire time (no event context). Options:
   (a) add capture-at-schedule to §9.4, (b) redesign the card. **Excluded** for now.
2. **orange_monolithic_ideals** (`CONDITIONAL_MAX_SHIELD_BREAKS` /
   `CONDITIONAL_MAX_PATIENCE_LOSS`) — per-turn rate caps aren't triggered
   abilities. Proposal: promote `MAX_SHIELD_BREAKS_PER_TURN` and
   `MAX_PATIENCE_LOSS_PER_TURN` to core §9.1 restriction types (doc change),
   using the existing `conditionThreshold` field. **Excluded** for now.
3. **green_genuine_enjoyment** — "prevent the break AND lose 5 Patience
   instead" is a prevention-with-cost replacement. Nearest vocabulary is plain
   `PREVENT_SHIELD_BREAK`, which loses the cost. Proposal: new restriction type
   `PREVENT_SHIELD_BREAK_WITH_PATIENCE_COST`. **Excluded** for now.
4. **orange_mind_tax / orange_artful_injunction** — "per extra draw / per
   blocked draw" riders: there is no draw event in the canonical §5.1 table.
   Mind Tax was re-authored to settle at `NPC_TURN_END` scaled by the
   opponent's extra draws (close to intent); the injunction's priority rider is
   dropped. If per-draw reactivity matters, that's a §5.1 addition (CARD_DRAWN)
   — version bump.
5. **fcp_lunatic_love** — `DEVOTION_PAYS_PRIORITY` dropped (pay-priority-with-
   counters is a cost-payment rule, not an ability). Card keeps its other two
   restrictions. Redesign or new mechanic?
6. **fcp_idols_favor transform** — old condition "10 total shields broken OR all
   NPC dummies broken". There's no cumulative shields-broken counter in v1.4's
   state; ported as all-Guards-broken only. Add a cumulative counter to the §4
   vocabulary if the 10-total clause matters.
7. **green_to_truly_know** — old tiers ("3 counters: break 3/turn; 5: break 5;
   10: break all") ported as three *consuming* thresholds (3→3, 5→5, 10→10).
   Not identical to "per turn while held" — confirm intended semantics.
8. **blue_find_fallacy** — old data fired on any opponent play with the +8
   conditional; printed text implies firing on the 3rd card. Ported as
   trigger-on-3rd-card with both effects unconditional. Confirm.

## Patience asymmetry audit (Brief §6.7, v1.4 §3.2)

- All player-card text reworded to "Pay N Patience" (cost framing); NPC cards
  say "Drain" — no card text implies the player wants Patience low.
- **White's low-Patience scalers**: not yet ported (White starter didn't exist
  in the old data) — Red's `press_the_attack` / `charismatic_conviction` keep
  their risk/reward framing as deliberate exceptions.
- **Copy-inversion (v1.4 §16.7)**: affected cards flagged, not decided:
  `green_empathy`, `green_shared_perspective` can copy NPC Patience-drain cards
  (e.g. `fcp_youre_a_hindrance`), which are dead weight or self-harm in the
  player's hand. Engine currently plays copies as printed. Needs the §8.5
  inversion rule decision.
- `red_ultimatum` / `red_intimidating_presence` drain Patience on *opponent*
  plays — under §3.2 these hurt the player's own budget with no payoff.
  Ported as printed (Red recklessness), but flagged: they may want redesign.

## Supabase

Old rows: **discarded** (Ken's call, this session). Fresh v1.4 schema in
`supabase/schema.sql`; content files above are the seed source.
