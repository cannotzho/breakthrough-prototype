import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { CardDef } from '../combat/types';

interface Props {
  card: CardDef;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const TYPE_LABEL: Record<string, string> = {
  enchantment: 'Enchantment',
  sorcery: 'Sorcery',
  instant: 'Instant',
};

// Stable check — only hover-capable (non-touch-primary) devices get the tooltip.
const supportsHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches;

export default function CardComponent({ card, selected, disabled, onClick }: Props) {
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const hoverProps = card.flavorText && supportsHover ? {
    onMouseEnter: (e: React.MouseEvent) => setTooltipPos({ x: e.clientX, y: e.clientY }),
    onMouseMove: (e: React.MouseEvent) => setTooltipPos({ x: e.clientX, y: e.clientY }),
    onMouseLeave: () => setTooltipPos(null),
  } : {};

  return (
    <>
      <button
        onClick={disabled ? undefined : onClick}
        className={[
          'relative flex flex-col flex-shrink-0',
          'w-[92px] min-h-[126px] rounded-md border-2 p-1.5 text-left',
          'transition-transform duration-150 select-none',
          disabled
            ? 'opacity-50 cursor-not-allowed border-[#0f3460] bg-[#1a1a2e]'
            : selected
              ? 'border-[#e94560] bg-[#1a1a2e] shadow-[0_0_12px_rgba(233,69,96,0.5)] -translate-y-2'
              : 'border-[#0f3460] bg-[#1a1a2e] hover:-translate-y-2 hover:border-[#e94560] cursor-pointer',
          'sm:w-[106px] sm:min-h-[138px]',
        ].join(' ')}
        aria-pressed={selected}
        title={card.effectText}
        {...hoverProps}
      >
        {/* Cost badge */}
        <span className="absolute top-1 right-1.5 text-[#00d9ff] font-bold text-sm leading-none">
          {card.cost}
        </span>

        {/* Name */}
        <p className="text-white font-semibold text-xs leading-tight pr-4 mb-0.5">
          {card.name}
        </p>

        {/* Supertype · Type */}
        <p className="text-[#888] text-[10px] mb-1">
          {card.supertype} · {TYPE_LABEL[card.type]}
        </p>

        {/* Effect text only — no flavor text on card face */}
        <p className="text-[#bbb] text-[10px] leading-snug flex-1">
          {card.effectText}
        </p>

        {/* Color pip */}
        <span
          className="absolute bottom-1.5 left-1.5 w-2.5 h-2.5 rounded-full border border-[#666]"
          style={{ background: card.color }}
        />
      </button>

      {tooltipPos && card.flavorText && createPortal(
        <div
          style={{
            position: 'fixed',
            left: tooltipPos.x + 14,
            top: tooltipPos.y - 12,
            maxWidth: 220,
            background: 'rgba(8, 8, 20, 0.95)',
            border: '1px solid #1e2a40',
            borderRadius: 6,
            padding: '8px 12px',
            fontSize: 11,
            fontFamily: 'monospace',
            color: '#aaa',
            fontStyle: 'italic',
            pointerEvents: 'none',
            zIndex: 9999,
            lineHeight: 1.6,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}
        >
          {card.flavorText}
        </div>,
        document.body,
      )}
    </>
  );
}
