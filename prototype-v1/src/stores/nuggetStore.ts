import { create } from 'zustand';
import { InfoNugget } from '../combat/types';
import { supabase } from '../lib/supabaseClient';
import { createSyncedStore } from './createSyncedStore';

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
  const synced = createSyncedStore<InfoNugget>(set, get, {
    table: 'info_nuggets',
    select: '*',
    itemsKey: 'nuggets',
    logPrefix: 'info_nuggets',
    toRow: (nugget) => ({
      id: nugget.id,
      name: nugget.name,
      long_description: nugget.longDescription,
      image_url: nugget.imageUrl ?? null,
      default_card_id: nugget.defaultCardId ?? null,
    }),
    fromRow: (row) => ({
      id: (row as { id: string }).id,
      name: (row as { name: string }).name,
      longDescription: (row as { long_description: string }).long_description,
      imageUrl: (row as { image_url?: string }).image_url ?? undefined,
      defaultCardId: (row as { default_card_id?: string }).default_card_id ?? undefined,
    }),
  });

  return {
    ...synced,
    addNugget: synced.addItem,
    updateNugget: synced.updateItem,
    removeNugget: synced.removeItem,
    getNugget: synced.getItem,
    getAllNuggets: synced.getAllItems,
    getCompleteNuggets: () => Object.values(get().nuggets).filter(n => !!n.defaultCardId),
    setDefaultCardId: (nuggetId: string, cardId: string) => {
      const nugget = get().nuggets[nuggetId];
      if (!nugget) return;
      const updated = { ...nugget, defaultCardId: cardId };
      set((s: NuggetStore) => ({ nuggets: { ...s.nuggets, [nuggetId]: updated } }));
      supabase
        .from('info_nuggets')
        .update({ default_card_id: cardId })
        .eq('id', nuggetId)
        .then(({ error }) => {
          if (error) console.error('[info_nuggets] set default_card_id failed:', error.message);
        });
    },
  } as NuggetStore;
});
