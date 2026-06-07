import type { CSSProperties } from 'react';
import type { TutorialStep, TooltipPosition } from '../tutorial/useTutorial';

interface Props {
  step: TutorialStep;
  onDismiss: () => void;
}

function cardStyle(pos: TooltipPosition): CSSProperties {
  switch (pos) {
    case 'top':
      return { position: 'absolute', top: 116, left: '50%', transform: 'translateX(-50%)', width: 280 };
    case 'bottom':
      return { position: 'absolute', bottom: 88, left: '50%', transform: 'translateX(-50%)', width: 280 };
    case 'left':
      return { position: 'absolute', left: 10, top: '30%', transform: 'translateY(-50%)', width: 220 };
    case 'right':
      return { position: 'absolute', right: 10, top: '30%', transform: 'translateY(-50%)', width: 220 };
    default:
      return { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 280 };
  }
}

function Arrow({ pos }: { pos: TooltipPosition }) {
  const base: CSSProperties = { position: 'absolute', width: 0, height: 0 };
  const T = '8px solid transparent';
  const C = '8px solid #4ecca3';
  switch (pos) {
    case 'top':
      // Arrow at top of card, pointing up toward the element above
      return <div style={{ ...base, top: -8, left: '50%', transform: 'translateX(-50%)', borderLeft: T, borderRight: T, borderBottom: C }} />;
    case 'bottom':
      // Arrow at bottom of card, pointing down toward the element below
      return <div style={{ ...base, bottom: -8, left: '50%', transform: 'translateX(-50%)', borderLeft: T, borderRight: T, borderTop: C }} />;
    case 'left':
      // Arrow at top of card pointing up (patience meter is in the HUD above)
      return <div style={{ ...base, top: -8, left: '50%', transform: 'translateX(-50%)', borderLeft: T, borderRight: T, borderBottom: C }} />;
    case 'right':
      return <div style={{ ...base, right: -8, top: '50%', transform: 'translateY(-50%)', borderTop: T, borderBottom: T, borderLeft: C }} />;
    default:
      return null;
  }
}

export default function TutorialTooltip({ step, onDismiss }: Props) {
  return (
    <div className="absolute inset-0 z-40 pointer-events-none">
      <div
        className="bg-[#0d1b2e] border border-[#4ecca3] rounded-xl p-5 shadow-2xl pointer-events-auto"
        style={cardStyle(step.position)}
      >
        <Arrow pos={step.position} />
        <p className="text-[#4ecca3] text-[10px] uppercase tracking-widest font-mono mb-1">Tutorial</p>
        <h3 className="text-white text-base font-bold mb-2">{step.title}</h3>
        <p className="text-[#ccc] text-sm leading-relaxed mb-4">{step.body}</p>
        <button
          onClick={onDismiss}
          className="w-full py-1.5 bg-[#4ecca3] text-black text-sm font-bold rounded hover:bg-[#3db892] transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
