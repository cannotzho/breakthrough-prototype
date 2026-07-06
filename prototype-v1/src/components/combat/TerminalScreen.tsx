import { motion, AnimatePresence } from 'framer-motion';
import { CombatState } from '../../combat/types';

interface TerminalScreenProps {
  phase: CombatState['phase'];
  onExit: () => void;
}

export default function TerminalScreen({ phase, onExit }: TerminalScreenProps) {
  const isTerminal = phase === 'WIN' || phase === 'LOSE';

  return (
    <AnimatePresence>
      {isTerminal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
        >
          <div className="text-center">
            <div className={`text-8xl font-bold tracking-widest mb-8 ${phase === 'WIN' ? 'text-green-400' : 'text-red-500'}`}>
              {phase === 'WIN' ? 'BREAKTHROUGH' : 'FAILED'}
            </div>
            <button
              onClick={onExit}
              className="px-12 py-4 border-2 border-white text-white hover:bg-white hover:text-zinc-950 uppercase tracking-widest text-lg transition-colors rounded-lg"
            >
              Exit
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
