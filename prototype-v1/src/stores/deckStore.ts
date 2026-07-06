import { create } from 'zustand';
import { DeckDefinition, DeckCardEntry } from '../combat/types';
import { createSyncedStore } from './createSyncedStore';

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

export const useDeckStore = create<DeckStore>()((set, get) => {
  const synced = createSyncedStore<DeckDefinition>(set, get, {
    table: 'decks',
    select: 'id, name, description, card_list',
    itemsKey: 'decks',
    logPrefix: 'decks',
    toRow: (deck) => ({
      id: deck.id,
      name: deck.name,
      description: deck.description,
      card_list: { cards: deck.cards } as { cards: DeckCardEntry[] },
    }),
    fromRow: (row) => {
      const r = row as { id: string; name: string; description: string; card_list: unknown };
      const list = r.card_list as { cards?: DeckCardEntry[] } | null;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        cards: list?.cards ?? [],
      };
    },
  });

  return {
    ...synced,
    addDeck: synced.addItem,
    updateDeck: synced.updateItem,
    removeDeck: synced.removeItem,
    getDeck: synced.getItem,
    getAllDecks: synced.getAllItems,
  } as DeckStore;
});
