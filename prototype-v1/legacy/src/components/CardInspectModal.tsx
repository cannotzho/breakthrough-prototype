import type { CardOverride } from '../combat/types';
import { cardForDisplay } from '../combat/effects';
import { CARDS } from '../data/cards';
import CardComponent from './CardComponent';

interface Props {
  cardId: string;
  displayCost?: number; // if provided, overrides card.cost for display (e.g. Vampire Network reduction)
  understood?: boolean; // if false, effectText is masked as "???" (#100)
  cardOverrides?: Record<string, CardOverride>; // encounter-specific card patches (#100)
  onClose: () => void;
}

export default function CardInspectModal({ cardId, displayCost, understood = true, cardOverrides = {}, onClose }: Props) {
  const base = CARDS[cardId];
  if (!base) return null;

  // Resolve overrides and apply understanding mask
  const understood_ = new Set<string>(understood ? [cardId] : []);
  const displayCard = cardForDisplay(cardId, understood_, cardOverrides, displayCost) ?? base;
  const shownEffectText = understood ? displayCard.effectText : '???';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="flex flex-col items-center"
        onClick={e => e.stopPropagation()}
      >
        {/* Card scaled up — transformOrigin top keeps it anchored above the text panel */}
        <div style={{ transform: 'scale(1.8)', transformOrigin: 'center top', marginBottom: 106 }}>
          <CardComponent card={displayCard} />
        </div>
        {/* Detail panel: effectText first, flavorText below a separator */}
        <div
          className="bg-[#0d1625] border border-[#1e2a40] rounded-lg p-3 text-left"
          style={{ maxWidth: 240 }}
        >
          <p className="text-[#ccc] text-xs leading-relaxed">{shownEffectText}</p>
          {base.flavorText && understood && (
            <>
              <hr className="border-[#1e2a40] my-2.5" />
              <p className="text-[#666] text-xs italic leading-relaxed">{base.flavorText}</p>
            </>
          )}
        </div>
        <p className="text-[#444] text-[10px] mt-3 font-mono">tap anywhere to close</p>
      </div>
    </div>
  );
}
