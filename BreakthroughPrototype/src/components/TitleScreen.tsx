import { useState } from 'react';

interface Props {
  onNewGame: () => void;
}

export default function TitleScreen({ onNewGame }: Props) {
  const [noSave, setNoSave] = useState(false);

  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#050508',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace',
      userSelect: 'none',
    }}>
      <div style={{
        color: '#e94560',
        fontSize: 'clamp(40px, 8vw, 80px)',
        fontWeight: 'bold',
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        textShadow: '0 0 40px #e9456066, 0 0 100px #e9456033',
        marginBottom: 10,
      }}>
        Breakthrough
      </div>
      <div style={{
        color: '#2e2e38',
        fontSize: 11,
        letterSpacing: '0.5em',
        textTransform: 'uppercase',
        marginBottom: 80,
      }}>
        A Detective Card Game
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', width: 220 }}>
        <button
          onClick={onNewGame}
          style={{
            width: '100%', padding: '12px 0',
            background: 'none', border: '1px solid #e94560',
            color: '#e94560', fontFamily: 'monospace', fontSize: 14,
            letterSpacing: '0.1em', cursor: 'pointer', borderRadius: 3,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#e9456018'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
        >
          New Game
        </button>
        <button
          onClick={() => setNoSave(true)}
          style={{
            width: '100%', padding: '12px 0',
            background: 'none', border: '1px solid #222',
            color: '#3a3a3a', fontFamily: 'monospace', fontSize: 14,
            letterSpacing: '0.1em', cursor: 'pointer', borderRadius: 3,
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#444';
            (e.currentTarget as HTMLButtonElement).style.color = '#555';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = '#222';
            (e.currentTarget as HTMLButtonElement).style.color = '#3a3a3a';
          }}
        >
          Load Game
        </button>
        {noSave && (
          <p style={{ color: '#3a3a3a', fontSize: 12, margin: 0, letterSpacing: '0.05em' }}>
            No save found.
          </p>
        )}
      </div>
    </div>
  );
}
