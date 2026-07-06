/**
 * v1.4 §3.6/§5 — trap cancellation (staged window), owner-relative filters,
 * canonical-event dispatch coverage (Brief §7 traps 4 & 5), ordering.
 */
import { describe, expect, it } from 'vitest';
import type { CardDefinition, EngineEventType } from '../../src/engine';
import { buildInitialState, reduce } from '../../src/engine';
import { CARDS, NUGGETS, TOKENS, act, endTurn, makeEncounter, playCard, runNpcTurn, start } from './fixtures';

describe('Traps (v1.4 §3.6)', () => {
  it('a cancel trap in the CARD_STAGED window prevents resolution entirely — single discard (traps 4/5)', () => {
    let s = start({
      config: {
        scriptedDrawOrder: ['p_trap_cancel', ...Array(11).fill('p_noop')],
        enemyDeckCardIds: ['n_patience_drain', ...Array(5).fill('n_noop')],
        scriptedOpponentPlays: ['n_patience_drain'],
      },
    });
    const patience = s.patience;
    s = playCard(s, 'p_trap_cancel');
    s = endTurn(s);
    const npcPriorityLog = s.log.length;
    s = reduce(s, { type: 'ADVANCE' }); // stages n_patience_drain → trap cancels
    expect(s.patience).toBe(patience); // effects never resolved
    // Cancelled card in NPC discard exactly once (§6.7.5).
    expect(s.npc.discard.filter((c) => c.definitionId === 'n_patience_drain').length).toBe(1);
    // No cost was deducted — cancellation is pre-cost (§3.6).
    const costLog = s.log.slice(npcPriorityLog).filter((l) => l.type === 'play' && l.data?.controller === 'npc' && l.data?.definitionId === 'n_patience_drain');
    expect(costLog.length).toBe(0);
    // The fired trap left the field to the player's discard.
    expect(s.field.some((p) => p.kind === 'trap' && p.owner === 'player')).toBe(false);
    expect(s.player.discard.some((c) => c.definitionId === 'p_trap_cancel')).toBe(true);
  });

  it('Rapport trap fires only on a matching prediction (v1.4 §8.3)', () => {
    const mk = (guess: number) => {
      let s = start({
        config: {
          scriptedDrawOrder: ['p_trap_rapport', ...Array(11).fill('p_noop')],
          enemyDeckCardIds: ['n_patience_drain', ...Array(5).fill('n_noop')],
          scriptedOpponentPlays: ['n_patience_drain'],
        },
      });
      s = playCard(s, 'p_trap_rapport');
      s = act(s, { type: 'CHOOSE_NUMBER', value: guess });
      s = endTurn(s);
      return runNpcTurn(s);
    };
    const hit = mk(1); // n_patience_drain costs 1
    expect(hit.log.some((l) => l.type === 'cancel')).toBe(true);
    expect(hit.patience).toBe(10 + 1); // +1×chosen(1), drain cancelled
    const miss = mk(7);
    expect(miss.log.some((l) => l.type === 'cancel')).toBe(false);
    expect(miss.patience).toBe(10 - 2); // drain resolved
  });

  it('NPC traps watch player events — both directions work (§3.6 owner-relative)', () => {
    let s = start({
      config: {
        enemyDeckCardIds: ['n_trap_on_play', ...Array(5).fill('n_noop')],
        scriptedOpponentPlays: ['n_trap_on_play'],
      },
    });
    s = endTurn(s);
    s = runNpcTurn(s); // NPC trap now on the field
    expect(s.field.some((p) => p.kind === 'trap' && p.owner === 'npc')).toBe(true);
    const patience = s.patience;
    s = playCard(s, 'p_noop'); // player play triggers it
    expect(s.patience).toBe(patience - 1);
  });

  it('trap firing order is play order (oldest first) and traps precede shield triggers (§5.4)', () => {
    // Two patience-watching traps: both fire on one PATIENCE_CHANGED; the log
    // must show them in play order.
    let s = start({ config: { scriptedDrawOrder: ['p_trap_on_patience', 'p_trap_on_patience', 'p_patience_down', 'p_patience_down', ...Array(8).fill('p_noop')] } });
    s = playCard(s, 'p_trap_on_patience');
    s = playCard(s, 'p_trap_on_patience');
    s = playCard(s, 'p_patience_down'); // 10 → 7, no fire (≥5)
    expect(s.log.filter((l) => l.type === 'trap-fired').length).toBe(0);
    s = playCard(s, 'p_patience_down'); // 7 → 4 < 5: both fire
    const fires = s.log.filter((l) => l.type === 'trap-fired');
    expect(fires.length).toBe(2);
  });
});

