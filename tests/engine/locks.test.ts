/**
 * v1.4 §3.3 — Guard Shields and lock-and-keys, incl. guard restoration
 * re-gating (Brief §4.5), key-waste rules, and win-before-loss (§6.7.4).
 */
import { describe, expect, it } from 'vitest';
import { act, playCard, runNpcTurn, start } from './fixtures';

const KEY_DECK = ['info_a', 'info_b', 'p_break', 'p_break', ...Array(8).fill('p_noop')];

describe('Lock-and-keys opponent shields (v1.4 §3.3)', () => {
  it('keys are inert while Guards stand — card resolves its override and recycles', () => {
    let s = start({ config: { scriptedDrawOrder: KEY_DECK } });
    expect(s.npcGuardsStanding).toBe(2);
    const handBefore = s.player.hand.length;
    s = playCard(s, 'info_a'); // override: cost 1, draw 1
    expect(s.npcCoreShields.every((c) => !c.broken)).toBe(true); // no break
    expect(s.player.discard.some((c) => c.definitionId === 'info_a')).toBe(true); // replayable later
    expect(s.player.hand.length).toBe(handBefore); // played 1, drew 1
    expect(s.pendingBlock).toBeNull();
  });

  it('generic break effects hit Guards only, and fizzle at zero Guards', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_break', 'p_break', 'p_break', ...Array(9).fill('p_noop')] } });
    s = playCard(s, 'p_break');
    s = playCard(s, 'p_break');
    expect(s.npcGuardsStanding).toBe(0);
    const cores = s.npcCoreShields.filter((c) => c.broken).length;
    s = playCard(s, 'p_break'); // no guards left → fizzles
    expect(s.npcCoreShields.filter((c) => c.broken).length).toBe(cores); // cores untouched
    expect(s.log.some((l) => l.type === 'break-fizzle')).toBe(true);
  });

  it('with Guards down, the matching key breaks its lock and suspends on Reveal', () => {
    let s = start({ config: { scriptedDrawOrder: KEY_DECK } });
    s = playCard(s, 'p_break');
    s = playCard(s, 'p_break'); // guards down
    s = playCard(s, 'info_a');
    expect(s.pendingBlock?.type).toBe('reveal');
    expect(s.gainedCardIds).toContain('lore_1'); // non-Hint adds its card
    s = act(s, { type: 'ACKNOWLEDGE' });
    expect(s.npcCoreShields.find((c) => c.cardId === 'lore_1')?.broken).toBe(true);
    // Completion ran after the Reveal: card moved, CARD_RESOLVED dispatched.
    expect(s.player.discard.some((c) => c.definitionId === 'info_a')).toBe(true);
    expect(s.log.some((l) => l.type === 'event' && l.data?.type === 'CARD_RESOLVED' && l.data?.cardDefId === 'info_a')).toBe(true);
  });

  it('break order is player-determined — whichever key plays first breaks first', () => {
    let s = start({ config: { scriptedDrawOrder: ['info_b', 'p_break', 'p_break', ...Array(9).fill('p_noop')] } });
    s = playCard(s, 'p_break');
    s = playCard(s, 'p_break');
    s = playCard(s, 'info_b'); // second-listed lock breaks first
    expect(s.pendingBlock?.type).toBe('reveal');
    expect(s.pendingBlock && 'isHint' in s.pendingBlock && s.pendingBlock.isHint).toBe(true);
    s = act(s, { type: 'ACKNOWLEDGE' });
    expect(s.npcCoreShields.find((c) => c.cardId === 'lore_2')?.broken).toBe(true);
    expect(s.npcCoreShields.find((c) => c.cardId === 'lore_1')?.broken).toBe(false);
    expect(s.gainedCardIds).not.toContain('lore_2'); // Hints add no card
  });

  it('a key for an already-broken lock resolves normally with no break', () => {
    let s = start({
      config: {
        minTurnStartPriority: 6,
        scriptedDrawOrder: ['info_a', 'info_a', 'p_break', 'p_break', ...Array(8).fill('p_noop')],
      },
    });
    s = playCard(s, 'p_break');
    s = playCard(s, 'p_break');
    s = playCard(s, 'info_a');
    s = act(s, { type: 'ACKNOWLEDGE' });
    s = playCard(s, 'info_a'); // lock already broken → override only
    expect(s.pendingBlock).toBeNull();
  });

  it('guard restoration re-gates the locks (v1.4 §3.3 — core NPC defensive tool)', () => {
    let s = start({
      config: {
        scriptedDrawOrder: ['p_break', 'p_break', 'info_a', ...Array(9).fill('p_noop')],
        enemyDeckCardIds: ['n_guards_up', ...Array(5).fill('n_noop')],
        scriptedOpponentPlays: ['n_guards_up'],
      },
    });
    s = playCard(s, 'p_break');
    s = playCard(s, 'p_break');
    expect(s.npcGuardsStanding).toBe(0);
    // Keep info_a through the turn transition via Back of Mind.
    s = act(s, { type: 'END_TURN' });
    const keep = s.player.hand.findIndex((c) => c.definitionId === 'info_a');
    s = act(s, { type: 'BOTM_SELECT', keepHandIndices: [keep] });
    s = runNpcTurn(s); // NPC restores 2 guards
    expect(s.npcGuardsStanding).toBe(2);
    s = playCard(s, 'info_a'); // key no longer works
    expect(s.pendingBlock).toBeNull();
    expect(s.npcCoreShields.every((c) => !c.broken)).toBe(true);
    expect(s.log.some((l) => l.type === 'guards-placed')).toBe(true);
  });

  it('breaking every opponent shield wins', () => {
    let s = start({ config: { minTurnStartPriority: 6, scriptedDrawOrder: ['p_break', 'p_break', 'info_a', 'info_b', ...Array(8).fill('p_noop')] } });
    s = playCard(s, 'p_break');
    s = playCard(s, 'p_break');
    s = playCard(s, 'info_a');
    s = act(s, { type: 'ACKNOWLEDGE' });
    s = playCard(s, 'info_b');
    s = act(s, { type: 'ACKNOWLEDGE' });
    expect(s.result).toBe('WIN');
    expect(s.phase).toBe('Won');
  });

  it('win is checked before loss (§6.7.4): last shield + Patience 0 in one play = WIN', () => {
    let s = start({
      config: {
        opponentPatience: 3,
        npcGuardShieldCount: 0,
        opponentShields: [{ cardId: 'lore_1', isHint: false, loreDescription: 'x', keyNuggetIds: ['nug_a'] }],
        nuggetOverrides: [
          { nuggetId: 'nug_a', cost: 0, effects: [{ type: 'MODIFY_PATIENCE', value: -5 }], effectText: 'x' },
        ],
        scriptedDrawOrder: ['info_a', ...Array(11).fill('p_noop')],
      },
    });
    s = playCard(s, 'info_a'); // −5 Patience (→ −2), then lock check breaks the last core
    s = act(s, { type: 'ACKNOWLEDGE' });
    expect(s.result).toBe('WIN');
  });

  it('nugget discovery fires once and persists in state', () => {
    let s = start({ config: { scriptedDrawOrder: ['info_a', 'info_a', ...Array(10).fill('p_noop')] } });
    s = playCard(s, 'info_a');
    expect(s.discoveredNuggetIds).toEqual(['nug_a']);
    s = playCard(s, 'info_a');
    expect(s.discoveredNuggetIds).toEqual(['nug_a']); // no duplicate
    expect(s.log.filter((l) => l.type === 'discovery').length).toBe(1);
  });

  it('non-overridden nugget cards convert to Ponder and are recorded', () => {
    let s = start({ config: { scriptedDrawOrder: ['info_c', ...Array(11).fill('p_noop')] } });
    const hand = s.player.hand.length;
    s = playCard(s, 'info_c'); // no override for nug_c → Ponder (cost 1, draw 1)
    expect(s.player.hand.length).toBe(hand); // played 1, drew 1
    expect(s.player.priority).toBe(4); // paid Ponder's cost 1
    expect(s.playedNonRelevantCards).toContain('info_c');
  });
});
