import { ActivatedAbilityCost } from '../../combat/types';

export function formatAbilityCost(cost: ActivatedAbilityCost): string {
  const parts: string[] = [];
  if (cost.priority) parts.push(`${cost.priority}P`);
  if (cost.patience) parts.push(`${cost.patience}Pat`);
  if (cost.shields) parts.push(`${cost.shields}S`);
  if (cost.discard) parts.push(`${cost.discard}D`);
  return parts.length > 0 ? `[${parts.join('/')}]` : '[Free]';
}
