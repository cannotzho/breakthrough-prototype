import type { ShieldSlot } from '../combat/types';
import { CARDS } from '../data/cards';

interface Props {
  shields: ShieldSlot[];
  owner: 'player' | 'opponent';
  awaitingChoice?: boolean;
  onChoose?: (index: number) => void;
}

export default function ShieldRow({ shields, owner, awaitingChoice, onChoose }: Props) {
  return (
    <div className="flex gap-3 justify-center flex-wrap">
      {shields.map((shield, i) => {
        const isClickable = owner === 'player' && awaitingChoice && !shield.broken;
        const revealedName = shield.broken && shield.linkedCardId
          ? CARDS[shield.linkedCardId]?.name ?? 'Revealed'
          : null;

        return (
          <button
            key={i}
            onClick={isClickable ? () => onChoose?.(i) : undefined}
            disabled={!isClickable}
            className={[
              'flex items-center justify-center rounded-md border-2 text-[10px] font-medium text-center leading-tight',
              'w-[68px] h-[88px] sm:w-[78px] sm:h-[100px]',
              shield.broken
                ? 'border-[#e94560] bg-[#1a0a0a] text-[#e94560]'
                : isClickable
                  ? 'border-[#e94560] bg-[#2a2a4e] text-[#e94560] cursor-pointer animate-pulse'
                  : 'border-dashed border-[#555] bg-[#2a2a4e] text-[#888] cursor-default',
            ].join(' ')}
            title={isClickable ? 'Click to sacrifice this shield' : undefined}
          >
            {shield.broken
              ? <span className="px-1">{revealedName ?? 'Broken'}</span>
              : owner === 'opponent'
                ? <span>Shield</span>
                : <span>Shield {i + 1}</span>
            }
          </button>
        );
      })}
    </div>
  );
}
