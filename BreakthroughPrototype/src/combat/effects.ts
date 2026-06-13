import type { CombatState, DeckState, CardDef, CardOverride } from './types';
import { CARDS } from '../data/cards';

// ── Utility helpers ────────────────────────────────────────────────────────────

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function addLog(state: CombatState, msg: string): CombatState {
  return { ...state, logs: [msg, ...state.logs].slice(0, 20) };
}

/**
 * Draw one card from a deck. If the draw pile is empty, reshuffles the
 * discard pile first. Returns [drawnId | null, updatedDeck].
 */
export function drawFromDeck(deck: DeckState): [string | null, DeckState] {
  if (deck.cards.length > 0) {
    const [drawn, ...rest] = deck.cards;
    return [drawn, { ...deck, cards: rest }];
  }
  if (deck.discard.length === 0) return [null, deck];
  const reshuffled = shuffle([...deck.discard]);
  const [drawn, ...rest] = reshuffled;
  return [drawn, { cards: rest, discard: [] }];
}

/**
 * Draw two cards from the combined deck (worldDeck holds both personal and world cards
 * shuffled together at combat init — see initCombat in Combat.ts).
 */
export function drawTwoCards(state: CombatState): CombatState {
  let s = state;
  for (let i = 0; i < 2; i++) {
    const [card, deck] = drawFromDeck(s.worldDeck);
    if (card) s = { ...s, hand: [...s.hand, card], worldDeck: deck };
  }
  return s;
}

/** Draw one card from the combined deck (used for Street Smarts bonus). */
export function drawOneCard(state: CombatState): CombatState {
  const [card, deck] = drawFromDeck(state.worldDeck);
  if (!card) return state;
  return { ...state, hand: [...state.hand, card], worldDeck: deck };
}

/**
 * Compute the effective cost of a card given the current field state.
 * Applies Vampire Network reduction to Information cards. Non-Information cards
 * are returned at their base cost unchanged.
 */
export function computeCardCost(cardId: string, field: string[]): number {
  const card = CARDS[cardId];
  if (!card) return 0;
  if (card.supertype !== 'Information') return card.cost;
  const vnActive = field.includes('vampireNetwork');
  const reduction = vnActive ? (CARDS['vampireNetwork']?.effects.reduceInfoCost ?? 0) : 0;
  return Math.max(0, card.cost - reduction);
}

// ── Effect resolvers ───────────────────────────────────────────────────────────

const clamp = (v: number) => Math.max(-10, Math.min(10, v));

/**
 * Break the opponent shield at a specific index. Used when the player has chosen
 * their target via the confirmation UI (#99).
 */
export function breakOppShieldAt(state: CombatState, index: number, prefix: string): CombatState {
  const target = state.oppShields[index];
  if (!target || target.broken) return addLog(state, 'No shield to break at that position.');
  const newShields = [...state.oppShields];
  newShields[index] = { ...target, broken: true };
  let s = { ...state, oppShields: newShields };
  if (target.linkedCardId) {
    const info = CARDS[target.linkedCardId];
    s = addLog(s, `${prefix}Shield broken! Reveals: ${info?.name ?? target.linkedCardId}`);
    s = { ...s, collectedInfo: [...s.collectedInfo, target.linkedCardId] };
  } else {
    s = addLog(s, `${prefix}Shield broken!`);
  }
  return s;
}

/**
 * Break the next opponent shield in `state.shieldBreakOrder` and log the result.
 * `prefix` is prepended to the log message.
 * If a shield has `requiresCardId` set, only a card with that ID may break it.
 * Priority: shields that specifically require `breakingCardId` are targeted first; unrestricted
 * shields are broken only if no specifically-targeted shield is found.
 */
export function breakLowestOppShield(state: CombatState, prefix: string, breakingCardId?: string): CombatState {
  let s = state;

  // Prefer a shield in order that specifically requires this card (e.g. promiseCard → locked shield)
  let targetIdx = -1;
  if (breakingCardId !== undefined) {
    for (const idx of s.shieldBreakOrder) {
      if (!s.oppShields[idx]?.broken && s.oppShields[idx]?.requiresCardId === breakingCardId) {
        targetIdx = idx;
        break;
      }
    }
  }

  // Fall back to the first intact unrestricted shield in order
  if (targetIdx === -1) {
    for (const idx of s.shieldBreakOrder) {
      if (!s.oppShields[idx]?.broken && !s.oppShields[idx]?.requiresCardId) {
        targetIdx = idx;
        break;
      }
    }
  }

  if (targetIdx === -1) {
    return addLog(s, 'No shields left to break.');
  }
  const target = s.oppShields[targetIdx];
  const newShields = [...s.oppShields];
  newShields[targetIdx] = { ...target, broken: true };
  s = { ...s, oppShields: newShields };
  if (target.linkedCardId) {
    const info = CARDS[target.linkedCardId];
    s = addLog(s, `${prefix}Shield broken! Reveals: ${info?.name ?? target.linkedCardId}`);
    s = { ...s, collectedInfo: [...s.collectedInfo, target.linkedCardId] };
  } else {
    s = addLog(s, `${prefix}Shield broken!`);
  }
  return s;
}

