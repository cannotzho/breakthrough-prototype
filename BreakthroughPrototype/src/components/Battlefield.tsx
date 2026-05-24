import type { CombatState } from '../combat/types';
import { CARDS } from '../data/cards';
import ShieldRow from './ShieldRow';

interface Props {
  state: CombatState;
  onChooseShield: (index: number) => void;
}

export default function Battlefield({ state, onChooseShield }: Props) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 py-4 flex-1">
      {/* Opponent shield row */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-[#888] text-xs uppercase tracking-wider">Opponent Shields</p>
        <ShieldRow shields={state.oppShields} owner="opponent" />
      </div>

      {/* Divider */}
      <div className="w-full max-w-sm h-px bg-[#0f3460] opacity-60" />

      {/* Player shield row */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-[#888] text-xs uppercase tracking-wider">
          {state.awaitingShieldChoice
            ? '⚠ Choose a Shield to sacrifice'
            : 'Your Shields'}
        </p>
        <ShieldRow
          shields={state.playerShields}
          owner="player"
          awaitingChoice={state.awaitingShieldChoice}
          onChoose={onChooseShield}
        />
      </div>

      {/* Active enchantments on field */}
      {state.field.length > 0 && (
        <div className="flex flex-col items-center gap-1">
          <p className="text-[#888] text-xs uppercase tracking-wider">Field</p>
          <div className="flex gap-2 flex-wrap justify-center">
            {state.field.map((id, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded text-[10px] border border-[#00d9ff] text-[#00d9ff] bg-[rgba(0,217,255,0.1)]"
              >
                {CARDS[id]?.name ?? id}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
