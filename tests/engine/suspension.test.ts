/**
 * v1.4 §6.3–6.5 — one generic suspension mechanism: sequences suspend and
 * resume, never restart (§6.7.6); completion always runs (Brief §7 trap 2);
 * BotM fires only at Player Turn End (Brief §7 trap 8).
 */
import { describe, expect, it } from 'vitest';
import { act, playCard, runNpcTurn, start } from './fixtures';

describe('Suspension & resume (v1.4 §6.4/§6.7.6)', () => {
  it('CHOOSE_NUMBER suspends mid-list and resumes at the next step — never restarts', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_choose', ...Array(11).fill('p_noop')] } });
    s = playCard(s, 'p_choose');
    expect(s.pendingBlock?.type).toBe('chooseNumber');
    expect(s.phase).toBe('PlayerPending'); // phase untouched; block gates actions
    // Combat is suspended: other plays are rejected.
    const rejected = playCard(s, 'p_noop');
    expect(rejected.log.at(-1)?.type).toBe('illegal-action');
    s = act(s, { type: 'CHOOSE_NUMBER', value: 7 });
    expect(s.patience).toBe(10 + 7); // scaled effect ran exactly once
    expect(s.player.discard.filter((c) => c.definitionId === 'p_choose').length).toBe(1); // completion ran once
    expect(s.pendingBlock).toBeNull();
  });

  it('completion steps run after a Reveal resume — the card is never left in limbo (trap 2)', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_break', 'p_break', 'info_a', ...Array(9).fill('p_noop')] } });
    s = playCard(s, 'p_break');
    s = playCard(s, 'p_break');
    s = playCard(s, 'info_a'); // key breaks core → Reveal Pending
    expect(s.pendingBlock?.type).toBe('reveal');
    // Card not yet moved — sequence is suspended, not restarted.
    expect(s.player.discard.some((c) => c.definitionId === 'info_a')).toBe(false);
    s = act(s, { type: 'ACKNOWLEDGE' });
    expect(s.player.discard.filter((c) => c.definitionId === 'info_a').length).toBe(1);
    expect(s.log.some((l) => l.type === 'event' && l.data?.type === 'CARD_RESOLVED')).toBe(true);
  });

  it('Reveal freezes combat state — no actions accepted while pending (§6.7.1)', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_break', 'p_break', 'info_a', ...Array(9).fill('p_noop')] } });
    s = playCard(s, 'p_break');
    s = playCard(s, 'p_break');
    s = playCard(s, 'info_a');
    const rejected = act(s, { type: 'END_TURN' });
    expect(rejected.log.at(-1)?.type).toBe('illegal-action');
  });
});

describe('Back of Mind (v1.4 §3.11/§6.5)', () => {
  it('BotM Select fires only from Player Turn End — never mid-NPC-turn (trap 8)', () => {
    // p_trap_draw draws the player a card during the NPC's turn.
    let s = start({
      config: {
        scriptedDrawOrder: ['p_trap_draw', ...Array(19).fill('p_noop')],
        enemyDeckCardIds: ['n_noop', ...Array(5).fill('n_noop')],
      },
      deck: Array(20).fill('p_noop'),
    });
    s = playCard(s, 'p_trap_draw');
    s = act(s, { type: 'END_TURN' });
    expect(s.phase).toBe('BotMSelect');
    s = act(s, { type: 'BOTM_SELECT', keepHandIndices: [] });
    expect(s.player.hand.length).toBe(0);
    s = runNpcTurn(s); // trap draws mid-NPC-turn; must NOT prompt BotM
    // runNpcTurn ends on the player's next turn; hand = gained card kept + refill
    expect(s.log.every((l) => l.type !== 'error')).toBe(true);
    expect(s.round).toBe(2); // NPC turn completed without a BotM detour
  });

  it('cards gained during the NPC turn simply sit in hand until the next player turn', () => {
    let s = start({
      config: {
        scriptedDrawOrder: ['p_trap_draw', ...Array(19).fill('p_noop')],
        enemyDeckCardIds: Array(6).fill('n_noop'),
      },
      deck: Array(20).fill('p_noop'),
    });
    s = playCard(s, 'p_trap_draw');
    s = act(s, { type: 'END_TURN' });
    s = act(s, { type: 'BOTM_SELECT', keepHandIndices: [] }); // hand emptied
    s = runNpcTurn(s);
    // Hand refilled to limit at turn start; the mid-NPC-turn draw is part of it.
    expect(s.player.hand.length).toBe(5);
  });
});
