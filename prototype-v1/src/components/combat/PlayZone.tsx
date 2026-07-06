import { motion, AnimatePresence } from 'framer-motion';

export default function PlayZone({
  isHovered,
  visible,
  zoneRef,
}: {
  isHovered: boolean;
  visible: boolean;
  zoneRef: { current: HTMLDivElement | null };
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="play-zone-outer"
          ref={zoneRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center transition-all duration-150 rounded-xl"
          style={{
            border: isHovered
              ? '2px solid rgba(251,191,36,0.8)'
              : '1px dashed rgba(161,161,170,0.18)',
            background: isHovered
              ? 'radial-gradient(ellipse, rgba(248,200,80,0.08) 0%, transparent 70%)'
              : 'transparent',
          }}
        >
          <AnimatePresence>
            {isHovered && (
              <motion.span
                key="play-label"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-amber-400 text-xl font-semibold tracking-widest uppercase"
              >
                Play
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
