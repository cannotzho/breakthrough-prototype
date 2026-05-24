import { useEffect } from 'react';
import { useCombat } from '../combat/Combat';
import { ENCOUNTERS } from '../data/encounters';
import { CARDS } from '../data/cards';
import CombatHUD from './CombatHUD';
import Battlefield from './Battlefield';
import HandArea from './HandArea';
import CombatLog from './CombatLog';

interface Props {
  encounterId: string;
  onEnd: (won: boolean) => void;
}

export default function CombatScreen({ encounterId, onEnd }: Props) {
  const encounter = ENCOUNTERS[encounterId];
  const { state, selectCard, playCard, placeShield, chooseShieldToBreak } = useCombat(encounter);

  // Notify parent once combat is resolved (with a short delay for the player to read final log)
  useEffect(() => {
    if (!state.gameOver) return;
    const timer = setTimeout(() => onEnd(state.winner === 'player'), 2000);
    return () => clearTimeout(timer);
  }, [state.gameOver, state.winner, onEnd]);

  return (
    <div className="flex flex-col h-full bg-[#0a0a1a] relative">

      {/* HUD */}
      <CombatHUD state={state} encounterName={encounter.name} />

      {/* Main area: battlefield + log side by side on larger screens */}
      <div className="flex flex-1 overflow-hidden">
        <Battlefield state={state} onChooseShield={chooseShieldToBreak} />

        {/* Log — sidebar on desktop, hidden on very small screens */}
        <div className="hidden sm:flex flex-col w-[200px] flex-shrink-0 p-2">
          <CombatLog logs={state.logs} />

          {/* Collected info cards */}
          {state.collectedInfo.length > 0 && (
            <div className="mt-2 bg-[rgba(10,15,30,0.92)] border border-[#0f3460] rounded-md p-2">
              <p className="text-[#4ecca3] text-[10px] uppercase tracking-wider mb-1">Intel Obtained</p>
              {state.collectedInfo.map((id, i) => (
                <p key={i} className="text-[#bbb] text-[9px] py-0.5 border-b border-[#1a1a2e] last:border-0">
                  {CARDS[id]?.name ?? id}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile log — shown below battlefield on small screens */}
      <div className="sm:hidden px-2 pb-1 max-h-[100px] overflow-hidden">
        <CombatLog logs={state.logs} />
      </div>

      {/* Hand */}
      <HandArea
        state={state}
        onSelectCard={selectCard}
        onPlayCard={playCard}
        onPlaceShield={placeShield}
      />

      {/* Game over overlay */}
      {state.gameOver && (
        <div className="absolute inset-0 bg-[rgba(0,0,0,0.85)] flex flex-col items-center justify-center z-10 p-6">
          <h2
            className="text-4xl font-bold mb-4"
            style={{ color: state.winner === 'player' ? '#4ecca3' : '#e94560' }}
          >
            {state.winner === 'player' ? 'Breakthrough!' : 'Case Stalled'}
          </h2>
          <p className="text-[#bbb] text-center max-w-sm mb-2 leading-relaxed">
            {state.winner === 'player'
              ? "You extracted the key information. Returning to the overworld…"
              : "The conversation broke down. You walked away empty-handed. Returning…"}
          </p>
          {state.winner === 'player' && state.collectedInfo.length > 0 && (
            <div className="mt-2 text-center">
              <p className="text-[#4ecca3] text-sm font-semibold mb-1">Intel collected:</p>
              {state.collectedInfo.map((id, i) => (
                <p key={i} className="text-[#bbb] text-sm">{CARDS[id]?.name ?? id}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
