import { create } from 'zustand';
import { EncounterConfig } from '../combat/types';
import { supabase } from '../lib/supabaseClient';

interface DevEncounterStore {
  encounters: Record<string, EncounterConfig>;
  loading: boolean;
  error: string | null;
  addEncounter: (encounter: EncounterConfig) => void;
  updateEncounter: (id: string, encounter: EncounterConfig) => void;
  removeEncounter: (id: string) => void;
  getEncounter: (id: string) => EncounterConfig | undefined;
  getAllEncounters: () => EncounterConfig[];
  importFromLocalStorage: () => Promise<number>;
}

export const useDevEncounterStore = create<DevEncounterStore>()((set, get) => {
  supabase
    .from('encounters')
    .select('id, data')
    .then(({ data, error }) => {
      if (error) {
        console.error('[encounters] fetch failed:', error.message);
        set({ loading: false, error: error.message });
        return;
      }
      const encounters: Record<string, EncounterConfig> = {};
      for (const row of data ?? []) encounters[row.id] = row.data as EncounterConfig;
      set({ encounters, loading: false });
    });

  return {
    encounters: {},
    loading: true,
    error: null,

    addEncounter: (encounter) => {
      set((s) => ({ encounters: { ...s.encounters, [encounter.id]: encounter } }));
      supabase
        .from('encounters')
        .upsert({ id: encounter.id, data: encounter })
        .then(({ error }) => {
          if (error) console.error('[encounters] upsert failed:', error.message);
        });
    },

    updateEncounter: (id, encounter) => {
      set((s) => {
        const next = { ...s.encounters };
        delete next[id];
        next[encounter.id] = encounter;
        return { encounters: next };
      });
      (async () => {
        if (id !== encounter.id) {
          const { error: delErr } = await supabase.from('encounters').delete().eq('id', id);
          if (delErr) console.error('[encounters] delete old id failed:', delErr.message);
        }
        const { error: upsErr } = await supabase.from('encounters').upsert({ id: encounter.id, data: encounter });
        if (upsErr) console.error('[encounters] upsert failed:', upsErr.message);
      })();
    },

    removeEncounter: (id) => {
      set((s) => {
        const next = { ...s.encounters };
        delete next[id];
        return { encounters: next };
      });
      supabase
        .from('encounters')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('[encounters] delete failed:', error.message);
        });
    },

    getEncounter: (id) => get().encounters[id],
    getAllEncounters: () => Object.values(get().encounters),

    importFromLocalStorage: async () => {
      const raw = localStorage.getItem('btdev-encounters');
      if (!raw) return 0;
      try {
        const parsed = JSON.parse(raw) as { state?: { encounters?: Record<string, EncounterConfig> } };
        const encounters = parsed.state?.encounters ?? {};
        const entries = Object.values(encounters);
        if (entries.length === 0) return 0;

        const rows = entries.map((e) => ({ id: e.id, data: e }));
        const { error } = await supabase.from('encounters').upsert(rows);
        if (error) throw new Error(error.message);

        const merged = { ...get().encounters };
        for (const e of entries) merged[e.id] = e;
        set({ encounters: merged });
        return entries.length;
      } catch (e) {
        console.error('[encounters] localStorage import failed:', e);
        throw e;
      }
    },
  };
});
