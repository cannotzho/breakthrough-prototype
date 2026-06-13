import { useRef, useState } from 'react';
import { CARDS } from '../data/cards';
import { COMBINATIONS } from '../data/combinations';
import type { CombatState } from '../combat/types';
import { computeCardCost, cardForDisplay } from '../combat/effects';
import CardComponent from './CardComponent';
import CardInspectModal from './CardInspectModal';

interface Props {
  state: CombatState;
  onPlayCard: (id: string) => void;
  onPlaceShield: () => void;
  onEndTurn: () => void;
  onDragStart: (cardId: string) => void;
  onDragEnd: () => void;
  onGhostMove: (x: number, y: number) => void;
  draggingCardId: string | null;
  stagedCardId: string | null;
  onCombineCards: (ingredient1: string, ingredient2: string) => void; // #94
  tutorialForcedCard?: string;
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

export default function HandArea({ state, onPlayCard, onPlaceShield, onEndTurn, onDragStart, onDragEnd, onGhostMove, draggingCardId, stagedCardId, onCombineCards, tutorialForcedCard }: Props) {
  const { hand, phase, awaitingShieldChoice, priority, field, backOfMind } = state;

  const [contextMenu, setContextMenu] = useState<{ cardId: string; x: number; y: number } | null>(null);
  const [combinePrompt, setCombinePrompt] = useState<{ sourceCardId: string; partners: string[] } | null>(null);
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);
  const [showDeck, setShowDeck] = useState(false);
  const [showDiscard, setShowDiscard] = useState(false);

  const drawPile = state.worldDeck.cards;
  const discardPile = state.worldDeck.discard;

  function getActualCost(cardId: string): number {
    return computeCardCost(cardId, field);
  }

