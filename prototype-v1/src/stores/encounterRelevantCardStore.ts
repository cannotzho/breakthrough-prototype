import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';

export interface EncounterRelevantCardRow {
  id: string;
  encounterId: string;
  nuggetId: string;
  cardId: string;
}

interface EncounterRelevantCardStore {
  rows: EncounterRelevantCardRow[];
  loading: boolean;
  error: string | null;
  getByEncounter: (encounterId: string) => EncounterRelevantCardRow[];
  addRow: (encounterId: string, nuggetId: string, cardId: string) => Promise<void>;
  removeRow: (id: string) => void;
  updateRow: (id: string, cardId: string) => void;
}

export const useEncounterRelevantCardStore = create<EncounterRelevantCardStore>()((set, get) => {
  supabase
    .from('encounter_relevant_cards')
    .select('*')
    .then(({ data, error }) => {
      if (error) {
        console.error('[encounter_relevant_cards] fetch failed:', error.message);
        set({ loading: false, error: error.message });
        return;
      }
      const rows: EncounterRelevantCardRow[] = (data ?? []).map(r => ({
        id: r.id,
        encounterId: r.encounter_id,
        nuggetId: r.nugget_id,
        cardId: r.card_id,
      }));
      set({ rows, loading: false });
    });

  return {
    rows: [],
    loading: true,
    error: null,

    getByEncounter: (encounterId) =>
      get().rows.filter(r => r.encounterId === encounterId),

    addRow: async (encounterId, nuggetId, cardId) => {
      const tempId = crypto.randomUUID();
      const row: EncounterRelevantCardRow = { id: tempId, encounterId, nuggetId, cardId };
      set((s) => ({ rows: [...s.rows, row] }));

      const { data, error } = await supabase
        .from('encounter_relevant_cards')
        .insert({ encounter_id: encounterId, nugget_id: nuggetId, card_id: cardId })
        .select('id')
        .single();

      if (error) {
        console.error('[encounter_relevant_cards] insert failed:', error.message);
        set((s) => ({ rows: s.rows.filter(r => r.id !== tempId) }));
        return;
      }
      if (data) {
        set((s) => ({
          rows: s.rows.map(r => r.id === tempId ? { ...r, id: data.id } : r),
        }));
      }
    },

    removeRow: (id) => {
      set((s) => ({ rows: s.rows.filter(r => r.id !== id) }));
      supabase
        .from('encounter_relevant_cards')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('[encounter_relevant_cards] delete failed:', error.message);
        });
    },

    updateRow: (id, cardId) => {
      set((s) => ({
        rows: s.rows.map(r => r.id === id ? { ...r, cardId } : r),
      }));
      supabase
        .from('encounter_relevant_cards')
        .update({ card_id: cardId })
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('[encounter_relevant_cards] update failed:', error.message);
        });
    },
  };
});