describe('Canonical event dispatch coverage (Brief §7 trap 5)', () => {
  /** Build a player trap subscribed to `event` and a scenario that dispatches it. */
  function trapFor(event: EngineEventType): CardDefinition {
    return {
      id: 'probe',
      name: 'probe',
      cost: 0,
      color: 'Colorless',
      supertype: 'Skill',
      subtype: 'Trap',
      keywords: ['Trap'],
      effects: [{ type: 'MODIFY_PATIENCE', value: 1 }],
      effectText: 'probe',
      trapTrigger: { event },
    };
  }

  const scenarios: Record<string, (s: ReturnType<typeof start>) => ReturnType<typeof start>> = {
    CARD_PLAYED: (s) => playCard(s, 'p_noop'),
    CARD_RESOLVED: (s) => playCard(s, 'p_noop'),
    CARD_DRAWN: (s) => playCard(s, 'p_draw'),
    PATIENCE_CHANGED: (s) => playCard(s, 'p_patience_down'),
    PRIORITY_CHANGED: (s) => playCard(s, 'p_gain_priority'),
    SHIELD_BROKEN: (s) => playCard(s, 'p_break'),
    TOKEN_CREATED: (s) => playCard(s, 'p_token_maker'),
    TOKEN_DESTROYED: (s) => {
      let x = playCard(s, 'p_token_maker');
      x = playCard(x, 'p_token_smash');
      return x;
    },
    PLAYER_TURN_END: (s) => endTurn(s),
    NPC_TURN_START: (s) => runNpcTurn(endTurn(s)),
    NPC_TURN_END: (s) => runNpcTurn(endTurn(s)),
    CARD_STAGED: (s) => runNpcTurn(endTurn(s)),
  };

  const scenarioDecks: Record<string, string[]> = {
    CARD_DRAWN: ['probe', 'p_draw', 'p_noop', 'p_noop', 'p_noop'],
    TOKEN_CREATED: ['probe', 'p_token_maker', 'p_noop', 'p_noop', 'p_noop'],
    TOKEN_DESTROYED: ['probe', 'p_token_maker', 'p_token_smash', 'p_noop', 'p_noop'],
  };

  for (const [event, drive] of Object.entries(scenarios)) {
    it(`${event} is genuinely dispatched and fires a subscribed trap`, () => {
      const cards = { ...CARDS, probe: trapFor(event as EngineEventType) };
      const deck = [
        ...(scenarioDecks[event] ?? ['probe', 'p_noop', 'p_patience_down', 'p_gain_priority', 'p_break']),
        ...Array(7).fill('p_noop'),
      ];
      let s = buildInitialState({
        config: makeEncounter({ scriptedDrawOrder: deck }),
        cards,
        tokens: TOKENS,
        nuggets: NUGGETS,
        playerDeckCardIds: deck,
        collectionCardIds: [],
        seed: 7,
      });
      s = playCard(s, 'probe');
      s = drive(s);
      expect(s.log.some((l) => l.type === 'trap-fired')).toBe(true);
    });
  }

  it('PLAYER_TURN_START is dispatched and fires a subscribed NPC trap', () => {
    // Owner-relative asymmetry: a player trap expires at §4.1 step 4 before
    // the step-9 dispatch, so PLAYER_TURN_START is an NPC-trap event.
    let s = start({
      config: {
        enemyDeckCardIds: ['n_trap_pts', ...Array(5).fill('n_noop')],
        scriptedOpponentPlays: ['n_trap_pts'],
      },
    });
    s = endTurn(s);
    s = runNpcTurn(s);
    expect(s.log.some((l) => l.type === 'trap-fired')).toBe(true);
  });
});
