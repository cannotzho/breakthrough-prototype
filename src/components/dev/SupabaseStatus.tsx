import { useState } from 'react';

interface Props {
  loading: boolean;
  error: string | null;
  table: string;
  importFromLocalStorage: () => Promise<number>;
}

export default function SupabaseStatus({ loading, error, table, importFromLocalStorage }: Props) {
  const [importState, setImportState] = useState<'idle' | 'importing' | 'done' | 'error'>('idle');
  const [importCount, setImportCount] = useState(0);
  const [importError, setImportError] = useState('');

  const handleImport = async () => {
    setImportState('importing');
    try {
      const count = await importFromLocalStorage();
      setImportCount(count);
      setImportState('done');
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Unknown error');
      setImportState('error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-400 py-1">
        <span className="inline-block w-3 h-3 border-2 border-zinc-500 border-t-blue-400 rounded-full animate-spin" />
        Loading from Supabase...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-400 bg-red-950/40 border border-red-800 rounded px-2 py-1.5">
        Supabase error: {error}
      </div>
    );
  }

  const lsKey = table === 'cards' ? 'btdev-cards' : 'btdev-encounters';
  const hasLocalData = !!localStorage.getItem(lsKey);

  if (!hasLocalData || importState === 'done') {
    if (importState === 'done') {
      return (
        <div className="text-xs text-green-400 bg-green-950/40 border border-green-800 rounded px-2 py-1.5">
          Imported {importCount} {table} from localStorage.
        </div>
      );
    }
    return null;
  }

  return (
    <div className="text-xs bg-zinc-800/60 border border-zinc-700 rounded px-2 py-1.5 flex items-center gap-2">
      <span className="text-zinc-400">
        Found local {table} data in browser storage.
      </span>
      {importState === 'idle' && (
        <button
          onClick={handleImport}
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
        >
          Import to Supabase
        </button>
      )}
      {importState === 'importing' && (
        <span className="text-zinc-400">Importing...</span>
      )}
      {importState === 'error' && (
        <span className="text-red-400">Failed: {importError}</span>
      )}
    </div>
  );
}
