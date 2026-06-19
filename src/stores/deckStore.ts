import { create } from 'zustand';
import { DeckDefinition, DeckCardEntry } from '../combat/types';
import { supabase } from '../lib/supabaseClient';

interface DeckStore {
  decks: Record<string, DeckDefinition>;
  loading: boolean;
  error: string | null;
  addDeck: (deck: DeckDefinition) => void;
  updateDeck: (id: string, deck: DeckDefinition) => void;
  removeDeck: (id: string) => void;
  getDeck: (id: string) => DeckDefinition | undefined;
  getAllDecks: () => DeckDefinition[];
}

function toRow(deck: DeckDefinition) {
  return {
    id: deck.id,
    name: deck.name,
    description: deck.description,
    card_list: { cards: deck.cards } as { cards: DeckCardEntry[] },
  };
}

function fromRow(row: { id: string; name: string; description: string; card_list: unknown }): DeckDefinition {
  const list = row.card_list as { cards?: DeckCardEntry[] } | null;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    cards: list?.cards ?? [],
  };
}

export const useDeckStore = create<DeckStore>()((set, get) => {
  supabase
    .from('decks')
    .select('id, name, description, card_list')
    .then(({ data, error }) => {
      if (error) {
        console.error('[decks] fetch failed:', error.message);
        set({ loading: false, error: error.message });
        return;
      }
      const decks: Record<string, DeckDefinition> = {};
      for (const row of data ?? []) {
        decks[row.id] = fromRow(row);
      }
      set({ decks, loading: false });
    });

  return {
    decks: {},
    loading: true,
    error: null,

    addDeck: (deck) => {
      set((s) => ({ decks: { ...s.decks, [deck.id]: deck } }));
      supabase
        .from('decks')
        .upsert(toRow(deck))
        .then(({ error }) => {
          if (error) console.error('[decks] upsert failed:', error.message);
        });
    },

    updateDeck: (id, deck) => {
      set((s) => {
        const next = { ...s.decks };
        delete next[id];
        next[deck.id] = deck;
        return { decks: next };
      });
      (async () => {
        if (id !== deck.id) {
          const { error: delErr } = await supabase.from('decks').delete().eq('id', id);
          if (delErr) console.error('[decks] delete old id failed:', delErr.message);
        }
        const { error: upsErr } = await supabase.from('decks').upsert(toRow(deck));
        if (upsErr) console.error('[decks] upsert failed:', upsErr.message);
      })();
    },

    removeDeck: (id) => {
      set((s) => {
        const next = { ...s.decks };
        delete next[id];
        return { decks: next };
      });
      supabase
        .from('decks')
        .delete()
        .eq('id', id)
        .then(({ error }) => {
          if (error) console.error('[decks] delete failed:', error.message);
        });
    },

    getDeck: (id) => get().decks[id],
    getAllDecks: () => Object.values(get().decks),
  };
});
