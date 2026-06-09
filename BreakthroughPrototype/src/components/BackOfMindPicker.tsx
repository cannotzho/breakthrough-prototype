import { useState } from 'react';
import { CARDS } from '../data/cards';
import CardComponent from './CardComponent';

// EXPERIMENTAL (BotM #84): picker shown when the player loses priority
export default function BackOfMindPicker({ hand, onConfirm }: { hand: string[]; onConfirm: (keptIds: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(cardId: string) {
    setSelected(prev => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= 3) return prev;
      return [...prev, cardId];
    });
  }

  return (
    <div className="absolute inset-0 z-[70] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-4">
        <div className="text-center">
          <p className="text-[#c4b5fd] text-xs uppercase tracking-[0.2em] font-mono mb-1">Back of Mind</p>
          <h2 className="text-white text-lg font-bold font-mono mb-1">Choose up to 3 cards to keep</h2>
          <p className="text-[#888] text-xs leading-relaxed">
            The rest are discarded. Kept cards can only be played if they're Instants.
            You'll draw 5 new cards when you regain priority.
          </p>
        </div>

        {hand.length === 0 ? (
          <p className="text-[#555] text-sm font-mono italic">No cards in hand.</p>
        ) : (
          <div className="flex flex-wrap gap-2 justify-center">
            {hand.map((cardId, idx) => {
              const card = CARDS[cardId];
              if (!card) return null;
              const isSelected = selected.includes(cardId);
              const isInstant = !!card.effects.isInstant;
              return (
                <div
                  key={idx}
                  onClick={() => toggle(cardId)}
                  style={{
                    cursor: 'pointer',
                    position: 'relative',
                    opacity: !isSelected && selected.length >= 3 ? 0.35 : 1,
                    transition: 'opacity 0.15s, transform 0.15s',
                    transform: isSelected ? 'translateY(-8px)' : undefined,
                    outline: isSelected ? '2px solid #c4b5fd' : undefined,
                    borderRadius: 6,
                  }}
                >
                  <CardComponent card={card} />
                  {isSelected && (
                    <div style={{
                      position: 'absolute', top: -8, right: -6,
                      background: '#7c3aed', color: '#fff', borderRadius: '50%',
                      width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 'bold', pointerEvents: 'none',
                    }}>✓</div>
                  )}
                  {isInstant && (
                    <div style={{
                      position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
                      background: '#d97706', color: '#fff', borderRadius: 3,
                      fontSize: 8, fontWeight: 'bold', padding: '2px 5px', whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                    }}>INSTANT</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3 mt-2">
          <span className="text-[#888] text-xs font-mono">{selected.length}/3 selected</span>
          <button
            onClick={() => onConfirm(selected)}
            className="px-6 py-2.5 bg-[#7c3aed] text-white rounded font-bold font-mono text-sm hover:bg-[#6d28d9] transition-colors"
          >
            {selected.length === 0 ? 'Discard All' : `Keep ${selected.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
