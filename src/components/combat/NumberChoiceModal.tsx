import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface NumberChoiceModalProps {
  visible: boolean;
  range: { min: number; max: number } | null;
  onChoose: (value: number) => void;
}

export default function NumberChoiceModal({ visible, range, onChoose }: NumberChoiceModalProps) {
  const [selected, setSelected] = useState<number | null>(null);

  if (!range) return null;

  const numbers = Array.from({ length: range.max - range.min + 1 }, (_, i) => range.min + i);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.85, opacity: 0 }}
            className="bg-zinc-900 border border-zinc-600 rounded-xl p-8 max-w-lg w-full mx-4 text-center"
          >
            <div className="text-sm uppercase tracking-widest text-green-400 mb-4">
              Choose a Number
            </div>
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {numbers.map(n => (
                <button
                  key={n}
                  onClick={() => setSelected(n)}
                  className={`w-10 h-10 rounded-lg border text-lg font-bold transition-colors ${
                    selected === n
                      ? 'bg-green-600 border-green-400 text-white'
                      : 'border-zinc-600 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={() => { if (selected !== null) onChoose(selected); }}
              disabled={selected === null}
              className="px-10 py-3 border border-green-500 text-green-400 hover:bg-green-600 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-base uppercase tracking-widest rounded-lg transition-colors"
            >
              Confirm
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
