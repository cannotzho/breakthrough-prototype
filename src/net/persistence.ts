/**
 * Save layer (v1.4 §12 — actually wired this time, unlike the prototype's
 * saveStore). Content CRUD backs the dev tools; progress functions persist
 * Collection gains, global nugget discovery, per-NPC trait discovery, and
 * per-encounter retry state.
 *
 * All functions fail soft (log + fallback) so the game remains playable
 * offline with the bundled content.
 */
import type { CardDefinition, CombatState, EncounterConfig, InfoNugget } from '../engine';
import { supabase } from './supabaseClient';

// ── Content CRUD ─────────────────────────────────────────────────────────────

export async function fetchCards(): Promise<Record<string, CardDefinition> | null> {
  const { data, error } = await supabase.from('cards').select('id,data');
  if (error || !data) return null;
  return Object.fromEntries(data.map((r) => [r.id, r.data as CardDefinition]));
}

export async function saveCard(card: CardDefinition): Promise<string | null> {
  const { error } = await supabase.from('cards').upsert({
    id: card.id,
    data: card,
    nugget_id: card.nuggetId ?? null,
    is_token: card.subtype === 'Token',
  });
  return error ? error.message : null;
}

export async function deleteCard(id: string): Promise<string | null> {
  const { error } = await supabase.from('cards').delete().eq('id', id);
  return error ? error.message : null;
}

export async function fetchEncounters(): Promise<Record<string, EncounterConfig> | null> {
  const { data, error } = await supabase.from('encounters').select('id,data');
  if (error || !data) return null;
  return Object.fromEntries(data.map((r) => [r.id, r.data as EncounterConfig]));
}

export async function saveEncounter(config: EncounterConfig): Promise<string | null> {
  const { error } = await supabase.from('encounters').upsert({ id: config.id, data: config });
  return error ? error.message : null;
}

export async function deleteEncounter(id: string): Promise<string | null> {
  const { error } = await supabase.from('encounters').delete().eq('id', id);
  return error ? error.message : null;
}

export async function fetchNuggets(): Promise<Record<string, InfoNugget> | null> {
  const { data, error } = await supabase.from('info_nuggets').select('id,name,description');
  if (error || !data) return null;
  return Object.fromEntries(data.map((r) => [r.id, r as InfoNugget]));
}

export async function saveNugget(n: InfoNugget): Promise<string | null> {
  const { error } = await supabase.from('info_nuggets').upsert(n);
  return error ? error.message : null;
}

export async function deleteNugget(id: string): Promise<string | null> {
  const { error } = await supabase.from('info_nuggets').delete().eq('id', id);
  return error ? error.message : null;
}

export interface DeckRow {
  id: string;
  name: string;
  description: string;
  card_ids: string[];
}

export async function fetchDecks(): Promise<DeckRow[] | null> {
  const { data, error } = await supabase.from('decks').select('id,name,description,card_ids');
  if (error || !data) return null;
  return data as DeckRow[];
}

export async function saveDeck(deck: DeckRow): Promise<string | null> {
  const { error } = await supabase.from('decks').upsert(deck);
  return error ? error.message : null;
}

export async function deleteDeck(id: string): Promise<string | null> {
  const { error } = await supabase.from('decks').delete().eq('id', id);
  return error ? error.message : null;
}

/** Seed the content tables from the bundled files (idempotent upserts). */
export async function seedContent(
  cards: Record<string, CardDefinition>,
  nuggets: Record<string, InfoNugget>,
  encounters: Record<string, EncounterConfig>,
): Promise<string | null> {
  for (const n of Object.values(nuggets)) {
    const err = await saveNugget(n);
    if (err) return err;
  }
  for (const c of Object.values(cards)) {
    const err = await saveCard(c);
    if (err) return err;
  }
  for (const e of Object.values(encounters)) {
    const err = await saveEncounter(e);
    if (err) return err;
  }
  return null;
}

// ── Runtime progress (v1.4 §12) ──────────────────────────────────────────────

export interface ProgressSnapshot {
  collectionCardIds: string[];
  discoveredNuggetIds: string[];
  discoveredTraitIds: Record<string, string[]>; // encounterId → trait ids
  encounterProgress: Record<string, { brokenCoreShieldCardIds: string[]; playedNonRelevantCards: string[] }>;
}

export async function loadProgress(): Promise<ProgressSnapshot | null> {
  try {
    const [coll, nug, traits, encs] = await Promise.all([
      supabase.from('progress_collection').select('card_id'),
      supabase.from('progress_nugget_discovery').select('nugget_id'),
      supabase.from('progress_trait_discovery').select('encounter_id,trait_id'),
      supabase.from('progress_encounters').select('encounter_id,broken_core_shield_card_ids,played_non_relevant_cards'),
    ]);
    if (coll.error || nug.error || traits.error || encs.error) return null;
    const traitMap: Record<string, string[]> = {};
    for (const t of traits.data ?? []) {
      (traitMap[t.encounter_id] ??= []).push(t.trait_id);
    }
    return {
      collectionCardIds: (coll.data ?? []).map((r) => r.card_id),
      discoveredNuggetIds: (nug.data ?? []).map((r) => r.nugget_id),
      discoveredTraitIds: traitMap,
      encounterProgress: Object.fromEntries(
        (encs.data ?? []).map((r) => [
          r.encounter_id,
          {
            brokenCoreShieldCardIds: (r.broken_core_shield_card_ids as string[]) ?? [],
            playedNonRelevantCards: (r.played_non_relevant_cards as string[]) ?? [],
          },
        ]),
      ),
    };
  } catch {
    return null;
  }
}

/** Persist everything a finished (or abandoned) combat produced. */
export async function saveCombatProgress(state: CombatState): Promise<void> {
  try {
    const encounterId = state.config.id;
    if (state.gainedCardIds.length > 0) {
      await supabase
        .from('progress_collection')
        .upsert(state.gainedCardIds.map((card_id) => ({ card_id })));
    }
    if (state.discoveredNuggetIds.length > 0) {
      await supabase
        .from('progress_nugget_discovery')
        .upsert(state.discoveredNuggetIds.map((nugget_id) => ({ nugget_id })));
    }
    if (state.discoveredTraitIds.length > 0) {
      await supabase
        .from('progress_trait_discovery')
        .upsert(state.discoveredTraitIds.map((trait_id) => ({ encounter_id: encounterId, trait_id })));
    }
    if (state.config.retryable) {
      const broken = state.npcCoreShields.filter((s) => s.broken).map((s) => s.cardId);
      await supabase.from('progress_encounters').upsert({
        encounter_id: encounterId,
        broken_core_shield_card_ids: broken,
        played_non_relevant_cards: state.playedNonRelevantCards,
      });
    }
  } catch (e) {
    console.warn('saveCombatProgress failed (offline?)', e);
  }
}