  function isPlayable(cardId: string): boolean {
    if (awaitingShieldChoice) return false;
    const card = CARDS[cardId];
    if (!card) return false;
    const isInstantCard = card.type === 'instant' || !!card.effects.isInterrupt;
    // During defense: only BotM instants are playable
    if (phase === 'defense') {
      return isInstantCard && state.backOfMind.includes(cardId);
    }
    // During attack: instants are always playable (cost is a delta, not a gate)
    if (isInstantCard) return true;
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

  // #94 — valid partners for the right-clicked card: recipes where it's an ingredient and
  // the other ingredient is also currently in hand (i.e. the combination is available).
  const handSet = new Set(hand);
  const validPartners: string[] = contextMenu
    ? COMBINATIONS
        .filter(r => state.availableCombinations.includes(r.result) && r.ingredients.includes(contextMenu.cardId))
        .map(r => r.ingredients.find(id => id !== contextMenu.cardId)!)
        .filter(id => handSet.has(id))
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
        <span className="text-[#4ecca3] text-xs font-bold uppercase tracking-widest flex-shrink-0">Detective</span>
        <span className="text-[#888] text-xs flex-shrink-0">
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
        <span className="text-[#888] text-xs flex-shrink-0">
          Shields <span className="text-white">{intactShields}/{totalShields}</span>
        </span>
        <span className="text-[#888] text-xs flex-shrink-0">
          Hand <span className="text-white">{hand.length}</span>
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); setShowDeck(true); }}
          className="text-xs text-[#4ecca3] underline decoration-dotted bg-transparent border-0 cursor-pointer p-0 hover:text-white flex-shrink-0"
        >
          Deck: {drawPile.length}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowDiscard(true); }}
          className="text-xs text-[#888] underline decoration-dotted bg-transparent border-0 cursor-pointer p-0 hover:text-white flex-shrink-0"
        >
          Discard: {discardPile.length}
        </button>
      </div>

      {/* Hand */}
      <div className="flex items-center gap-2 px-3 py-2 overflow-x-auto min-h-[158px]" data-tutorial-id="hand">
        {/* End Turn button — only in attack phase; hidden during forced-play tutorial steps */}
        {phase === 'attack' && !awaitingShieldChoice && !tutorialForcedCard && (
          <button
            data-tutorial-id="end-turn-btn"
            onClick={(e) => { e.stopPropagation(); onEndTurn(); }}
            className="flex-shrink-0 flex flex-col items-center justify-center w-[76px] h-[106px] sm:w-[84px] sm:h-[114px] rounded-md border-2 border-dashed border-[#4ecca3] bg-[#0a2a1e] text-[#4ecca3] text-xs text-center leading-snug cursor-pointer hover:bg-[#0f3d2c] hover:border-[#6ee8c0] transition-colors"
          >
            End<br />Turn
          </button>
        )}

        {hand.map((cardId, idx) => {
          const card = CARDS[cardId];
          if (!card) return null;
          // #100: mask effect text if not yet understood this encounter
          const displayCard = cardForDisplay(cardId, state.understoodCards, state.cardOverrides, getActualCost(cardId)) ?? card;
          const isBeingDragged = cardId === draggingCardId;
          const isStaged = cardId === stagedCardId;
          const isMenuOpen = contextMenu?.cardId === cardId;
          const isInBotM = backOfMind.includes(cardId);
          const isInstantCard = card.type === 'instant' || !!card.effects.isInterrupt;
          const showInstantBadge = phase === 'defense' && isInstantCard && isInBotM;
          const showBotMBadge = phase === 'defense' && isInBotM && !isInstantCard;
          const dimInDefense = phase === 'defense' && !isInBotM;
          const isComboSource = phase !== 'defense' && COMBINATIONS.some(r =>
            state.availableCombinations.includes(r.result) && r.ingredients.includes(cardId)
          );
          // Forced-play: non-target cards are non-interactive and greyed out
          const isForcedTarget = tutorialForcedCard === cardId;
          const isLockedByTutorial = !!tutorialForcedCard && !isForcedTarget;
          return (
            <div
              key={idx}
              data-tutorial-id={`card-${cardId}`}
              draggable={!stagedCardId && !isLockedByTutorial}
              onClick={(e) => { if (isLockedByTutorial) { e.stopPropagation(); return; } handleCardClick(e, cardId); }}
              onDragStart={(e) => {
                if (stagedCardId || isLockedByTutorial) { e.preventDefault(); return; }
                const img = new Image();
                img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                e.dataTransfer.setDragImage(img, 0, 0);
                e.dataTransfer.setData('text/plain', cardId);
                e.dataTransfer.effectAllowed = 'move';
                onGhostMove(e.clientX, e.clientY);
                onDragStart(cardId);
              }}
              onDragEnd={onDragEnd}
              onTouchStart={(e) => { if (isLockedByTutorial) return; handleTouchStart(e, cardId); }}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                cursor: isLockedByTutorial ? 'not-allowed' : !stagedCardId ? 'grab' : 'pointer',
                opacity: isBeingDragged || isStaged ? 0.25 : isLockedByTutorial ? 0.25 : dimInDefense ? 0.4 : 1,
                transition: 'opacity 0.15s',
                position: 'relative',
                pointerEvents: isLockedByTutorial ? 'none' : undefined,
              }}
            >
              {showInstantBadge && (
                <div style={{
                  position: 'absolute',
                  top: -10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 10,
                  background: '#d97706',
                  color: '#fff',
                  fontSize: 8,
                  fontWeight: 'bold',
                  letterSpacing: '0.06em',
                  padding: '2px 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}>
                  INTERRUPT
                </div>
              )}
              {isComboSource && (
                <div style={{
                  position: 'absolute',
                  top: -10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 10,
                  background: '#7c3aed',
                  color: '#e9d5ff',
                  fontSize: 8,
                  fontWeight: 'bold',
                  letterSpacing: '0.06em',
                  padding: '2px 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}>
                  COMBO
                </div>
              )}
              {showBotMBadge && (
                <div style={{
                  position: 'absolute',
                  top: -10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  zIndex: 10,
                  background: '#4a1d96',
                  color: '#c4b5fd',
                  fontSize: 8,
                  fontWeight: 'bold',
                  letterSpacing: '0.06em',
                  padding: '2px 5px',
                  borderRadius: 3,
                  whiteSpace: 'nowrap',
                  pointerEvents: 'none',
                }}>
                  BACK OF MIND
                </div>
              )}
              <CardComponent
                card={displayCard}
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
              <p className="text-[#4ecca3] text-xs font-bold leading-none">{contextCard.name}</p>
              <p className="text-[#555] text-[10px] mt-0.5">{contextCard.supertype} · cost {getActualCost(contextMenu.cardId)}</p>
            </div>
            <button
              className={[
                'w-full text-left px-3 py-2.5 text-sm font-medium border-b border-[#0f3460] transition-colors',
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
                  {phase === 'defense'
                    ? (contextCard.type !== 'instant' && !contextCard.effects.isInterrupt
                        ? '(opponent\'s turn)'
                        : '(not in Back of Mind)')
                    : `(need ${getActualCost(contextMenu.cardId)} priority)`}
                </span>
              )}
            </button>
            {canShield && (
              <button
                className="w-full text-left px-3 py-2.5 text-sm text-[#e6a817] hover:bg-[#0f3460] transition-colors cursor-pointer border-b border-[#0f3460]"
                onClick={() => { onPlaceShield(); setContextMenu(null); }}
              >
                Place as Shield
              </button>
            )}
            {validPartners.length > 0 && (
              <button
                className="w-full text-left px-3 py-2.5 text-sm text-[#c084fc] hover:bg-[#0f3460] transition-colors cursor-pointer border-b border-[#0f3460]"
                onClick={() => { setCombinePrompt({ sourceCardId: contextMenu!.cardId, partners: validPartners }); setContextMenu(null); }}
              >
                Combine…
              </button>
            )}
            <button
              className="w-full text-left px-3 py-2.5 text-sm text-[#888] hover:bg-[#0f3460] transition-colors cursor-pointer"
              onClick={() => { setInspectCardId(contextMenu.cardId); setContextMenu(null); }}
            >
              Inspect
            </button>
          </div>
        </>
      )}

      {/* Combine partner picker */}
      {combinePrompt && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setCombinePrompt(null)}
        >
          <div
            className="bg-[#0d1625] border border-[#7c3aed] rounded-xl p-5 max-w-sm w-full font-mono text-[#ddd]"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-1">
              <p className="text-[#c084fc] font-bold text-sm uppercase tracking-widest">Combine</p>
              <button onClick={() => setCombinePrompt(null)} className="text-[#888] text-lg leading-none hover:text-white bg-transparent border-0 cursor-pointer">✕</button>
            </div>
            <p className="text-[#666] text-xs mb-4">
              Select a card from your hand to combine with{' '}
              <span className="text-[#c084fc]">{CARDS[combinePrompt.sourceCardId]?.name ?? combinePrompt.sourceCardId}</span>
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              {combinePrompt.partners.map((partnerId, i) => {
                const partnerCard = CARDS[partnerId];
                if (!partnerCard) return null;
                return (
                  <div
                    key={i}
                    className="cursor-pointer transition-transform hover:-translate-y-1"
                    onClick={() => {
                      onCombineCards(combinePrompt.sourceCardId, partnerId);
                      setCombinePrompt(null);
                    }}
                  >
                    <CardComponent card={partnerCard} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Inspect overlay */}
      {inspectCardId && (
        <CardInspectModal
          cardId={inspectCardId}
          displayCost={getActualCost(inspectCardId)}
          understood={state.understoodCards.has(inspectCardId)}
          cardOverrides={state.cardOverrides}
          onClose={() => setInspectCardId(null)}
        />
      )}

      {showDeck && <PileModal title="Draw Pile" cardIds={drawPile} onClose={() => setShowDeck(false)} />}
      {showDiscard && <PileModal title="Discard Pile" cardIds={discardPile} onClose={() => setShowDiscard(false)} />}
    </div>
  );
}
