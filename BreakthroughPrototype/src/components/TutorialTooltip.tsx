import type { TutorialStep } from '../tutorial/useTutorial';

interface Props {
  step: TutorialStep;
  onDismiss: () => void;
}

export default function TutorialTooltip({ step, onDismiss }: Props) {
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center">
      <div className="bg-[#0d1b2e] border border-[#4ecca3] rounded-xl p-5 shadow-2xl max-w-xs w-full mx-4">
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
