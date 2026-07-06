/**
 * v1.4 §10 — NPC behaviour: mirrored resource loop, leftmost-play policy,
 * scheduled plays (set aside, injected, prioritized), automatic turn end.
 */
import { describe, expect, it } from 'vitest';
import { act, endTurn, playCard, runNpcTurn, start } from './fixtures';

describe('NPC behaviour (v1.4 §10)', () => {
  it('draws to npcHandLimit at NPC Turn Start', () => {
    let s = start({ config: { npcHandLimit: 4, enemyDeckCardIds: Array(8).fill('n_free') } });
    s = act(s, { type: 'END_TURN' });
    if (s.phase === 'BotMSelect') s = act(s, { type: 'BOTM_SELECT', keepHandIndices: [] });
    expect(s.npc.hand.length).toBe(4);
  });

  it('plays the leftmost hand card while Priority is positive', () => {
    let s = start({
      config: {
        enemyDeckCardIds: ['n_patience_drain', 'n_noop', 'n_noop', 'n_noop', 'n_noop', 'n_noop'],
        scriptedOpponentPlays: ['n_patience_drain', 'n_noop', 'n_noop', 'n_noop', 'n_noop', 'n_noop'],
      },
    });
    s = act(s, { type: 'END_TURN' });
    if (s.phase === 'BotMSelect') s = act(s, { type: 'BOTM_SELECT', keepHandIndices: [] });
    s = act(s, { type: 'ADVANCE' });
    // Leftmost (scripted first) card played first.
    const firstPlay = s.log.find((l) => l.type === 'play' && l.data?.controller === 'npc');
    expect(firstPlay?.data?.definitionId).toBe('n_patience_drain');
  });

  it('turn ends automatically when Priority hits 0 or the hand empties — hand discards (§4.4)', () => {
    let s = start({ config: { enemyDeckCardIds: Array(6).fill('n_noop') } }); // cost 1 each, priority 3
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.activeTurn).toBe('player'); // handed off automatically
    expect(s.npc.hand.length).toBe(0);
    expect(s.npc.discard.length).toBe(5); // 3 played + 2 discarded
  });

  it('an empty hand ends the turn even with Priority remaining (§4.4)', () => {
    let s = start({ config: { enemyDeckCardIds: ['n_free', 'n_free'] } }); // only 2 cards, cost 0
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.activeTurn).toBe('player');
    expect(s.npc.discard.length).toBe(2);
  });

  it('scheduled plays are set aside, excluded from draws, injected leftmost when due (§10)', () => {
    let s = start({
      config: {
        enemyDeckCardIds: ['n_patience_drain', ...Array(7).fill('n_noop')],
        scheduledPlays: [{ cardId: 'n_patience_drain', afterTurn: 1 }],
        npcHandLimit: 8,
      },
    });
    expect(s.npcScheduledAside.length).toBe(1);
    s = endTurn(s); // Round 1 NPC turn: round(1) > afterTurn(1) is false → not injected
    expect(s.npc.hand.some((c) => c.definitionId === 'n_patience_drain')).toBe(false);
    s = runNpcTurn(s); // finish NPC turn → Round 2 player turn
    s = endTurn(s); // Round 2 NPC turn: 2 > 1 → injected leftmost
    expect(s.npc.hand[0]?.definitionId).toBe('n_patience_drain');
    expect(s.npcScheduledAside.length).toBe(0);
    s = runNpcTurn(s);
    // Injected card played first (leftmost policy).
    const npcPlays = s.log.filter((l) => l.type === 'play' && l.data?.controller === 'npc');
    expect(npcPlays.some((l) => l.data?.definitionId === 'n_patience_drain')).toBe(true);
  });

  it('NPC Impression turn-start effects fire at NPC Turn Start (§4.3.9)', () => {
    let s = start({ config: { startingImpressions: ['n_impression_ts'] } });
    const patience = s.patience;
    s = endTurn(s);
    expect(s.patience).toBe(patience - 1); // −1 at NPC turn start
  });

  it('counters + thresholds drive encounter mechanics with no card-ID logic (§3.10)', () => {
    let s = start({
      config: {
        startingImpressions: ['n_counter_impression'],
        scriptedDrawOrder: ['p_counter_feeder', 'p_counter_feeder', ...Array(10).fill('p_noop')],
      },
    });
    s = playCard(s, 'p_counter_feeder'); // +2 devotion
    const perm = s.field.find((p) => p.definitionId === 'n_counter_impression');
    expect(perm?.counters.devotion).toBe(2);
    const shieldsBefore = s.playerShields.length;
    s = playCard(s, 'p_counter_feeder'); // +2 → 4 ≥ threshold → consume, break 1 player shield
    const perm2 = s.field.find((p) => p.definitionId === 'n_counter_impression');
    expect(perm2?.counters.devotion).toBe(0);
    expect(s.playerShields.length).toBe(shieldsBefore - 1);
  });

  it('COPY_FROM_NPC_DECK copies (never steals) with the Patience rider (§8.5)', () => {
    let s = start({
      config: { scriptedDrawOrder: ['p_copy', ...Array(11).fill('p_noop')], enemyDeckCardIds: Array(6).fill('n_noop') },
    });
    const npcDeckSize = s.npc.deck.length;
    s = playCard(s, 'p_copy');
    expect(s.npc.deck.length).toBe(npcDeckSize); // copying, not stealing
    const copy = s.player.hand.find((c) => c.definitionId.startsWith('n_'));
    expect(copy).toBeTruthy();
    expect(copy?.patienceCostOverride).toBe(2);
    const patience = s.patience;
    const idx = s.player.hand.findIndex((c) => c.instanceId === copy?.instanceId);
    s = act(s, { type: 'PLAY_CARD', handIndex: idx });
    expect(s.patience).toBe(patience - 2); // rider paid on play
  });

  it('Lie keyword: exceeding the threshold loses the encounter', () => {
    let s = start({
      config: { lieThreshold: 2, scriptedDrawOrder: ['p_lie', 'p_lie', 'p_lie', ...Array(9).fill('p_noop')] },
    });
    s = playCard(s, 'p_lie');
    s = playCard(s, 'p_lie');
    expect(s.result).toBeNull(); // at threshold, not over
    s = playCard(s, 'p_lie');
    expect(s.result).toBe('LOSE');
    expect(s.loseReason).toBe('LIES');
  });

  it('token replacements apply at creation and expire at their boundary (§9.3)', () => {
    let s = start({
      config: {
        // Second maker sits at deck index 5 so the turn-2 refill draws it.
        scriptedDrawOrder: ['p_replacer', 'p_token_maker', 'p_noop', 'p_noop', 'p_noop', 'p_token_maker', ...Array(6).fill('p_noop')],
      },
    });
    s = playCard(s, 'p_replacer');
    s = playCard(s, 'p_token_maker'); // creates tok_boom instead
    expect(s.field.some((p) => p.definitionId === 'tok_boom')).toBe(true);
    s = endTurn(s); // replacement expires at PLAYER_TURN_END
    s = runNpcTurn(s);
    s = playCard(s, 'p_token_maker');
    expect(s.field.filter((p) => p.definitionId === 'tok_chain').length).toBe(1);
  });
});
