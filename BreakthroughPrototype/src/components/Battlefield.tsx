import { useState } from 'react';
import type { CombatState } from '../combat/types';
import { CARDS } from '../data/cards';
import ShieldRow from './ShieldRow';
import CardComponent from './CardComponent';

interface Props {
  state: CombatState;
  onChooseShield: (index: number) => void;
  isDragging: boolean;
  onDropPlay: (cardId: string) => void;
  onDropShield: () => void;
  stagedCardId: string | null;
  onCancelStaged: () => void;
  justBrokenPlayerShieldIdx?: number | null;
  encounterName: string;
  portraitUrl?: string;
}

export default function Battlefield({ state, onChooseShield, isDragging, onDropPlay, onDropShield, stagedCardId, onCancelStaged, justBrokenPlayerShieldIdx, encounterName, portraitUrl }: Props) {
  const [playZoneOver, setPlayZoneOver] = useState(false);
  const [shieldZoneOver, setShieldZoneOver] = useState(false);

  const stagedCard = stagedCardId ? CARDS[stagedCardId] : null;

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-4 flex-1">
      {/* Priority bar — center pip = 0, left = opponent's turn, right = player's turn */}
      <div className="w-full max-w-sm px-2">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-[10px] text-[#888] uppercase tracking-wider">Opponent</span>
          <span className={`text-[11px] font-bold tabular-nums ${state.priority > 0 ? 'text-[#4ecca3]' : state.priority < 0 ? 'text-[#e94560]' : 'text-[#666]'}`}>
            {state.priority > 0 ? `+${state.priority}` : state.priority}
          </span>
          <span className="text-[10px] text-[#888] uppercase tracking-wider">You</span>
        </div>
        <div className="relative h-3 bg-[#111827] rounded-full overflow-hidden">
          {state.priority > 0 && (
            <div
              className="absolute top-0 h-full bg-[#4ecca3] rounded-r-full transition-all duration-300"
              style={{ left: '50%', width: `${(state.priority / 10) * 50}%` }}
            />
          )}
          {state.priority < 0 && (
            <div
              className="absolute top-0 h-full bg-[#e94560] rounded-l-full transition-all duration-300"
              style={{ right: '50%', width: `${(Math.abs(state.priority) / 10) * 50}%` }}
            />
          )}
          <div className="absolute top-0 left-1/2 -translate-x-px w-0.5 h-full bg-[#4a4a6a]" />
        </div>
      </div>

      {/* Staging zone — card appears here for 600 ms before effects resolve */}
      {stagedCard ? (
        <div className="flex flex-col items-center gap-1">
          <p className="text-[#e94560] text-xs uppercase tracking-wider animate-pulse">Resolving…</p>
          <div
            className="relative cursor-pointer"
            onClick={onCancelStaged}
            title="Click to cancel"
          >
            <CardComponent card={stagedCard} />
            <div className="absolute inset-0 rounded-md border-2 border-[#e94560] shadow-[0_0_16px_rgba(233,69,96,0.6)] pointer-events-none" />
          </div>
          <p className="text-[#555] text-[9px]">tap to cancel</p>
        </div>
      ) : (
        /* Play zone — enlarged natural drag target with opponent portrait background */
        <div
          data-dropzone="play"
          className={[
            'w-full max-w-sm rounded-xl border-2 border-dashed transition-all select-none relative overflow-hidden',
            'min-h-[120px] flex items-center justify-center',
            playZoneOver
              ? 'border-[#4ecca3] scale-[1.02]'
              : isDragging
                ? 'border-[#4ecca3]'
                : 'border-[#1e2a40]',
          ].join(' ')}
          style={{
            background: portraitUrl
              ? `url(${portraitUrl}) center/cover no-repeat`
              : 'linear-gradient(135deg, #0d1625 0%, #16213e 40%, #0f3460 100%)',
          }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setPlayZoneOver(true); }}
          onDragEnter={(e) => { e.preventDefault(); setPlayZoneOver(true); }}
          onDragLeave={() => setPlayZoneOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setPlayZoneOver(false);
            const cardId = e.dataTransfer.getData('text/plain');
            if (cardId) onDropPlay(cardId);
          }}
        >
          {/* Overlay for text legibility */}
          <div className="absolute inset-0 bg-black/50" />
          <span className={[
            'relative z-10 text-sm uppercase tracking-widest font-bold transition-colors',
            playZoneOver ? 'text-[#4ecca3]' : isDragging ? 'text-[#4ecca3]' : 'text-[#2a4060]',
          ].join(' ')}>
            {isDragging ? 'Drop to Play' : encounterName}
          </span>
        </div>
      )}

      {/* Opponent shield row */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-[#888] text-xs uppercase tracking-wider">Opponent Shields</p>
        <ShieldRow shields={state.oppShields} owner="opponent" />
      </div>

      {/* Player shield row — also a drop zone for shield placement */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-[#888] text-xs uppercase tracking-wider">
          {state.awaitingShieldChoice
            ? '⚠ Choose a Shield to sacrifice'
            : shieldZoneOver
              ? 'Drop to Place Shield'
              : isDragging
                ? 'Drop to Place Shield'
                : 'Your Shields'}
        </p>
        <div
          data-dropzone="shield"
          className={[
            'rounded-lg p-1 transition-all',
            shieldZoneOver
              ? 'bg-[rgba(15,52,96,0.5)] ring-2 ring-[#0f3460] scale-105'
              : isDragging && state.phase === 'attack'
                ? 'bg-[rgba(15,52,96,0.2)] ring-1 ring-[#0f3460]'
                : '',
          ].join(' ')}
          onDragOver={(e) => {
            if (state.phase !== 'attack' || state.awaitingShieldChoice) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            setShieldZoneOver(true);
          }}
          onDragEnter={(e) => {
            if (state.phase !== 'attack' || state.awaitingShieldChoice) return;
            e.preventDefault();
            setShieldZoneOver(true);
          }}
          onDragLeave={() => setShieldZoneOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setShieldZoneOver(false);
            if (state.phase === 'attack' && !state.awaitingShieldChoice) onDropShield();
          }}
        >
          <ShieldRow
            shields={state.playerShields}
            owner="player"
            awaitingChoice={state.awaitingShieldChoice}
            onChoose={onChooseShield}
            justBrokenIdx={justBrokenPlayerShieldIdx}
          />
        </div>
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
