## Analysis: Shield cards vs. shield-breakers

Looked through `cards.ts`, `Combat.ts`, `effects.ts`, and the two live encounters in `encounters.ts` to ground this in what's actually implemented today.

### The audit: yes, there's overlap — but it's a structural property, not a labeling slip

There's no dedicated "shield card" type in the data model. Shields aren't a card archetype — they're an *action* (`PLACE_SHIELD`) that consumes whatever Information card happens to be first in the player's hand (`hand.findIndex(id => CARDS[id]?.supertype === 'Information')`, Combat.ts:309). Any Information card can become shield material; `valuableShields` is just an encounter-level tag marking which of those cards the NPC would be especially rattled to see (it drives the "surge vs. barely notice" branch in `CHOOSE_SHIELD_TO_BREAK`).

So when we ask "does a 'valuable shield' card double as a shield-breaker," the honest answer for the two live encounters is:

- **Gutterfang** — `valuableShields: ['bloodTrail', 'streetInfo', 'theRustyTap']`. Of these, `bloodTrail` and `theRustyTap` both carry `breakShield: true`. Only `streetInfo` (a plain Priority +1 card) is "clean."
- **Mary-Ann** — `valuableShields: ['loanLedger', 'distributionNet', 'bloodAnalysis', 'beastManSponsors']`. `loanLedger` and `distributionNet` both carry `breakShield: true`; `bloodAnalysis` and `beastManSponsors` are clean (patience/priority effects only).

So roughly two-thirds and one-half of the "valuable" lists, respectively, are also primary shield-breakers. That overlap is real and worth addressing — but I'd push back gently on calling it a "contradiction." It's closer to: the cards the encounter design has marked as the most narratively significant pieces of evidence (`bloodTrail`, `theRustyTap`, `loanLedger`, `distributionNet` — note these are also the highest-cost Information cards: 2–4 priority, vs. 1–2 for the "clean" ones) are *also* the cards with the strongest mechanical payoff (`breakShield: true`, guaranteed and consumed-on-use). That's thematically coherent — the most important lead is naturally also the most powerful tool — but it does create a real mechanical tension worth naming explicitly.

### Where the actual tension lives: the player has zero say in what becomes a shield

This is the part I'd flag as the sharper design question. `PLACE_SHIELD` doesn't let the player choose which Information card gets consumed — it grabs the *first* Info card index in hand. That means a player who's holding `bloodTrail` (their best shield-breaker) and, say, `streetInfo`, and decides to place a shield, has no guarantee which one gets buried behind their wall. If `bloodTrail` gets consumed and that shield later breaks, the player loses both (a) a powerful offensive tool they never got to use, and (b) takes the "valuable shield found" patience surge — a double punishment for a choice they didn't actually make.

That randomness undercuts the "valuable shield" mechanic's intended weight. Right now "valuable shields" reads as a flavor/risk layer bolted onto an essentially automatic process, rather than a meaningful tradeoff the player opts into.

### Shield-breakers: there are more of them, and more *kinds*, than you might expect

Counting every card whose `effects` can break an opponent shield (`breakShield`, `breakShieldChance`, `shieldBreakPatience`, `autoBreakAfterPlays`, plus the `promiseCard` combination): **11 cards**, spanning four distinct mechanisms —

1. **Guaranteed & consumed**: `bloodTrail`, `nobleConnection`, `loanLedger`, `distributionNet`, `theRustyTap`, `promiseCard`, `promiseKept` — play it, a shield breaks, the card (if Information) is removed from the game entirely.
2. **Probabilistic, ramping**: `persuade` — 25% base, +5% per failed attempt, resets to base on success.
3. **Patience-gated**: `intimidate` — costs the *opponent* 3 patience to force a shield open; explicitly does nothing against `fearless` opponents (Mary-Ann is fearless, so `intimidate` is a dead card there by design — nice disposition-driven counterplay).
4. **Attrition / inevitability**: `maryannInsight` / `maryannInsightReluctance` — auto-breaks after the third play, independent of luck or cost.

