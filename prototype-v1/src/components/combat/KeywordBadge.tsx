import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Keyword } from '../../combat/types';

const KEYWORD_DEFINITIONS: Record<Keyword, string> = {
  Safety: 'No effect when played normally. When this card is used as a Dummy Shield and that shield is broken, the shield owner loses 0 Patience instead of 1.',
  Assemble: 'This card may be combined with another Assemble card.',
  'Shield Trigger': 'When broken as a shield, its printed effects resolve before the break outcome fires.',
  Lie: 'Playing this card increments the Lie Counter. Exceeding the threshold loses the encounter.',
  Trap: 'When played from hand, this card is placed on the Field. It triggers when its condition is met during the opponent\'s turn.',
  Rapport: 'Choose a number from 1-10, then check the opponent\'s hand for cards with that priority cost. Effects vary based on whether a match is found.',
  'Heavy Hand': 'When played, choose Normal (printed cost) or Heavy Hand (2× cost). Heavy Hand activates a stronger alternate set of effects.',
};

export default function KeywordBadge({ keyword }: { keyword: Keyword }) {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <span
      className="relative text-sm bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded cursor-help"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {keyword}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl text-sm text-zinc-200 leading-relaxed pointer-events-none"
          >
            <span className="font-semibold text-white">{keyword}:</span> {KEYWORD_DEFINITIONS[keyword]}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}
