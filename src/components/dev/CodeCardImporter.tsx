import { useState, useMemo } from 'react';
import { CARD_DEF_BLOCKS } from '../../data/devCards';
import { useDevCardStore } from '../../stores/collectionStore';
import { BTN } from './CardEditorForm';

export default function CodeCardImporter() {
  const { getAllCards, addCard } = useDevCardStore();
  const [importedCounts, setImportedCounts] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const existingIds = useMemo(() => {
    const set = new Set<string>();
    for (const c of getAllCards()) set.add(c.id);
    return set;
  }, [getAllCards]);

  const blocks = useMemo(() =>
    Object.entries(CARD_DEF_BLOCKS).map(([name, cards]) => {
      const newCards = cards.filter(c => !existingIds.has(c.id));
      const existingCount = cards.length - newCards.length;
      return { name, cards, newCards, existingCount };
    }),
  [existingIds]);

  if (blocks.length === 0) return null;

  const handleImport = (blockName: string, cards: typeof blocks[0]['newCards']) => {
    let count = 0;
    for (const card of cards) {
      addCard(card);
      count++;
    }
    setImportedCounts(prev => ({ ...prev, [blockName]: count }));
  };

  return (
    <div className="border border-indigo-700/50 rounded p-3 bg-indigo-950/20">
      <div className="text-xs text-indigo-400 uppercase tracking-widest mb-2">
        Import from Code (devCards.ts)
      </div>
      <div className="flex flex-col gap-2">
        {blocks.map(({ name, cards, newCards, existingCount }) => {
          const justImported = importedCounts[name];
          const isExpanded = expanded === name;
          return (
            <div key={name} className="border border-zinc-700 rounded p-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => setExpanded(isExpanded ? null : name)}
                  className="text-left flex-1"
                >
                  <span className="text-sm text-zinc-200 font-medium">{name}</span>
                  <span className="text-xs text-zinc-500 ml-2">
                    {cards.length} card{cards.length !== 1 ? 's' : ''}
                    {existingCount > 0 && ` (${existingCount} already imported)`}
                  </span>
                </button>
                {justImported ? (
                  <span className="text-xs text-green-400">Imported {justImported} cards</span>
                ) : newCards.length > 0 ? (
                  <button
                    onClick={() => handleImport(name, newCards)}
                    className={`${BTN} border-indigo-500 text-indigo-400 hover:bg-indigo-900`}
                  >
                    Import {newCards.length} new
                  </button>
                ) : (
                  <span className="text-xs text-zinc-500">All imported</span>
                )}
              </div>
              {isExpanded && (
                <div className="mt-2 max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <tbody>
                      {cards.map(c => {
                        const exists = existingIds.has(c.id);
                        return (
                          <tr key={c.id} className={exists ? 'text-zinc-600' : 'text-zinc-300'}>
                            <td className="py-0.5 pr-2">{c.name}</td>
                            <td className="py-0.5 pr-2 text-zinc-500">{c.cost}</td>
                            <td className="py-0.5 pr-2 text-zinc-500">{c.color}</td>
                            <td className="py-0.5">
                              {exists ? (
                                <span className="text-zinc-600">exists</span>
                              ) : justImported ? (
                                <span className="text-green-500">imported</span>
                              ) : (
                                <span className="text-indigo-400">new</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
