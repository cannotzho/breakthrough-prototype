/**
 * Ported content sanity: every card validates, both encounters validate and
 * boot, and a scripted FCP opening runs without engine errors.
 */
import { describe, expect, it } from 'vitest';
import { buildInitialState, reduce, validateCard, validateEncounter } from '../../src/engine';
import {
  ALL_CARDS,
  DEV_COLLECTION_IDS,
  ENCOUNTERS,
  NUGGETS,
  RECIPES,
  STARTER_DECK_LISTS,
  TOKENS,
} from '../../src/content';

describe('Ported content (Brief §6)', () => {
  it('every card definition passes authoring validation', () => {
    const errors = Object.values(ALL_CARDS)
      .flatMap(validateCard)
      .filter((i) => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('both encounters pass validation (≥1 shield, ≥1 key per lock, real nuggets)', () => {
    for (const enc of Object.values(ENCOUNTERS)) {
      const errors = validateEncounter(enc, ALL_CARDS, NUGGETS).filter((i) => i.severity === 'error');
      expect(errors).toEqual([]);
    }
  });

  for (const [deckName, deck] of Object.entries(STARTER_DECK_LISTS)) {
    it(`FCP encounter boots and survives 3 full rounds with the ${deckName} deck`, () => {
      let s = buildInitialState({
        config: ENCOUNTERS.fan_club_president,
        cards: ALL_CARDS,
        tokens: TOKENS,
        nuggets: NUGGETS,
        recipes: RECIPES,
        playerDeckCardIds: deck,
        collectionCardIds: DEV_COLLECTION_IDS,
        seed: 2026,
      });
      expect(s.phase).toBe('PlayerPending');
      expect(s.field.some((p) => p.definitionId === 'fcp_idols_favor')).toBe(true);

      let guard = 0;
      for (let round = 0; round < 3 && !s.result; round++) {
        // Player: play whatever is playable, then end turn.
        while (s.phase === 'PlayerPending' && s.player.priority >= 1 && s.player.hand.length > 0) {
          if (++guard > 200) throw new Error('runaway');
          const next = reduce(s, { type: 'PLAY_CARD', handIndex: 0 });
          if (next.log.at(-1)?.type === 'illegal-action') break;
          s = next;
          while (s.pendingBlock) {
            s =
              s.pendingBlock.type === 'chooseNumber'
                ? reduce(s, { type: 'CHOOSE_NUMBER', value: s.pendingBlock.min })
                : reduce(s, { type: 'ACKNOWLEDGE' });
          }
        }
        if (s.result) break;
        s = reduce(s, { type: 'END_TURN' });
        if (s.phase === 'BotMSelect') s = reduce(s, { type: 'BOTM_SELECT', keepHandIndices: [] });
        while (s.phase === 'EnemyPending') {
          if (++guard > 400) throw new Error('runaway npc');
          s = reduce(s, { type: 'ADVANCE' });
          while (s.pendingBlock) s = reduce(s, { type: 'ACKNOWLEDGE' });
        }
      }
      // No engine errors and no resolution halts anywhere in the run.
      expect(s.log.filter((l) => l.type === 'error')).toEqual([]);
      expect(s.resolutionHalted).toBe(false);
    });
  }

  it('The Informant is winnable via lock-and-keys with the drafted overrides', () => {
    const deck = [
      'dev_push',
      'dev_push',
      'dev_push',
      'dev_quick_retort',
      'info_warehouse_logs',
      'info_personal_history',
      'info_incident_report',
      'dev_hold',
      'dev_nudge',
      'dev_quick_retort',
      'dev_push',
      'dev_hold',
    ];
    let s = buildInitialState({
      config: { ...ENCOUNTERS.test_encounter, scriptedDrawOrder: deck },
      cards: ALL_CARDS,
      tokens: TOKENS,
      nuggets: NUGGETS,
      playerDeckCardIds: deck,
      collectionCardIds: DEV_COLLECTION_IDS,
      seed: 7,
    });
    const play = (defId: string) => {
      const idx = s.player.hand.findIndex((c) => c.definitionId === defId);
      expect(idx, `${defId} in hand`).toBeGreaterThanOrEqual(0);
      s = reduce(s, { type: 'PLAY_CARD', handIndex: idx });
      while (s.pendingBlock) s = reduce(s, { type: 'ACKNOWLEDGE' });
    };
    const endTurn = (keepDefIds: string[] = []) => {
      s = reduce(s, { type: 'END_TURN' });
      if (s.phase === 'BotMSelect') {
        const keep = keepDefIds
          .map((id) => s.player.hand.findIndex((c) => c.definitionId === id))
          .filter((i) => i >= 0);
        s = reduce(s, { type: 'BOTM_SELECT', keepHandIndices: keep });
      }
      while (s.phase === 'EnemyPending') {
        s = reduce(s, { type: 'ADVANCE' });
        while (s.pendingBlock) s = reduce(s, { type: 'ACKNOWLEDGE' });
      }
    };
    // Turn 1: 3 guards down (2+2 cost), quick retort funds the third push.
    play('dev_quick_retort'); // +2 → 7
    play('dev_push');
    play('dev_push');
    play('dev_push');
    expect(s.npcGuardsStanding).toBe(0);
    // Keep the key drawn this turn through Back of Mind (v1.4 §3.11).
    endTurn(['info_warehouse_logs']);
    play('info_warehouse_logs'); // breaks lock 1
    play('info_personal_history'); // breaks lock 2 (hint)
    play('info_incident_report'); // breaks lock 3 → WIN
    expect(s.result).toBe('WIN');
    expect(s.gainedCardIds).toContain('info_warehouse_logs');
  });
});
