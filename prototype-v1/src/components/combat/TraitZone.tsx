import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CombatState } from '../../combat/types';

function TraitIcon({ trait, compact }: { trait: CombatState['config']['traits'][0]; compact?: boolean }) {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <span
      className="relative cursor-help"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <motion.span
        key={trait.discovered ? 'discovered' : 'hidden'}
        initial={{ rotateY: 90 }}
        animate={{ rotateY: 0 }}
        className={`inline-flex items-center justify-center rounded-full border-2 font-bold
          ${compact ? 'w-7 h-7 text-xs' : 'w-12 h-12 text-base'}
          ${trait.discovered
            ? 'border-amber-500 bg-amber-950 text-amber-400'
            : 'border-zinc-600 bg-zinc-800 text-zinc-500'}`}
      >
        {trait.discovered ? trait.name.charAt(0).toUpperCase() : '?'}
      </motion.span>
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl text-sm text-zinc-200 leading-relaxed pointer-events-none"
          >
            {trait.discovered ? (
              <>
                <span className="font-semibold text-amber-400">{trait.name}</span>
                <p className="mt-0.5">{trait.description}</p>
              </>
            ) : (
              <span className="italic text-zinc-400">Unknown trait — trigger it to discover.</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

export default function TraitZone({ traits, compact }: { traits: CombatState['config']['traits']; compact?: boolean }) {
  if (traits.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 justify-center mt-0.5">
      <span className={`text-zinc-500 uppercase tracking-widest ${compact ? 'text-[9px]' : 'text-xs'}`}>Traits</span>
      {traits.map(trait => (
        <TraitIcon key={trait.id} trait={trait} compact={compact} />
      ))}
    </div>
  );
}
