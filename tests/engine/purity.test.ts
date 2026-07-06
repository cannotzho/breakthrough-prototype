/**
 * §6.7 inv. 12 & Brief §7 trap 10 — reducer purity, config immutability,
 * and full determinism (the dual-playtest foundation, Brief §4).
 */
import { describe, expect, it } from 'vitest';
import type { CombatAction } from '../../src/engine';
import { reduce } from '../../src/engine';
import { start } from './fixtures';

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const v of Object.values(obj as object)) deepFreeze(v);
  }
  return obj;
}

const SCRIPT: CombatAction[] = [
  { type: 'PLAY_CARD', handIndex: 0 },
  { type: 'PLAY_CARD', handIndex: 0 },
  { type: 'END_TURN' },
  { type: 'BOTM_SELECT', keepHandIndices: [0] },
  { type: 'ADVANCE' },
  { type: 'ADVANCE' },
  { type: 'ADVANCE' },
  { type: 'ADVANCE' },
];

describe('Purity & determinism', () => {
  it('reduce never mutates its input (deep-frozen state passes through)', () => {
    const s0 = deepFreeze(start());
    expect(() => reduce(s0, { type: 'PLAY_CARD', handIndex: 0 })).not.toThrow();
  });

  it('input state is byte-identical before and after reduce', () => {
    const s0 = start();
    const snapshot = JSON.stringify(s0);
    reduce(s0, { type: 'END_TURN' });
    expect(JSON.stringify(s0)).toBe(snapshot);
  });

  it('same seed + same action sequence ⇒ byte-identical states (dual playtest)', () => {
    const run = () => {
      let s = start({ seed: 1234 });
      for (const a of SCRIPT) s = reduce(s, a);
      return JSON.stringify(s);
    };
    expect(run()).toBe(run());
  });

  it('different seeds diverge (randomness flows through the state RNG)', () => {
    const shuffleOf = (seed: number) =>
      JSON.stringify(start({ seed, deck: ['p_break', 'p_draw', 'p_noop', 'p_lie', 'p_safety', 'p_choose', 'p_free', 'p_heavy', 'p_copy', 'p_scheduler', 'p_replacer', 'p_token_maker'] }).player.deck);
    expect(shuffleOf(1)).not.toBe(shuffleOf(2));
  });

  it('the encounter config is immutable input — never mutated (trap 10)', () => {
    let s = start();
    const cfg = JSON.stringify(s.config);
    s = reduce(s, { type: 'PLAY_CARD', handIndex: 0 });
    s = reduce(s, { type: 'END_TURN' });
    if (s.phase === 'BotMSelect') s = reduce(s, { type: 'BOTM_SELECT', keepHandIndices: [] });
    while (s.phase === 'EnemyPending') s = reduce(s, { type: 'ADVANCE' });
    expect(JSON.stringify(s.config)).toBe(cfg);
  });

  it('manual NPC play of the same card produces identical transitions to ADVANCE (Brief §4)', () => {
    const auto = (() => {
      let s = start({ seed: 99 });
      s = reduce(s, { type: 'END_TURN' });
      if (s.phase === 'BotMSelect') s = reduce(s, { type: 'BOTM_SELECT', keepHandIndices: [] });
      s = reduce(s, { type: 'ADVANCE' });
      return s;
    })();
    const manual = (() => {
      let s = start({ seed: 99 });
      s = reduce(s, { type: 'END_TURN' });
      if (s.phase === 'BotMSelect') s = reduce(s, { type: 'BOTM_SELECT', keepHandIndices: [] });
      s = reduce(s, { type: 'NPC_PLAY_CARD', handIndex: 0 }); // same leftmost card
      return s;
    })();
    expect(JSON.stringify(auto)).toBe(JSON.stringify(manual));
  });
});
