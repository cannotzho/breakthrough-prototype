import { motion, AnimatePresence } from 'framer-motion';
import { CardInstance } from '../../combat/types';
import CardView from './CardView';

interface DeckRevealModalProps {
  visible: boolean;
  cards: CardInstance[] | null;
  onDismiss: () => void;
}

export default function DeckRevealModal({ visible, cards, onDismiss }: DeckRevealModalProps) {
  return (
    <AnimatePresence>
      {visible && cards && cards.length > 0 && (
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
            className="bg-zinc-900 border border-zinc-600 rounded-xl p-8 max-w-2xl w-full mx-4 text-center"
          >
            <div className="text-sm uppercase tracking-widest text-green-400 mb-4">
              NPC Deck — Top {cards.length} Card{cards.length !== 1 ? 's' : ''}
            </div>
            <div className="flex justify-center gap-3 flex-wrap mb-6">
              {cards.map((card, i) => (
                <motion.div
                  key={card.instanceId}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.15 }}
                >
                  <CardView card={card} label={`#${i + 1}`} />
                </motion.div>
              ))}
            </div>
            <button
              onClick={onDismiss}
              className="px-10 py-3 border border-white text-white hover:bg-white hover:text-zinc-950 text-base uppercase tracking-widest rounded-lg transition-colors"
            >
              Continue
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
