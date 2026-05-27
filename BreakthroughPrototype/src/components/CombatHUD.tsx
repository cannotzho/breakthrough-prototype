import type { CombatState } from '../combat/types';

interface Props {
  state: CombatState;
  encounterName: string;
}

export default function CombatHUD({ state, encounterName }: Props) {
  const { priority, oppPatience, oppMaxPatience, phase, awaitingShieldChoice } = state;

  const patiencePct = Math.max(0, (oppPatience / oppMaxPatience) * 100);

  const phaseLabel = awaitingShieldChoice
    ? 'Choose Shield'
    : phase === 'attack' ? 'Attack Phase' : 'Defense Phase';
  const phaseColor = awaitingShieldChoice
    ? '#f4d03f'
    : phase === 'attack' ? '#4ecca3' : '#e94560';

  const hint = awaitingShieldChoice
    ? 'Click one of your shields to sacrifice it.'
    : phase === 'attack'
      ? 'Your turn: tap a card to select, tap again to play. Or place a Shield.'
      : 'Defense Phase — Opponent acting… You may still play Instant cards.';

  return (
    <div className="flex flex-wrap items-start gap-2 p-2 bg-[rgba(10,15,30,0.95)] border-b border-[#0f3460]">

      {/* Opponent info */}
      <div className="flex-1 min-w-[140px] bg-[#16213e] rounded p-2 border border-[#0f3460]">
        <p className="text-[#888] text-[10px] uppercase tracking-wider">Opponent</p>
        <p className="text-white font-bold text-sm truncate">{encounterName}</p>
        <p className="text-[#888] text-[10px] mt-1">
          Patience <span className="text-white">{oppPatience}/{oppMaxPatience}</span>
        </p>
        <div className="w-full h-1.5 bg-[#333] rounded-full mt-1 overflow-hidden">
          <div
            className="h-full rounded-full bg-[#e94560] transition-all duration-300"
            style={{ width: `${patiencePct}%` }}
          />
        </div>
        <p className="text-[#888] text-[10px] mt-1">
          Shields: {state.oppShields.filter(s => !s.broken).length} / {state.oppShields.length}
        </p>
      </div>

      {/* Phase */}
      <div className="flex-1 min-w-[120px] bg-[#16213e] rounded p-2 border border-[#0f3460] text-center">
        <p className="text-[#888] text-[10px] uppercase tracking-wider">Phase</p>
        <p className="font-bold text-sm" style={{ color: phaseColor }}>{phaseLabel}</p>
        <p className="text-[#888] text-[10px] mt-1">Priority</p>
        <p className="font-bold text-lg leading-none" style={{ color: priority > 0 ? '#4ecca3' : priority < 0 ? '#e94560' : '#888' }}>
          {priority > 0 ? `+${priority}` : priority}
        </p>
      </div>

      {/* Player info */}
      <div className="flex-1 min-w-[140px] bg-[#16213e] rounded p-2 border border-[#0f3460]">
        <p className="text-[#888] text-[10px] uppercase tracking-wider">Detective</p>
        <p className="text-white font-bold text-sm">You</p>
        <p className="text-[#888] text-[10px] mt-1">
          Shields: {state.playerShields.filter(s => !s.broken).length} / {state.playerShields.length}
        </p>
        <p className="text-[#888] text-[10px] mt-0.5">
          Hand: <span className="text-white">{state.hand.length}</span> cards
        </p>
      </div>

      {/* Hint bar — full width below the boxes */}
      <div className="w-full">
        <p className="text-[#888] text-[10px] text-center italic px-2">{hint}</p>
      </div>
    </div>
  );
}
