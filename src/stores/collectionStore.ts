import { create } from 'zustand';
import { CardDefinition } from '../combat/types';
import { supabase } from '../lib/supabaseClient';

interface DevCardStore {
  cards: Record<string, CardDefinition>;
  loading: boolean;
  error: string | null;
  addCard: (card: CardDefinition) => void;
  updateCard: (id: string, card: CardDefinition) => void;
  removeCard: (id: string) => void;
  getCard: (id: string) => CardDefinition | undefined;
  getAllCards: () => CardDefinition[];
  getCardsByNugget: (nuggetId: string) => CardDefinition[];
  importFromLocalStorage: () => Promise<number>;
}

export const useDevCardStore = create<DevCardStore>()((set, get) => {
  supabase
    .from('cards')
    .select('id, data, nugget_id')
    .then(({ data, error }) => {
      if (error) {
        console.error('[cards] fetch failed:', error.message);
        set({ loading: false, error: error.message });
        return;
      }
      const cards: Record<string, CardDefinition> = {};
      for (const row of data ?? []) {
        const card = row.data as CardDefinition;
        if (row.nugget_id) card.nuggetId = row.nugget_id;
        cards[row.id] = card;
      }
      set({ cards, loading: false });
    });

  return {
    cards: {},
    loading: true,
    error: null,

    addCard: (card) => {
      set((s) => ({ cards: { ...s.cards, [card.id]: card } }));
      supabase
        .from('cards')
        .upsert({ id: card.id, data: card, nugget_id: card.nuggetId ?? null })
        .then(({ error }) => {
          if (error) console.error('[cards] upsert failed:', error.message);
        });
    },

    updateCard: (id, card) => {
      set((s) => {
        const next = { ...s.cards };
        delete next[id];
        next[card.id] = card;
        return { cards: next };
      });
      (async () => {
        if (id !== card.id) {
          const { error: delErr } = await supabase.from('cards').delete().eq('id', id);
          if (delErr) console.error('[cards] delete old id failed:', delErr.message);
        }
        const { error: upsErr } = await supabase
          .from('cards')
          .upsert({ id: card.id, data: card, nugget_id: card.nuggetId ?? null });
        if (upsErr) console.error('[cards] upsert failed:', upsErr.message);
      })();
    },

    removeCard: (id) => {
      set((s) => {
        const next = { ...s.cards };
        delete next[id];
        return { cards: next };
      });
      supabase
        .from('cards')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('[cards] delete failed:', error.message);
        });
    },

    getCard: (id) => get().cards[id],
    getAllCards: () => Object.values(get().cards),

    getCardsByNugget: (nuggetId) =>
      Object.values(get().cards).filter(c => c.nuggetId === nuggetId),

    importFromLocalStorage: async () => {
      const raw = localStorage.getItem('btdev-cards');
      if (!raw) return 0;
      try {
        const parsed = JSON.parse(raw) as { state?: { cards?: Record<string, CardDefinition> } };
        const cards = parsed.state?.cards ?? {};
        const entries = Object.values(cards);
        if (entries.length === 0) return 0;

        const rows = entries.map((c) => ({ id: c.id, data: c, nugget_id: c.nuggetId ?? null }));
        const { error } = await supabase.from('cards').upsert(rows);
        if (error) throw new Error(error.message);

        const merged = { ...get().cards };
        for (const c of entries) merged[c.id] = c;
        set({ cards: merged });
        return entries.length;
      } catch (e) {
        console.error('[cards] localStorage import failed:', e);
        throw e;
      }
    },
  };
});
