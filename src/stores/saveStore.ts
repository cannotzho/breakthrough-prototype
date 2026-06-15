import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface EncounterSave {
  brokenShieldIndices: number[];
  playedNonRelevantCards: string[];
}

const DEFAULT_SAVE: EncounterSave = { brokenShieldIndices: [], playedNonRelevantCards: [] };

interface SaveState {
  encounterSaves: Record<string, EncounterSave>;
  updateEncounterSave: (encounterId: string, save: Partial<EncounterSave>) => void;
  getEncounterSave: (encounterId: string) => EncounterSave;
}

export const useSaveStore = create<SaveState>()(
  persist(
    (set, get) => ({
      encounterSaves: {},
      updateEncounterSave: (id, partial) =>
        set(s => ({
          encounterSaves: {
            ...s.encounterSaves,
            [id]: { ...get().getEncounterSave(id), ...partial },
          },
        })),
      getEncounterSave: (id) => get().encounterSaves[id] ?? { ...DEFAULT_SAVE },
    }),
    { name: 'breakthrough-saves' }
  )
);
