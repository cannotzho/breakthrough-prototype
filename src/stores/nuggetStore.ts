import { create } from 'zustand';
import { InfoNugget } from '../combat/types';
import { supabase } from '../lib/supabaseClient';

interface NuggetStore {
  nuggets: Record<string, InfoNugget>;
  loading: boolean;
  error: string | null;
  addNugget: (nugget: InfoNugget) => void;
  updateNugget: (id: string, nugget: InfoNugget) => void;
  removeNugget: (id: string) => void;
  getNugget: (id: string) => InfoNugget | undefined;
  getAllNuggets: () => InfoNugget[];
  getCompleteNuggets: () => InfoNugget[];
  setDefaultCardId: (nuggetId: string, cardId: string) => void;
}

export const useNuggetStore = create<NuggetStore>()((set, get) => {
  supabase
    .from('info_nuggets')
    .select('*')
    .then(({ data, error }) => {
      if (error) {
        console.error('[info_nuggets] fetch failed:', error.message);
        set({ loading: false, error: error.message });
        return;
      }
      const nuggets: Record<string, InfoNugget> = {};
      for (const row of data ?? []) {
        nuggets[row.id] = {
          id: row.id,
          name: row.name,
          longDescription: row.long_description,
          imageUrl: row.image_url ?? undefined,
          defaultCardId: row.default_card_id ?? undefined,
        };
      }
      set({ nuggets, loading: false });
    });

  return {
    nuggets: {},
    loading: true,
    error: null,

    addNugget: (nugget) => {
      set((s) => ({ nuggets: { ...s.nuggets, [nugget.id]: nugget } }));
      supabase
        .from('info_nuggets')
        .upsert({
          id: nugget.id,
          name: nugget.name,
          long_description: nugget.longDescription,
          image_url: nugget.imageUrl ?? null,
          default_card_id: nugget.defaultCardId ?? null,
        })
        .then(({ error }) => {
          if (error) console.error('[info_nuggets] upsert failed:', error.message);
        });
    },

    updateNugget: (id, nugget) => {
      set((s) => {
        const next = { ...s.nuggets };
        delete next[id];
        next[nugget.id] = nugget;
        return { nuggets: next };
      });
      (async () => {
        if (id !== nugget.id) {
          const { error: delErr } = await supabase.from('info_nuggets').delete().eq('id', id);
          if (delErr) console.error('[info_nuggets] delete old id failed:', delErr.message);
        }
        const { error: upsErr } = await supabase.from('info_nuggets').upsert({
          id: nugget.id,
          name: nugget.name,
          long_description: nugget.longDescription,
          image_url: nugget.imageUrl ?? null,
          default_card_id: nugget.defaultCardId ?? null,
        });
        if (upsErr) console.error('[info_nuggets] upsert failed:', upsErr.message);
      })();
    },

    removeNugget: (id) => {
      set((s) => {
        const next = { ...s.nuggets };
        delete next[id];
        return { nuggets: next };
      });
      supabase
        .from('info_nuggets')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('[info_nuggets] delete failed:', error.message);
        });
    },

    getNugget: (id) => get().nuggets[id],
    getAllNuggets: () => Object.values(get().nuggets),
    getCompleteNuggets: () => Object.values(get().nuggets).filter(n => !!n.defaultCardId),

    setDefaultCardId: (nuggetId, cardId) => {
      const nugget = get().nuggets[nuggetId];
      if (!nugget) return;
      const updated = { ...nugget, defaultCardId: cardId };
      set((s) => ({ nuggets: { ...s.nuggets, [nuggetId]: updated } }));
      supabase
        .from('info_nuggets')
        .update({ default_card_id: cardId })
        .eq('id', nuggetId)
        .then(({ error }) => {
          if (error) console.error('[info_nuggets] set default_card_id failed:', error.message);
        });
    },
  };
});
