import { create } from 'zustand';
import { CardDefinition } from '../combat/types';
import { createSyncedStore } from './createSyncedStore';

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
  const synced = createSyncedStore<CardDefinition>(set, get, {
    table: 'cards',
    select: 'id, data, nugget_id',
    itemsKey: 'cards',
    logPrefix: 'cards',
    toRow: (card) => ({ id: card.id, data: card, nugget_id: card.nuggetId ?? null }),
    fromRow: (row) => {
      const card = (row as { data: CardDefinition }).data;
      if ((row as { nugget_id?: string }).nugget_id) card.nuggetId = (row as { nugget_id: string }).nugget_id;
      return card;
    },
    importConfig: {
      localStorageKey: 'btdev-cards',
      parsePath: 'cards',
    },
  });

  return {
    ...synced,
    addCard: synced.addItem,
    updateCard: synced.updateItem,
    removeCard: synced.removeItem,
    getCard: synced.getItem,
    getAllCards: synced.getAllItems,
    getCardsByNugget: (nuggetId: string) =>
      Object.values(get().cards).filter((c: CardDefinition) => c.nuggetId === nuggetId),
  } as DevCardStore;
});
