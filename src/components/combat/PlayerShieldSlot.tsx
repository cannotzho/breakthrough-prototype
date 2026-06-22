import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CombatState } from '../../combat/types';

export default function PlayerShieldSlot({ slot, idx, selectable, selected, onSelect, isDropTarget, isDragHovered, onDrop }: {
  slot: CombatState['playerShields'][0];
  idx: number;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  isDropTarget?: boolean;
  isDragHovered?: boolean;
  onDrop?: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const hovered = (dragOver || isDragHovered) && isDropTarget && !slot;

  return (
    <motion.div
      layout
      className={`w-44 h-[84px] rounded-lg border-2 flex items-center px-3 cursor-pointer transition-all
        ${slot ? 'border-blue-400 bg-blue-950' : 'border-zinc-700 bg-zinc-900/40 border-dashed'}
        ${selectable ? 'hover:border-yellow-400' : ''}
        ${selected ? 'border-yellow-400 ring-2 ring-yellow-400' : ''}
        ${isDropTarget && !slot ? 'border-amber-400 border-solid bg-amber-950/30' : ''}
        ${hovered ? 'ring-2 ring-amber-400 bg-amber-950/50 shadow-[0_0_16px_rgba(245,158,11,0.4)]' : ''}
      `}
      onClick={onSelect}
      onDragOver={isDropTarget && !slot ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={isDropTarget ? () => setDragOver(false) : undefined}
      onDrop={isDropTarget && !slot ? (e) => { e.preventDefault(); setDragOver(false); onDrop?.(); } : undefined}
    >
      <AnimatePresence mode="wait">
        {slot ? (
          <motion.div
            key="filled"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60, scale: 0.8, transition: { duration: 0.8 } }}
            className="flex items-center gap-2 min-w-0 w-full"
          >
            <span className="text-white text-sm font-semibold truncate flex-1">{slot.card.definition.name}</span>
            {slot.card.definition.keywords.includes('Safety') && (
              <span className="text-[11px] bg-green-900/60 text-green-400 px-1.5 py-0.5 rounded shrink-0">Safety</span>
            )}
            {slot.card.definition.keywords.includes('Shield Trigger') && (
              <span className="text-[11px] bg-blue-900/60 text-blue-400 px-1.5 py-0.5 rounded shrink-0">Shield Trigger</span>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center w-full"
          >
            <span className="text-zinc-600 text-sm">Slot {idx + 1}</span>
            {isDropTarget && (
              <span className="text-amber-500/60 text-xs ml-2">Drop</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
