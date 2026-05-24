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

export default function CardComponent({ card, selected, disabled, onClick }: Props) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      className={[
        'relative flex flex-col flex-shrink-0',
        'w-[88px] min-h-[120px] rounded-md border-2 p-1.5 text-left',
        'transition-transform duration-150 select-none',
        disabled
          ? 'opacity-50 cursor-not-allowed border-[#0f3460] bg-[#1a1a2e]'
          : selected
            ? 'border-[#e94560] bg-[#1a1a2e] shadow-[0_0_12px_rgba(233,69,96,0.5)] -translate-y-2'
            : 'border-[#0f3460] bg-[#1a1a2e] hover:-translate-y-2 hover:border-[#e94560] cursor-pointer',
        'sm:w-[100px] sm:min-h-[130px]',
      ].join(' ')}
      aria-pressed={selected}
      title={card.effectText}
    >
      {/* Cost badge */}
      <span className="absolute top-1 right-1.5 text-[#00d9ff] font-bold text-sm leading-none">
        {card.cost}
      </span>

      {/* Name */}
      <p className="text-white font-semibold text-[11px] leading-tight pr-4 mb-0.5">
        {card.name}
      </p>

      {/* Supertype · Type */}
      <p className="text-[#888] text-[9px] mb-1">
        {card.supertype} · {TYPE_LABEL[card.type]}
      </p>

      {/* Effect text */}
      <p className="text-[#bbb] text-[9px] leading-snug flex-1">
        {card.effectText}
      </p>

      {/* Color pip */}
      <span
        className="absolute bottom-1.5 left-1.5 w-2.5 h-2.5 rounded-full border border-[#666]"
        style={{ background: card.color }}
      />
    </button>
  );
}
