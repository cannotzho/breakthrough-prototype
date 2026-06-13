interface Props {
  onContinue: () => void;
}

export default function SceneDescriptionScreen({ onContinue }: Props) {
  return (
    <div
      onClick={onContinue}
      style={{
        width: '100%', height: '100%',
        background: '#000',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <p style={{
        color: '#888',
        fontSize: 'clamp(14px, 2.5vw, 20px)',
        fontStyle: 'italic',
        fontFamily: '"Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif',
        letterSpacing: '0.02em',
        textAlign: 'center',
        margin: 0,
        padding: '0 40px',
        lineHeight: 1.8,
      }}>
        In a dark alley, somewhere in the city of Shaiyapur...
      </p>

      <p style={{
        position: 'absolute',
        bottom: 40,
        left: '50%',
        transform: 'translateX(-50%)',
        color: '#282828',
        fontSize: 11,
        fontFamily: 'monospace',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        margin: 0,
      }}>
        Click to continue
      </p>
    </div>
  );
}
