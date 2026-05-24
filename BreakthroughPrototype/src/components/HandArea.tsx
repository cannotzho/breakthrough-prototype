import { CARDS } from '../data/cards';
import type { CombatState } from '../combat/types';
import CardComponent from './CardComponent';

interface Props {
  state: CombatState;
  onSelectCard: (id: string) => void;
  onPlayCard: (id: string) => void;
  onPlaceShield: () => void;
}

export default function HandArea({ state, onSelectCard, onPlayCard, onPlaceShield }: Props) {
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
    if (!isPlayable(cardId) && cardId !== selectedCardId) return;
    if (selectedCardId === cardId) {
      // Second tap on selected card: play it
      onPlayCard(cardId);
    } else {
      onSelectCard(cardId);
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
        const selected = selectedCardId === cardId;
        return (
          <CardComponent
            key={idx}
            card={{ ...card, cost: getActualCost(cardId) }}
            selected={selected}
            disabled={!playable && !selected}
            onClick={() => handleCardTap(cardId)}
          />
        );
      })}

      {hand.length === 0 && (
        <p className="text-[#555] text-sm italic flex-1 text-center">— No cards in hand —</p>
      )}
    </div>
  );
}
