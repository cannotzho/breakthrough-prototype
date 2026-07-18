/**
 * Cross-engine behavioral parity trace for the C# port.
 *
 * Drives the TS engine through a deterministic multi-round game (seeded RNG,
 * fixed policy: leftmost play while Priority ≥ 1, choose min on number
 * prompts, acknowledge every block, keep nothing in Back of Mind) and writes
 * one state-snapshot line after every top-level reduce. The C# suite
 * (TraceParityTests) replays the identical script and must reproduce every
 * line — including rngState, logSeq and nextId, which count every internal
 * step.
 *
 * Run with:  npx vitest run --config csharp-engine/tools/vitest.config.ts
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import type { CombatState } from '../../src/engine';
import { reduce } from '../../src/engine';
import { start } from '../../tests/engine/fixtures';

const snap = (s: CombatState): string =>
  [
    s.phase,
    s.rngState,
    s.patience,
    s.player.priority,
    s.npc.priority,
    s.round,
    s.lieCounter,
    s.player.hand.map((c) => c.definitionId).join(','),
    s.player.deck.map((c) => c.definitionId).join(','),
    s.player.discard.map((c) => c.definitionId).join(','),
    s.npc.hand.map((c) => c.definitionId).join(','),
    s.npc.deck.map((c) => c.definitionId).join(','),
    s.npc.discard.map((c) => c.definitionId).join(','),
    s.npcGuards.map((g) => g.cardId ?? '-').join(','),
    s.npcGuardsStanding,
    s.oppShieldsBrokenByPlayerThisTurn,
    s.playerShields.length,
    s.field.map((p) => `${p.kind}:${p.definitionId}`).join(','),
    s.logSeq,
    s.nextId,
  ].join('|');

it('dumps the TS engine parity trace for the C# suite', () => {
  let s = start({
    seed: 4242,
    deck: [
      'p_break', 'p_draw', 'p_choose', 'p_lie', 'p_safety', 'p_free',
      'p_heavy', 'p_copy', 'p_scheduler', 'p_replacer', 'p_token_maker', 'p_noop',
    ],
    config: {
      enemyDeckCardIds: ['n_break', 'n_guards_up', 'n_patience_drain', 'n_noop', 'n_noop', 'n_noop'],
    },
  });
  const trace: string[] = [snap(s)];

  for (let round = 0; round < 4 && !s.result; round++) {
    while (s.phase === 'PlayerPending' && s.player.priority >= 1 && s.player.hand.length > 0 && !s.result) {
      s = reduce(s, { type: 'PLAY_CARD', handIndex: 0 });
      while (s.pendingBlock) {
        s =
          s.pendingBlock.type === 'chooseNumber'
            ? reduce(s, { type: 'CHOOSE_NUMBER', value: s.pendingBlock.min })
            : reduce(s, { type: 'ACKNOWLEDGE' });
      }
      trace.push(snap(s));
    }
    if (s.result) break;
    s = reduce(s, { type: 'END_TURN' });
    trace.push(snap(s));
    if (s.phase === 'BotMSelect') {
      s = reduce(s, { type: 'BOTM_SELECT', keepHandIndices: [] });
      trace.push(snap(s));
    }
    while (s.phase === 'EnemyPending') {
      s = reduce(s, { type: 'ADVANCE' });
      while (s.pendingBlock) s = reduce(s, { type: 'ACKNOWLEDGE' });
      trace.push(snap(s));
    }
  }

  const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'Breakthrough.Engine.Tests', 'trace.expected.txt');
  writeFileSync(out, trace.join('\n') + '\n');
  expect(trace.length).toBeGreaterThan(10);
});
