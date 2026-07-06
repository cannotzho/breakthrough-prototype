import { useState } from 'react';
import { CombatState } from '../../combat/types';
import type { DualRole } from '../../lib/realtimeChannel';

interface CombatConsoleProps {
  state: CombatState;
  role: DualRole;
}

export default function CombatConsole({ state, role }: CombatConsoleProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);

  const activePlayerShields = state.playerShields.filter(s => s !== null).length;
  const activeNpcShields = state.opponentShields.filter(s => !s.broken).length;
  const totalNpcShields = state.opponentShields.length;

  return (
    <div className="fixed right-0 top-0 h-full z-40 flex">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="self-start mt-16 bg-zinc-800 border border-zinc-600 border-r-0 rounded-l px-1 py-3 text-zinc-400 hover:text-white text-xs"
      >
        {collapsed ? '◀' : '▶'}
      </button>
      {!collapsed && (
        <div className="w-64 bg-zinc-900/95 border-l border-zinc-700 h-full overflow-y-auto p-3 flex flex-col gap-3">
          <div className="text-xs text-zinc-500 uppercase tracking-widest font-bold">
            Combat Console
          </div>
          <div className="text-[10px] text-zinc-600">
            Role: <span className={role === 'player' ? 'text-blue-400' : 'text-red-400'}>{role.toUpperCase()}</span>
          </div>

          <Section title="State">
            <Row label="Phase" value={state.phase} />
            <Row label="Active Turn" value={state.activeTurn} />
            <Row label="Priority Mode" value={state.config.priorityMode} />
          </Section>

          <Section title="Priority">
            <Row label="Priority" value={state.priority} />
            {state.config.priorityMode === 'classic' && (
              <Row label="NPC Priority" value={state.npcPriority} />
            )}
            <Row label="Default Restore" value={state.config.defaultRestorePriority} />
          </Section>

          <Section title="Health">
            <Row label="Patience" value={`${state.patience} / ${state.config.opponentPatience}`} />
            <Row label="Lie Counter" value={`${state.lieCounter} / ${state.config.lieThreshold ?? '∞'}`} />
          </Section>

          <Section title="Player">
            <Row label="Hand" value={state.playerHand.length} />
            <Row label="Deck" value={state.playerDeck.length} />
            <Row label="Discard" value={state.playerDiscard.length} />
            <Row label="Shields" value={activePlayerShields} />
            <Row label="Back of Mind" value={state.backOfMind.length} />
          </Section>

          <Section title="NPC">
            <Row label="Deck" value={state.enemyDeck.length} />
            <Row label="Discard" value={state.enemyDiscard.length} />
            <Row label="Shields" value={`${activeNpcShields} / ${totalNpcShields}`} />
            <Row label="Cards Played (turn)" value={state.npcCardsPlayedThisTurn} />
            {state.stagedEnemyCard && (
              <Row label="Staged" value={state.stagedEnemyCard.definition.name} />
            )}
          </Section>

          <Section title="Field">
            <Row label="Impressions" value={state.fieldImpressions.length} />
            <Row label="Tokens" value={state.fieldTokens.length} />
            <Row label="Traps" value={state.fieldTraps.length} />
          </Section>

          {state.activeRestrictions.length > 0 && (
            <Section title="Restrictions">
              {state.activeRestrictions.map((r, i) => (
                <div key={i} className="text-[10px] text-amber-400">
                  {r.restrictionType} → {r.target}
                </div>
              ))}
            </Section>
          )}

          <Section title="Log">
            <button
              onClick={() => setLogExpanded(!logExpanded)}
              className="text-[10px] text-zinc-500 hover:text-zinc-300 mb-1"
            >
              {logExpanded ? 'Collapse' : `Show all (${state.actionLog.length})`}
            </button>
            <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto">
              {(logExpanded ? state.actionLog : state.actionLog.slice(-8)).map((log, i) => (
                <div key={i} className="text-[10px] text-zinc-500 leading-tight">
                  {log}
                </div>
              ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold mb-1 border-b border-zinc-800 pb-0.5">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between text-[11px]">
      <span className="text-zinc-500">{label}</span>
      <span className="text-zinc-300 font-mono">{value}</span>
    </div>
  );
}
