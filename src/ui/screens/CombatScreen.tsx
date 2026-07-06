/**
 * Combat screen (v1.4 §14): single-bar two-meter priority display with debt
 * rendering, lockout affordance, distinct shield visuals, Field zones, BotM
 * (no Play action), never-silent sequential feedback via the engine log, and
 * the win/lose flow with retry for retryable encounters.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { CardDefinition, CardInstance, CombatState, Permanent } from '../../engine';
import { REAL_SHIELD_PLACEMENT_COST, effectiveBotmLimit, resolveEffectivePlay } from '../../engine';
import { useGameStore } from '../../stores/gameStore';
import { navigate } from '../../App';
import { DevPanel } from '../../devtools/DevPanel';

const NPC_STEP_DELAY_MS = 1100; // sequential pacing — one NPC play at a time

export function CombatScreen() {
  const { state, dispatch, manualEnemy, role, devPanelOpen, toggleDevPanel, retry, quit } = useGameStore();
  if (!state) return null;
  return (
    <CombatView
      state={state}
      dispatch={dispatch}
      manualEnemy={manualEnemy}
      role={role}
      devPanelOpen={devPanelOpen}
      toggleDevPanel={toggleDevPanel}
      retry={retry}
      quit={() => {
        quit();
        navigate('title');
      }}
    />
  );
}

interface ViewProps {
  state: CombatState;
  dispatch: ReturnType<typeof useGameStore.getState>['dispatch'];
  manualEnemy: boolean;
  role: 'solo' | 'host' | 'guest';
  devPanelOpen: boolean;
  toggleDevPanel: () => void;
  retry: () => void;
  quit: () => void;
}

function CombatView({ state, dispatch, manualEnemy, role, devPanelOpen, toggleDevPanel, retry, quit }: ViewProps) {
  const [selectedCard, setSelectedCard] = useState<string | null>(null);

  // NPC auto-driver: leftmost-play policy paced for animation (§10). Skipped
  // in manual-enemy mode and for the dual-playtest guest side.
  const driverBusy = useRef(false);
  useEffect(() => {
    if (state.phase !== 'EnemyPending' || state.pendingBlock || manualEnemy || role === 'guest') return;
    if (driverBusy.current) return;
    driverBusy.current = true;
    const t = setTimeout(() => {
      driverBusy.current = false;
      dispatch({ type: 'ADVANCE' });
    }, NPC_STEP_DELAY_MS);
    return () => {
      driverBusy.current = false;
      clearTimeout(t);
    };
  }, [state, manualEnemy, role, dispatch]);

  useEffect(() => setSelectedCard(null), [state.phase, state.player.hand.length]);

  const lockedOut = state.player.priority < 1;
  const isPlayerTurn = state.activeTurn === 'player' && state.phase === 'PlayerPending' && !state.pendingBlock;
  const canAct = isPlayerTurn && (role !== 'guest');
  const lastLog = state.log.at(-1);

  return (
    <div className="combat">
      <header className="combat-header">
        <strong>{state.config.displayName}</strong>
        <span className="stat">
          <span className="label">Round</span>
          <span className="value">{state.round}</span>
        </span>
        <span className="stat">
          <span className="label">Patience</span>
          <span className={`value patience${state.patience <= 3 ? ' low' : ''}`}>{state.patience}</span>
        </span>
        {(state.config.lieThreshold ?? 0) > 0 && (
          <span className="stat">
            <span className="label">Lies</span>
            <span className="value lie">
              {state.lieCounter}/{state.config.lieThreshold}
            </span>
          </span>
        )}
        <span className="spacer" />
        {role !== 'solo' && <span className="badge purple">{role === 'host' ? 'HOST — Detective' : 'GUEST — NPC side'}</span>}
        <button onClick={toggleDevPanel}>Dev</button>
        <button className="danger" onClick={quit}>
          Quit
        </button>
      </header>

      <main className="battlefield">
        {/* ── NPC zone ── */}
        <section className="npc-zone">
          <div className="zone-row">
            <span className="zone-label">NPC hand</span>
            <span>{state.npc.hand.length} card(s)</span>
            {state.npcHandRevealed &&
              state.npc.hand.map((c) => (
                <span key={c.instanceId} className="badge purple">
                  {state.cards[c.definitionId]?.name}
                </span>
              ))}
            <span className="pile">
              <span className="n">{state.npc.deck.length}</span>deck
            </span>
            <span className="pile">
              <span className="n">{state.npc.discard.length}</span>discard
            </span>
            {state.npcDeckTopRevealed && state.npc.deck[0] && (
              <span className="badge gold">top: {state.cards[state.npc.deck[0].definitionId]?.name}</span>
            )}
          </div>
          <div className="zone-row">
            <span className="zone-label">Opponent shields</span>
            <AnimatePresence>
              {Array.from({ length: state.npcGuardsStanding }).map((_, i) => (
                <motion.div
                  key={`guard-${i}`}
                  className="shield guard"
                  title="Guard Shield — pacing armor; generic break effects hit these first (nothing behind it)"
                  initial={{ scale: 0, rotate: -8 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0, opacity: 0, rotate: 12 }}
                >
                  🛡
                </motion.div>
              ))}
            </AnimatePresence>
            {state.npcCoreShields.map((s) => (
              <div
                key={s.cardId}
                className={`shield npc-core${s.broken ? (s.isHint ? ' hint-broken' : ' broken') : ''}`}
                title={
                  s.broken
                    ? s.isHint
                      ? `Hint: ${s.hintText ?? ''} — ${s.loreDescription}`
                      : s.loreDescription
                    : 'NPC Core Shield — a lock. Only the right knowledge opens it, and only while no Guards stand.'
                }
              >
                {s.broken ? (s.isHint ? '💬' : '📂') : '🔒'}
              </div>
            ))}
          </div>
        </section>

        {/* ── Center: staged card, priority, field ── */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'hidden' }}>
          <PriorityBar state={state} />
          <AnimatePresence>
            {state.stagedCard && (
              <motion.div
                key={state.stagedCard.instanceId}
                initial={{ y: -40, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 30, opacity: 0 }}
                style={{ alignSelf: 'center' }}
              >
                <CardFace def={state.cards[state.stagedCard.definitionId]} dimmed={false} staged />
              </motion.div>
            )}
          </AnimatePresence>
          <div className="field">
            <AnimatePresence>
              {state.field.map((p) => (
                <PermanentView key={p.permanentId} perm={p} state={state} dispatch={dispatch} canAct={canAct} />
              ))}
            </AnimatePresence>
            {state.field.length === 0 && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>The Field is empty.</span>}
          </div>
        </section>

        {/* ── Player zone ── */}
        <section className="player-zone">
          <div className="zone-row">
            <span className="zone-label">Your shields</span>
            <AnimatePresence>
              {state.playerShields.map((s) => (
                <motion.div
                  key={s.slotId}
                  layout
                  className={`shield ${s.shieldType}`}
                  title={
                    s.shieldType === 'placeholder'
                      ? 'Placeholder Shield — free cover; removed from the game when broken (−1 Patience)'
                      : s.shieldType === 'real'
                        ? `${state.cards[s.cardDefinitionId ?? '']?.name ?? 'Card'} — discards when broken (−1 Patience${state.cards[s.cardDefinitionId ?? '']?.keywords.includes('Safety') ? '; Safety: 0' : ''})`
                        : `Core Shield: ${state.cards[s.cardDefinitionId ?? '']?.name ?? ''} (−${s.patienceCostOnBreak} Patience on break; only targetable after all dummies)`
                  }
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0, opacity: 0, y: 16 }}
                >
                  {s.shieldType === 'placeholder' ? '▦' : s.shieldType === 'real' ? '🃏' : '★'}
                </motion.div>
              ))}
            </AnimatePresence>
            {canAct && state.playerShields.length > 1 && (
              <button
                title="Free action: rotate the shield row left"
                onClick={() =>
                  dispatch({
                    type: 'RESEQUENCE_SHIELDS',
                    order: [...state.playerShields.keys()].slice(1).concat(0),
                  })
                }
              >
                ⟳ resequence
              </button>
            )}
          </div>

          <div className="zone-row">
            <span className="zone-label">Back of Mind</span>
            <div className="botm-zone" title="Kept across the turn transition. No Play action here (v1.4 §14).">
              {state.backOfMind.length === 0 && <span style={{ color: 'var(--text-dim)', fontSize: 11 }}>empty · limit {effectiveBotmLimit(state)}</span>}
              {state.backOfMind.map((c) => (
                <div key={c.instanceId} className="mini-card">
                  {state.cards[c.definitionId]?.name}
                </div>
              ))}
            </div>
            <span className="spacer" style={{ flex: 1 }} />
            <span className="pile">
              <span className="n">{state.player.deck.length}</span>deck
            </span>
            <span className="pile">
              <span className="n">{state.player.discard.length}</span>discard
            </span>
            <button
              className={`end-turn${canAct && lockedOut ? ' urgent' : ''}`}
              disabled={!canAct}
              onClick={() => dispatch({ type: 'END_TURN' })}
              title="Your explicit acknowledgement that your turn is over (v1.4 §3.1 — no automatic handoff)"
            >
              End Turn
            </button>
          </div>

          <div className="hand">
            <AnimatePresence>
              {state.player.hand.map((card, i) => (
                <HandCard
                  key={card.instanceId}
                  card={card}
                  index={i}
                  state={state}
                  canAct={canAct}
                  lockedOut={lockedOut}
                  selected={selectedCard === card.instanceId}
                  onSelect={() => setSelectedCard(selectedCard === card.instanceId ? null : card.instanceId)}
                  dispatch={dispatch}
                />
              ))}
            </AnimatePresence>
            {state.player.hand.length === 0 && <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>Hand empty.</span>}
          </div>
        </section>
      </main>

      <footer className="log-ticker">{lastLog ? lastLog.message : ''}</footer>

      <Modals state={state} dispatch={dispatch} role={role} retry={retry} quit={quit} />
      {devPanelOpen && <DevPanel />}
    </div>
  );
}

