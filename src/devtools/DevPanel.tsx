/**
 * In-combat dev panel (Brief §5): state inspector (both priority meters,
 * debt, counters, restrictions, field, boundary log), action log, dev
 * actions, and manual enemy mode (human picks the NPC's play).
 */
import { useState } from 'react';
import { useGameStore } from '../stores/gameStore';

export function DevPanel() {
  const { state, dispatch, devPatch, manualEnemy, setManualEnemy, role, session, toggleDevPanel } = useGameStore();
  const [patchValue, setPatchValue] = useState(5);
  const [addCardId, setAddCardId] = useState('');
  if (!state) return null;

  const devDisabled = session !== null;

  return (
    <aside className="dev-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Dev Panel</h2>
        <button onClick={toggleDevPanel}>✕</button>
      </div>

      <h3>State</h3>
      <div className="kv"><span>phase</span><b>{state.phase}</b></div>
      <div className="kv"><span>activeTurn / round</span><b>{state.activeTurn} / {state.round}</b></div>
      <div className="kv"><span>player priority</span><b>{state.player.priority} (debt in: {state.player.incomingDebt}, unspent: {state.player.lastUnspentPriority})</b></div>
      <div className="kv"><span>npc priority</span><b>{state.npc.priority} (debt in: {state.npc.incomingDebt}, unspent: {state.npc.lastUnspentPriority})</b></div>
      <div className="kv"><span>patience / lies</span><b>{state.patience} / {state.lieCounter}</b></div>
      <div className="kv"><span>guards / cores broken</span><b>{state.npcGuardsStanding} / {state.npcCoreShields.filter((s) => s.broken).length}/{state.npcCoreShields.length}</b></div>
      <div className="kv"><span>shield-loss armed</span><b>{String(state.shieldLossArmed)}</b></div>
      <div className="kv"><span>pendingBlock</span><b>{state.pendingBlock?.type ?? '—'}</b></div>
      <div className="kv"><span>effect stack depth</span><b>{state.effectStack.length}</b></div>
      <div className="kv"><span>rng / nextId</span><b>{state.rngState} / {state.nextId}</b></div>

      <h3>Restrictions ({state.restrictions.length})</h3>
      {state.restrictions.map((r) => (
        <div key={r.id} className="kv">
          <span>{r.type} → {r.target}{r.value != null ? ` (${r.value})` : ''}</span>
          <b>{r.expiry ? `${r.expiry.boundary}×${r.expiry.occurrences}` : r.linkedPermanentId ? 'linked' : 'permanent'}</b>
        </div>
      ))}

      <h3>Scheduled ({state.scheduledEffects.length}) · Replacements ({state.replacements.length})</h3>
      {state.scheduledEffects.map((s) => (
        <div key={s.id} className="kv"><span>{s.controller}</span><b>{s.at.boundary}×{s.at.occurrences}</b></div>
      ))}

      <h3>Field counters</h3>
      {state.field
        .filter((p) => Object.keys(p.counters).length > 0)
        .map((p) => (
          <div key={p.permanentId} className="kv">
            <span>{state.cards[p.definitionId]?.name ?? p.definitionId}</span>
            <b>{Object.entries(p.counters).map(([k, v]) => `${k}=${v}`).join(' ')}</b>
          </div>
        ))}

      <h3>Manual enemy mode {role !== 'solo' ? '(disabled in dual playtest)' : ''}</h3>
      <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={manualEnemy}
          disabled={role !== 'solo'}
          onChange={(e) => setManualEnemy(e.target.checked)}
        />
        Human picks the NPC's play (replaces leftmost-play policy, v1.4 §10)
      </label>
      {manualEnemy && state.phase === 'EnemyPending' && (
        <div style={{ marginTop: 6 }}>
          {state.npc.hand.map((c, i) => (
            <div key={c.instanceId} className="npc-hand-card">
              <span>
                {state.cards[c.definitionId]?.name} <em>({state.cards[c.definitionId]?.cost})</em>
              </span>
              <button onClick={() => dispatch({ type: 'NPC_PLAY_CARD', handIndex: i })}>Stage</button>
            </div>
          ))}
          {state.npc.hand.length === 0 && <em>NPC hand empty — turn will end automatically.</em>}
        </div>
      )}

      <h3>Dev actions {devDisabled ? '(disabled in dual playtest)' : ''}</h3>
      <div className="actions">
        <input
          type="number"
          value={patchValue}
          onChange={(e) => setPatchValue(Number(e.target.value))}
          style={{ width: 64 }}
        />
        <button disabled={devDisabled} onClick={() => devPatch((d) => void (d.player.priority = patchValue))}>
          set player ⚡
        </button>
        <button disabled={devDisabled} onClick={() => devPatch((d) => void (d.npc.priority = patchValue))}>
          set npc ⚡
        </button>
        <button disabled={devDisabled} onClick={() => devPatch((d) => void (d.patience = patchValue))}>
          set patience
        </button>
        <button disabled={devDisabled} onClick={() => devPatch((d) => void (d.lieCounter = patchValue))}>
          set lies
        </button>
        <button
          disabled={devDisabled}
          onClick={() => devPatch((d) => void (d.npcGuardsStanding = Math.max(0, d.npcGuardsStanding - 1)))}
        >
          break guard
        </button>
        <button
          disabled={devDisabled}
          onClick={() =>
            devPatch((d) => {
              const s = d.npcCoreShields.find((x) => !x.broken);
              if (s) s.broken = true;
            })
          }
        >
          force-break core
        </button>
        <button disabled={devDisabled} onClick={() => devPatch((d) => void d.playerShields.pop())}>
          break own shield
        </button>
      </div>
      <div className="actions" style={{ marginTop: 6 }}>
        <input
          placeholder="card id"
          value={addCardId}
          onChange={(e) => setAddCardId(e.target.value)}
          style={{ width: 150 }}
        />
        <button
          disabled={devDisabled || !state.cards[addCardId]}
          onClick={() =>
            devPatch((d) => {
              d.nextId += 1;
              d.player.hand.push({ instanceId: `dev_${d.nextId}`, definitionId: addCardId, owner: 'player' });
            })
          }
        >
          add to hand
        </button>
        <button
          disabled={devDisabled || !state.cards[addCardId]}
          onClick={() =>
            devPatch((d) => {
              d.nextId += 1;
              d.npc.hand.unshift({ instanceId: `dev_${d.nextId}`, definitionId: addCardId, owner: 'npc' });
            })
          }
        >
          add to NPC hand
        </button>
      </div>

      <h3>Action log</h3>
      <div className="dev-log">
        {state.log.slice(-80).map((l) => (
          <div key={l.seq}>
            [{l.seq}] {l.type}: {l.message}
          </div>
        ))}
      </div>
    </aside>
  );
}
