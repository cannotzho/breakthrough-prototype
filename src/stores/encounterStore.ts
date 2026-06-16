import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EncounterConfig } from '../combat/types';

interface DevEncounterStore {
  encounters: Record<string, EncounterConfig>;
  addEncounter: (encounter: EncounterConfig) => void;
  updateEncounter: (id: string, encounter: EncounterConfig) => void;
  removeEncounter: (id: string) => void;
  getEncounter: (id: string) => EncounterConfig | undefined;
  getAllEncounters: () => EncounterConfig[];
}

export const useDevEncounterStore = create<DevEncounterStore>()(
  persist(
    (set, get) => ({
      encounters: {},
      addEncounter: (encounter) =>
        set((s) => ({ encounters: { ...s.encounters, [encounter.id]: encounter } })),
      updateEncounter: (id, encounter) =>
        set((s) => {
          const next = { ...s.encounters };
          delete next[id];
          next[encounter.id] = encounter;
          return { encounters: next };
        }),
      removeEncounter: (id) =>
        set((s) => {
          const next = { ...s.encounters };
          delete next[id];
          return { encounters: next };
        }),
      getEncounter: (id) => get().encounters[id],
      getAllEncounters: () => Object.values(get().encounters),
    }),
    { name: 'btdev-encounters' }
  )
);
