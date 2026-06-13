import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { TutorialStep, TooltipPosition } from '../tutorial/useTutorial';

interface Props {
  step: TutorialStep;
  onDismiss: () => void;
}

function cardStyle(pos: TooltipPosition): CSSProperties {
  switch (pos) {
    case 'top':
      return { position: 'absolute', top: 116, left: '50%', transform: 'translateX(-50%)', width: 300 };
    case 'bottom':
      return { position: 'absolute', bottom: 88, left: '50%', transform: 'translateX(-50%)', width: 300 };
    case 'left':
      return { position: 'absolute', left: 10, top: '30%', transform: 'translateY(-50%)', width: 240 };
    case 'right':
      return { position: 'absolute', right: 10, top: '30%', transform: 'translateY(-50%)', width: 240 };
    case 'upper-center':
      return { position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%, -50%)', width: 300 };
    default:
      return { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 300 };
  }
}

function Arrow({ pos }: { pos: TooltipPosition }) {
  const base: CSSProperties = { position: 'absolute', width: 0, height: 0 };
  const T = '8px solid transparent';
  const C = '8px solid #4ecca3';
  switch (pos) {
    case 'top':
      return <div style={{ ...base, top: -8, left: '50%', transform: 'translateX(-50%)', borderLeft: T, borderRight: T, borderBottom: C }} />;
    case 'bottom':
      return <div style={{ ...base, bottom: -8, left: '50%', transform: 'translateX(-50%)', borderLeft: T, borderRight: T, borderTop: C }} />;
    case 'left':
      return <div style={{ ...base, top: -8, left: '50%', transform: 'translateX(-50%)', borderLeft: T, borderRight: T, borderBottom: C }} />;
    case 'right':
      return <div style={{ ...base, right: -8, top: '50%', transform: 'translateY(-50%)', borderTop: T, borderBottom: T, borderLeft: C }} />;
    case 'upper-center':
      return <div style={{ ...base, top: -8, left: '50%', transform: 'translateX(-50%)', borderLeft: T, borderRight: T, borderBottom: C }} />;
    default:
      return null;
  }
}

// Highlight ring — finds the element with data-tutorial-id matching the target
// and renders a pulsing gold border around it.
function HighlightRing({ target, zIndex }: { target: string; zIndex: number }) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    function update() {
      const el = document.querySelector(`[data-tutorial-id="${target}"]`);
      if (el) setRect(el.getBoundingClientRect());
    }
    update();
    const interval = setInterval(update, 200);
    return () => clearInterval(interval);
  }, [target]);

  if (!rect) return null;

  const pad = 6;
  return (
    <div
      style={{
        position: 'fixed',
        top: rect.top - pad,
        left: rect.left - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
        borderRadius: 8,
        border: '2px solid #e6a817',
        boxShadow: '0 0 12px rgba(230,168,23,0.7)',
        pointerEvents: 'none',
        zIndex,
        animation: 'tutorialHighlightPulse 1.2s ease-in-out infinite',
      }}
    />
  );
}

// Ghost drag — animates a card silhouette from the hand toward the play zone (or shield zone)
function GhostDrag({ cardId, targetId, zIndex }: { cardId: string; targetId: string; zIndex: number }) {
  const [startRect, setStartRect] = useState<DOMRect | null>(null);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    function update() {
      const cardEl = document.querySelector(`[data-tutorial-id="card-${cardId}"]`);
      const zoneEl = document.querySelector(`[data-tutorial-id="${targetId}"]`);
      if (cardEl) setStartRect(cardEl.getBoundingClientRect());
      if (zoneEl) setTargetRect(zoneEl.getBoundingClientRect());
    }
    update();
    const interval = setInterval(update, 300);
    return () => clearInterval(interval);
  }, [cardId, targetId]);

  if (!startRect) return null;

  // If no play zone target found, just pulse above the hand
  const endX = targetRect ? targetRect.left + targetRect.width / 2 : startRect.left + startRect.width / 2;
  const endY = targetRect ? targetRect.top + targetRect.height / 2 : startRect.top - 80;

  const startX = startRect.left + startRect.width / 2;
  const startY = startRect.top + startRect.height / 2;

  return (
    <div
      style={{
        position: 'fixed',
        width: 60,
        height: 84,
        borderRadius: 6,
        background: 'rgba(78,204,163,0.3)',
        border: '2px dashed #4ecca3',
        pointerEvents: 'none',
        zIndex,
        // Use CSS custom properties for animation
        '--ghost-start-x': `${startX - 30}px`,
        '--ghost-start-y': `${startY - 42}px`,
        '--ghost-end-x': `${endX - 30}px`,
        '--ghost-end-y': `${endY - 42}px`,
        left: 0,
        top: 0,
        animation: 'tutorialGhostDrag 1.8s ease-in-out infinite',
      } as CSSProperties}
    />
  );
}

export default function TutorialTooltip({ step, onDismiss }: Props) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const baseZ = step.overlayZIndex ?? 40;

  return (
    <>
      <style>{`
        @keyframes tutorialHighlightPulse {
          0%, 100% { opacity: 0.6; box-shadow: 0 0 8px rgba(230,168,23,0.5); }
          50%       { opacity: 1;   box-shadow: 0 0 20px rgba(230,168,23,0.9); }
        }
        @keyframes tutorialGhostDrag {
          0%   { left: var(--ghost-start-x); top: var(--ghost-start-y); opacity: 0.9; }
          60%  { left: var(--ghost-end-x);   top: var(--ghost-end-y);   opacity: 0.6; }
          80%  { left: var(--ghost-end-x);   top: var(--ghost-end-y);   opacity: 0.3; }
          100% { left: var(--ghost-start-x); top: var(--ghost-start-y); opacity: 0.9; }
        }
      `}</style>

      {/* Dim overlay — semi-transparent so the player can see the game underneath */}
      <div className="absolute inset-0 pointer-events-none bg-black/40" style={{ zIndex: baseZ }} />

      {/* Highlight ring */}
      {step.highlightTarget && <HighlightRing target={step.highlightTarget} zIndex={baseZ + 5} />}

      {/* Ghost drag animation */}
      {step.showGhostDrag && step.ghostDragCardId && (
        <GhostDrag
          cardId={step.ghostDragCardId}
          targetId={step.ghostDragTarget ?? 'play-zone'}
          zIndex={baseZ + 6}
        />
      )}

      {/* Tooltip card */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: baseZ }}>
        <div
          ref={tooltipRef}
          className="bg-[#0d1b2e] border border-[#4ecca3] rounded-xl p-5 shadow-2xl pointer-events-auto"
          style={cardStyle(step.position)}
        >
          <Arrow pos={step.position} />
          <p className="text-[#4ecca3] text-[10px] uppercase tracking-widest font-mono mb-1">Tutorial</p>
          <h3 className="text-white text-base font-bold mb-2">{step.title}</h3>
          <p className="text-[#ccc] text-sm leading-relaxed mb-4">{step.body}</p>
          {!step.forcedPlayCard && (
            <button
              onClick={onDismiss}
              className="w-full py-1.5 bg-[#4ecca3] text-black text-sm font-bold rounded hover:bg-[#3db892] transition-colors"
            >
              Got it
            </button>
          )}
          {step.forcedPlayCard && (
            <p className="text-[#4ecca3] text-[10px] uppercase tracking-widest font-mono text-center opacity-60">
              Play the card to continue
            </p>
          )}
        </div>
      </div>
    </>
  );
}