/** One bar, two meters (v1.4 §3.1 presentation; §14 requirements). */
function PriorityBar({ state }: { state: CombatState }) {
  const active = state.activeTurn;
  const value = state[active].priority;
  const max = Math.max(state.config.maxPriority, Math.abs(value), 1);
  const pct = Math.min(100, (Math.abs(value) / max) * 50);
  const debt = value < 0;
  return (
    <div className="priority-wrap">
      <span className={`priority-side${active === 'player' ? ' active' : ''}`}>
        You {active === 'player' ? `· ${value}` : ''}
        {state.npc.incomingDebt > 0 && active === 'player' ? '' : ''}
      </span>
      <div className="priority-bar" title={`${active === 'player' ? 'Your' : 'NPC'} Priority: ${value}${debt ? ' (debt — transfers to the opponent at turn end)' : ''}`}>
        <div className="priority-center" />
        <div
          className={`priority-fill ${active}${debt ? ' debt' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`priority-side right${active === 'npc' ? ' active' : ''}`}>
        {active === 'npc' ? `${value} · ` : ''}
        {state.config.displayName.split(' ')[0]}…
      </span>
      <span className={`priority-value${debt ? ' debt' : ''}`}>{value}</span>
    </div>
  );
}

function CardFace({ def, dimmed, staged }: { def: CardDefinition | undefined; dimmed: boolean; staged?: boolean }) {
  if (!def) return null;
  return (
    <div className={`card color-${def.color}${dimmed ? ' dimmed' : ''}`} style={staged ? { cursor: 'default' } : undefined} title={def.longDescription}>
      <div className="c-top">
        <span className="c-name">{def.name}</span>
        <span className="c-cost">{def.cost}</span>
      </div>
      {def.keywords.length > 0 && <div className="c-keywords">{def.keywords.join(' · ')}</div>}
      <div className="c-text">{def.effectText}</div>
      <span className="c-color" />
    </div>
  );
}

interface HandCardProps {
  card: CardInstance;
  index: number;
  state: CombatState;
  canAct: boolean;
  lockedOut: boolean;
  selected: boolean;
  onSelect: () => void;
  dispatch: ViewProps['dispatch'];
}

function HandCard({ card, index, state, canAct, lockedOut, selected, onSelect, dispatch }: HandCardProps) {
  const printed = state.cards[card.definitionId];
  const effective = useMemo(() => resolveEffectivePlay(state, card, false), [state, card]);
  if (!printed) return null;
  const dimmed = !canAct || lockedOut;
  const showAsPonder = effective.convertedToPonder;
  return (
    <motion.div
      layout
      initial={{ y: 60, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -40, opacity: 0 }}
      style={{ position: 'relative' }}
      onClick={() => !dimmed && onSelect()}
    >
      <div title={dimmed && lockedOut ? 'Locked out: Priority must be ≥ 1 to play (End Turn is available)' : undefined}>
        <CardFace
          def={
            showAsPonder
              ? { ...printed, effectText: 'Will be converted to Ponder here (cost 1: draw 1).', cost: 1 }
              : printed.supertype === 'Information'
                ? { ...printed, cost: effective.cost, effectText: `${effective.def.nuggetId && state.discoveredNuggetIds.includes(effective.def.nuggetId) ? '' : '??? '}${state.config.nuggetOverrides.find((o) => o.nuggetId === printed.nuggetId)?.effectText ?? printed.effectText}` }
                : printed
          }
          dimmed={dimmed}
        />
      </div>
      {selected && canAct && !lockedOut && (
        <div className="card-menu" onClick={(e) => e.stopPropagation()}>
          <button className="primary" onClick={() => dispatch({ type: 'PLAY_CARD', handIndex: index })}>
            Play ({state.cards[card.definitionId] ? effectiveCostLabel(state, card, false) : '?'})
          </button>
          {printed.keywords.includes('Heavy Hand') && (
            <button onClick={() => dispatch({ type: 'PLAY_CARD', handIndex: index, heavyHand: true })}>
              Heavy Hand ({effectiveCostLabel(state, card, true)})
            </button>
          )}
          <button onClick={() => dispatch({ type: 'PLACE_SHIELD', handIndex: index })}>
            Place as Shield ({REAL_SHIELD_PLACEMENT_COST})
          </button>
        </div>
      )}
    </motion.div>
  );
}

function effectiveCostLabel(state: CombatState, card: CardInstance, heavy: boolean): string {
  const eff = resolveEffectivePlay(state, card, heavy);
  const base = heavy ? eff.cost * 2 : eff.cost;
  return String(base);
}

function PermanentView({
  perm,
  state,
  dispatch,
  canAct,
}: {
  perm: Permanent;
  state: CombatState;
  dispatch: ViewProps['dispatch'];
  canAct: boolean;
}) {
  const def = state.cards[perm.definitionId] ?? state.tokens[perm.definitionId];
  if (!def) return null;
  const counters = Object.entries(perm.counters).filter(([, v]) => v > 0);
  const trapCondition =
    perm.kind === 'trap' && def.trapTrigger
      ? `Fires on ${def.trapTrigger.event}${def.trapTrigger.controllerFilter ? ` (${def.trapTrigger.controllerFilter === 'opponent' ? "the controller's opponent" : 'the controller'})` : ''}`
      : null;
  return (
    <motion.div
      layout
      className={`permanent ${perm.kind}${perm.owner === 'npc' ? ' npc-owned' : ''}`}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.6, opacity: 0 }}
      title={`${def.effectText}${trapCondition ? `\n${trapCondition}` : ''}${perm.rapportPrediction != null ? `\nPrediction: ${perm.rapportPrediction}` : ''}`}
    >
      <div className="p-kind">
        {perm.kind} · {perm.owner === 'npc' ? 'NPC' : 'you'}
        {perm.turnsRemaining != null ? ` · ${perm.turnsRemaining}⏳` : ''}
      </div>
      <div className="p-name">{def.name}</div>
      {counters.length > 0 && (
        <div className="p-counters">{counters.map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
      )}
      {perm.kind === 'trap' && perm.owner === 'player' && <div style={{ fontSize: 9 }}>armed</div>}
      {(def.activatedAbilities ?? []).map((ab) => (
        <div key={ab.id} className="p-ability">
          <button
            disabled={!canAct || perm.owner !== 'player'}
            onClick={() => dispatch({ type: 'ACTIVATE_ABILITY', permanentId: perm.permanentId, abilityId: ab.id })}
            title={ab.effects.length > 0 ? JSON.stringify(ab.cost) : undefined}
          >
            {ab.name}
            {ab.cost.priority ? ` (${ab.cost.priority}⚡)` : ''}
            {ab.cost.patience ? ` (${ab.cost.patience}♥)` : ''}
          </button>
        </div>
      ))}
    </motion.div>
  );
}

function Modals({
  state,
  dispatch,
  role,
  retry,
  quit,
}: {
  state: CombatState;
  dispatch: ViewProps['dispatch'];
  role: 'solo' | 'host' | 'guest';
  retry: () => void;
  quit: () => void;
}) {
  const [botmPicks, setBotmPicks] = useState<number[]>([]);
  useEffect(() => {
    if (state.phase !== 'BotMSelect') setBotmPicks([]);
  }, [state.phase]);

  const isDriver = role !== 'guest';

  if (state.result === 'WIN' || state.result === 'LOSE') {
    return (
      <div className="modal-backdrop">
        <motion.div className="modal" initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
          <h2>{state.result === 'WIN' ? 'Breakthrough!' : 'The conversation is over.'}</h2>
          <p className="lore">
            {state.result === 'WIN'
              ? 'Every shield is down. The truth is yours.'
              : state.loseReason === 'PATIENCE'
                ? 'Their patience ran out — the door closes in your face.'
                : state.loseReason === 'LIES'
                  ? 'One lie too many. They see right through you.'
                  : 'Your last defense crumbled. You have nothing left to stand on.'}
          </p>
          {state.gainedCardIds.length > 0 && (
            <p style={{ fontSize: 13 }}>Added to your Collection: {state.gainedCardIds.map((id) => state.cards[id]?.name ?? id).join(', ')}</p>
          )}
          <div className="row">
            {state.result === 'LOSE' && state.config.retryable && isDriver && (
              <button className="primary" onClick={retry}>
                Retry (persistent breaks kept)
              </button>
            )}
            <button onClick={quit}>Back to Title</button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (!state.pendingBlock && state.phase !== 'BotMSelect') return null;

  if (state.pendingBlock?.type === 'reveal') {
    const b = state.pendingBlock;
    return (
      <div className="modal-backdrop">
        <motion.div className="modal" initial={{ rotateY: 90, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.45 }}>
          <h2>{b.isHint ? 'A Hint Surfaces' : 'Shield Broken — Information Revealed'}</h2>
          {b.isHint && b.hintText && <p style={{ color: 'var(--accent-2)' }}>{b.hintText}</p>}
          <p className="lore">{b.lore}</p>
          {b.gainedCardId && (
            <p style={{ fontSize: 13 }}>
              <span className="badge gold">{state.cards[b.gainedCardId]?.name ?? b.gainedCardId}</span> added to your Collection.
            </p>
          )}
          {isDriver && (
            <button className="primary" onClick={() => dispatch({ type: 'ACKNOWLEDGE' })}>
              Continue
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  if (state.pendingBlock?.type === 'chooseNumber') {
    const b = state.pendingBlock;
    const options = Array.from({ length: b.max - b.min + 1 }, (_, i) => b.min + i);
    return (
      <div className="modal-backdrop">
        <motion.div className="modal" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <h2>Choose a Number</h2>
          <p style={{ color: 'var(--text-dim)' }}>Your read on them — pick from {b.min} to {b.max}.</p>
          <div className="row">
            {options.map((n) => (
              <button key={n} className="number-btn" disabled={!isDriver} onClick={() => dispatch({ type: 'CHOOSE_NUMBER', value: n })}>
                {n}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    );
  }

  if (state.pendingBlock?.type === 'deckReveal') {
    const b = state.pendingBlock;
    return (
      <div className="modal-backdrop">
        <motion.div className="modal" initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <h2>Top of Their Deck</h2>
          <div className="row">
            {b.cardDefIds.map((id, i) => (
              <CardFace key={`${id}-${i}`} def={state.cards[id]} dimmed={false} staged />
            ))}
            {b.cardDefIds.length === 0 && <p>Their deck is empty.</p>}
          </div>
          {isDriver && (
            <button className="primary" onClick={() => dispatch({ type: 'ACKNOWLEDGE' })}>
              Continue
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  if (state.phase === 'BotMSelect') {
    const limit = effectiveBotmLimit(state);
    return (
      <div className="modal-backdrop">
        <motion.div className="modal" style={{ maxWidth: 720 }} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <h2>Back of Mind</h2>
          <p style={{ color: 'var(--text-dim)' }}>
            Keep up to {limit} card{limit === 1 ? '' : 's'} for your next turn. The rest are discarded.
          </p>
          <div className="row">
            {state.player.hand.map((c, i) => (
              <div
                key={c.instanceId}
                style={{
                  outline: botmPicks.includes(i) ? '2px solid var(--accent)' : 'none',
                  borderRadius: 10,
                }}
                onClick={() =>
                  setBotmPicks((prev) =>
                    prev.includes(i) ? prev.filter((x) => x !== i) : prev.length < limit ? [...prev, i] : prev,
                  )
                }
              >
                <CardFace def={state.cards[c.definitionId]} dimmed={false} staged />
              </div>
            ))}
          </div>
          {isDriver && (
            <button className="primary" onClick={() => dispatch({ type: 'BOTM_SELECT', keepHandIndices: botmPicks })}>
              Keep {botmPicks.length} · Discard {state.player.hand.length - botmPicks.length}
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  return null;
}
