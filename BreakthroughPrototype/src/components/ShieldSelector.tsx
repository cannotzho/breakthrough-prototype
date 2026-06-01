import { useState } from 'react';
import { CARDS } from '../data/cards';
import { ENCOUNTERS } from '../data/encounters';
import CardComponent from './CardComponent';

interface Props {
  chosenWorldDeck: string[];
  encounterId: string;
  onConfirm: (preShields: string[]) => void;
  onCancel: () => void;
}

export default function ShieldSelector({ chosenWorldDeck, encounterId, onConfirm, onCancel }: Props) {
  const encounter = ENCOUNTERS[encounterId];
  const maxShields = encounter.playerShields;

  const [selected, setSelected] = useState<string[]>([]);

  // De-duplicate for display (same as DeckBuilder approach)
  const uniqueIds = [...new Set(chosenWorldDeck)].filter(id => CARDS[id]);

  function toggle(cardId: string) {
    if (selected.includes(cardId)) {
      setSelected(prev => prev.filter(id => id !== cardId));
    } else if (selected.length < maxShields) {
      setSelected(prev => [...prev, cardId]);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a1a] text-white overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2 border-b border-[#0f3460]">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[#e6a817] font-bold text-lg tracking-wide">Place Your Shields</h1>
          <button
            onClick={onCancel}
            className="text-[#555] hover:text-[#bbb] text-sm font-mono transition-colors"
          >
            ✕ Cancel
          </button>
        </div>
        <p className="text-[#666] text-xs font-mono mb-2">
          Encounter: <span className="text-[#bbb]">{encounter.name}</span>
        </p>
        <p className="text-[#888] text-xs font-mono">
          Choose up to{' '}
          <span className={selected.length >= maxShields ? 'text-[#e6a817] font-bold' : 'text-[#4ecca3] font-bold'}>
            {maxShields}
          </span>{' '}
          cards to place face-down as starting shields.{' '}
          <span className="text-[#555]">
            Selected cards are removed from your deck.
          </span>
        </p>
        <div className="flex items-center gap-2 mt-2">
          <span className={['font-mono text-sm font-bold', selected.length >= maxShields ? 'text-[#e6a817]' : 'text-[#4ecca3]'].join(' ')}>
            {selected.length} / {maxShields} shields chosen
          </span>
          {selected.length >= maxShields && (
            <span className="text-[#e6a817] text-xs font-mono">All slots filled</span>
          )}
        </div>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {uniqueIds.length === 0 ? (
          <p className="text-[#555] font-mono text-sm text-center mt-8">
            No cards in your deck.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2 justify-start">
            {uniqueIds.map(id => {
              const card = CARDS[id]!;
              const isSelected = selected.includes(id);
              const isDisabled = !isSelected && selected.length >= maxShields;
              return (
                <div
                  key={id}
                  className="relative"
                  style={{ opacity: isDisabled ? 0.4 : 1, transition: 'opacity 0.15s' }}
                >
                  {isSelected && (
                    <span className="absolute -top-1 -left-1 z-10 text-[#e6a817] text-xs leading-none pointer-events-none font-bold">
                      ▣
                    </span>
                  )}
                  <div
                    className={isSelected ? 'rounded-md' : ''}
                    style={isSelected ? { boxShadow: '0 0 14px rgba(230,168,23,0.6)' } : undefined}
                  >
                    <CardComponent
                      card={card}
                      selected={isSelected}
                      disabled={isDisabled}
                      onClick={isDisabled ? undefined : () => toggle(id)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-[#0f3460] bg-[#0a0a1a]">
        {selected.length < maxShields && (
          <p className="text-[#555] text-xs font-mono text-center mb-2">
            {selected.length === 0
              ? 'No shields selected — you will start with empty shield slots.'
              : `${maxShields - selected.length} slot${maxShields - selected.length !== 1 ? 's' : ''} will start empty.`}
          </p>
        )}
        <button
          onClick={() => onConfirm(selected)}
          className="w-full py-3 rounded-md font-bold font-mono text-sm tracking-wide transition-all bg-[#e94560] hover:bg-[#c73652] text-white cursor-pointer"
        >
          Begin Encounter
          {selected.length > 0 ? ` (${selected.length} shield${selected.length !== 1 ? 's' : ''} placed)` : ''}
        </button>
      </div>
    </div>
  );
}