Against that, there is **no symmetric "shield" card type at all** — defense is just "spend 2 priority and burn a random Info card from hand." That asymmetry (offense = a rich, varied toolkit; defense = one undifferentiated action) is, to me, the more interesting balance question underneath the one you raised. It also means shield-*breaking* cards are plentiful and the dominant use of the Information suit, while "shielding" isn't really a *card* category that can be over- or under-represented — it's a sink for whatever Information card you happen to be holding.

### Priority/instant and the combination mechanic (#61)

Worth noting as a clean separation that's *already working well*: none of the 11 shield-breakers are `instant`. Shield-breaking is exclusively an attack-phase, priority-gated action; the instants (`empathy`, `empathize`, `composure`, `offerHelp`, `whiteDeerDepartment`) are purely defensive/tempo tools playable in either phase. So there's no overlap risk between "things you can always do" and "things that break shields" — that boundary is solid.

The combination system *does* intersect this discussion directly, though: `promiseCard` (from `maryannInsightReluctance` + `persuade`) is the **only** card that can break Mary-Ann's third shield (`requiresCardId: 'promiseCard'`). That's a deliberate, gated shield-breaker — a nice payoff for assembling a combo — but it also means that encounter's "win condition" shield-breaker isn't a card you draw, it's a card you *build*. That's a different (and arguably healthier) relationship between shield and shield-breaker than the raw-overlap question above: instead of "is this card both a shield and a breaker," it's "is the breaker itself a constructed resource." Might be worth considering whether the trap-card idea below could similarly be built via combination rather than drawn directly, to keep that resource-construction feel consistent.

### On the "trap" mechanic exception

I think this is the most promising resolution path, and the codebase is already shaped to support it cheaply. `breakLowestOppShield()` (effects.ts:64) is a self-contained helper that any effect can call. A `breaksShieldOnReveal: true` (or similar) flag on `CardEffects`, checked inside the `CHOOSE_SHIELD_TO_BREAK` branch where `isValuable` is currently determined (Combat.ts:343), could call `breakLowestOppShield` the moment that card is revealed as a broken player shield. Mechanically this would flip the overlap from "a liability with a side benefit (offense) you didn't get to use" into "a liability that *is* the benefit" — turning your worst moment (a shield breaking) into a counter-strike. That reframes "valuable + shield-breaker" from an accidental contradiction into an intentional, named card behavior — exactly the kind of "trap" you described.

### Suggested directions

1. **Give the player agency over what becomes a shield.** Even a lightweight choice (pick which Information card in hand to consume, rather than auto-grabbing the first match) would convert the current overlap from "random risk" into "a real tradeoff": *do I keep my best shield-breaker in hand, or bury it where the opponent might find it?* That alone would make the existing overlap feel intentional rather than incidental — possibly without even needing to change which cards are tagged `valuableShields`.
2. **Pick a lane for the overlap and commit to it per-encounter**, rather than a blanket rule:
   - *Separation lane*: keep `valuableShields` to cards with no `breakShield`-family effect (like `streetInfo`, `bloodAnalysis`, `beastManSponsors` already are) — purely narrative/patience-relevant evidence that's risky to lose but not a tool you'd miss using offensively.
   - *Trap lane*: formalize `breaksShieldOnReveal` for the cards where overlap currently exists (`bloodTrail`, `theRustyTap`, `loanLedger`, `distributionNet`) so the dual role becomes their defining trait rather than an oddity.
3. **If you keep the overlap as-is for some cards**, consider surfacing it to the player explicitly (e.g., a card-face icon or tooltip note such as "valuable if hidden") so the tension is legible rather than discovered the hard way when a shield breaks.

Happy to help prototype the `breaksShieldOnReveal` flag if that direction seems worth pursuing — the plumbing for it (the helper function, the `isValuable` check site, the `CardEffects` interface) is all already in place.
