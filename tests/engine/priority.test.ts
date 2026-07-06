/**
 * v1.4 §3.1 — two-meter Priority, overspend, debt transfer, lockout.
 * (Brief §7 trap 3 — turn-start formula only, no "restore priority".)
 */
import { describe, expect, it } from 'vitest';
import { act, endTurn, playCard, runNpcTurn, start } from './fixtures';

describe('Priority (v1.4 §3.1)', () => {
  it('first turn: min(max, minTurnStart) + firstTurnBonus', () => {
    const s = start();
    expect(s.round).toBe(1);
    expect(s.activeTurn).toBe('player');
    expect(s.player.priority).toBe(3 + 2);
  });

  it('first-turn bonus goes to the NPC when it starts (Round 0)', () => {
    const s = start({ config: { startingSide: 'npc' } });
    expect(s.round).toBe(0);
    expect(s.activeTurn).toBe('npc');
    expect(s.npc.priority).toBe(3 + 2);
  });

  it('overspend drives the meter negative — full cost always deducted', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_expensive', ...Array(11).fill('p_noop')] } });
    s = playCard(s, 'p_expensive'); // cost 9 at priority 5
    expect(s.player.priority).toBe(-4);
    expect(s.phase).toBe('PlayerPending'); // no automatic handoff
  });

  it('lockout at ≤ 0: plays rejected, End Turn still required and legal', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_expensive', ...Array(11).fill('p_noop')] } });
    s = playCard(s, 'p_expensive');
    const before = JSON.stringify({ ...s, log: null, logSeq: 0 });
    const rejected = playCard(s, 'p_noop');
    expect(JSON.stringify({ ...rejected, log: null, logSeq: 0 })).toBe(before); // unchanged
    expect(rejected.log.at(-1)?.type).toBe('illegal-action');
    const ended = act(s, { type: 'END_TURN' });
    expect(['BotMSelect', 'EnemyPending', 'PlayerPending', 'Won', 'Lost']).toContain(ended.phase);
  });

  it('debt transfers to the opponent at turn end, clamped by maxPriority', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_expensive', ...Array(11).fill('p_noop')] } });
    s = playCard(s, 'p_expensive'); // → −4
    s = endTurn(s);
    // NPC turn-start: min(10, 3 + 4) = 7
    expect(s.npc.priority).toBeLessThanOrEqual(7);
    expect(s.log.some((l) => l.type === 'debt-transfer' && l.data?.debt === 4)).toBe(true);
    expect(s.player.priority).toBe(0); // meter zeroed at settlement
  });

  it('debt clamp happens at turn start, not at overspend', () => {
    let s = start({
      config: { maxPriority: 5, scriptedDrawOrder: ['p_expensive', ...Array(11).fill('p_noop')] },
    });
    s = playCard(s, 'p_expensive'); // 5 → −4 (unclamped)
    expect(s.player.priority).toBe(-4);
    s = act(s, { type: 'END_TURN' });
    if (s.phase === 'BotMSelect') s = act(s, { type: 'BOTM_SELECT', keepHandIndices: [] });
    // min(maxPriority 5, 3 + 4) = 5
    expect(s.log.some((l) => l.type === 'turn-start-priority' && l.data?.side === 'npc' && l.data?.value === 5)).toBe(true);
  });

  it('positive surplus records to lastUnspentPriority (no mechanical effect)', () => {
    let s = start();
    s = endTurn(s); // player ends at 5
    expect(s.player.lastUnspentPriority).toBe(5);
    expect(s.player.priority).toBe(0);
  });

  it('debt is consumed on use — never banked', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_expensive', ...Array(11).fill('p_noop')] } });
    s = playCard(s, 'p_expensive');
    s = endTurn(s);
    s = runNpcTurn(s); // NPC turn with the debt bonus
    expect(s.npc.incomingDebt).toBe(0);
    // Next NPC turn starts from the base again (no leftover debt)
    s = endTurn(s);
    const entry = [...s.log].reverse().find((l) => l.type === 'turn-start-priority' && l.data?.side === 'npc');
    expect(entry?.data?.debt ?? 0).toBe(0);
  });

  it('a cost may exceed current Priority as long as the meter is positive (≥1)', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_free', 'p_expensive', ...Array(10).fill('p_noop')] } });
    s = playCard(s, 'p_free'); // 5
    expect(s.player.priority).toBe(5);
    s = playCard(s, 'p_expensive'); // 5 → −4, legal (meter was ≥1)
    expect(s.player.priority).toBe(-4);
  });

  it('Priority-gaining ability re-opens the window mid-turn (no turn transition)', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_impression_battery', 'p_expensive', ...Array(10).fill('p_noop')] } });
    s = playCard(s, 'p_impression_battery'); // cost 1 → 4, impression on field
    s = playCard(s, 'p_expensive'); // 4 → −5, locked out
    expect(s.player.priority).toBe(-5);
    const perm = s.field.find((p) => p.definitionId === 'p_impression_battery');
    expect(perm).toBeTruthy();
    // Activated ability costs Patience only — usable while locked out.
    s = act(s, { type: 'ACTIVATE_ABILITY', permanentId: perm!.permanentId, abilityId: 'surge' });
    expect(s.player.priority).toBe(1);
    expect(s.activeTurn).toBe('player'); // still the same turn
    const s2 = playCard(s, 'p_noop'); // playable again
    expect(s2.log.at(-1)?.type).not.toBe('illegal-action');
  });

  it('NPC symmetry: NPC overspends and transfers debt to the player', () => {
    // NPC deck of cost-1 cards, minTurnStart 3 → 3 plays then locked.
    let s = start({ config: { enemyDeckCardIds: Array(6).fill('n_noop') } });
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.activeTurn).toBe('player');
    // NPC ended at 0 exactly → no debt.
    const entry = [...s.log].reverse().find((l) => l.type === 'turn-start-priority' && l.data?.side === 'player');
    expect(entry?.data?.debt ?? 0).toBe(0);
  });
});
