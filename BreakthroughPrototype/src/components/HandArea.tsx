import { useRef, useState } from 'react';
import { CARDS } from '../data/cards';
import type { CombatState } from '../combat/types';
import CardComponent from './CardComponent';

interface Props {
  state: CombatState;
  onSelectCard: (id: string) => void;
  onPlayCard: (id: string) => void;
  onPlaceShield: () => void;
  onEndTurn: () => void;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  onGhostMove: (x: number, y: number) => void;
  draggingCardId: string | null;
  stagedCardId: string | null;
}

export default function HandArea({ state, onSelectCard: _onSelectCard, onPlayCard, onPlaceShield, onEndTurn, onDragStart, onDragEnd, onGhostMove, draggingCardId, stagedCardId }: Props) {
  const { hand, phase, awaitingShieldChoice, priority, field } = state;

  const [contextMenu, setContextMenu] = useState<{ cardId: string; x: number; y: number } | null>(null);
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);

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

  function handleCardClick(e: React.MouseEvent, cardId: string) {
    if (stagedCardId) return;
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setContextMenu({ cardId, x: rect.left + rect.width / 2, y: rect.top });
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

  const contextCard = contextMenu ? CARDS[contextMenu.cardId] : null;
  const canShield = phase === 'attack' && !awaitingShieldChoice;

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 overflow-x-auto bg-[rgba(10,15,30,0.92)] border-t-2 border-[#0f3460] min-h-[148px]"
      onClick={() => setContextMenu(null)}
    >
      {/* End Turn button — only in attack phase */}
      {phase === 'attack' && !awaitingShieldChoice && (
        <button
          onClick={(e) => { e.stopPropagation(); onEndTurn(); }}
          className="flex-shrink-0 flex flex-col items-center justify-center w-[72px] h-[100px] sm:w-[80px] sm:h-[106px] rounded-md border-2 border-dashed border-[#4ecca3] bg-[#0a2a1e] text-[#4ecca3] text-[10px] text-center leading-snug cursor-pointer hover:bg-[#0f3d2c] hover:border-[#6ee8c0] transition-colors"
        >
          End<br />Turn
        </button>
      )}

      {hand.map((cardId, idx) => {
        const card = CARDS[cardId];
        if (!card) return null;
        const playable = isPlayable(cardId);
        const isBeingDragged = cardId === draggingCardId;
        const isStaged = cardId === stagedCardId;
        const isMenuOpen = contextMenu?.cardId === cardId;
        return (
          <div
            key={idx}
            draggable={playable && !stagedCardId}
            onClick={(e) => handleCardClick(e, cardId)}
            onDragStart={(e) => {
              if (!playable || stagedCardId) { e.preventDefault(); return; }
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
              cursor: playable && !stagedCardId ? 'grab' : 'pointer',
              opacity: isBeingDragged || isStaged ? 0.25 : 1,
              transition: 'opacity 0.15s',
            }}
          >
            <CardComponent
              card={{ ...card, cost: getActualCost(cardId) }}
              selected={isMenuOpen}
              disabled={!!stagedCardId}
            />
          </div>
        );
      })}

      {hand.length === 0 && (
        <p className="text-[#555] text-sm italic flex-1 text-center">— No cards in hand —</p>
      )}

      {/* Context menu */}
      {contextMenu && contextCard && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setContextMenu(null)} />
          <div
            className="fixed z-50 bg-[#0d1625] border border-[#0f3460] rounded-lg shadow-2xl overflow-hidden min-w-[160px]"
            style={{
              left: contextMenu.x,
              top: contextMenu.y - 8,
              transform: 'translate(-50%, -100%)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-[#0f3460] bg-[#111d33]">
              <p className="text-[#4ecca3] text-[11px] font-bold leading-none">{contextCard.name}</p>
              <p className="text-[#555] text-[9px] mt-0.5">{contextCard.supertype} · cost {getActualCost(contextMenu.cardId)}</p>
            </div>
            <button
              className={[
                'w-full text-left px-3 py-2.5 text-[13px] font-medium border-b border-[#0f3460] transition-colors',
                isPlayable(contextMenu.cardId)
                  ? 'text-[#4ecca3] hover:bg-[#0f3460] cursor-pointer'
                  : 'text-[#3a3a5a] cursor-not-allowed',
              ].join(' ')}
              disabled={!isPlayable(contextMenu.cardId)}
              onClick={() => { onPlayCard(contextMenu.cardId); setContextMenu(null); }}
            >
              Play
              {!isPlayable(contextMenu.cardId) && (
                <span className="text-[10px] ml-1 text-[#2a2a4a]">
                  (need {getActualCost(contextMenu.cardId)} priority)
                </span>
              )}
            </button>
            {canShield && (
              <button
                className="w-full text-left px-3 py-2.5 text-[13px] text-[#e6a817] hover:bg-[#0f3460] transition-colors cursor-pointer border-b border-[#0f3460]"
                onClick={() => { onPlaceShield(); setContextMenu(null); }}
              >
                Place as Shield
              </button>
            )}
            <button
              className="w-full text-left px-3 py-2.5 text-[13px] text-[#888] hover:bg-[#0f3460] transition-colors cursor-pointer"
              onClick={() => { setInspectCardId(contextMenu.cardId); setContextMenu(null); }}
            >
              Inspect
            </button>
          </div>
        </>
      )}

      {/* Inspect overlay */}
      {inspectCardId && CARDS[inspectCardId] && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setInspectCardId(null)}
        >
          <div
            className="flex flex-col items-center gap-4"
            onClick={e => e.stopPropagation()}
            style={{ transform: 'scale(1.6)', transformOrigin: 'center' }}
          >
            <CardComponent card={{ ...CARDS[inspectCardId]!, cost: getActualCost(inspectCardId) }} />
          </div>
        </div>
      )}
    </div>
  );
}
