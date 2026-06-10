import { useState } from 'react';
import type { CombatState } from '../combat/types';
import { CARDS } from '../data/cards';
import ShieldRow from './ShieldRow';
import CardComponent from './CardComponent';
import CardInspectModal from './CardInspectModal';

interface Props {
  state: CombatState;
  onChooseShield: (index: number) => void;
  onChooseOppShield: (index: number) => void;
  isDragging: boolean;
  onDropPlay: (cardId: string) => void;
  onDropShield: () => void;
  stagedCardId: string | null;
  onCancelStaged: () => void;
  oppStagedCardId?: string | null;
  justBrokenPlayerShieldIdx?: number | null;
  encounterName: string;
  portraitUrl?: string;
}

export default function Battlefield({ state, onChooseShield, onChooseOppShield, isDragging, onDropPlay, onDropShield, stagedCardId, onCancelStaged, oppStagedCardId, justBrokenPlayerShieldIdx, encounterName, portraitUrl }: Props) {
  const [playZoneOver, setPlayZoneOver] = useState(false);
  const [shieldZoneOver, setShieldZoneOver] = useState(false);
  const [inspectCardId, setInspectCardId] = useState<string | null>(null);
  // #99 — local staging for break-target selection before confirm
  const [pendingBreakIdx, setPendingBreakIdx] = useState<number | null>(null);

  // Reset local pending selection when the engine clears the awaiting flag (#99)
  if (!state.awaitingOppShieldBreakChoice && pendingBreakIdx !== null) {
    setPendingBreakIdx(null);
  }

  const phaseLabel = state.awaitingShieldChoice
    ? 'Choose Shield'
    : state.awaitingOppShieldBreakChoice
      ? 'Choose Target Shield'
      : state.phase === 'attack' ? 'Your Turn' : "Opponent's Turn";
  const phaseColor = (state.awaitingShieldChoice || state.awaitingOppShieldBreakChoice) ? '#f4d03f' : state.phase === 'attack' ? '#4ecca3' : '#e94560';

  const stagedCard = stagedCardId ? CARDS[stagedCardId] : null;
  const oppStagedCard = oppStagedCardId ? CARDS[oppStagedCardId] : null;

  return (
    <div className="flex flex-col items-center justify-center gap-4 py-4 flex-1">
      {/* Priority bar — center pip = 0, left = opponent's turn, right = player's turn */}
      <div className="w-full max-w-sm px-2">
        <div className="flex justify-between items-baseline mb-1">
          <span className="text-xs text-[#888] uppercase tracking-wider">Opponent</span>
          <span className={`text-xs font-bold tabular-nums ${state.priority > 0 ? 'text-[#4ecca3]' : state.priority < 0 ? 'text-[#e94560]' : 'text-[#666]'}`}>
            {state.priority > 0 ? `+${state.priority}` : state.priority}
          </span>
          <span className="text-xs text-[#888] uppercase tracking-wider">You</span>
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
        <p className="text-center text-xs uppercase tracking-widest mt-1 font-semibold" style={{ color: phaseColor }}>
          {phaseLabel}
        </p>
      </div>

      {/* Staging zone — card appears here for 600 ms before effects resolve */}
      {stagedCard ? (
        <div className="flex flex-col items-center gap-1">
          <p className="text-[#e94560] text-sm uppercase tracking-wider animate-pulse">Resolving…</p>
          <div
            className="relative cursor-pointer"
            onClick={onCancelStaged}
            title="Click to cancel"
          >
            <CardComponent card={stagedCard} />
            <div className="absolute inset-0 rounded-md border-2 border-[#e94560] shadow-[0_0_16px_rgba(233,69,96,0.6)] pointer-events-none" />
          </div>
          <p className="text-[#555] text-xs">tap to cancel</p>
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
                : oppStagedCard
                  ? 'border-[#e94560]'
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
          <div className="absolute inset-0 bg-black/60" />
          {oppStagedCard ? (
            /* Opponent staged card — shown during defense phase while OPPONENT_ACT is pending */
            <div className="relative z-10 flex flex-col items-center gap-1.5 py-2">
              <p className="text-[#e94560] text-xs uppercase tracking-wider animate-pulse">Opponent plays…</p>
              <div className="relative">
                <CardComponent card={oppStagedCard} />
                <div className="absolute inset-0 rounded-md border-2 border-[#e94560] shadow-[0_0_16px_rgba(233,69,96,0.5)] pointer-events-none" />
              </div>
            </div>
          ) : (
            <span className={[
              'relative z-10 text-sm uppercase tracking-widest font-bold transition-colors',
              playZoneOver ? 'text-[#4ecca3]' : isDragging ? 'text-[#4ecca3]' : 'text-[#2a4060]',
            ].join(' ')}>
              {isDragging ? 'Drop to Play' : encounterName}
            </span>
          )}
        </div>
      )}

      {/* Opponent shield row */}
      <div className="flex flex-col items-center gap-1">
        <p className={`text-sm uppercase tracking-wider ${state.awaitingOppShieldBreakChoice ? 'text-[#f4d03f]' : 'text-[#888]'}`}>
          {state.awaitingOppShieldBreakChoice
            ? pendingBreakIdx !== null ? '⚠ Confirm your target' : '⚠ Choose a shield to break'
            : 'Opponent Shields'}
        </p>
        <ShieldRow
          shields={state.oppShields}
          owner="opponent"
          awaitingBreakChoice={state.awaitingOppShieldBreakChoice}
          pendingBreakIdx={pendingBreakIdx}
          onSelectBreakTarget={setPendingBreakIdx}
        />
        {/* #99 — Confirm / Cancel buttons during break-target selection */}
        {state.awaitingOppShieldBreakChoice && (
          <div className="flex gap-2 mt-2">
            {pendingBreakIdx !== null && (
              <button
                onClick={() => { onChooseOppShield(pendingBreakIdx); setPendingBreakIdx(null); }}
                className="px-4 py-1.5 bg-[#e94560] text-white rounded font-bold font-mono text-sm hover:bg-[#d03550] transition-colors shadow"
              >
                Break this shield
              </button>
            )}
            <button
              onClick={() => setPendingBreakIdx(null)}
              className="px-4 py-1.5 bg-[#1a1a2e] border border-[#555] text-[#aaa] rounded font-mono text-sm hover:border-[#888] transition-colors"
            >
              {pendingBreakIdx !== null ? 'Cancel' : 'Deselect'}
            </button>
          </div>
        )}
      </div>

      {/* Player shield row — also a drop zone for shield placement */}
      <div className="flex flex-col items-center gap-1">
        <p className="text-[#888] text-sm uppercase tracking-wider">
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
            onInspect={(cardId) => setInspectCardId(cardId)}
            justBrokenIdx={justBrokenPlayerShieldIdx}
          />
        </div>
      </div>

      {/* Active enchantments on field */}
      {state.field.length > 0 && (
        <div className="flex flex-col items-center gap-1">
          <p className="text-[#888] text-sm uppercase tracking-wider">Field</p>
          <div className="flex gap-2 flex-wrap justify-center">
            {state.field.map((id, i) => (
              <span
                key={i}
                className="px-2 py-0.5 rounded text-xs border border-[#00d9ff] text-[#00d9ff] bg-[rgba(0,217,255,0.1)]"
              >
                {CARDS[id]?.name ?? id}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Shield inspect overlay */}
      {inspectCardId && (
        <CardInspectModal cardId={inspectCardId} onClose={() => setInspectCardId(null)} />
      )}
    </div>
  );
}
