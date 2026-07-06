/**
 * v1.4.1 — two-tier opponent shields: card-backed Guard Shields with Shield
 * Triggers, dummy fill, patience-free opponent guard breaks, restoration.
 */
import { describe, expect, it } from 'vitest';
import type { CardDefinition } from '../../src/engine';
import { buildInitialState, reduce } from '../../src/engine';
import { CARDS, NUGGETS, TOKENS, makeEncounter, playCard, start } from './fixtures';

const GUARD_ST: CardDefinition = {
  id: 'g_st',
  name: 'g_st',
  cost: 0,
  color: 'Colorless',
  supertype: 'Skill',
  subtype: null,
  keywords: ['Shield Trigger'],
  effects: [],
  shieldTriggerEffects: [{ type: 'MODIFY_PATIENCE', value: -2 }],
  effectText: 'Shield Trigger: drain 2 Patience.',
};

function startWithCardGuards(guardCount: number, guardCards: string[], seed = 5) {
  return buildInitialState({
    config: makeEncounter({
      npcGuardShieldCount: guardCount,
      npcGuardShieldCardIds: guardCards,
      scriptedDrawOrder: ['p_break', 'p_break', 'p_break', ...Array(9).fill('p_noop')],
    }),
    cards: { ...CARDS, g_st: GUARD_ST },
    tokens: TOKENS,
    nuggets: NUGGETS,
    playerDeckCardIds: ['p_break', 'p_break', 'p_break', ...Array(9).fill('p_noop')],
    collectionCardIds: [],
    seed,
  });
}

describe('Card-backed Guard Shields (v1.4.1)', () => {
  it('card guards count toward the guard total; dummies fill the difference', () => {
    const s = startWithCardGuards(3, ['g_st']);
    expect(s.npcGuardsStanding).toBe(3);
    expect(s.npcGuards.filter((g) => g.cardId === 'g_st').length).toBe(1);
    expect(s.npcGuards.filter((g) => !g.cardId).length).toBe(2);
  });

  it('breaking an opponent dummy guard never costs Patience', () => {
    let s = start({ config: { npcGuardShieldCount: 2, scriptedDrawOrder: ['p_break', ...Array(11).fill('p_noop')] } }); // all dummies
    const patience = s.patience;
    s = playCard(s, 'p_break');
    expect(s.npcGuardsStanding).toBe(1);
    expect(s.patience).toBe(patience); // no patience change on opponent guard break
  });

  it('a card-backed guard fires its Shield Trigger when broken and its card goes to NPC discard', () => {
    // Break all three guards: exactly one is g_st (drains 2 via trigger).
    let s = startWithCardGuards(3, ['g_st']);
    const patience = s.patience;
    s = playCard(s, 'p_break');
    s = playCard(s, 'p_break');
    s = playCard(s, 'p_break');
    expect(s.npcGuardsStanding).toBe(0);
    expect(s.patience).toBe(patience - 2); // only the trigger, no break outcome cost
    expect(s.npc.discard.filter((c) => c.definitionId === 'g_st').length).toBe(1);
  });

  it('guard row composition is deterministic per seed (face-down shuffle)', () => {
    const order = (seed: number) => startWithCardGuards(4, ['g_st'], seed).npcGuards.map((g) => g.cardId ?? '-').join(',');
    expect(order(11)).toBe(order(11));
  });

  it('guard restoration places dummy guards (no cards) and re-gates locks', () => {
    let s = start({
      config: {
        npcGuardShieldCount: 1,
        scriptedDrawOrder: ['p_break', 'info_a', ...Array(10).fill('p_noop')],
        enemyDeckCardIds: ['n_guards_up', ...Array(5).fill('n_noop')],
        scriptedOpponentPlays: ['n_guards_up'],
      },
    });
    s = playCard(s, 'p_break');
    expect(s.npcGuardsStanding).toBe(0);
    s = reduce(s, { type: 'END_TURN' });
    if (s.phase === 'BotMSelect') {
      const keep = s.player.hand.findIndex((c) => c.definitionId === 'info_a');
      s = reduce(s, { type: 'BOTM_SELECT', keepHandIndices: keep >= 0 ? [keep] : [] });
    }
    while (s.phase === 'EnemyPending') s = reduce(s, { type: 'ADVANCE' });
    expect(s.npcGuardsStanding).toBe(2);
    expect(s.npcGuards.every((g) => !g.cardId)).toBe(true); // restored guards are dummies
  });

  it('validation rejects more card guards than the guard total', () => {
    expect(() => startWithCardGuards(1, ['g_st', 'g_st'])).toThrow();
  });
});
