import type { CombatState } from '../combat/types';

interface Props {
  state: CombatState;
  encounterName: string;
}

export default function CombatHUD({ state, encounterName }: Props) {
  const { oppPatience, oppMaxPatience, phase, awaitingShieldChoice } = state;

  const patiencePct = Math.max(0, (oppPatience / oppMaxPatience) * 100);

  const hint = awaitingShieldChoice
    ? 'Click one of your shields to sacrifice it.'
    : phase === 'attack'
      ? 'Your turn: click a card for options, or drag to play / place shield.'
      : 'Opponent acting… You may still play Interrupt cards.';

  return (
    <div className="flex flex-wrap items-start gap-2 p-2 bg-[rgba(10,15,30,0.95)] border-b border-[#0f3460]">

      {/* Opponent info */}
      <div className="flex-1 min-w-[140px] bg-[#16213e] rounded p-2 border border-[#0f3460]">
        <p className="text-[#888] text-xs uppercase tracking-wider">Opponent</p>
        <p className="text-white font-bold text-base truncate">{encounterName}</p>
        <p className="text-[#888] text-xs mt-1">
          Patience <span className="text-white">{oppPatience}/{oppMaxPatience}</span>
        </p>
        <div className="w-full h-1.5 bg-[#333] rounded-full mt-1 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#e94560] transition-all duration-300"
            style={{ width: `${patiencePct}%` }}
          />
        </div>
        <p className="text-[#888] text-xs mt-1">
          Shields: {state.oppShields.filter(s => !s.broken).length} / {state.oppShields.length}
        </p>
      </div>

      {/* Hint bar — full width below the boxes */}
      <div className="w-full">
        <p className="text-[#888] text-xs text-center italic px-2">{hint}</p>
      </div>
    </div>
  );
}
