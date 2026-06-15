import { motion } from 'framer-motion';

interface PatienceDisplayProps {
  patience: number;
  maxPatience: number;
  lieCounter: number;
  lieThreshold?: number;
}

export default function PatienceDisplay({
  patience,
  maxPatience,
  lieCounter,
  lieThreshold,
}: PatienceDisplayProps) {
  const patienceRatio = Math.max(0, patience) / maxPatience;

  return (
    <div className="flex items-center gap-4 justify-center">
      {/* Patience */}
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 text-xs font-semibold tracking-[0.15em] uppercase">
          Patience
        </span>
        <div className="w-28 h-3 bg-zinc-800/60 rounded-full border border-zinc-700/50 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={false}
            animate={{
              width: `${patienceRatio * 100}%`,
              backgroundColor: patienceRatio > 0.5
                ? '#2dd4bf'
                : patienceRatio > 0.25
                  ? '#f59e0b'
                  : '#ef4444',
            }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>
        <motion.span
          key={patience}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          className={`text-sm font-bold tabular-nums ${
            patienceRatio > 0.5 ? 'text-teal-400' : patienceRatio > 0.25 ? 'text-amber-400' : 'text-red-400'
          }`}
        >
          {patience}
        </motion.span>
      </div>

      {/* Lie counter */}
      {lieThreshold !== undefined && lieThreshold > 0 && (
        <div className="flex items-center gap-1.5">
          <span className="text-zinc-500 text-xs font-semibold tracking-[0.15em] uppercase">
            Lies
          </span>
          <motion.span
            key={lieCounter}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className={`text-sm font-bold tabular-nums ${
              lieCounter > 0 ? 'text-red-400' : 'text-zinc-500'
            }`}
          >
            {lieCounter}/{lieThreshold}
          </motion.span>
        </div>
      )}
    </div>
  );
}