/**
 * Apply a card's effects from the player's perspective.
 * breakShield targets opponent shields; restoreShield targets player shields.
 * Personal cards are further modified by the opponent's disposition.
 * Pass `opts.skipBreak: true` when deferring the `breakShield` effect (#99).
 */
export function resolvePlayerEffect(state: CombatState, card: CardDef, opts?: { skipBreak?: boolean }): CombatState {
  let s = state;
  const eff = card.effects;

  // Determine whether this Personal card hits a vulnerability or resistance
  const isVulnerable = card.supertype === 'Personal' && s.disposition.vulnerable.includes(card.id);
  const isResistant  = card.supertype === 'Personal' && s.disposition.resistant.includes(card.id);

  if (isVulnerable) {
    s = addLog(s, 'Vulnerable! Opponent is susceptible to this approach.');
    const lines = s.encounterDialogue.onVulnerable;
    if (lines.length > 0) {
      s = { ...s, activeDialogue: lines[Math.floor(Math.random() * lines.length)] };
    }
  } else if (isResistant) {
    s = addLog(s, 'Resistant. Opponent shrugs off this approach.');
    const lines = s.encounterDialogue.onResistant;
    if (lines.length > 0) {
      s = { ...s, activeDialogue: lines[Math.floor(Math.random() * lines.length)] };
    }
  }

  if (eff.breakShield && !opts?.skipBreak) {
    s = breakLowestOppShield(s, '', card.id);
  }

  // #57 — probabilistic shield break
  if (eff.breakShieldChance !== undefined) {
    const currentChance = s.cardBreakChances[card.id] ?? eff.breakShieldChance;
    if (Math.random() < currentChance) {
      s = breakLowestOppShield(s, 'Persuasion lands! ', card.id);
      s = { ...s, cardBreakChances: { ...s.cardBreakChances, [card.id]: eff.breakShieldChance } };
    } else {
      const newChance = currentChance + (eff.breakShieldChanceIncrement ?? 0);
      s = { ...s, cardBreakChances: { ...s.cardBreakChances, [card.id]: newChance } };
      s = addLog(s, `Didn't land (${Math.round(currentChance * 100)}% chance). Next: ${Math.round(newChance * 100)}%`);
    }
  }

  // #58 — patience-cost shield break
  if (eff.shieldBreakPatience !== undefined) {
    if (s.fearless) {
      s = addLog(s, 'No effect on this opponent.');
    } else {
      const newPat = Math.max(0, s.oppPatience - eff.shieldBreakPatience);
      s = { ...s, oppPatience: newPat };
      s = addLog(s, `Opponent Patience −${eff.shieldBreakPatience} (${newPat} remaining)`);
      s = breakLowestOppShield(s, 'Intimidation forces it open! ', card.id);
    }
  }

  if (eff.opponentPatience !== undefined) {
    // Vulnerable: no patience multiplier (only +1 priority bonus above); resistant: halved.
    let patDelta = eff.opponentPatience;
    if (isResistant) patDelta = Math.ceil(patDelta * 0.5);

    const newPat = Math.max(0, s.oppPatience + patDelta);
    s = { ...s, oppPatience: newPat };
    s = addLog(s, `Opponent Patience ${patDelta > 0 ? '+' : ''}${patDelta} (${newPat} remaining)`);
  }

  if (eff.priority !== undefined) {
    // Disposition adds/subtracts 1 from priority for Personal cards
    let priDelta = eff.priority;
    if (isVulnerable) priDelta += 1;
    else if (isResistant) priDelta = Math.max(0, priDelta - 1);
    s = { ...s, priority: clamp(s.priority + priDelta) };
  } else if (isVulnerable || isResistant) {
    // Personal cards with no explicit priority effect still get the ±1 modifier
    s = { ...s, priority: clamp(s.priority + (isVulnerable ? 1 : -1)) };
  }

  if (eff.restoreShield) {
    const brokenIdx = s.playerShields.findIndex(sh => sh.broken);
    if (brokenIdx !== -1) {
      const newShields = [...s.playerShields];
      newShields[brokenIdx] = { broken: false, usedCardId: 'smallTalk', isDummyShield: true };
      s = { ...s, playerShields: newShields };
      s = addLog(s, 'Restored 1 Shield (Small Talk).');
    } else {
      s = addLog(s, 'No broken shields to restore.');
    }
  }

  // #59 — restore N player shields (player patience) — uses dummy "Small Talk" shields
  if (eff.playerPatience !== undefined && eff.playerPatience > 0) {
    const newShields = [...s.playerShields];
    let restored = 0;
    for (let i = 0; i < newShields.length && restored < eff.playerPatience; i++) {
      if (newShields[i].broken) {
        newShields[i] = { broken: false, usedCardId: 'smallTalk', isDummyShield: true };
        restored++;
      }
    }
    s = { ...s, playerShields: newShields };
    s = addLog(s, restored > 0 ? `Restored ${restored} Shield${restored !== 1 ? 's' : ''} (Small Talk).` : 'No broken shields to restore.');
  }

  // #59 — grant shield immunity until player regains positive priority
  if (eff.shieldImmunityUntilPriority) {
    s = { ...s, playerShieldImmune: true };
    s = addLog(s, 'Shield immunity active until your next turn.');
  }

  // #59 — surrender priority (set to 0 after all other effects)
  if (eff.surrenderPriority) {
    s = { ...s, priority: 0 };
    s = addLog(s, 'You surrender the initiative.');
  }

  // #60 — auto-break shield after N cumulative plays (count already incremented in reducer)
  if (eff.autoBreakAfterPlays !== undefined) {
    const count = s.cardPlayCounts[card.id] ?? 0;
    if (count >= eff.autoBreakAfterPlays) {
      s = breakLowestOppShield(s, 'Repeated appeals finally break through! ', card.id);
      s = { ...s, cardPlayCounts: { ...s.cardPlayCounts, [card.id]: 0 } };
    }
  }

  if (eff.drawCards) {
    for (let i = 0; i < eff.drawCards; i++) s = drawTwoCards(s);
    s = addLog(s, 'Drew a card.');
  }

  if (eff.peekShield) {
    const intact = s.oppShields.filter(sh => !sh.broken && sh.linkedCardId);
    if (intact.length > 0) {
      const peeked = intact[Math.floor(Math.random() * intact.length)];
      const info = peeked.linkedCardId ? CARDS[peeked.linkedCardId] : null;
      s = addLog(s, `Shield peek: ${info?.name ?? '(empty shield)'}`);
    } else {
      s = addLog(s, 'No hidden shields remain to peek at.');
    }
  }

  return s;
}

