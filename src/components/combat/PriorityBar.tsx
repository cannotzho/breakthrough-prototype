import { motion } from 'framer-motion';

interface PriorityBarProps {
  priority: number;
  maxPriority: number;
}

export default function PriorityBar({ priority, maxPriority }: PriorityBarProps) {
  const totalSegments = maxPriority;
  const absPriority = Math.abs(priority);
  const isNegative = priority < 0;
  const filledCount = Math.min(absPriority, totalSegments);

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="flex items-center gap-3">
        {/* Label */}
        <span className="text-zinc-500 text-xs font-semibold tracking-[0.2em] uppercase shrink-0">
          Priority
        </span>

        {/* Bar */}
        <div className="flex-1 flex items-center gap-1">
          {Array.from({ length: totalSegments }, (_, i) => {
            const segmentIdx = i;
            const isFilled = segmentIdx < filledCount;

            return (
              <motion.div
                key={segmentIdx}
                className="flex-1 h-6 rounded-sm border"
                initial={false}
                animate={{
                  backgroundColor: isFilled
                    ? isNegative ? '#dc2626' : '#f5c842'
                    : 'rgba(39, 39, 42, 0.5)',
                  borderColor: isFilled
                    ? isNegative ? '#991b1b' : '#b8941f'
                    : 'rgba(63, 63, 70, 0.6)',
                  boxShadow: isFilled
                    ? isNegative
                      ? '0 0 8px rgba(220, 38, 38, 0.3)'
                      : '0 0 8px rgba(245, 200, 66, 0.25)'
                    : 'none',
                }}
                transition={{
                  duration: 0.2,
                  delay: isFilled
                    ? segmentIdx * 0.06
                    : (totalSegments - 1 - segmentIdx) * 0.06,
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
          className={`text-2xl font-black tabular-nums min-w-[2.5rem] text-right ${
            isNegative ? 'text-red-400' : priority > 0 ? 'text-amber-400' : 'text-zinc-500'
          }`}
        >
          {priority}
        </motion.span>
      </div>

      {/* Negative indicator */}
      {isNegative && (
        <div className="flex items-center gap-1 mt-1 ml-[4.5rem]">
          {Array.from({ length: totalSegments }, (_, i) => {
            const isFilled = i < filledCount;
            return (
              <motion.div
                key={`neg-${i}`}
                className="flex-1 h-1.5 rounded-full"
                initial={false}
                animate={{
                  backgroundColor: isFilled
                    ? 'rgba(220, 38, 38, 0.6)'
                    : 'rgba(39, 39, 42, 0.3)',
                }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
