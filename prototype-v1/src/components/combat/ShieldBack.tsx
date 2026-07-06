import { motion, AnimatePresence } from 'framer-motion';
import { SHIELD_BREAK_SHAKE } from './cardColors';

export default function ShieldBack({ broken, loreText, hintText, isHint, compact }: {
  broken: boolean;
  loreText?: string;
  hintText?: string;
  isHint: boolean;
  compact?: boolean;
}) {
  return (
    <motion.div
      animate={{ opacity: broken ? 0.7 : 1 }}
      className={`rounded-xl border-2 flex flex-col items-center justify-center
        ${compact ? 'w-[6.5rem] h-[8.5rem] p-2' : 'w-44 h-60 p-4'}
        ${broken ? 'border-zinc-600 bg-zinc-800/40' : 'border-zinc-500 bg-zinc-800'}
      `}
    >
      <AnimatePresence mode="wait">
        {broken ? (
          <motion.div
            key="broken-content"
            initial={{ opacity: 0, scale: 1.15 }}
            animate={{ opacity: 1, scale: 1, x: SHIELD_BREAK_SHAKE }}
            exit={{ opacity: 0 }}
            transition={{
              x: { duration: 0.9, ease: 'easeOut' },
              opacity: { duration: 1.0 },
              scale: { type: 'spring', stiffness: 200, damping: 12 },
            }}
            className="text-center"
          >
            <div className={`text-zinc-500 mb-1 ${compact ? 'text-[10px]' : 'text-sm mb-2'}`}>{isHint ? 'HINT' : 'BROKEN'}</div>
            <p className={`text-zinc-400 leading-tight ${compact ? 'text-[10px] line-clamp-3' : 'text-sm'}`}>{hintText ?? loreText}</p>
          </motion.div>
        ) : (
          <motion.div
            key="intact-content"
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.7 } }}
          >
            <div className={`text-zinc-600 ${compact ? 'text-2xl' : 'text-5xl'}`}>?</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
