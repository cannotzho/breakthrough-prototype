import { useState, useRef } from 'react';
import { CARDS } from '../data/cards';
import { ENCOUNTERS } from '../data/encounters';
import CardComponent from './CardComponent';

interface Props {
  compendium: string[];
  encounterId: string;
  onConfirm: (chosen: string[]) => void;
  onCancel: () => void;
}

const MAX_DECK = 15;

export default function DeckBuilder({ compendium, encounterId, onConfirm, onCancel }: Props) {
  const encounter = ENCOUNTERS[encounterId];
  const [selected, setSelected] = useState<string[]>([]);
  const [shake, setShake] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Deduplicate compendium for display
  const uniqueIds = [...new Set(compendium)].filter(id => CARDS[id]);
  const relevantSet = new Set(encounter.worldDeck);

  // Relevant cards first, then others (both groups alphabetical by name)
  const sorted = [...uniqueIds].sort((a, b) => {
    const aRel = relevantSet.has(a) ? 0 : 1;
    const bRel = relevantSet.has(b) ? 0 : 1;
    if (aRel !== bRel) return aRel - bRel;
    return (CARDS[a]?.name ?? a).localeCompare(CARDS[b]?.name ?? b);
  });

  function toggle(cardId: string) {
    if (selected.includes(cardId)) {
      setSelected(prev => prev.filter(id => id !== cardId));
      return;
    }
    if (selected.length >= MAX_DECK) {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      setShake(true);
      shakeTimer.current = setTimeout(() => setShake(false), 600);
      return;
    }
    setSelected(prev => [...prev, cardId]);
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a1a] text-white overflow-hidden">

      {/* Header */}
      <div className="flex-shrink-0 px-4 pt-4 pb-2 border-b border-[#0f3460]">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[#e94560] font-bold text-lg tracking-wide">Prepare Your Deck</h1>
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

        {/* Counter */}
        <div
          className="flex items-center gap-2"
          style={shake ? { animation: 'deckShake 0.4s ease' } : undefined}
        >
          <span
            className={[
              'font-mono text-sm font-bold',
              selected.length >= MAX_DECK ? 'text-[#e94560]' : 'text-[#4ecca3]',
            ].join(' ')}
          >
            {selected.length} / {MAX_DECK} cards selected
          </span>
          {shake && (
            <span className="text-[#e94560] text-xs font-mono animate-pulse">
              Deck limit reached!
            </span>
          )}
        </div>

        {/* Relevance legend */}
        <p className="text-[#555] text-[10px] font-mono mt-1">
          <span className="text-[#f4d03f]">★</span> = relevant to this encounter
        </p>
      </div>

      {/* Card grid */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="flex flex-wrap gap-2 justify-start">
          {sorted.map(id => {
            const card = CARDS[id]!;
            const isRelevant = relevantSet.has(id);
            const isSelected = selected.includes(id);
            return (
              <div key={id} className="relative">
                {/* Relevance star badge */}
                {isRelevant && (
                  <span className="absolute -top-1 -left-1 z-10 text-[#f4d03f] text-xs leading-none pointer-events-none">
                    ★
                  </span>
                )}
                {/* Relevance glow */}
                <div
                  className={isRelevant ? 'rounded-md' : ''}
                  style={isRelevant ? {
                    boxShadow: isSelected
                      ? '0 0 14px rgba(244,208,63,0.5)'
                      : '0 0 8px rgba(244,208,63,0.2)',
                  } : undefined}
                >
                  <CardComponent
                    card={card}
                    selected={isSelected}
                    onClick={() => toggle(id)}
                  />
                </div>
              </div>
            );
          })}
        </div>
        {uniqueIds.length === 0 && (
          <p className="text-[#555] font-mono text-sm text-center mt-8">
            No cards in compendium yet.
          </p>
        )}
      </div>

      {/* Footer — pinned Begin Encounter button */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-[#0f3460] bg-[#0a0a1a]">
        <button
          onClick={() => selected.length > 0 && onConfirm(selected)}
          disabled={selected.length === 0}
          className={[
            'w-full py-3 rounded-md font-bold font-mono text-sm tracking-wide transition-all',
            selected.length > 0
              ? 'bg-[#e94560] hover:bg-[#c73652] text-white cursor-pointer'
              : 'bg-[#1a1a2e] text-[#444] cursor-not-allowed border border-[#0f3460]',
          ].join(' ')}
        >
          {selected.length > 0 ? `Begin Encounter (${selected.length} cards)` : 'Select at least 1 card'}
        </button>
      </div>

      {/* Keyframe for shake animation */}
      <style>{`
        @keyframes deckShake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-6px); }
          40%       { transform: translateX(6px); }
          60%       { transform: translateX(-4px); }
          80%       { transform: translateX(4px); }
        }
      `}</style>
    </div>
  );
}
