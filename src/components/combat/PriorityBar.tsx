import { motion } from 'framer-motion';

interface PriorityBarProps {
  priority: number;
  maxPriority: number;
}

export default function PriorityBar({ priority, maxPriority }: PriorityBarProps) {
  const totalPerSide = maxPriority;
  const absPriority = Math.abs(priority);
  const isNegative = priority < 0;
  const isPositive = priority > 0;

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      <div className="flex items-center gap-4">
        <span className="text-zinc-500 text-sm font-semibold tracking-[0.2em] uppercase shrink-0">
          Priority
        </span>

        <div className="flex-1 flex items-center gap-1">
          {/* Negative side (left) — pips fill leftward from center */}
          {Array.from({ length: totalPerSide }, (_, i) => {
            const distFromCenter = totalPerSide - i;
            const isFilled = isNegative && distFromCenter <= absPriority;

            return (
              <motion.div
                key={`neg-${i}`}
                className="flex-1 h-10 rounded-sm border"
                initial={false}
                animate={{
                  backgroundColor: isFilled
                    ? '#dc2626'
                    : 'rgba(39, 39, 42, 0.5)',
                  borderColor: isFilled
                    ? '#991b1b'
                    : 'rgba(63, 63, 70, 0.6)',
                  boxShadow: isFilled
                    ? '0 0 8px rgba(220, 38, 38, 0.3)'
                    : 'none',
                }}
                transition={{
                  duration: 0.2,
                  delay: isFilled
                    ? (absPriority - distFromCenter) * 0.06
                    : (distFromCenter - 1) * 0.06,
                }}
              />
            );
          })}

          {/* Center zero marker */}
          <div className="w-1.5 h-14 rounded-full bg-zinc-500 shrink-0 mx-1" />

          {/* Positive side (right) — pips fill rightward from center */}
          {Array.from({ length: totalPerSide }, (_, i) => {
            const distFromCenter = i + 1;
            const isFilled = isPositive && distFromCenter <= absPriority;

            return (
              <motion.div
                key={`pos-${i}`}
                className="flex-1 h-10 rounded-sm border"
                initial={false}
                animate={{
                  backgroundColor: isFilled
                    ? '#f5c842'
                    : 'rgba(39, 39, 42, 0.5)',
                  borderColor: isFilled
                    ? '#b8941f'
                    : 'rgba(63, 63, 70, 0.6)',
                  boxShadow: isFilled
                    ? '0 0 8px rgba(245, 200, 66, 0.25)'
                    : 'none',
                }}
                transition={{
                  duration: 0.2,
                  delay: isFilled
                    ? (distFromCenter - 1) * 0.06
                    : (totalPerSide - distFromCenter) * 0.06,
                }}
              />
            );
          })}
        </div>

        {/* Number */}
        <motion.span
          key={priority}
          initial={{ scale: 1.3, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          className={`text-4xl font-black tabular-nums min-w-[3.5rem] text-right ${
            isNegative ? 'text-red-400' : isPositive ? 'text-amber-400' : 'text-zinc-500'
          }`}
        >
          {priority > 0 ? `+${priority}` : priority}
        </motion.span>
      </div>
    </div>
  );
}