// ── #100: Card understanding helpers ──────────────────────────────────────────

/**
 * Merge a base CardDef with any encounter-specific overrides.
 * Returns the base card unchanged if no override is registered for it.
 */
export function resolveCardDef(
  cardId: string,
  overrides: Record<string, CardOverride>,
): CardDef | undefined {
  const base = CARDS[cardId];
  if (!base) return undefined;
  const o = overrides[cardId];
  if (!o) return base;
  return {
    ...base,
    ...(o.effectText !== undefined ? { effectText: o.effectText } : {}),
    effects: o.effects ? { ...base.effects, ...o.effects } : base.effects,
  };
}

/**
 * Return a CardDef suitable for display: real effectText when understood, '???' when not.
 * Also applies any encounter-specific overrides and an optional cost override.
 */
export function cardForDisplay(
  cardId: string,
  understood: Set<string>,
  overrides: Record<string, CardOverride>,
  costOverride?: number,
): CardDef | undefined {
  const resolved = resolveCardDef(cardId, overrides);
  if (!resolved) return undefined;
  const effectText = understood.has(cardId) ? resolved.effectText : '???';
  return costOverride !== undefined
    ? { ...resolved, effectText, cost: costOverride }
    : { ...resolved, effectText };
}

/**
 * Apply a card's effects from the opponent's perspective.
 * priority and opponentPatience work in the same direction as player effects
 * (some opponent cards are self-defeating by design).
 */
export function resolveOpponentEffect(state: CombatState, card: CardDef): CombatState {
  let s = state;
  const eff = card.effects;

  if (eff.priority !== undefined) {
    s = { ...s, priority: clamp(s.priority + eff.priority) };
  }
  if (eff.opponentPatience !== undefined) {
    s = { ...s, oppPatience: Math.max(0, s.oppPatience + eff.opponentPatience) };
  }

  return s;
}
