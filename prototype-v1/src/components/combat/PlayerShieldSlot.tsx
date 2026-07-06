import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CombatState } from '../../combat/types';

export default function PlayerShieldSlot({ slot, idx, selectable, selected, onSelect, isDropTarget, isDragHovered, onDrop, reorderable, onReorderDragStart, onReorderDrop, triggerFlash }: {
  slot: CombatState['playerShields'][0];
  idx: number;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  isDropTarget?: boolean;
  isDragHovered?: boolean;
  onDrop?: () => void;
  reorderable?: boolean;
  onReorderDragStart?: () => void;
  onReorderDrop?: () => void;
  triggerFlash?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [reorderDragOver, setReorderDragOver] = useState(false);
  const hovered = (dragOver || isDragHovered) && isDropTarget && !slot;

  if (slot?.shieldType === 'dummy') {
    return (
      <motion.div
        layout
        draggable={reorderable}
        onDragStart={reorderable ? (e) => {
          (e as unknown as React.DragEvent).dataTransfer.effectAllowed = 'move';
          onReorderDragStart?.();
        } : undefined}
        onDragOver={reorderable ? (e) => { e.preventDefault(); (e as unknown as React.DragEvent).dataTransfer.dropEffect = 'move'; setReorderDragOver(true); } : undefined}
        onDragLeave={reorderable ? () => setReorderDragOver(false) : undefined}
        onDrop={reorderable ? (e) => { e.preventDefault(); setReorderDragOver(false); onReorderDrop?.(); } : undefined}
        className={`w-4 lg:w-5 h-10 lg:h-12 rounded border-2 cursor-pointer transition-all
          border-zinc-400 bg-zinc-300/20
          ${selected ? 'ring-2 ring-yellow-400' : ''}
          ${reorderDragOver ? 'ring-2 ring-indigo-400 bg-indigo-950/40' : ''}
          ${reorderable ? 'cursor-grab active:cursor-grabbing' : ''}
        `}
        onClick={onSelect}
        title={`${slot.card.definition.name} (Dummy)`}
      />
    );
  }

  if (!slot) {
    return (
      <motion.div
        layout
        onDragOver={(e) => {
          e.preventDefault();
          if (isDropTarget) setDragOver(true);
          if (reorderable) { (e as unknown as React.DragEvent).dataTransfer.dropEffect = 'move'; setReorderDragOver(true); }
        }}
        onDragLeave={() => { setDragOver(false); setReorderDragOver(false); }}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          setReorderDragOver(false);
          if (reorderable) onReorderDrop?.();
          else if (isDropTarget) onDrop?.();
        }}
        className={`w-4 lg:w-5 h-10 lg:h-12 rounded border cursor-pointer transition-all
          border-zinc-700/50 bg-transparent border-dashed
          ${selectable ? 'hover:border-yellow-400' : ''}
          ${isDropTarget ? 'border-amber-400 border-solid bg-amber-950/30' : ''}
          ${hovered ? 'ring-2 ring-amber-400 bg-amber-950/50 shadow-[0_0_16px_rgba(245,158,11,0.4)]' : ''}
          ${reorderDragOver ? 'ring-2 ring-indigo-400 bg-indigo-950/40 border-indigo-400 border-solid' : ''}
        `}
        onClick={onSelect}
        title={`Empty slot ${idx + 1}`}
      />
    );
  }

  // Core shield
  return (
    <motion.div
      layout
      draggable={reorderable}
      onDragStart={reorderable ? (e) => {
        (e as unknown as React.DragEvent).dataTransfer.effectAllowed = 'move';
        onReorderDragStart?.();
      } : undefined}
      onDragOver={reorderable ? (e) => { e.preventDefault(); (e as unknown as React.DragEvent).dataTransfer.dropEffect = 'move'; setReorderDragOver(true); } : undefined}
      onDragLeave={reorderable ? () => setReorderDragOver(false) : undefined}
      onDrop={reorderable ? (e) => { e.preventDefault(); setReorderDragOver(false); onReorderDrop?.(); } : undefined}
      className={`w-32 lg:w-36 h-10 lg:h-12 rounded-lg border-2 flex items-center px-2 cursor-pointer transition-all
        border-indigo-400 bg-indigo-950
        ${selectable ? 'hover:border-yellow-400' : ''}
        ${selected ? 'border-yellow-400 ring-2 ring-yellow-400' : ''}
        ${reorderDragOver ? 'ring-2 ring-indigo-300 bg-indigo-900' : ''}
        ${reorderable ? 'cursor-grab active:cursor-grabbing' : ''}
        ${triggerFlash ? 'animate-shield-trigger' : ''}
      `}
      onClick={onSelect}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key="filled"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 60, scale: 0.8, transition: { duration: 0.8 } }}
          className="flex items-center gap-1.5 min-w-0 w-full"
        >
          <span className="text-white text-xs font-semibold truncate flex-1">{slot.card.definition.name}</span>
          {slot.card.definition.keywords.includes('Safety') && (
            <span className="text-[9px] bg-green-900/60 text-green-400 px-1 py-0.5 rounded shrink-0">Safe</span>
          )}
          {slot.card.definition.keywords.includes('Shield Trigger') && (
            <span className="text-[9px] bg-blue-900/60 text-blue-400 px-1 py-0.5 rounded shrink-0">Trigger</span>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
