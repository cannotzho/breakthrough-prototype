/**
 * v1.4 §3.4/§3.5 — player shield economy: placeholders removed vs real cards
 * discarded (Brief §7 trap 7), Safety, Shield Triggers, dummy-before-core,
 * Core single-break (§6.7.7), shield-loss arming semantics.
 */
import { describe, expect, it } from 'vitest';
import { act, endTurn, runNpcTurn, start } from './fixtures';

const BREAKER = (n: string, extra: object = {}) => ({
  enemyDeckCardIds: [n, ...Array(5).fill('n_noop')],
  scriptedOpponentPlays: [n],
  ...extra,
});

describe('Player shields (v1.4 §3.4)', () => {
  it('broken Placeholder: −1 Patience, removed from the game — NOT discarded (trap 7)', () => {
    let s = start({ config: BREAKER('n_break') });
    s = endTurn(s);
    const discardBefore = s.player.discard.length;
    s = runNpcTurn(s);
    expect(s.playerShields.length).toBe(2); // 3 placeholders − 1
    expect(s.patience).toBe(9);
    expect(s.player.discard.length).toBe(discardBefore); // nothing entered discard
  });

  it('broken Real-card shield: −1 Patience, card goes to the player discard (trap 7)', () => {
    let s = start({ config: BREAKER('n_break', { playerDummyShieldSlots: 0, unbreakablePlayerShields: false }) });
    // Place p_noop from hand as a real shield (2 Priority).
    const idx = s.player.hand.findIndex((c) => c.definitionId === 'p_noop');
    s = act(s, { type: 'PLACE_SHIELD', handIndex: idx });
    expect(s.player.priority).toBe(3); // 5 − 2
    expect(s.playerShields[0].shieldType).toBe('real');
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.player.discard.some((c) => c.definitionId === 'p_noop')).toBe(true);
  });

  it('Safety: Effective Break — 0 Patience instead of 1 (v1.4 §8.3)', () => {
    let s = start({
      config: BREAKER('n_break', { playerDummyShieldSlots: 0, scriptedDrawOrder: ['p_safety', ...Array(11).fill('p_noop')] }),
    });
    const idx = s.player.hand.findIndex((c) => c.definitionId === 'p_safety');
    expect(idx).toBeGreaterThanOrEqual(0);
    s = act(s, { type: 'PLACE_SHIELD', handIndex: idx });
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.patience).toBe(10); // no patience lost on the Safety break
  });

  it('Shield Trigger resolves before the break outcome (v1.4 §3.5)', () => {
    let s = start({
      config: BREAKER('n_break', { playerDummyShieldSlots: 0, scriptedDrawOrder: ['p_shield_trigger', ...Array(11).fill('p_noop')] }),
    });
    const idx = s.player.hand.findIndex((c) => c.definitionId === 'p_shield_trigger');
    s = act(s, { type: 'PLACE_SHIELD', handIndex: idx });
    s = endTurn(s);
    s = runNpcTurn(s);
    // +2 (trigger) then −1 (break outcome) = net +1
    expect(s.patience).toBe(11);
    expect(s.player.discard.some((c) => c.definitionId === 'p_shield_trigger')).toBe(true);
  });

  it('all Dummy Shields break before any Core Shield; one effect never breaks two Cores (§6.7.7)', () => {
    let s = start({
      config: BREAKER('n_break5', {
        playerDummyShieldSlots: 1,
        allowedCoreShields: [
          { cardId: 'p_noop', patienceCostOnBreak: 0 },
          { cardId: 'p_free', patienceCostOnBreak: 0 },
        ],
      }),
      collection: ['p_noop', 'p_free'],
    });
    expect(s.playerShields.map((x) => x.shieldType)).toEqual(['placeholder', 'core', 'core']);
    s = endTurn(s);
    s = runNpcTurn(s); // n_break5: placeholder + first core, then capped
    expect(s.playerShields.length).toBe(1);
    expect(s.playerShields[0].shieldType).toBe('core');
    expect(s.log.some((l) => l.type === 'break-capped')).toBe(true);
  });

  it('shield-loss never arms when the encounter defines no player shields', () => {
    let s = start({ config: BREAKER('n_break2', { playerDummyShieldSlots: 0, allowedCoreShields: [] }) });
    expect(s.shieldLossArmed).toBe(false);
    s = endTurn(s);
    s = runNpcTurn(s); // breaks fizzle on an empty row
    expect(s.result).toBeNull(); // no loss — condition never armed (§3.4)
  });

  it('armed + emptied row = loss at the next Check (§3.4)', () => {
    let s = start({ config: BREAKER('n_break', { playerDummyShieldSlots: 1 }) });
    expect(s.shieldLossArmed).toBe(true);
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.result).toBe('LOSE');
    expect(s.loseReason).toBe('SHIELDS');
  });

  it('unbreakablePlayerShields disables NPC breaks and the loss condition', () => {
    let s = start({ config: BREAKER('n_break', { playerDummyShieldSlots: 1, unbreakablePlayerShields: true }) });
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.playerShields.length).toBe(1);
    expect(s.result).toBeNull();
  });

  it('resequencing is free and reorders the row', () => {
    let s = start({
      config: {
        playerDummyShieldSlots: 1,
        allowedCoreShields: [{ cardId: 'p_noop', patienceCostOnBreak: 0 }],
      },
      collection: ['p_noop'],
    });
    const before = s.playerShields.map((x) => x.slotId);
    const priority = s.player.priority;
    s = act(s, { type: 'RESEQUENCE_SHIELDS', order: [1, 0] });
    expect(s.playerShields.map((x) => x.slotId)).toEqual([before[1], before[0]]);
    expect(s.player.priority).toBe(priority); // free
  });

  it('NPC self-break effects hit its own Guards only (§6.6.3)', () => {
    let s = start({
      config: {
        npcGuardShieldCount: 3,
        enemyDeckCardIds: ['n_self_break', ...Array(5).fill('n_noop')],
        scriptedOpponentPlays: ['n_self_break'],
      },
    });
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.npcGuardsStanding).toBe(2);
    expect(s.npcCoreShields.every((c) => !c.broken)).toBe(true);
    expect(s.pendingBlock).toBeNull(); // self-breaking a Guard reveals nothing
  });
});
