import { motion, AnimatePresence } from 'framer-motion';
import { CardInstance } from '../../combat/types';
import { COLOR_BORDER } from './cardColors';

interface PileViewerModalProps {
  viewingPile: 'draw' | 'discard' | null;
  onClose: () => void;
  playerDeck: CardInstance[];
  playerDiscard: CardInstance[];
}

export default function PileViewerModal({ viewingPile, onClose, playerDeck, playerDiscard }: PileViewerModalProps) {
  return (
    <AnimatePresence>
      {viewingPile && (
        <motion.div
          key="pile-viewer-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-xl p-8 max-w-2xl w-full mx-4 max-h-[70vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-bold uppercase tracking-widest text-zinc-200">
                {viewingPile === 'draw' ? 'Draw Pile' : 'Discard Pile'}
                <span className="ml-2 text-zinc-500 font-normal">
                  ({viewingPile === 'draw' ? playerDeck.length : playerDiscard.length} cards)
                </span>
              </h2>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-white transition-colors text-2xl leading-none"
              >
                ✕
              </button>
            </div>

            {viewingPile === 'draw' && (
              <p className="text-sm text-zinc-500 italic mb-4">Sorted alphabetically — draw order is hidden.</p>
            )}

            <div className="overflow-y-auto flex-1 -mr-2 pr-2">
              {(() => {
                const cards = viewingPile === 'draw'
                  ? [...playerDeck].sort((a, b) => a.definition.name.localeCompare(b.definition.name))
                  : [...playerDiscard].reverse();
                if (cards.length === 0) {
                  return <p className="text-zinc-600 text-base text-center py-8">No cards.</p>;
                }
                return cards.map((card, i) => {
                  const def = card.definition;
                  const border = COLOR_BORDER[def.color] ?? 'border-zinc-500';
                  return (
                    <div
                      key={card.instanceId + '-' + i}
                      className={`flex items-center gap-4 px-4 py-3 rounded-lg border ${border} bg-zinc-800/60 mb-2`}
                    >
                      <span className="text-white text-base font-semibold min-w-0 flex-1 truncate">{def.name}</span>
                      <span className="text-zinc-400 text-sm shrink-0">{def.supertype}</span>
                      {def.keywords.length > 0 && (
                        <span className="text-zinc-500 text-xs shrink-0">{def.keywords.join(', ')}</span>
                      )}
                      <span className="text-zinc-300 text-sm font-bold shrink-0 w-8 text-right">{def.cost}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
