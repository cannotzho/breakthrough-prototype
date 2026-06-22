import { useState } from 'react';
import { motion } from 'framer-motion';
import { CardInstance } from '../../combat/types';
import CardView from './CardView';

export default function HandCard({
  card,
  onClick,
  onRightClick,
  selected,
  dimmed,
  isDraggable,
  isAnyDragging,
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
  isDraggable?: boolean;
  isAnyDragging?: boolean;
  onCardDragStart?: () => void;
  onCardDrag?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
  onCardDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
  initialOffset?: { x: number; y: number };
}) {
  const [hovered, setHovered] = useState(false);
  const showHover = hovered && !isAnyDragging;

  return (
    <motion.div
      className="relative"
      style={{ zIndex: showHover ? 50 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={{ y: showHover ? -80 : 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <CardView
        card={card}
        onClick={onClick}
        onRightClick={onRightClick}
        selected={selected}
        dimmed={dimmed}
        isDraggable={isDraggable}
        onCardDragStart={onCardDragStart}
        onCardDrag={onCardDrag}
        onCardDragEnd={onCardDragEnd}
        initialOffset={initialOffset}
      />
    </motion.div>
  );
}
