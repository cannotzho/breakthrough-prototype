import { useState } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { CardInstance, CardDefinition } from '../../combat/types';
import { COLOR_BORDER, COLOR_BG } from './cardColors';

function getCardEffectDisplay(def: CardDefinition): string {
  const lines: string[] = [];
  for (const kw of def.keywords) lines.push(kw);
  const text = def.effectText ?? def.description ?? '';
  if (text) lines.push(text);
  return lines.join('\n');
}

function getCardLongDesc(def: CardDefinition): string | undefined {
  return def.longDescription;
}

export default function CardView({
  card,
  onClick,
  onRightClick,
  selected,
  dimmed,
  label,
  isDraggable,
  onCardDragStart,
  onCardDrag,
  onCardDragEnd,
  initialOffset,
}: {
  card: CardInstance;
  onClick?: (e: React.MouseEvent) => void;
  onRightClick?: (x: number, y: number) => void;
  selected?: boolean;
  dimmed?: boolean;
  label?: string;
  isDraggable?: boolean;
  onCardDragStart?: () => void;
  onCardDrag?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
  onCardDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
  initialOffset?: { x: number; y: number };
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const def = card.definition;
  const border = COLOR_BORDER[def.color] ?? 'border-zinc-500';
  const bg = COLOR_BG[def.color] ?? 'bg-zinc-900';
  const effectDisplay = getCardEffectDisplay(def);
  const longDesc = getCardLongDesc(def);

  return (
    <motion.div
      layout
      onClick={onClick}
      onContextMenu={(e) => {
        if (onRightClick) {
          e.preventDefault();
          onRightClick(e.clientX, e.clientY);
        }
      }}
      onMouseEnter={() => { if (longDesc) setShowTooltip(true); }}
      onMouseLeave={() => setShowTooltip(false)}
      drag={!!isDraggable}
      dragSnapToOrigin={isDraggable ? true : undefined}
      dragElastic={isDraggable ? 0.1 : undefined}
      onDragStart={isDraggable ? (_e: MouseEvent | TouchEvent | PointerEvent, _i: PanInfo) => onCardDragStart?.() : undefined}
      onDrag={isDraggable ? (e: MouseEvent | TouchEvent | PointerEvent, _i: PanInfo) => onCardDrag?.(e) : undefined}
      onDragEnd={isDraggable ? (e: MouseEvent | TouchEvent | PointerEvent, _i: PanInfo) => onCardDragEnd?.(e) : undefined}
      initial={initialOffset
        ? { opacity: 0, x: initialOffset.x, y: initialOffset.y, scale: 0.5 }
        : { opacity: 0, x: -60, scale: 0.9 }}
      animate={{ opacity: dimmed ? 0.4 : 1, x: 0, y: 0, scale: selected ? 1.05 : 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.8, transition: { duration: 0.7 } }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`relative w-[104px] h-36 lg:w-[156px] lg:h-[216px] shrink-0 rounded-xl border-2 ${border} ${bg} flex flex-col p-1.5 lg:p-3 select-none
        ${isDraggable ? 'cursor-grab active:cursor-grabbing' : onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}
        ${selected ? 'ring-2 ring-yellow-400' : ''}`}
      whileTap={onClick && !isDraggable ? { scale: 0.95 } : {}}
    >
      {label && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-sm bg-yellow-400 text-black px-2 py-0.5 rounded">
          {label}
        </span>
      )}
      <div className="flex justify-between items-start gap-1">
        <span className="text-[10px] lg:text-sm text-white font-semibold truncate leading-tight">{def.name}</span>
        <span className="text-sm lg:text-lg font-bold text-white shrink-0">{def.cost}</span>
      </div>
      <div className="flex-1 flex items-center justify-center bg-zinc-800/50 rounded-lg overflow-hidden mt-1">
        {def.imageUrl ? (
          <img src={def.imageUrl} alt={def.name} className="w-full h-full object-cover" />
        ) : (
          <svg viewBox="0 0 48 48" className="w-10 h-10 lg:w-14 lg:h-14 text-zinc-600" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="10" width="36" height="28" rx="2" stroke="currentColor" strokeWidth="2" />
            <circle cx="17" cy="21" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 34l12-10 10 8 8-6 6 6v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </div>
      <p className="text-zinc-400 text-[10px] lg:text-xs mt-1 lg:mt-1.5 leading-tight line-clamp-2 lg:line-clamp-3 whitespace-pre-line">{effectDisplay}</p>

      <AnimatePresence>
        {showTooltip && longDesc && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-4 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl text-sm text-zinc-200 leading-relaxed pointer-events-none"
          >
            <span className="font-semibold text-white">{def.name}</span>
            <p className="mt-1">{longDesc}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
