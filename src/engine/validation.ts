/**
 * Authoring-time validation (v1.4 §15.5, §3.3; Rebuild_Brief §5).
 * Rejects subscriptions to non-canonical events, keyless locks, empty shield
 * rows, and malformed configs — config errors, not gameplay states.
 */
import type { CardDefinition, EncounterConfig, InfoNugget, TriggerCondition } from './types';
import { CANONICAL_EVENTS } from './types';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  where: string;
  message: string;
}

const isCanonical = (e: string): boolean => (CANONICAL_EVENTS as readonly string[]).includes(e);

function validateTrigger(t: TriggerCondition, where: string, issues: ValidationIssue[]): void {
  if (!isCanonical(t.event)) {
    issues.push({
      severity: 'error',
      where,
      message: `Trigger subscribes to non-canonical event "${t.event}". Canonical events: ${CANONICAL_EVENTS.join(', ')}.`,
    });
  }
}

export function validateCard(card: CardDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const w = `card ${card.id}`;

  if (card.subtype === 'Trap') {
    if (!card.trapTrigger) {
      issues.push({ severity: 'error', where: w, message: 'Trap card has no trapTrigger — no silent dead traps (v1.4 §3.6).' });
    } else {
      validateTrigger(card.trapTrigger, w, issues);
    }
    if (!card.keywords.includes('Trap')) {
      issues.push({ severity: 'warning', where: w, message: 'Trap subtype without Trap keyword.' });
    }
  }
  for (const ab of card.triggeredAbilities ?? []) {
    validateTrigger(ab.trigger, `${w} / ability ${ab.id}`, issues);
  }
  if (card.keywords.includes('Rapport') && !card.rapport) {
    issues.push({ severity: 'error', where: w, message: 'Rapport keyword requires rapport prediction config (v1.4 §8.3).' });
  }
  if (card.keywords.includes('Heavy Hand') && !card.heavyHandEffects) {
    issues.push({ severity: 'error', where: w, message: 'Heavy Hand keyword requires heavyHandEffects (v1.4 §8.3).' });
  }
  if (card.supertype === 'Information' && !card.nuggetId) {
    issues.push({ severity: 'error', where: w, message: 'Information Card must carry a nuggetId (v1.4 §3.9).' });
  }
  if (card.subtype === 'Token' && card.cost !== 0) {
    issues.push({ severity: 'warning', where: w, message: 'Tokens are never played from hand; cost is meaningless.' });
  }
  return issues;
}

export function validateEncounter(
  config: EncounterConfig,
  cards: Record<string, CardDefinition>,
  nuggets: Record<string, InfoNugget>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const w = `encounter ${config.id}`;

  // ≥ 1 opponent shield total (v1.4 §3.3 validation; Brief §7 trap 12 — no vacuous wins)
  if (config.npcGuardShieldCount + config.opponentShields.length < 1) {
    issues.push({ severity: 'error', where: w, message: 'Encounter must define at least one opponent shield (guards + cores ≥ 1).' });
  }
  if (config.npcGuardShieldCount < 0) {
    issues.push({ severity: 'error', where: w, message: 'npcGuardShieldCount cannot be negative.' });
  }

  for (const [i, shield] of config.opponentShields.entries()) {
    const sw = `${w} / core shield ${i} (${shield.cardId})`;
    if (!shield.keyNuggetIds || shield.keyNuggetIds.length === 0) {
      issues.push({ severity: 'error', where: sw, message: 'NPC Core Shield lists no key nuggets — a keyless lock is a config error (v1.4 §3.3).' });
    }
    for (const nid of shield.keyNuggetIds ?? []) {
      if (!nuggets[nid]) {
        issues.push({ severity: 'error', where: sw, message: `Key nugget "${nid}" does not exist.` });
      }
    }
    if (!shield.isHint && !cards[shield.cardId]) {
      issues.push({ severity: 'error', where: sw, message: `Core shield card "${shield.cardId}" not found (non-Hint shields add their card to the Collection).` });
    }
  }

  for (const id of config.enemyDeckCardIds) {
    if (!cards[id]) issues.push({ severity: 'error', where: w, message: `Enemy deck card "${id}" not found.` });
  }
  for (const sp of config.scheduledPlays ?? []) {
    if (!config.enemyDeckCardIds.includes(sp.cardId)) {
      issues.push({ severity: 'error', where: w, message: `Scheduled play "${sp.cardId}" is not in the enemy deck.` });
    }
  }
  for (const id of config.startingImpressions ?? []) {
    if (!cards[id]) issues.push({ severity: 'error', where: w, message: `Starting impression "${id}" not found.` });
  }
  for (const ov of config.nuggetOverrides) {
    if (!nuggets[ov.nuggetId]) {
      issues.push({ severity: 'error', where: w, message: `Nugget override references unknown nugget "${ov.nuggetId}".` });
    }
  }
  if (config.playerDummyShieldSlots < 0) {
    issues.push({ severity: 'error', where: w, message: 'playerDummyShieldSlots cannot be negative.' });
  }
  return issues;
}

export function assertValid(issues: ValidationIssue[]): void {
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new Error(`Validation failed:\n${errors.map((e) => `  [${e.where}] ${e.message}`).join('\n')}`);
  }
}
