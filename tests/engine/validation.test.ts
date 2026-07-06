/**
 * v1.4 §15.5 + Brief §7 traps 5/12 — authoring-time validation.
 */
import { describe, expect, it } from 'vitest';
import type { CardDefinition } from '../../src/engine';
import { validateCard, validateEncounter } from '../../src/engine';
import { CARDS, NUGGETS, makeEncounter, start } from './fixtures';

const baseCard: CardDefinition = {
  id: 'x',
  name: 'x',
  cost: 1,
  color: 'Colorless',
  supertype: 'Skill',
  subtype: null,
  keywords: [],
  effects: [],
  effectText: 'x',
};

describe('Authoring validation (v1.4 §15.5)', () => {
  it('rejects trap subscriptions to non-canonical events (trap 5)', () => {
    const bad: CardDefinition = {
      ...baseCard,
      subtype: 'Trap',
      keywords: ['Trap'],
      trapTrigger: { event: 'END_OF_PLAYER_TURN' as never },
    };
    expect(validateCard(bad).some((i) => i.severity === 'error' && i.message.includes('non-canonical'))).toBe(true);
  });

  it('rejects triggered abilities on non-canonical events', () => {
    const bad: CardDefinition = {
      ...baseCard,
      triggeredAbilities: [{ id: 'a', trigger: { event: 'OPPONENT_BREAKS_SHIELD' as never }, effects: [] }],
    };
    expect(validateCard(bad).length).toBeGreaterThan(0);
  });

  it('rejects traps with no trigger — no silent dead traps (§3.6)', () => {
    const bad: CardDefinition = { ...baseCard, subtype: 'Trap', keywords: ['Trap'] };
    expect(validateCard(bad).some((i) => i.severity === 'error')).toBe(true);
  });

  it('rejects keyless locks (§3.3)', () => {
    const cfg = makeEncounter({
      opponentShields: [{ cardId: 'lore_1', isHint: false, loreDescription: 'x', keyNuggetIds: [] }],
    });
    expect(validateEncounter(cfg, CARDS, NUGGETS).some((i) => i.message.includes('keyless') || i.message.includes('no key'))).toBe(true);
  });

  it('rejects an empty opponent shield row — no vacuous wins (trap 12)', () => {
    const cfg = makeEncounter({ npcGuardShieldCount: 0, opponentShields: [] });
    expect(validateEncounter(cfg, CARDS, NUGGETS).some((i) => i.severity === 'error')).toBe(true);
    expect(() => start({ config: { npcGuardShieldCount: 0, opponentShields: [] } })).toThrow();
  });

  it('rejects keys referencing unknown nuggets', () => {
    const cfg = makeEncounter({
      opponentShields: [{ cardId: 'lore_1', isHint: false, loreDescription: 'x', keyNuggetIds: ['nope'] }],
    });
    expect(validateEncounter(cfg, CARDS, NUGGETS).some((i) => i.message.includes('does not exist'))).toBe(true);
  });

  it('rejects Rapport without prediction config and Heavy Hand without alternate effects', () => {
    expect(validateCard({ ...baseCard, keywords: ['Rapport'] }).some((i) => i.severity === 'error')).toBe(true);
    expect(validateCard({ ...baseCard, keywords: ['Heavy Hand'] }).some((i) => i.severity === 'error')).toBe(true);
  });

  it('rejects Information Cards without a nuggetId (§3.9)', () => {
    expect(validateCard({ ...baseCard, supertype: 'Information' }).some((i) => i.severity === 'error')).toBe(true);
  });

  it('rejects scheduled plays for cards not in the enemy deck', () => {
    const cfg = makeEncounter({ scheduledPlays: [{ cardId: 'p_noop', afterTurn: 2 }] });
    expect(validateEncounter(cfg, CARDS, NUGGETS).some((i) => i.severity === 'error')).toBe(true);
  });
});
