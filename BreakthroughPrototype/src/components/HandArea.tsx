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
  onCombineCards: (comboId: string) => void; // #61
}

function PileModal({ title, cardIds, onClose }: { title: string; cardIds: string[]; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#16213e] border-2 border-[#0f3460] rounded-xl p-5 max-w-md w-full max-h-[80vh] overflow-auto font-mono text-[#ddd]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <p className="text-[#4ecca3] font-bold text-sm">{title} — {cardIds.length} card{cardIds.length !== 1 ? 's' : ''}</p>
          <button onClick={onClose} className="text-[#888] text-lg leading-none hover:text-white bg-transparent border-0 cursor-pointer">✕</button>
        </div>
        {cardIds.length === 0 ? (
          <p className="text-[#555] text-xs text-center py-4">Empty</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 justify-items-center">
            {cardIds.map((id, i) => {
              const card = CARDS[id];
              if (!card) return null;
              return <CardComponent key={i} card={card} />;
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function HandArea({ state, onSelectCard: _onSelectCard, onPlayCard, onPlaceShield, onEndTurn, onDragStart, onDragEnd, onGhostMove, draggingCardId, stagedCardId, onCombineCards }: Props) {
  const { hand, phase, awaitingShieldChoice, priority, field } = state;

  const [contextMenu, setContextMenu] = useState<{ cardId: string; x: number; y: number } | null>(null);
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);
  const [showDeck, setShowDeck] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  const drawPile = [...state.personalDeck.cards, ...state.worldDeck.cards];
  const discardPile = [...state.personalDeck.discard, ...state.worldDeck.discard];

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

    if (dropZone === 'play') {
      onPlayCard(cardId);
    } else if (dropZone === 'shield' && phase === 'attack' && !awaitingShieldChoice) {
      onPlaceShield();
    }
  }

  const contextCard = contextMenu ? CARDS[contextMenu.cardId] : null;
  const canShield = phase === 'attack' && !awaitingShieldChoice;

  // #61 — find combination cards whose sources include the context menu card
  const availableCombos = contextMenu
    ? state.availableCombinations
        .map(id => CARDS[id])
        .filter((c): c is typeof CARDS[string] => !!c?.combinesFrom?.includes(contextMenu.cardId))
    : [];
  const intactShields = state.playerShields.filter(s => !s.broken).length;
  const totalShields = state.playerShields.length;

  return (
    <div
      className="flex flex-col bg-[rgba(10,15,30,0.92)] border-t-2 border-[#0f3460]"
      onClick={() => setContextMenu(null)}
    >
      {/* Detective status row — condensed single line above hand */}
      <div className="flex items-center gap-3 px-3 py-1.5 border-b border-[#1a2540] flex-wrap">
        <span className="text-[#4ecca3] text-[10px] font-bold uppercase tracking-widest flex-shrink-0">Detective</span>
        <span className="text-[#888] text-[10px] flex-shrink-0">
          Priority <span className={`font-bold ${priority > 0 ? 'text-[#4ecca3]' : priority < 0 ? 'text-[#e94560]' : 'text-[#666]'}`}>
            {priority > 0 ? `+${priority}` : priority}
          </span>
        </span>
        {/* Mini priority bar */}
        <div className="relative h-2 w-16 bg-[#111827] rounded-full overflow-hidden flex-shrink-0">
          {priority > 0 && (
            <div className="absolute top-0 h-full bg-[#4ecca3] rounded-r-full" style={{ left: '50%', width: `${(priority / 10) * 50}%` }} />
          )}
          {priority < 0 && (
            <div className="absolute top-0 h-full bg-[#e94560] rounded-l-full" style={{ right: '50%', width: `${(Math.abs(priority) / 10) * 50}%` }} />
          )}
          <div className="absolute top-0 left-1/2 -translate-x-px w-px h-full bg-[#4a4a6a]" />
        </div>
        <span className="text-[#888] text-[10px] flex-shrink-0">
          Shields <span className="text-white">{intactShields}/{totalShields}</span>
        </span>
        <span className="text-[#888] text-[10px] flex-shrink-0">
          Hand <span className="text-white">{hand.length}</span>
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setShowDeck(true); }}
          className="text-[10px] text-[#4ecca3] underline decoration-dotted bg-transparent border-0 cursor-pointer p-0 hover:text-white flex-shrink-0"
        >
          Deck: {drawPile.length}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowDiscard(true); }}
          className="text-[10px] text-[#888] underline decoration-dotted bg-transparent border-0 cursor-pointer p-0 hover:text-white flex-shrink-0"
        >
          Discard: {discardPile.length}
        </button>
      </div>

      {/* Hand */}
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto min-h-[148px]">
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
          const isBeingDragged = cardId === draggingCardId;
          const isStaged = cardId === stagedCardId;
          const isMenuOpen = contextMenu?.cardId === cardId;
          return (
            <div
              key={idx}
              draggable={!stagedCardId}
              onClick={(e) => handleCardClick(e, cardId)}
              onDragStart={(e) => {
                if (stagedCardId) { e.preventDefault(); return; }
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
                cursor: !stagedCardId ? 'grab' : 'pointer',
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
      </div>

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
            {availableCombos.map(combo => (
              <button
                key={combo.id}
                className="w-full text-left px-3 py-2.5 text-[13px] text-[#c084fc] hover:bg-[#0f3460] transition-colors cursor-pointer border-b border-[#0f3460]"
                onClick={() => { onCombineCards(combo.id); setContextMenu(null); }}
              >
                Combine → {combo.name}
              </button>
            ))}
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
            className="flex flex-col items-center"
            onClick={e => e.stopPropagation()}
          >
            {/* Card scaled up — transformOrigin top keeps it anchored above the text panel */}
            <div style={{ transform: 'scale(1.8)', transformOrigin: 'center top', marginBottom: 106 }}>
              <CardComponent card={{ ...CARDS[inspectCardId]!, cost: getActualCost(inspectCardId) }} />
            </div>
            {/* Detail panel: effectText first, flavorText below a separator */}
            <div
              className="bg-[#0d1625] border border-[#1e2a40] rounded-lg p-3 text-left"
              style={{ maxWidth: 240 }}
            >
              <p className="text-[#ccc] text-[11px] leading-relaxed">
                {CARDS[inspectCardId]!.effectText}
              </p>
              {CARDS[inspectCardId]!.flavorText && (
                <>
                  <hr className="border-[#1e2a40] my-2.5" />
                  <p className="text-[#666] text-[11px] italic leading-relaxed">
                    {CARDS[inspectCardId]!.flavorText}
                  </p>
                </>
              )}
            </div>
            <p className="text-[#444] text-[9px] mt-3 font-mono">tap anywhere to close</p>
          </div>
        </div>
      )}

      {showDeck && <PileModal title="Draw Pile" cardIds={drawPile} onClose={() => setShowDeck(false)} />}
      {showDiscard && <PileModal title="Discard Pile" cardIds={discardPile} onClose={() => setShowDiscard(false)} />}
    </div>
  );
}
