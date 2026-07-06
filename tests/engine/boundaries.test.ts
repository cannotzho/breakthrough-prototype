/**
 * v1.4 §4 — boundary step ordering (normative), expiry ticks before new
 * applications (Brief §7 trap 6), per-turn counter naming/reset, BotM timing,
 * scheduled effects.
 */
import { describe, expect, it } from 'vitest';
import { act, endTurn, playCard, runNpcTurn, start } from './fixtures';

describe('Turn boundaries (v1.4 §4)', () => {
  it('round increments at Player Turn Start only', () => {
    let s = start();
    expect(s.round).toBe(1);
    s = endTurn(s);
    expect(s.round).toBe(1); // NPC turn, same round
    s = runNpcTurn(s);
    expect(s.round).toBe(2);
  });

  it('a restriction applied at a boundary does NOT expire in that same instant (trap 6)', () => {
    // n_trap_pts (NPC trap) fires at PLAYER_TURN_START (step 9) and applies
    // PREVENT_DRAW(player) expiring at PLAYER_TURN_START. Expiry ticks run at
    // step 3 — before step 9 — so the restriction must survive the boundary
    // where it was applied, block that turn's mid-turn draws, and expire at
    // the NEXT Player Turn Start. (NPC deck is deep enough that the fired
    // trap is not recycled and replayed within the test window.)
    let s = start({
      config: {
        // p_draw sits at deck index 5 so the turn-2 refill draws it.
        scriptedDrawOrder: [...Array(5).fill('p_noop'), 'p_draw', ...Array(14).fill('p_noop')],
        enemyDeckCardIds: ['n_trap_pts', ...Array(9).fill('n_noop')],
        scriptedOpponentPlays: ['n_trap_pts'],
      },
      deck: Array(20).fill('p_noop'),
    });
    s = endTurn(s);
    s = runNpcTurn(s); // NPC lays the trap; it fires at this Player Turn Start
    expect(s.log.some((l) => l.type === 'trap-fired')).toBe(true);
    expect(s.restrictions.some((r) => r.type === 'PREVENT_DRAW')).toBe(true);
    const handBefore = s.player.hand.length;
    s = playCard(s, 'p_draw'); // mid-turn draw blocked
    expect(s.player.hand.length).toBe(handBefore - 1); // played 1, drew 0
    s = endTurn(s);
    s = runNpcTurn(s); // next Player Turn Start: expiry tick removes it (step 3)
    expect(s.restrictions.some((r) => r.type === 'PREVENT_DRAW')).toBe(false);
    expect(s.player.hand.length).toBe(5); // turn-start draw unblocked
  });

  it('NPC-applied "during your next turn" restriction blocks the turn-start draw, then expires at Player Turn End', () => {
    let s = start({
      config: { enemyDeckCardIds: ['n_draw_blocker', ...Array(5).fill('n_noop')], scriptedOpponentPlays: ['n_draw_blocker'] },
      deck: Array(20).fill('p_noop'),
    });
    const handAtStart = s.player.hand.length;
    expect(handAtStart).toBe(5);
    s = endTurn(s); // player discards hand (BotM keep 0)
    s = runNpcTurn(s); // NPC plays n_draw_blocker; player turn starts with draw prevented
    expect(s.player.hand.length).toBe(0); // turn-start draw fully blocked
    s = endTurn(s); // restriction expires at PLAYER_TURN_END
    s = runNpcTurn(s);
    expect(s.player.hand.length).toBe(5); // draws normal again
  });

  it('untriggered traps expire to owner discard at owner’s next Turn Start', () => {
    // Rapport trap with a wrong prediction: never fires, must expire.
    let s = start({ config: { scriptedDrawOrder: ['p_trap_rapport', ...Array(11).fill('p_noop')], enemyDeckCardIds: Array(6).fill('n_noop') } });
    s = playCard(s, 'p_trap_rapport');
    expect(s.pendingBlock?.type).toBe('chooseNumber');
    s = act(s, { type: 'CHOOSE_NUMBER', value: 9 }); // n_noop costs 1 — never matches
    expect(s.field.some((p) => p.kind === 'trap' && p.owner === 'player')).toBe(true);
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.field.some((p) => p.kind === 'trap' && p.owner === 'player')).toBe(false);
    expect(s.player.discard.some((c) => c.definitionId === 'p_trap_rapport')).toBe(true);
    expect(s.log.some((l) => l.type === 'trap-expired')).toBe(true);
  });

  it('per-turn counters reset; oppShieldsBroken rolls into its prev-turn mirror (§4.1.5)', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_break', 'p_break', ...Array(10).fill('p_noop')], npcGuardShieldCount: 5 } });
    s = playCard(s, 'p_break');
    s = playCard(s, 'p_break');
    expect(s.oppShieldsBrokenByPlayerThisTurn).toBe(2);
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.oppShieldsBrokenByPlayerPrevTurn).toBe(2);
    expect(s.oppShieldsBrokenByPlayerThisTurn).toBe(0);
  });

  it('BotM cards return to hand before the turn-start draw (§4.1.6–7)', () => {
    let s = start({ deck: Array(20).fill('p_noop') });
    s = act(s, { type: 'END_TURN' });
    expect(s.phase).toBe('BotMSelect');
    s = act(s, { type: 'BOTM_SELECT', keepHandIndices: [0] });
    expect(s.backOfMind.length).toBe(1);
    s = runNpcTurn(s);
    expect(s.backOfMind.length).toBe(0);
    expect(s.player.hand.length).toBe(5); // 1 returned + drew 4 up to limit
  });

  it('BotM keep is capped by the limit', () => {
    let s = start();
    s = act(s, { type: 'END_TURN' });
    const over = act(s, { type: 'BOTM_SELECT', keepHandIndices: [0, 1] });
    expect(over.log.at(-1)?.type).toBe('illegal-action');
  });

  it('scheduled effects fire at their named boundary (§9.4)', () => {
    let s = start({ config: { scriptedDrawOrder: ['p_scheduler', ...Array(11).fill('p_noop')] } });
    s = playCard(s, 'p_scheduler'); // +4 priority at next PLAYER_TURN_START
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.player.priority).toBe(3 + 4); // fired at step 8, after formula
    expect(s.scheduledEffects.length).toBe(0);
  });

  it('NPC hand discards at NPC Turn End; deck recycles next turn (§3.12/§4.4)', () => {
    let s = start({ config: { enemyDeckCardIds: Array(6).fill('n_noop'), npcHandLimit: 5 } });
    s = endTurn(s);
    s = runNpcTurn(s); // NPC drew 5, played 3 (priority 3), discarded 2
    expect(s.npc.hand.length).toBe(0);
    expect(s.npc.discard.length).toBe(5);
    expect(s.npc.deck.length).toBe(1);
    s = endTurn(s);
    s = runNpcTurn(s); // needs 5: 1 from deck + recycle
    expect(s.log.some((l) => l.type === 'recycle')).toBe(true);
  });
});
