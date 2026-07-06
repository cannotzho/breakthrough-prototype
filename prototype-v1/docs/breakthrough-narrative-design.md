# Breakthrough — Toy Case: Narrative Design Document
*Structured reference for implementation. Intended audience: Claude code sessions.*

---

## Story Summary

A private investigator is hired by the sponsors of a grievously injured beast-man of high renown to find the culprit. The investigation leads from a blood-addled street vampire to the daughter of a disgraced noble house running an underground blood trade to pay off her family's debts.

**Key characters:**
- **The Detective (player)** — a PI with connections to the White Deer Police Department but not formally employed by them.
- **Gutterfang** — a blood-addled vampire lurking near the scene of the attack. Spineless and cowardly. Vulnerable to intimidation. Source of the first lead.
- **Mary-Ann Mariposa** — daughter of House Mariposa. Attending Larkgrove Women's College. Exceptionally sharp and focused. Running the blood distribution network out of The Rusty Tap to service her family's debt. Vulnerable to empathy, persuasion, and logic. Resistant to intimidation and threats.
- **Victor Mariposa** — Mary-Ann's father. Erratic, was ejected from the Seashaker Casino for making a scene. Not the mastermind.
- **Kara Mariposa** — Mary-Ann's mother. Former member of Red Moon Descends (vampire supremacist cult). Fled when the society was shut down. Cares about status, not ideology.

---

## Investigation Flow (Linear)

### 1. Opening Cutscene
Detective is issued the case by the beast-man's sponsors near the scene of the injury. A follow-up cutscene shows the detective spotting Gutterfang — clearly blood-addled — skulking in the area.

*Implementation: text/image cutscene panels, no gameplay.*

---

### 2. Encounter: Gutterfang [The Rusty Tap area]

**Goal:** Learn that the blood supply comes from a vampire noble.

**Encounter mechanics:**
- 3 opponent shields
- Shield 1 & 2: phony excuses / bluster (weak shields, low value)
- Shield 3 (final, valuable): reveals that the supplier is a noble vampire. This is the key intel card.
- Disposition: vulnerable to `intimidate`, `threaten` / resistant to `logicalAppeal`, `empathy`
- `isMinorCharacter: false`

**Cards obtained from this encounter:**
- `nobleConnection` (from final shield break)

**Post-encounter objective prompt:** "Find out more about the noble vampire families in the city."
**Tooltip hint:** Visit the bar to eavesdrop and learn more about the city's happenings.

---

### 3. Overworld: Eavesdrop at The Rusty Tap

*Non-combat interaction. Player approaches the bar and triggers a dialogue panel.*

**Cards revealed/added to compendium:**
- `loanLedger` — rumours that the Mariposa noble family has taken a large loan from The Moneylending Fellas.

---

### 4. Overworld: Sneak into The Moneylending Fellas Office

*Non-combat interaction. Player approaches the office (less guarded on a specific in-narrative moment). Triggers a text panel describing the detective flipping through the ledger.*

**Cards revealed/added to compendium:**
- `distributionNet` — confirms the Mariposas are in debt and that repayments are accelerating rapidly. The math points to an active income source.

**Post-interaction objective prompt:** "Investigate the Mariposa family."

---

### 5. Overworld: Eavesdrop at The Rusty Tap (Second Visit)

*Non-combat interaction.*

**Cards revealed/added to compendium:**
- Background on Victor Mariposa (erratic, ejected from Seashaker Casino — not the mastermind)
- Background on Kara Mariposa (ex-Red Moon Descends, superficial motivations)
- Lead on Mary-Ann attending Larkgrove Women's College

---

### 6. Overworld: Visit Larkgrove Women's College (Observation Cutscene)

*Cutscene. Detective attends a forensics workshop run by a contact in the White Deer PD. Mary-Ann is among the students. The detective observes her — sharp, efficient, clearly capable beyond her years.*

**Cards added to compendium:**
- `bloodAnalysis` — Mary-Ann was specially recommended for the forensics workshop as a promising alchemist excelling in magical blood analysis.
- `collegeRecords` — confirms her attendance and academic standing.

**Post-cutscene objective prompt:** "Confront Mary-Ann."

---

### 7. Encounter: Mary-Ann Mariposa [Near Larkgrove Women's College, campus park entrance]

**Goal:** Get Mary-Ann to admit to running the blood trade and reveal the blood vials and notebook she's carrying.

