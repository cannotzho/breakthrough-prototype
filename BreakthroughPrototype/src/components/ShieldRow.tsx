import type { ShieldSlot } from '../combat/types';
import { CARDS } from '../data/cards';

interface Props {
  shields: ShieldSlot[];
  owner: 'player' | 'opponent';
  awaitingChoice?: boolean;
  onChoose?: (index: number) => void;
  onInspect?: (cardId: string) => void;
  justBrokenIdx?: number | null;
}

export default function ShieldRow({ shields, owner, awaitingChoice, onChoose, onInspect, justBrokenIdx }: Props) {
  return (
    <div className="flex gap-3 justify-center flex-wrap">
      {shields.map((shield, i) => {
        const isAwaitingClick = owner === 'player' && awaitingChoice && !shield.broken;
        const isFaceDown = owner === 'player' && !shield.broken && !!shield.usedCardId;
        const isInspectable = isFaceDown && !!onInspect && !awaitingChoice;
        const isJustBroken = owner === 'player' && justBrokenIdx === i && shield.broken;
        const revealedName = shield.broken && shield.linkedCardId
          ? CARDS[shield.linkedCardId]?.name ?? 'Revealed'
          : null;

        function handleClick() {
          if (isAwaitingClick) { onChoose?.(i); }
          else if (isInspectable && shield.usedCardId) { onInspect!(shield.usedCardId); }
        }

        const isInteractive = isAwaitingClick || isInspectable;

        return (
          <button
            key={i}
            onClick={isInteractive ? handleClick : undefined}
            disabled={!isInteractive}
            className={[
              'relative flex items-center justify-center rounded-md border-2 text-xs font-medium text-center leading-tight',
              'w-[72px] h-[92px] sm:w-[82px] sm:h-[106px]',
              shield.broken
                ? 'border-[#e94560] bg-[#1a0a0a] text-[#e94560]'
                : isAwaitingClick
                  ? 'border-[#e94560] bg-[#2a2a4e] text-[#e94560] cursor-pointer animate-pulse'
                  : isInspectable
                    ? 'border-[#1a3a6e] bg-[#0d1e3d] cursor-pointer hover:border-[#4ecca3]'
                    : isFaceDown
                      ? 'border-[#1a3a6e] bg-[#0d1e3d] cursor-default'
                      : 'border-dashed border-[#555] bg-[#2a2a4e] text-[#888] cursor-default',
              isJustBroken ? 'scale-110' : '',
            ].join(' ')}
            title={
              isAwaitingClick ? 'Click to sacrifice this shield'
              : isInspectable ? 'Click to inspect'
              : undefined
            }
          >
            {shield.broken ? (
              <span className="px-1">{revealedName ?? 'Broken'}</span>
            ) : owner === 'opponent' ? (
              <span>Shield</span>
            ) : isFaceDown ? (
              /* Face-down card back */
              <span className="flex flex-col items-center justify-center gap-1 w-full h-full select-none pointer-events-none">
                <span className="text-[#1e4a8a] text-2xl leading-none">◈</span>
                <span className="text-[#1a3060] text-[9px] tracking-widest uppercase font-mono">
                  {isAwaitingClick ? 'Sacrifice?' : '[ hidden ]'}
                </span>
              </span>
            ) : (
              <span className="text-[#444]">Shield {i + 1}</span>
            )}
            {isJustBroken && (
              <span className="absolute inset-0 rounded-md border-2 border-[#e94560] shadow-[0_0_20px_rgba(233,69,96,0.9)] animate-pulse pointer-events-none" />
            )}
          </button>
        );
      })}
    </div>
  );
}
