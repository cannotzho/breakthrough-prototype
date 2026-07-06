import { useRef, useState } from 'react';
import { CARDS } from '../data/cards';
import CardComponent from './CardComponent';

interface Props {
  personalDeck: string[];
  compendium: string[];
  onUpdate: (deck: string[]) => void;
  onClose: () => void;
}

const MAX_DECK = 15;

export default function PersonalDeckPanel({ personalDeck, compendium, onUpdate, onClose }: Props) {
  const [deck, setDeck] = useState<string[]>(personalDeck);
  const [shake, setShake] = useState(false);
  const shakeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Personal-supertype cards available in compendium (deduped)
  const availablePersonal = [...new Set(compendium)].filter(id => {
    const card = CARDS[id];
    return card && card.supertype === 'Personal';
  });

  // Cards available to add (not already in deck)
  const deckSet = new Set(deck);
  const addable = availablePersonal.filter(id => !deckSet.has(id));

  function toggle(cardId: string) {
    if (deckSet.has(cardId)) {
      const next = deck.filter(id => id !== cardId);
      setDeck(next);
      onUpdate(next);
      return;
    }
    if (deck.length >= MAX_DECK) {
      if (shakeTimer.current) clearTimeout(shakeTimer.current);
      setShake(true);
      shakeTimer.current = setTimeout(() => setShake(false), 600);
      return;
    }
    const next = [...deck, cardId];
    setDeck(next);
    onUpdate(next);
  }

  const panelStyle: React.CSSProperties = {
    position: 'absolute', inset: 0, background: '#000000aa',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    zIndex: 100,
  };

  const innerStyle: React.CSSProperties = {
    background: '#0a0a1a', border: '2px solid #0f3460',
    borderRadius: 12, padding: 24, maxWidth: 700, width: '100%',
    maxHeight: '88vh', display: 'flex', flexDirection: 'column',
    fontFamily: 'monospace', color: '#ddd',
    gap: 16,
  };

  return (
    <div style={panelStyle} onClick={onClose}>
      <div style={innerStyle} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ color: '#e94560', fontWeight: 'bold', fontSize: 16, margin: '0 0 4px', letterSpacing: 1 }}>
              Personal Deck
            </p>
            <p style={{ color: '#555', fontSize: 11, margin: 0 }}>
              Your detective's core cards — always available in combat
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#666', fontSize: 18, cursor: 'pointer', lineHeight: 1, padding: 0 }}
          >✕</button>
        </div>

        {/* Deck count */}
        <div
          style={shake ? { animation: 'deckShake 0.4s ease' } : undefined}
        >
          <span style={{
            fontFamily: 'monospace', fontSize: 13, fontWeight: 'bold',
            color: deck.length >= MAX_DECK ? '#e94560' : '#4ecca3',
          }}>
            {deck.length} / {MAX_DECK} cards
          </span>
          {shake && (
            <span style={{ color: '#e94560', fontSize: 11, marginLeft: 12 }}>Deck limit reached!</span>
          )}
        </div>

        {/* Current deck */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <p style={{ color: '#888', fontSize: 11, margin: '0 0 8px', letterSpacing: 1, textTransform: 'uppercase' }}>
            In Deck — click to remove
          </p>
          {deck.length === 0 ? (
            <p style={{ color: '#333', fontSize: 13, padding: '12px 0' }}>No cards in deck.</p>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {deck.map(id => {
                const card = CARDS[id];
                if (!card) return null;
                return (
                  <div key={id} style={{ position: 'relative' }}>
                    <div style={{
                      outline: '2px solid #4ecca3',
                      outlineOffset: 2,
                      borderRadius: 8,
                      boxShadow: '0 0 10px rgba(78,204,163,0.3)',
                    }}>
                      <CardComponent card={card} onClick={() => toggle(id)} />
                    </div>
                    <div style={{
                      position: 'absolute', top: 3, right: 3,
                      background: '#0a2a1e', border: '1px solid #4ecca3',
                      borderRadius: 3, padding: '1px 5px',
                      fontSize: 9, color: '#4ecca3', pointerEvents: 'none',
                    }}>✓</div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Available to add */}
          {addable.length > 0 && (
            <>
              <p style={{ color: '#555', fontSize: 11, margin: '16px 0 8px', letterSpacing: 1, textTransform: 'uppercase' }}>
                Available to add — click to add
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {addable.map(id => {
                  const card = CARDS[id];
                  if (!card) return null;
                  return (
                    <div key={id} style={{ opacity: 0.6 }}>
                      <CardComponent card={card} onClick={() => toggle(id)} />
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {availablePersonal.length === 0 && (
            <p style={{ color: '#333', fontSize: 12, marginTop: 16 }}>
              No additional Personal cards in compendium yet.
            </p>
          )}
        </div>

        <p style={{ color: '#333', fontSize: 10, textAlign: 'center', margin: 0 }}>
          Press D to close
        </p>
      </div>

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