**Encounter mechanics:**
- 3 opponent shields
- Shield 1 (**Insight Card** — *She doesn't want to keep dealing*): An insight about Mary-Ann's reluctance. Breaks normally, OR auto-breaks after the player has played this card 3 times without breaking it (the repeated emotional appeal finally lands).
- Shield 2 (**Insight Card** — *Tied down by noble origins*): Her sense of obligation to her family and house. Unlocks after Shield 1 is broken.
- Shield 3 (**Confession**): Simply that she is the blood dealer. Breaks when the player plays a **Promise Card** (see below).

**Promise Card mechanic:**
- Formed by combining an Insight card (Shield 1 or Shield 2 card in player's hand after it's been broken) with a `persuade` card.
- Represents the detective offering to not turn her in + leverage White Deer connections to waive the debt.
- Automatically breaks Shield 3 when played.

**Disposition:**
- Vulnerable to `persuade`, `logicalAppeal`, `empathy`, `offerHelp`
- Resistant to `intimidate`, `threaten`

**Player shield interactions:**
- Shields related to her situation (e.g. `distributionNet`, `loanLedger`) are effective player shields — she can't attack those easily.
- The fact that the detective was hired by the beast-man's sponsors is a strong piece of information that interests her and makes effective opponent shields.

**Post-encounter choice:**
The detective must decide: complete the job for the beast-man's sponsors (breaking the promise), or let Mary-Ann go free. Letting her go adds a powerful new Personal card to the detective's permanent deck.

---

## Card Definitions

### Starting Compendium (given at case start)
| ID | Name | Notes |
|----|------|-------|
| `beastManAssault` | Beast-Man Assault | Starting lead — the injury that started the case |
| `bloodTradeSuspicion` | Blood Trade Suspicion | Starting lead — general knowledge of illegal blood dealing in the area |
| `whiteDeerDepartment` | White Deer Department | Starting lead — detective's connection to the official PD |

*(Existing starter compendium cards; may need renaming/description pass against narrative)*

---

### Personal Deck Cards (Global — available in all encounters)

| ID | Name | Cost | Mechanic |
|----|------|------|----------|
| `persuade` | Persuade | 2 | 25% chance to break a shield. Chance +5% each time `persuade` is played this encounter; resets to 25% when a shield is broken. |
| `intimidate` | Intimidate | — | Costs 3 opponent patience to break a shield. Has no effect on **Fearless** opponents. |
| `empathize` | Empathize | — | Player regains 2 patience and surrenders priority. Opponent cannot break player shields until the player has regained priority. |
| `logicalAppeal` | Logical Appeal | — | *Existing — no change required* |
| `threaten` | Threaten | — | *Existing — no change required* |
| `offerHelp` | Offer Help | — | *Existing — no change required* |
| `composure` | Composure | — | *Existing — no change required* |
| `probe` | Probe | — | *Existing — no change required* |
| `streetSmarts` | Street Smarts | — | *Existing — no change required* |

**KIV / Backlog Personal Cards:**
- `humiliate`
- `complimentSandwich`
- `tease`
- `joke`

---

### New Information Cards Needed

| ID | Name | Notes |
|----|------|-------|
| `maryannInsightReluctance` | She Doesn't Want This | Shield card — Mary-Ann's reluctance. Auto-breaks after played 3 times. |
| `maryannInsightObligation` | Tied to Her House | Shield card — Mary-Ann's family obligation. Unlocks after first insight broken. |
| `maryannConfession` | The Blood Vials | Shield card — her confession. Breaks only via Promise Card. |
| `promiseCard` | A Better Way Out | Combination card: Insight + Persuade. Breaks Shield 3 in Mary-Ann encounter. |
| `beastManSponsors` | Hired by the Sponsors | Opponent shield for Mary-Ann — knowing who hired the detective interests her. |

---

## New Mechanics Required (see Epic on GitHub)

### 1. Probabilistic Shield Break (`persuade`)
- Cards can have `breakShieldChance: number` (0–1) and `breakShieldChanceIncrement: number`
- Per-encounter counter tracks how many times the card has been played since last break
- On play: roll against current chance; on break: reset counter and chance

### 2. Patience-Cost Shield Break (`intimidate`)
- Cards can have `shieldBreakPatience: number` — costs that much opponent patience instead of resolving normally
- Encounters can set `fearless: true` — cards with patience-cost break have no effect on these opponents

### 3. Priority Surrender + Shield Immunity (`empathize`)
- New effect: `surrenderPriority: true` — sets priority to 0 after resolution
- New effect: `shieldImmunityUntilPriority: true` — player shields cannot be targeted until player has positive priority again

### 4. Cumulative Counter (Insight Card auto-break)
- Cards can have `autoBreakAfterPlays: number`
- Combat state tracks `cardPlayCounts: Record<CardId, number>`
- When a card with `autoBreakAfterPlays` is played N times, it automatically breaks the targeted shield

### 5. Card Combination (Promise Card)
- New card type or mechanic: requires two cards in hand to combine into a third
- `combinesFrom: [CardId, CardId]` on a CardDefinition — when both source cards are in hand, the combination becomes available
- Combining consumes both source cards and plays the result

---

## Backlog Items

- `humiliate`, `complimentSandwich`, `tease`, `joke` — Personal cards, design TBD
- **Remove shield peeking** — The mechanic of players peeking at their own face-down shields doesn't make narrative sense. Remove in a future pass.
- Full cutscene system (opening scene + college observation) — currently stubbed as text panels

---

## Implementation Order (Suggested)

1. New card mechanics epic (data structure changes) — affects all card/encounter work
2. Update `persuade` and `intimidate` per new definitions
3. Implement `empathize` new effects
4. Add new Mary-Ann encounter cards and shields
5. Insight card auto-break mechanic
6. Promise card / card combination mechanic
7. Non-combat overworld interactions (eavesdrop, moneylender sneak)
8. College observation cutscene
9. Post-Mary-Ann encounter ending choice
10. Update worldDeck relevance lists per narrative flow
11. Backlog: KIV personal cards, remove shield peeking
