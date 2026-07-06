/**
 * Token registry (v1.4 §3.7) — ported from prototype-v1 DEV_TOKEN_DEFINITIONS
 * (Brief §6). Tokens are Field-only, never deck-legal.
 */
import type { CardDefinition } from '../engine';

export const TOKENS: Record<string, CardDefinition> = {
  dev_token_informant: {
    id: 'dev_token_informant',
    name: 'Informant Contact',
    cost: 0,
    keywords: [],
    effects: [],
    color: 'Green',
    supertype: 'Skill',
    subtype: 'Token',
    effectText: 'A contact on the field. {1}: Draw 1 card.',
    activatedAbilities: [
      { id: 'informant_tip', name: 'Tip', cost: { priority: 1 }, effects: [{ type: 'DRAW_CARDS', value: 1 }] },
    ],
  },
  logical_chain: {
    id: 'logical_chain',
    name: 'Logical Chain',
    cost: 0,
    keywords: [],
    effects: [],
    color: 'Blue',
    supertype: 'Skill',
    subtype: 'Token',
    effectText: 'When this leaves the field, draw a card. {1}: Destroy this token.',
    leaveTriggerEffects: [{ type: 'DRAW_CARDS', value: 1 }],
    activatedAbilities: [
      { id: 'logical_chain_sacrifice', name: 'Sacrifice', cost: { priority: 1 }, effects: [{ type: 'DESTROY_SELF' }] },
    ],
  },
  captivating_sense: {
    id: 'captivating_sense',
    name: 'Captivating Sense',
    cost: 0,
    keywords: [],
    effects: [],
    color: 'Blue',
    supertype: 'Skill',
    subtype: 'Token',
    effectText: 'When this leaves the field, gain 3 Priority. {1}: Destroy this token.',
    leaveTriggerEffects: [{ type: 'MODIFY_PRIORITY', value: 3 }],
    activatedAbilities: [
      { id: 'captivating_sense_release', name: 'Release', cost: { priority: 1 }, effects: [{ type: 'DESTROY_SELF' }] },
    ],
  },
  impactful_conclusion: {
    id: 'impactful_conclusion',
    name: 'Impactful Conclusion',
    cost: 0,
    keywords: [],
    effects: [],
    color: 'Blue',
    supertype: 'Skill',
    subtype: 'Token',
    effectText: 'When this leaves the field, break 2 opponent Guard Shields. {4}: Destroy this token.',
    leaveTriggerEffects: [{ type: 'BREAK_SHIELDS', target: 'opponent', count: 2 }],
    activatedAbilities: [
      { id: 'impactful_conclusion_conclude', name: 'Conclude', cost: { priority: 4 }, effects: [{ type: 'DESTROY_SELF' }] },
    ],
  },
};
