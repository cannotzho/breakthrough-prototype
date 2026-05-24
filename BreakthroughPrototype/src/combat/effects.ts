import type { CombatState, DeckState, CardDef } from './types';
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

/** Draw one card from the personal deck and one from the world deck into hand. */
export function drawOneCardPair(state: CombatState): CombatState {
  let s = state;

  const [pCard, pDeck] = drawFromDeck(s.personalDeck);
  if (pCard) s = { ...s, hand: [...s.hand, pCard], personalDeck: pDeck };

  const [wCard, wDeck] = drawFromDeck(s.worldDeck);
  if (wCard) s = { ...s, hand: [...s.hand, wCard], worldDeck: wDeck };

  return s;
}

/** Draw one card from the personal deck only (used for Street Smarts bonus). */
export function drawOnePersonalCard(state: CombatState): CombatState {
  const [card, deck] = drawFromDeck(state.personalDeck);
  if (!card) return state;
  return { ...state, hand: [...state.hand, card], personalDeck: deck };
}

// ── Effect resolvers ───────────────────────────────────────────────────────────

const clamp = (v: number) => Math.max(-10, Math.min(10, v));

/**
 * Apply a card's effects from the player's perspective.
 * breakShield targets opponent shields; restoreShield targets player shields.
 * Personal cards are further modified by the opponent's disposition.
 */
export function resolvePlayerEffect(state: CombatState, card: CardDef): CombatState {
  let s = state;
  const eff = card.effects;

  // Determine whether this Personal card hits a vulnerability or resistance
  const isVulnerable = card.supertype === 'Personal' && s.disposition.vulnerable.includes(card.id);
  const isResistant  = card.supertype === 'Personal' && s.disposition.resistant.includes(card.id);

  if (isVulnerable) {
    s = addLog(s, 'Vulnerable! Opponent is susceptible to this approach.');
  } else if (isResistant) {
    s = addLog(s, 'Resistant. Opponent shrugs off this approach.');
  }

  if (eff.breakShield) {
    const targetIdx = s.oppShields.findIndex(sh => !sh.broken);
    if (targetIdx !== -1) {
      const target = s.oppShields[targetIdx];
      const newShields = [...s.oppShields];
      newShields[targetIdx] = { ...target, broken: true };
      s = { ...s, oppShields: newShields };
      if (target.linkedCardId) {
        const info = CARDS[target.linkedCardId];
        s = addLog(s, `Shield broken! Reveals: ${info?.name ?? target.linkedCardId}`);
        s = { ...s, collectedInfo: [...s.collectedInfo, target.linkedCardId] };
      } else {
        s = addLog(s, 'Shield broken!');
      }
    } else {
      s = addLog(s, 'No shields left to break.');
    }
  }

  if (eff.opponentPatience !== undefined) {
    // Apply disposition multiplier to patience drain for Personal cards
    let patDelta = eff.opponentPatience;
    if (isVulnerable) patDelta = patDelta * 2;
    else if (isResistant) patDelta = Math.ceil(patDelta * 0.5);

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
      newShields[brokenIdx] = { ...newShields[brokenIdx], broken: false };
      s = { ...s, playerShields: newShields };
      s = addLog(s, 'Restored 1 Shield.');
    } else {
      s = addLog(s, 'No broken shields to restore.');
    }
  }

  if (eff.drawCards) {
    for (let i = 0; i < eff.drawCards; i++) s = drawOneCardPair(s);
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
