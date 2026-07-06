import { motion, AnimatePresence } from 'framer-motion';

interface DiscoveryModalProps {
  pendingDiscovery: { nuggetName: string; effectDescription: string } | null;
  onDismiss: () => void;
}

export default function DiscoveryModal({ pendingDiscovery, onDismiss }: DiscoveryModalProps) {
  return (
    <AnimatePresence>
      {pendingDiscovery && (
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
            className="bg-zinc-900 border border-amber-600 rounded-xl p-10 max-w-md w-full mx-4 text-center"
          >
            <div className="text-sm uppercase tracking-widest text-amber-500 mb-3">
              Information Discovered
            </div>
            <div className="text-lg font-semibold text-amber-300 mb-2">
              {pendingDiscovery.nuggetName}
            </div>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.9 }}
              className="text-white text-xl leading-relaxed mb-8"
            >
              {pendingDiscovery.effectDescription}
            </motion.p>
            <button
              onClick={onDismiss}
              className="px-10 py-3 border border-amber-500 text-amber-400 hover:bg-amber-900 text-base uppercase tracking-widest rounded-lg transition-colors"
            >
              Continue
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
