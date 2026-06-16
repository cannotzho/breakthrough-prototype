import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CardDefinition } from '../combat/types';

interface DevCardStore {
  cards: Record<string, CardDefinition>;
  addCard: (card: CardDefinition) => void;
  updateCard: (id: string, card: CardDefinition) => void;
  removeCard: (id: string) => void;
  getCard: (id: string) => CardDefinition | undefined;
  getAllCards: () => CardDefinition[];
}

export const useDevCardStore = create<DevCardStore>()(
  persist(
    (set, get) => ({
      cards: {},
      addCard: (card) =>
        set((s) => ({ cards: { ...s.cards, [card.id]: card } })),
      updateCard: (id, card) =>
        set((s) => {
          const next = { ...s.cards };
          delete next[id];
          next[card.id] = card;
          return { cards: next };
        }),
      removeCard: (id) =>
        set((s) => {
          const next = { ...s.cards };
          delete next[id];
          return { cards: next };
        }),
      getCard: (id) => get().cards[id],
      getAllCards: () => Object.values(get().cards),
    }),
    { name: 'btdev-cards' }
  )
);
