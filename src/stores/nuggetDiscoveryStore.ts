import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';

export interface NuggetDiscoveryRow {
  encounterId: string;
  nuggetId: string;
  discoveredAt: string;
}

interface NuggetDiscoveryStore {
  discoveries: NuggetDiscoveryRow[];
  loading: boolean;
  error: string | null;
  isDiscovered: (encounterId: string, nuggetId: string) => boolean;
  getByEncounter: (encounterId: string) => NuggetDiscoveryRow[];
  recordDiscovery: (encounterId: string, nuggetId: string) => void;
}

export const useNuggetDiscoveryStore = create<NuggetDiscoveryStore>()((set, get) => {
  supabase
    .from('nugget_discovery')
    .select('*')
    .then(({ data, error }) => {
      if (error) {
        console.error('[nugget_discovery] fetch failed:', error.message);
        set({ loading: false, error: error.message });
        return;
      }
      const discoveries: NuggetDiscoveryRow[] = (data ?? []).map(r => ({
        encounterId: r.encounter_id,
        nuggetId: r.nugget_id,
        discoveredAt: r.discovered_at,
      }));
      set({ discoveries, loading: false });
    });

  return {
    discoveries: [],
    loading: true,
    error: null,

    isDiscovered: (encounterId, nuggetId) =>
      get().discoveries.some(d => d.encounterId === encounterId && d.nuggetId === nuggetId),

    getByEncounter: (encounterId) =>
      get().discoveries.filter(d => d.encounterId === encounterId),

    recordDiscovery: (encounterId, nuggetId) => {
      if (get().isDiscovered(encounterId, nuggetId)) return;

      const row: NuggetDiscoveryRow = {
        encounterId,
        nuggetId,
        discoveredAt: new Date().toISOString(),
      };
      set((s) => ({ discoveries: [...s.discoveries, row] }));

      supabase
        .from('nugget_discovery')
        .upsert(
          { encounter_id: encounterId, nugget_id: nuggetId },
          { onConflict: 'encounter_id,nugget_id' }
        )
        .then(({ error }) => {
          if (error) console.error('[nugget_discovery] upsert failed:', error.message);
        });
    },
  };
});
