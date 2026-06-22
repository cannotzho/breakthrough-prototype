import { create } from 'zustand';
import { EncounterConfig } from '../combat/types';
import { createSyncedStore } from './createSyncedStore';

interface DevEncounterStore {
  encounters: Record<string, EncounterConfig>;
  loading: boolean;
  error: string | null;
  addEncounter: (encounter: EncounterConfig) => void;
  updateEncounter: (id: string, encounter: EncounterConfig) => void;
  removeEncounter: (id: string) => void;
  getEncounter: (id: string) => EncounterConfig | undefined;
  getAllEncounters: () => EncounterConfig[];
  importFromLocalStorage: () => Promise<number>;
}

function toStorable(enc: EncounterConfig) {
  const { nuggetOverrides: _, ...rest } = enc;
  return rest;
}

export const useDevEncounterStore = create<DevEncounterStore>()((set, get) => {
  const synced = createSyncedStore<EncounterConfig>(set, get, {
    table: 'encounters',
    select: 'id, data',
    itemsKey: 'encounters',
    logPrefix: 'encounters',
    toRow: (enc) => ({ id: enc.id, data: toStorable(enc) }),
    fromRow: (row) => {
      const enc = (row as { data: EncounterConfig }).data;
      if (!enc.nuggetOverrides) enc.nuggetOverrides = [];
      return enc;
    },
    importConfig: {
      localStorageKey: 'btdev-encounters',
      parsePath: 'encounters',
      normalizeItem: (enc) => {
        if (!enc.nuggetOverrides) enc.nuggetOverrides = [];
        return enc;
      },
    },
  });

  return {
    ...synced,
    addEncounter: synced.addItem,
    updateEncounter: synced.updateItem,
    removeEncounter: synced.removeItem,
    getEncounter: synced.getItem,
    getAllEncounters: synced.getAllItems,
  } as DevEncounterStore;
});
