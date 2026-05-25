import { useRef } from 'react';
import { CARDS } from '../data/cards';
import type { CombatState } from '../combat/types';
import CardComponent from './CardComponent';

interface Props {
  state: CombatState;
  onSelectCard: (id: string) => void;
  onPlayCard: (id: string) => void;
  onPlaceShield: () => void;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  onGhostMove: (x: number, y: number) => void;
  draggingCardId: string | null;
  stagedCardId: string | null;
}

export default function HandArea({ state, onSelectCard, onPlayCard, onPlaceShield, onDragStart, onDragEnd, onGhostMove, draggingCardId, stagedCardId }: Props) {
  const { hand, phase, selectedCardId, awaitingShieldChoice, priority, field } = state;

  const vnActive = field.includes('vampireNetwork');
  const reduction = vnActive ? (CARDS['vampireNetwork']?.effects.reduceInfoCost ?? 0) : 0;

  function getActualCost(cardId: string): number {
    const card = CARDS[cardId];
    if (!card) return 0;
    if (card.supertype === 'Information') return Math.max(0, card.cost - reduction);
    return card.cost;
  }

  function isPlayable(cardId: string): boolean {
    if (awaitingShieldChoice) return false;
    const card = CARDS[cardId];
    if (!card) return false;
    if (phase === 'defense' && card.type !== 'instant') return false;
    return priority >= getActualCost(cardId);
  }

  function handleCardTap(cardId: string) {
    if (stagedCardId) return; // locked while a card is resolving
    if (!isPlayable(cardId) && cardId !== selectedCardId) return;
    if (selectedCardId === cardId) {
      onPlayCard(cardId);
    } else {
      onSelectCard(cardId);
    }
  }

  // Touch drag tracking — store card id + whether the touch moved enough to be a drag
  const touchDragRef = useRef<{ cardId: string; startX: number; startY: number; moved: boolean } | null>(null);

  function handleTouchStart(e: React.TouchEvent, cardId: string) {
    const touch = e.changedTouches[0];
    touchDragRef.current = { cardId, startX: touch.clientX, startY: touch.clientY, moved: false };
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchDragRef.current) return;
    const touch = e.changedTouches[0];
    const dx = Math.abs(touch.clientX - touchDragRef.current.startX);
    const dy = Math.abs(touch.clientY - touchDragRef.current.startY);
    if (dx > 10 || dy > 10) {
      if (!touchDragRef.current.moved) {
        touchDragRef.current.moved = true;
        onDragStart(touchDragRef.current.cardId);
      }
      e.preventDefault(); // prevent scroll while dragging
      onGhostMove(touch.clientX, touch.clientY);
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchDragRef.current) return;
    const { cardId, moved } = touchDragRef.current;
    touchDragRef.current = null;

    if (!moved) return; // was a tap — let the click handler run naturally

    e.preventDefault(); // prevent synthetic click after a drag
    onDragEnd();

    const touch = e.changedTouches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const dropZone = el?.closest('[data-dropzone]')?.getAttribute('data-dropzone');

    if (dropZone === 'play' && isPlayable(cardId)) {
      onPlayCard(cardId);
    } else if (dropZone === 'shield' && phase === 'attack' && !awaitingShieldChoice) {
      onPlaceShield();
    }
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto bg-[rgba(10,15,30,0.92)] border-t-2 border-[#0f3460] min-h-[148px]">
      {/* Place Shield button — only in attack phase */}
      {phase === 'attack' && !awaitingShieldChoice && (
        <button
          onClick={onPlaceShield}
          className="flex-shrink-0 flex flex-col items-center justify-center w-[72px] h-[100px] sm:w-[80px] sm:h-[106px] rounded-md border-2 border-dashed border-[#555] bg-[#2a2a4e] text-[#888] text-[10px] text-center leading-snug cursor-pointer hover:border-[#e94560] hover:text-[#e94560] transition-colors"
        >
          Place<br />Shield<br /><span className="text-[9px] opacity-70">(−2 Priority)</span>
        </button>
      )}

      {hand.map((cardId, idx) => {
        const card = CARDS[cardId];
        if (!card) return null;
        const playable = isPlayable(cardId);
        const selected = selectedCardId === cardId && cardId !== stagedCardId;
        const isBeingDragged = cardId === draggingCardId;
        const isStaged = cardId === stagedCardId;
        return (
          <div
            key={idx}
            draggable={playable && !stagedCardId}
            onDragStart={(e) => {
              if (!playable || stagedCardId) { e.preventDefault(); return; }
              // Suppress browser's default drag ghost; we render our own
              const img = new Image();
              img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
              e.dataTransfer.setDragImage(img, 0, 0);
              e.dataTransfer.setData('text/plain', cardId);
              e.dataTransfer.effectAllowed = 'move';
              onGhostMove(e.clientX, e.clientY);
              onDragStart(cardId);
            }}
            onDragEnd={onDragEnd}
            onTouchStart={(e) => handleTouchStart(e, cardId)}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              cursor: playable && !stagedCardId ? 'grab' : 'default',
              opacity: isBeingDragged || isStaged ? 0.25 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <CardComponent
              card={{ ...card, cost: getActualCost(cardId) }}
              selected={selected}
              disabled={(!playable && !selected) || !!stagedCardId}
              onClick={() => handleCardTap(cardId)}
            />
          </div>
        );
      })}

      {hand.length === 0 && (
        <p className="text-[#555] text-sm italic flex-1 text-center">— No cards in hand —</p>
      )}
    </div>
  );
}
