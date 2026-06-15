// TODO(#120): wire into game loop
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { CardDefinition } from '../combat/types';

interface CollectionState {
  skillCards: CardDefinition[];
  infoCards: CardDefinition[];
  discoveredCardIds: string[];
  addSkillCard: (card: CardDefinition) => void;
  addInfoCard: (card: CardDefinition) => void;
  markDiscovered: (cardId: string) => void;
}

export const useCollectionStore = create<CollectionState>()(
  persist(
    (set) => ({
      skillCards: [],
      infoCards: [],
      discoveredCardIds: [],
      addSkillCard: (card) => set(s => ({ skillCards: [...s.skillCards, card] })),
      addInfoCard: (card) => set(s => ({ infoCards: [...s.infoCards, card] })),
      markDiscovered: (cardId) =>
        set(s => ({
          discoveredCardIds: s.discoveredCardIds.includes(cardId)
            ? s.discoveredCardIds
            : [...s.discoveredCardIds, cardId],
        })),
    }),
    { name: 'breakthrough-collection' }
  )
);
