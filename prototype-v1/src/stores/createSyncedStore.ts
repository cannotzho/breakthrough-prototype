import { supabase } from '../lib/supabaseClient';

export interface SyncedStoreConfig<T extends { id: string }> {
  table: string;
  select: string;
  itemsKey: string;
  toRow: (item: T) => Record<string, unknown>;
  fromRow: (row: Record<string, unknown>) => T;
  logPrefix: string;
  importConfig?: {
    localStorageKey: string;
    parsePath: string;
    normalizeItem?: (item: T) => T;
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

export function createSyncedStore<T extends { id: string }>(
  set: (...args: any[]) => void,
  get: () => any,
  config: SyncedStoreConfig<T>,
) {
  const { table, select, itemsKey: k, toRow, fromRow, logPrefix } = config;

  supabase.from(table).select(select).then(({ data, error }) => {
    if (error) {
      console.error(`[${logPrefix}] fetch failed:`, error.message);
      set({ loading: false, error: error.message });
      return;
    }
    const items: Record<string, T> = {};
    for (const row of data ?? []) items[(row as any).id] = fromRow(row as any);
    set({ [k]: items, loading: false });
  });

  const result: Record<string, any> = {
    [k]: {} as Record<string, T>,
    loading: true,
    error: null,

    addItem(item: T) {
      set((s: any) => ({ [k]: { ...s[k], [item.id]: item } }));
      supabase.from(table).upsert(toRow(item) as any).then(({ error }: any) => {
        if (error) console.error(`[${logPrefix}] upsert failed:`, error.message);
      });
    },

    updateItem(id: string, item: T) {
      set((s: any) => {
        const next = { ...s[k] };
        delete next[id];
        next[item.id] = item;
        return { [k]: next };
      });
      (async () => {
        if (id !== item.id) {
          const { error: delErr } = await supabase.from(table).delete().eq('id', id);
          if (delErr) console.error(`[${logPrefix}] delete old id failed:`, delErr.message);
        }
        const { error: upsErr } = await supabase.from(table).upsert(toRow(item) as any);
        if (upsErr) console.error(`[${logPrefix}] upsert failed:`, upsErr.message);
      })();
    },

    removeItem(id: string) {
      set((s: any) => {
        const next = { ...s[k] };
        delete next[id];
        return { [k]: next };
      });
      supabase.from(table).delete().eq('id', id).then(({ error }: any) => {
        if (error) console.error(`[${logPrefix}] delete failed:`, error.message);
      });
    },

    getItem: (id: string): T | undefined => get()[k][id],
    getAllItems: (): T[] => Object.values(get()[k]),
  };

  if (config.importConfig) {
    const { localStorageKey, parsePath, normalizeItem } = config.importConfig;
    result.importFromLocalStorage = async (): Promise<number> => {
      const raw = localStorage.getItem(localStorageKey);
      if (!raw) return 0;
      try {
        const parsed = JSON.parse(raw);
        const items: Record<string, T> = parsed?.state?.[parsePath] ?? {};
        const entries = Object.values(items);
        if (entries.length === 0) return 0;
        const rows = entries.map(e => toRow(e));
        const { error } = await supabase.from(table).upsert(rows as any);
        if (error) throw new Error(error.message);
        const merged = { ...get()[k] };
        for (const e of entries) merged[e.id] = normalizeItem ? normalizeItem(e) : e;
        set({ [k]: merged });
        return entries.length;
      } catch (e) {
        console.error(`[${logPrefix}] localStorage import failed:`, e);
        throw e;
      }
    };
  }

  return result;
}
