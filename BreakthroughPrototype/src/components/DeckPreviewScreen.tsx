import { CARDS, DETECTIVE_PERSONAL_DECK } from '../data/cards';
import { ENCOUNTERS } from '../data/encounters';
import CardComponent from './CardComponent';

interface Props {
  encounterId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function btn(bg: string, border: string): React.CSSProperties {
  return {
    background: bg, border: `1px solid ${border}`, color: '#fff',
    padding: '10px 28px', borderRadius: 6,
    fontFamily: 'monospace', fontSize: 14, cursor: 'pointer',
  };
}

export default function DeckPreviewScreen({ encounterId, onConfirm, onCancel }: Props) {
  const encounter = ENCOUNTERS[encounterId];
  const personalDeckIds = [
    ...DETECTIVE_PERSONAL_DECK,
    ...(encounter?.personalDeck ?? []),
  ];

  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#090912',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: 24, overflow: 'hidden',
      fontFamily: 'monospace',
    }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <p style={{
          color: '#e94560', fontWeight: 'bold', fontSize: 11,
          letterSpacing: 2, margin: '0 0 6px', textTransform: 'uppercase',
        }}>
          Entering Interrogation
        </p>
        <p style={{
          color: '#c8a96e', fontWeight: 'bold', fontSize: 22,
          margin: '0 0 8px', letterSpacing: 1,
        }}>
          {encounter?.name ?? encounterId}
        </p>
        <p style={{ color: '#555', fontSize: 12, margin: 0 }}>
          Your personal deck — {personalDeckIds.length} cards
        </p>
      </div>

      <div style={{
        background: '#16213e', border: '2px solid #0f3460',
        borderRadius: 12, padding: '20px 24px',
        maxWidth: 900, width: '100%',
        maxHeight: '60vh', overflowY: 'auto',
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
          gap: 12,
          justifyItems: 'center',
        }}>
          {personalDeckIds.map((id, i) => {
            const card = CARDS[id];
            if (!card) return null;
            return <CardComponent key={`${id}-${i}`} card={card} />;
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 24 }}>
        <button onClick={onCancel} style={btn('#0a0a18', '#1e2a40')}>
          ← Back
        </button>
        <button onClick={onConfirm} style={btn('#8a1030', '#e94560')}>
          Enter Fight →
        </button>
      </div>
    </div>
  );
}
