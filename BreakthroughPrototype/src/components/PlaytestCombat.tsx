import { useState, useRef, useEffect } from 'react';
import type { EncounterConfig } from '../combat/types';
import { useCombat } from '../combat/Combat';
import { CARDS } from '../data/cards';
import CardComponent from './CardComponent';
import CombatLog from './CombatLog';
import HandArea from './HandArea';
import ShieldRow from './ShieldRow';

// ── Styles (match DevTools theme) ────────────────────────────────────────────

const selectSt: React.CSSProperties = {
  background: '#09090f', border: '1px solid #1e2a40', borderRadius: 4,
  color: '#ccc', padding: '5px 10px', fontFamily: 'monospace', fontSize: 12,
  outline: 'none', cursor: 'pointer',
};

const btnSt: React.CSSProperties = {
  background: '#16213e', border: '1px solid #0f3460',
  color: '#ccc', padding: '6px 14px', borderRadius: 6,
  fontFamily: 'monospace', fontSize: 12, cursor: 'pointer', flexShrink: 0,
};

// ── Outer: encounter selector ─────────────────────────────────────────────────

export default function PlaytestCombat() {
  const [encounters, setEncounters] = useState<Record<string, EncounterConfig>>({});
  const [selectedId, setSelectedId] = useState('');

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}dev-api/encounters`)
      .then(r => r.json())
      .then((data: Record<string, EncounterConfig>) => setEncounters(data))
      .catch(() => {});
  }, []);

  const encounter = selectedId ? encounters[selectedId] : null;
  const encounterList = Object.values(encounters);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', background: '#0a0a18', border: '1px solid #1e2a40', borderRadius: 6 }}>
        <span style={{ color: '#bbb', fontSize: 11, fontFamily: 'monospace', flexShrink: 0 }}>Encounter:</span>
        <select
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          style={{ ...selectSt, flex: 1, maxWidth: 360 }}
        >
          <option value="">— select encounter —</option>
          {encounterList.map(e => (
            <option key={e.id} value={e.id}>{e.name} ({e.id})</option>
          ))}
        </select>
        {encounterList.length === 0 && (
          <span style={{ color: '#666', fontSize: 11, fontFamily: 'monospace' }}>
            No encounters found — is the dev server running?
          </span>
        )}
        <span style={{ color: '#555', fontSize: 11, fontFamily: 'monospace', marginLeft: 'auto' }}>
          Player deck: encounter worldDeck · Pre-shields: none
        </span>
      </div>

      {encounter ? (
        <PlaytestActive key={encounter.id} encounter={encounter} />
      ) : (
        <div style={{ color: '#555', fontFamily: 'monospace', fontSize: 13, textAlign: 'center', marginTop: 60 }}>
          Select an encounter above to begin playtesting.
        </div>
      )}
    </div>
  );
}

// ── Inner: active combat ──────────────────────────────────────────────────────

function PlaytestActive({ encounter }: { encounter: EncounterConfig }) {
  const {
    state,
    selectCard,
    playCard,
    placeShield,
    endTurn,
    chooseShieldToBreak,
    resetCombat,
    opponentAct,
    opponentEndTurn,
    combineCards,
  } = useCombat(encounter, encounter.worldDeck, [], true);

  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [stagedCardId, setStagedCardId] = useState<string | null>(null);
  const [playZoneOver, setPlayZoneOver] = useState(false);
  const stagedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!draggingCardId) { setGhostPos(null); return; }
    const onMove = (e: DragEvent) => setGhostPos({ x: e.clientX, y: e.clientY });
    document.addEventListener('dragover', onMove);
    return () => document.removeEventListener('dragover', onMove);
  }, [draggingCardId]);

  useEffect(() => () => {
    if (stagedTimerRef.current) clearTimeout(stagedTimerRef.current);
  }, []);

  function handlePlayCard(cardId: string) {
    if (stagedTimerRef.current) clearTimeout(stagedTimerRef.current);
    setStagedCardId(cardId);
    stagedTimerRef.current = setTimeout(() => {
      playCard(cardId);
      setStagedCardId(null);
      stagedTimerRef.current = null;
    }, 1000);
  }

  function handleCancelStaged() {
    if (stagedTimerRef.current) { clearTimeout(stagedTimerRef.current); stagedTimerRef.current = null; }
    setStagedCardId(null);
  }

  const isPlayerTurn = state.priority > 0;
  const patiencePct = Math.max(0, (state.oppPatience / state.oppMaxPatience) * 100);
  const phaseLabel = state.awaitingShieldChoice
    ? 'Choose Shield to Sacrifice'
    : isPlayerTurn ? 'Your Turn' : "Opponent's Turn";
  const phaseColor = state.awaitingShieldChoice ? '#f4d03f' : isPlayerTurn ? '#4ecca3' : '#e94560';
  const ghostCard = ghostPos && draggingCardId ? CARDS[draggingCardId] : null;

  return (
    <div style={{ position: 'relative' }}>
      {/* Status / reset bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={resetCombat}
          style={{ ...btnSt, background: '#1a0a18', borderColor: '#e94560', color: '#e94560' }}
        >
          ↺ Reset
        </button>
        <span style={{ color: '#888', fontSize: 11, fontFamily: 'monospace' }}>
          Priority{' '}
          <span style={{ color: state.priority > 0 ? '#4ecca3' : state.priority < 0 ? '#e94560' : '#888', fontWeight: 'bold' }}>
            {state.priority > 0 ? `+${state.priority}` : state.priority}
          </span>
          {' · '}Patience{' '}
          <span style={{ color: '#fff' }}>{state.oppPatience}/{state.oppMaxPatience}</span>
        </span>
        <span style={{ color: phaseColor, fontSize: 11, fontFamily: 'monospace', fontWeight: 'bold', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {phaseLabel}
        </span>
      </div>

      {/* Two-column layout: combat + log */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 20, alignItems: 'start' }}>

        {/* ── Left: battlefield ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Priority bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10, fontFamily: 'monospace', color: '#888' }}>
              <span>OPPONENT</span>
              <span>PRIORITY</span>
              <span>YOU</span>
            </div>
            <div style={{ position: 'relative', height: 10, background: '#111827', borderRadius: 9999, overflow: 'hidden' }}>
              {state.priority > 0 && (
                <div style={{ position: 'absolute', top: 0, left: '50%', height: '100%', width: `${(state.priority / 10) * 50}%`, background: '#4ecca3', borderRadius: '0 9999px 9999px 0' }} />
              )}
              {state.priority < 0 && (
                <div style={{ position: 'absolute', top: 0, right: '50%', height: '100%', width: `${(Math.abs(state.priority) / 10) * 50}%`, background: '#e94560', borderRadius: '9999px 0 0 9999px' }} />
              )}
              <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 2, height: '100%', background: '#4a4a6a' }} />
            </div>
          </div>

          {/* Patience bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10, fontFamily: 'monospace', color: '#888' }}>
              <span>{encounter.name} — Patience</span>
              <span style={{ color: '#fff' }}>{state.oppPatience}/{state.oppMaxPatience}</span>
            </div>
            <div style={{ height: 6, background: '#333', borderRadius: 9999, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${patiencePct}%`, background: '#e94560', transition: 'width 0.3s', borderRadius: 9999 }} />
            </div>
          </div>

          {/* Opponent shields */}
          <div>
            <p style={{ color: '#888', fontSize: 11, fontFamily: 'monospace', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Opponent Shields ({state.oppShields.filter(s => !s.broken).length}/{state.oppShields.length})
            </p>
            <ShieldRow shields={state.oppShields} owner="opponent" />
          </div>

          {/* Centre zone */}
          {isPlayerTurn ? (
            /* Drop-to-play zone */
            <div
              data-dropzone="play"
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setPlayZoneOver(true); }}
              onDragEnter={e => { e.preventDefault(); setPlayZoneOver(true); }}
              onDragLeave={() => setPlayZoneOver(false)}
              onDrop={e => {
                e.preventDefault();
                setPlayZoneOver(false);
                const cardId = e.dataTransfer.getData('text/plain');
                if (cardId) { setDraggingCardId(null); handlePlayCard(cardId); }
              }}
              style={{
                minHeight: 100,
                borderRadius: 12,
                border: `2px dashed ${playZoneOver || draggingCardId ? '#4ecca3' : '#1e2a40'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: playZoneOver ? 'rgba(78,204,163,0.08)' : 'rgba(13,22,37,0.8)',
                transition: 'all 0.2s',
              }}
            >
              {stagedCardId && CARDS[stagedCardId] ? (
                <div
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                  onClick={handleCancelStaged}
                >
                  <p style={{ color: '#e94560', fontSize: 11, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>Resolving…</p>
                  <div style={{ position: 'relative' }}>
                    <CardComponent card={CARDS[stagedCardId]!} />
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 6, border: '2px solid #e94560', boxShadow: '0 0 16px rgba(233,69,96,0.6)', pointerEvents: 'none' }} />
                  </div>
                  <p style={{ color: '#555', fontSize: 10, fontFamily: 'monospace', margin: 0 }}>click to cancel</p>
                </div>
              ) : (
                <span style={{ color: draggingCardId || playZoneOver ? '#4ecca3' : '#1e3050', fontFamily: 'monospace', fontSize: 13, textTransform: 'uppercase', letterSpacing: 2 }}>
                  {draggingCardId ? 'Drop to Play' : encounter.name}
                </span>
              )}
            </div>
          ) : state.awaitingShieldChoice ? (
            /* Shield choice hint */
            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <p style={{ color: '#f4d03f', fontFamily: 'monospace', fontSize: 13, margin: 0 }}>
                ⚠ Opponent broke a shield — click a shield below to sacrifice it
              </p>
            </div>
          ) : (
            /* Opponent hand face-up — dev clicks to play */
            <div style={{ background: '#0a0a18', border: '1px solid #1e2a40', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <p style={{ color: '#e94560', fontSize: 11, fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
                  Opponent Hand — click card to play
                </p>
                <button
                  onClick={opponentEndTurn}
                  style={{ ...btnSt, background: '#0a1a0a', borderColor: '#4ecca3', color: '#4ecca3', fontSize: 11, padding: '4px 10px' }}
                >
                  End Opponent Turn (+1 priority)
                </button>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {state.oppHand.length === 0 ? (
                  <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 12, fontStyle: 'italic' }}>
                    Opponent hand is empty — use End Opponent Turn
                  </span>
                ) : (
                  state.oppHand.map((cardId, i) => {
                    const card = CARDS[cardId];
                    if (!card) return null;
                    return (
                      <div
                        key={i}
                        onClick={() => opponentAct(cardId)}
                        style={{ cursor: 'pointer', transition: 'transform 0.15s' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-6px) scale(1.05)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = ''; }}
                        title={`Play: ${card.name}`}
                      >
                        <CardComponent card={card} />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Player shields */}
          <div>
            <p style={{ color: '#888', fontSize: 11, fontFamily: 'monospace', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {state.awaitingShieldChoice
                ? '⚠ Choose a Shield to sacrifice'
                : `Your Shields (${state.playerShields.filter(s => !s.broken).length}/${state.playerShields.length})`}
            </p>
            <div
              data-dropzone="shield"
              onDragOver={e => {
                if (state.phase !== 'attack' || state.awaitingShieldChoice) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
              }}
              onDrop={e => {
                e.preventDefault();
                if (state.phase === 'attack' && !state.awaitingShieldChoice) placeShield();
              }}
            >
              <ShieldRow
                shields={state.playerShields}
                owner="player"
                awaitingChoice={state.awaitingShieldChoice}
                onChoose={chooseShieldToBreak}
              />
            </div>
          </div>

          {/* Active enchantments on field */}
          {state.field.length > 0 && (
            <div>
              <p style={{ color: '#888', fontSize: 11, fontFamily: 'monospace', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Field</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {state.field.map((id, i) => (
                  <span key={i} style={{ padding: '2px 8px', borderRadius: 4, border: '1px solid #00d9ff', color: '#00d9ff', background: 'rgba(0,217,255,0.1)', fontFamily: 'monospace', fontSize: 11 }}>
                    {CARDS[id]?.name ?? id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Hand area */}
          <HandArea
            state={state}
            onSelectCard={selectCard}
            onPlayCard={handlePlayCard}
            onPlaceShield={placeShield}
            onEndTurn={endTurn}
            onDragStart={setDraggingCardId}
            onDragEnd={() => setDraggingCardId(null)}
            onGhostMove={(x, y) => setGhostPos({ x, y })}
            draggingCardId={draggingCardId}
            stagedCardId={stagedCardId}
            onCombineCards={combineCards}
          />
        </div>

        {/* ── Right: log sidebar ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <CombatLog logs={state.logs} />
          {state.collectedInfo.length > 0 && (
            <div style={{ background: 'rgba(10,15,30,0.92)', border: '1px solid #0f3460', borderRadius: 6, padding: 10 }}>
              <p style={{ color: '#4ecca3', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, fontFamily: 'monospace', margin: '0 0 6px' }}>Intel Obtained</p>
              {state.collectedInfo.map((id, i) => (
                <p key={i} style={{ color: '#bbb', fontSize: 10, fontFamily: 'monospace', padding: '2px 0', borderBottom: '1px solid #1a1a2e', margin: 0 }}>
                  {CARDS[id]?.name ?? id}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Ghost card follows cursor during drag */}
      {ghostCard && ghostPos && (
        <div style={{ position: 'fixed', left: ghostPos.x - 44, top: ghostPos.y - 30, transform: 'scale(1.05)', opacity: 0.8, pointerEvents: 'none', zIndex: 9999 }}>
          <CardComponent card={ghostCard} />
        </div>
      )}

      {/* Game-over overlay — inline, no navigation */}
      {state.gameOver && (
        <div style={{
          position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, borderRadius: 8, padding: 40, minHeight: 300,
        }}>
          {state.winner === 'player' ? (
            <>
              <h2 style={{ color: '#4ecca3', fontSize: 32, fontFamily: 'monospace', margin: '0 0 12px' }}>Breakthrough!</h2>
              <p style={{ color: '#bbb', fontFamily: 'monospace', fontSize: 13, margin: '0 0 8px' }}>All opponent shields broken.</p>
              {state.collectedInfo.length > 0 && (
                <p style={{ color: '#4ecca3', fontSize: 12, fontFamily: 'monospace', margin: '0 0 20px' }}>
                  Intel: {state.collectedInfo.map(id => CARDS[id]?.name ?? id).join(', ')}
                </p>
              )}
            </>
          ) : (
            <>
              <h2 style={{ color: '#e94560', fontSize: 32, fontFamily: 'monospace', margin: '0 0 12px' }}>Case Stalled</h2>
              <p style={{ color: '#bbb', fontFamily: 'monospace', fontSize: 13, margin: '0 0 20px' }}>
                {state.oppPatience <= 0 ? 'Opponent lost patience.' : 'All player shields broken.'}
              </p>
            </>
          )}
          <button
            onClick={resetCombat}
            style={{ ...btnSt, background: '#0a2a1e', borderColor: '#4ecca3', color: '#4ecca3', fontSize: 14, padding: '10px 28px' }}
          >
            Play Again
          </button>
        </div>
      )}
    </div>
  );
}
