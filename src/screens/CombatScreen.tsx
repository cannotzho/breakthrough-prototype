import { useReducer, useEffect, useLayoutEffect, useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { combatReducer } from '../combat/combatReducer';
import { buildInitialCombatState, TEST_ENCOUNTER } from '../data/encounterDefs';
import { CardInstance, EncounterConfig, SHIELD_PLACEMENT_COST, ActivatedAbilityCost } from '../combat/types';
import DevPanel from '../components/dev/DevPanel';
import PriorityBar from '../components/combat/PriorityBar';
import PatienceDisplay from '../components/combat/PatienceDisplay';
import CardView from '../components/combat/CardView';
import HandCard from '../components/combat/HandCard';
import ShieldBack from '../components/combat/ShieldBack';
import PlayerShieldSlot from '../components/combat/PlayerShieldSlot';
import TraitZone from '../components/combat/TraitZone';
import PhaseBar from '../components/combat/PhaseBar';
import PlayZone from '../components/combat/PlayZone';
import KeywordBadge from '../components/combat/KeywordBadge';
import useCardDrag from '../components/combat/useCardDrag';
import { COLOR_BORDER } from '../components/combat/cardColors';
import { useNuggetDiscoveryStore } from '../stores/nuggetDiscoveryStore';

function formatAbilityCost(cost: ActivatedAbilityCost): string {
  const parts: string[] = [];
  if (cost.priority) parts.push(`${cost.priority}P`);
  if (cost.patience) parts.push(`${cost.patience}Pat`);
  if (cost.shields) parts.push(`${cost.shields}S`);
  if (cost.discard) parts.push(`${cost.discard}D`);
  return parts.length > 0 ? `[${parts.join('/')}]` : '[Free]';
}

interface CombatScreenProps {
  onExit: () => void;
  encounterConfig?: EncounterConfig;
  playerDeckDefs?: import('../combat/types').CardDefinition[];
}

export default function CombatScreen({ onExit, encounterConfig, playerDeckDefs }: CombatScreenProps) {
  const initialEncounter = encounterConfig ?? TEST_ENCOUNTER;
  const [state, dispatch] = useReducer(
    combatReducer,
    undefined,
    () => buildInitialCombatState(initialEncounter, playerDeckDefs),
  );
  const [activeEncounter, setActiveEncounter] = useState(initialEncounter);

  const loadEncounter = useCallback((config: EncounterConfig) => {
    setActiveEncounter(config);
    dispatch({ type: 'DEV_RESET', state: buildInitialCombatState(config, playerDeckDefs) });
  }, [playerDeckDefs]);
  const [devOpen, setDevOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ cardId: string; x: number; y: number; source: 'hand' | 'botm' } | null>(null);
  const [priorityRestoreFlash, setPriorityRestoreFlash] = useState(false);
  const [viewingPile, setViewingPile] = useState<'draw' | 'discard' | null>(null);
  const [enemyPanelCollapsed, setEnemyPanelCollapsed] = useState(false);
  const [detailCard, setDetailCard] = useState<CardInstance | null>(null);
  const [playedCardAnim, setPlayedCardAnim] = useState<CardInstance | null>(null);
  const playedCardContainerRef = useRef<HTMLDivElement | null>(null);
  const [discardExitOffset, setDiscardExitOffset] = useState<{ x: number; y: number }>({ x: 80, y: 0 });
  const playZoneRef = useRef<HTMLDivElement | null>(null);
  const drawPileRef = useRef<HTMLButtonElement | null>(null);
  const discardPileRef = useRef<HTMLButtonElement | null>(null);
  const handContainerRef = useRef<HTMLDivElement | null>(null);
  const drawPileOffset = useRef<{ x: number; y: number } | undefined>(undefined);
  const shieldSlotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const prevPriorityRef = useRef(state.priority);
  const handRef = useRef(state.playerHand);
  const botmRef = useRef(state.backOfMind);
  handRef.current = state.playerHand;
  botmRef.current = state.backOfMind;

  const capturePlayedCard = useCallback((instanceId: string) => {
    const card = handRef.current.find(c => c.instanceId === instanceId)
      ?? botmRef.current.find(c => c.instanceId === instanceId);
    if (card) {
      setPlayedCardAnim(card);
      const container = playedCardContainerRef.current;
      const dp = discardPileRef.current;
      if (container && dp) {
        const containerRect = container.getBoundingClientRect();
        const dpRect = dp.getBoundingClientRect();
        setDiscardExitOffset({
          x: dpRect.left + dpRect.width / 2 - (containerRect.left + containerRect.width / 2),
          y: dpRect.top + dpRect.height / 2 - (containerRect.top + containerRect.height / 2),
        });
      }
    }
  }, []);

  const {
    playZoneHovered,
    draggingCardId,
    hoveredShieldIdx,
    dragOccurredRef,
    handleCardDragStart,
    handleCardDrag,
    handleCardDragEnd,
    handleShieldDrop,
  } = useCardDrag(playZoneRef, shieldSlotRefs, state, dispatch, capturePlayedCard);

  useLayoutEffect(() => {
    const dp = drawPileRef.current;
    const hc = handContainerRef.current;
    if (dp && hc) {
      const dpRect = dp.getBoundingClientRect();
      const hcRect = hc.getBoundingClientRect();
      drawPileOffset.current = {
        x: dpRect.left + dpRect.width / 2 - (hcRect.left + hcRect.width / 2),
        y: dpRect.top + dpRect.height / 2 - (hcRect.top + hcRect.height / 2),
      };
    }
  });

  useEffect(() => {
    const prev = prevPriorityRef.current;
    prevPriorityRef.current = state.priority;
    if (prev <= 0 && state.priority > 0) {
      setPriorityRestoreFlash(true);
      const t = setTimeout(() => setPriorityRestoreFlash(false), 1300);
      return () => clearTimeout(t);
    }
  }, [state.priority]);

  useEffect(() => {
    if (playedCardAnim) {
      const t = setTimeout(() => setPlayedCardAnim(null), 1300);
      return () => clearTimeout(t);
    }
  }, [playedCardAnim]);

  const recordDiscovery = useNuggetDiscoveryStore(s => s.recordDiscovery);
  const prevDiscoveredRef = useRef(state.discoveredNuggetIds.length);
  useEffect(() => {
    const ids = state.discoveredNuggetIds;
    if (ids.length > prevDiscoveredRef.current) {
      for (let i = prevDiscoveredRef.current; i < ids.length; i++) {
        recordDiscovery(state.config.id, ids[i]);
      }
    }
    prevDiscoveredRef.current = ids.length;
  }, [state.discoveredNuggetIds, state.config.id, recordDiscovery]);

  useEffect(() => {
    if (state.phase === 'Check') {
      dispatch({ type: 'CHECK' });
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'EnemyPending' && !state.manualEnemyMode) {
      const t = setTimeout(() => dispatch({ type: 'TRIGGER_ENEMY_ACTION' }), 1100);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.manualEnemyMode]);

  useEffect(() => {
    if (state.phase === 'FieldTriggerCheck') {
      const t = setTimeout(() => {
        dispatch({ type: 'RESOLVE_FIELD_TRIGGERS' });
      }, 400);
      return () => clearTimeout(t);
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'EnemyPlay' && state.stagedEnemyCard) {
      const t = setTimeout(() => {
        dispatch({ type: 'RESOLVE_ENEMY_CARD' });
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.stagedEnemyCard]);

  const openContextMenu = useCallback((cardId: string, x: number, y: number, source: 'hand' | 'botm') => {
    if (dragOccurredRef.current) return;
    setContextMenu({ cardId, x, y, source });
  }, [dragOccurredRef]);

  const { phase, priority, patience, playerHand, playerShields,
    opponentShields, stagedEnemyCard, backOfMind, pendingReveal } = state;

  const isPlayerTurn = phase === 'PlayerPending';
  const isBotMSelect = phase === 'BotMSelect';
  const isReveal = phase === 'RevealPending';
  const isTerminal = phase === 'WIN' || phase === 'LOSE';

  const hasEmptyShieldSlot = playerShields.some(s => s === null);
  const showPlayZone = isPlayerTurn;
  const isDragging = draggingCardId !== null;

  return (
    <div className="relative h-screen overflow-hidden bg-zinc-950">
      {/* Background */}
      <img
        src={`${import.meta.env.BASE_URL}assets/bg-placeholder.svg`}
        className="absolute inset-0 w-full h-full object-cover"
        alt=""
        aria-hidden
      />

      {/* Priority Restore flash */}
      <AnimatePresence>
        {priorityRestoreFlash && (
          <motion.div
            key="priority-restore-flash"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.3 }}
            className="fixed inset-0 z-15 pointer-events-none bg-blue-400/10"
          />
        )}
      </AnimatePresence>

      {/* Context menu dismiss overlay */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setContextMenu(null)}
        />
      )}

      {/* Context menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            key="context-menu"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.1 }}
            className="fixed z-40 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-2 min-w-[240px]"
            style={{ left: contextMenu.x, top: contextMenu.y, transform: 'translate(-50%, -100%)' }}
          >
            {/* Header */}
            {(() => {
              const ctxCard = contextMenu.source === 'botm'
                ? backOfMind.find(c => c.instanceId === contextMenu.cardId)
                : playerHand.find(c => c.instanceId === contextMenu.cardId);
              if (!ctxCard) return null;
              return (
                <div className="px-4 py-2 border-b border-zinc-700">
                  <div className="text-white text-sm font-semibold">{ctxCard.definition.name}</div>
                  <div className="text-zinc-500 text-xs">{ctxCard.definition.supertype} · cost {ctxCard.definition.cost}</div>
                </div>
              );
            })()}

            {/* Play action */}
            {isPlayerTurn && (
              <button
                className="w-full text-left px-5 py-3 text-base text-zinc-200 hover:bg-zinc-700 transition-colors"
                onClick={() => {
                  capturePlayedCard(contextMenu.cardId);
                  dispatch({ type: 'PLAY_CARD', cardInstanceId: contextMenu.cardId });
                  setContextMenu(null);
                }}
              >
                Play
              </button>
            )}

            {/* Place as Shield */}
            {isPlayerTurn && hasEmptyShieldSlot && (
              <button
                className="w-full text-left px-5 py-3 text-base text-amber-300 hover:bg-zinc-700 transition-colors"
                onClick={() => {
                  const emptySlotIdx = playerShields.findIndex(s => s === null);
                  if (emptySlotIdx !== -1) {
                    dispatch({ type: 'PLACE_SHIELD', cardInstanceId: contextMenu.cardId, slotIdx: emptySlotIdx });
                  }
                  setContextMenu(null);
                }}
              >
                Place as Shield ({SHIELD_PLACEMENT_COST} priority)
              </button>
            )}

            {/* BotM selection */}
            {isBotMSelect && (
              <button
                className="w-full text-left px-5 py-3 text-base text-zinc-200 hover:bg-zinc-700 transition-colors"
                onClick={() => {
                  dispatch({ type: 'SELECT_BOTM', cardInstanceId: contextMenu.cardId });
                  setContextMenu(null);
                }}
              >
                Keep
              </button>
            )}

            {/* Details */}
            {(() => {
              const ctxCard = contextMenu.source === 'botm'
                ? backOfMind.find(c => c.instanceId === contextMenu.cardId)
                : playerHand.find(c => c.instanceId === contextMenu.cardId);
              if (!ctxCard) return null;
              return (
                <button
                  className="w-full text-left px-5 py-3 text-base text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors border-t border-zinc-800"
                  onClick={() => {
                    setDetailCard(ctxCard);
                    setContextMenu(null);
                  }}
                >
                  Details
                </button>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game UI */}
      <div className="relative z-10 h-full text-white flex flex-col select-none overflow-hidden">

        {/* Nav Bar */}
        <div data-testid="nav-bar" className="flex items-center justify-between px-6 py-3 bg-zinc-900/90 border-b border-zinc-800 backdrop-blur-sm">
          <button onClick={onExit} className="text-zinc-400 hover:text-white text-lg transition-colors">
            ← Exit
          </button>
          <PhaseBar phase={phase} />
          <button
            onClick={() => setDevOpen(v => !v)}
            className="text-sm bg-zinc-800 border border-zinc-600 text-zinc-400 hover:text-white px-4 py-2 rounded transition-colors"
          >
            DEV
          </button>
        </div>

        {/* Main layout: top area (opponent + play zone) expands, stats + hand anchored bottom */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* ═══ TOP: Opponent area + staged card + play zone ═══ */}
          <div className="flex-1 flex flex-col p-2 lg:p-4 min-h-0 overflow-hidden relative">

            {/* Play zone overlay */}
            <PlayZone
              isHovered={playZoneHovered}
              visible={showPlayZone}
              zoneRef={playZoneRef}
            />

            {/* Staged enemy card */}
            <div ref={playedCardContainerRef} className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
              <AnimatePresence>
                {stagedEnemyCard && (
                  <motion.div
                    key={stagedEnemyCard.instanceId}
                    initial={{ opacity: 0, x: -60, scale: 0.85 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 80, scale: 0.7, transition: { duration: 0.8 } }}
                    transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                    className="flex flex-col items-center gap-1 pointer-events-auto"
                  >
                    <span className="text-sm text-red-400 uppercase tracking-widest">NPC plays</span>
                    <CardView card={stagedEnemyCard} />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Player played card animation */}
              <AnimatePresence>
                {playedCardAnim && !stagedEnemyCard && (() => {
                  const isConsumed = playedCardAnim.definition.subtype === 'Impression';
                  return (
                    <motion.div
                      key={playedCardAnim.instanceId + '-played'}
                      initial={{ opacity: 0.9, scale: 1.1, y: 40 }}
                      animate={{ opacity: 0.7, scale: 0.95, y: 0 }}
                      exit={isConsumed
                        ? { opacity: 0, scale: 0.5, transition: { duration: 0.8 } }
                        : { opacity: 0.3, scale: 0.2, x: discardExitOffset.x, y: discardExitOffset.y, transition: { duration: 0.9, ease: 'easeIn' } }}
                      transition={{ duration: 0.9 }}
                      className="flex flex-col items-center gap-1 pointer-events-none"
                    >
                      <CardView card={playedCardAnim} />
                    </motion.div>
                  );
                })()}
              </AnimatePresence>
            </div>

            {/* Field — Impressions and Traps (top of play area) */}
            {(state.fieldImpressions.length > 0 || state.fieldTraps.length > 0) && (
              <div className="flex justify-center gap-4 relative z-10">
                <AnimatePresence>
                  {state.fieldImpressions.map(c => (
                    <div key={c.instanceId} className="flex flex-col items-center gap-1">
                      <CardView card={c} label="Impression" />
                      {c.definition.activatedAbilities?.map(ab => (
                        <button key={ab.id}
                          onClick={() => dispatch({ type: 'ACTIVATE_ABILITY', cardInstanceId: c.instanceId, abilityId: ab.id })}
                          disabled={state.phase !== 'PlayerPending'}
                          className="text-[10px] px-2 py-0.5 rounded border border-amber-600 text-amber-400 hover:bg-amber-900/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          {ab.name} {formatAbilityCost(ab.cost)}
                        </button>
                      ))}
                    </div>
                  ))}
                  {state.fieldTraps.map(t => (
                    <CardView key={t.card.instanceId} card={t.card} label="Trap" />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Spacer pushes tokens to bottom of play area */}
            <div className="flex-1" />

            {/* Field — Tokens (bottom of play area) */}
            {state.fieldTokens.length > 0 && (
              <div className="flex justify-center gap-4 relative z-10 pb-2">
                <AnimatePresence>
                  {state.fieldTokens.map(c => (
                    <div key={c.instanceId} className="flex flex-col items-center gap-1">
                      <CardView card={c} label="Token" />
                      {c.definition.activatedAbilities?.map(ab => (
                        <button key={ab.id}
                          onClick={() => dispatch({ type: 'ACTIVATE_ABILITY', cardInstanceId: c.instanceId, abilityId: ab.id })}
                          disabled={state.phase !== 'PlayerPending'}
                          className="text-[10px] px-2 py-0.5 rounded border border-amber-600 text-amber-400 hover:bg-amber-900/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          {ab.name} {formatAbilityCost(ab.cost)}
                        </button>
                      ))}
                    </div>
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Placement hint */}
            {state.pendingPlaceAsShield && (
              <div className="text-center text-base text-yellow-400 py-2 relative z-10">Choose a shield slot to place the card</div>
            )}

            {/* Enemy Panel */}
            <div data-testid="enemy-panel" className="absolute bottom-0 left-0 z-20 pl-2 pb-1 max-w-[33%] max-h-[50%]">
              <div className="bg-zinc-950/70 backdrop-blur-sm rounded-lg p-3 inline-flex flex-col items-center gap-2">
                <button
                  onClick={() => setEnemyPanelCollapsed(v => !v)}
                  className="flex items-center gap-1.5 w-full justify-center group"
                >
                  <span className="text-[11px] text-zinc-500 uppercase tracking-widest group-hover:text-zinc-300 transition-colors">{activeEncounter.displayName}</span>
                  <motion.svg
                    animate={{ rotate: enemyPanelCollapsed ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    viewBox="0 0 12 12"
                    className="w-3 h-3 text-zinc-500 group-hover:text-zinc-300 transition-colors shrink-0"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M3 5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </motion.svg>
                </button>
                {!enemyPanelCollapsed && (
                  <div className="flex flex-col items-center gap-1.5">
                    <div className="flex gap-2">
                      {opponentShields.map((shield, i) => (
                        <ShieldBack
                          key={i}
                          broken={shield.broken}
                          loreText={shield.loreDescription}
                          hintText={shield.hintText}
                          isHint={shield.isHint}
                          compact
                        />
                      ))}
                    </div>
                    <TraitZone traits={state.config.traits} compact />
                    <div className="flex gap-3 text-[10px] lg:text-xs text-zinc-500">
                      <span>Deck {state.enemyDeck.length}</span>
                      <span>Discard {state.enemyDiscard.length}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ BOTTOM: Stats row (Priority + Patience + Player Shields) + Hand ═══ */}
          <div className="flex flex-col">

            {/* Combat Bar — two rows: shields on top, priority+patience on bottom */}
            <div data-testid="combat-bar" className="bg-zinc-950/80 backdrop-blur-sm border-t border-zinc-800 px-4 lg:px-6 py-2 lg:py-3">
              <div className="flex items-stretch gap-3 lg:gap-5">

                {/* Draw pile — spans full height of both rows */}
                <button
                  ref={drawPileRef}
                  onClick={() => setViewingPile('draw')}
                  className="group flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
                  title="View draw pile"
                >
                  <svg viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-10 lg:w-[60px] lg:h-[70px] group-hover:scale-110 transition-transform">
                    <rect x="4" y="0" width="18" height="24" rx="2" className="fill-zinc-700 stroke-zinc-500" strokeWidth="1"/>
                    <rect x="2" y="2" width="18" height="24" rx="2" className="fill-zinc-800 stroke-zinc-500" strokeWidth="1"/>
                    <rect x="0" y="4" width="18" height="24" rx="2" className="fill-zinc-900 stroke-zinc-400" strokeWidth="1.5"/>
                    <text x="9" y="19" textAnchor="middle" className="fill-zinc-400" fontSize="10" fontWeight="bold">?</text>
                  </svg>
                  <span className="tabular-nums font-medium text-xs lg:text-sm">{state.playerDeck.length}</span>
                </button>

                {/* Two-row center content */}
                <div className="flex-1 flex flex-col gap-1.5 lg:gap-2 min-w-0">

                  {/* Row 1: Player shields */}
                  <div className="flex items-center gap-1 lg:gap-1.5 flex-wrap justify-center">
                    <AnimatePresence mode="popLayout">
                      {playerShields.map((slot, i) => (
                        <div key={i} ref={el => { shieldSlotRefs.current[i] = el; }}>
                          <PlayerShieldSlot
                            slot={slot}
                            idx={i}
                            selectable={state.pendingPlaceAsShield && slot === null}
                            selected={false}
                            isDropTarget={isPlayerTurn && isDragging}
                            isDragHovered={hoveredShieldIdx === i}
                            onDrop={() => handleShieldDrop(i)}
                            onSelect={() => {
                              if (state.pendingPlaceAsShield && slot === null) {
                                dispatch({ type: 'CONFIRM_PLACE_AS_SHIELD', slotIdx: i });
                              } else if (slot !== null) {
                                setDetailCard(slot.card);
                              }
                            }}
                          />
                        </div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Row 2: Priority + Patience */}
                  <div className="flex items-center gap-3 lg:gap-5">
                    <div className="flex-1 min-w-0">
                      <PriorityBar
                        priority={priority}
                        maxPriority={state.config.defaultRestorePriority}
                      />
                    </div>
                    <PatienceDisplay
                      patience={patience}
                      maxPatience={state.config.opponentPatience}
                    />
                  </div>
                </div>

                {/* Discard pile — spans full height of both rows */}
                <button
                  ref={discardPileRef}
                  onClick={() => setViewingPile('discard')}
                  className="group flex flex-col items-center justify-center gap-1 text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
                  title="View discard pile"
                >
                  <svg viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-10 lg:w-[56px] lg:h-[70px] group-hover:scale-110 transition-transform">
                    <rect x="2" y="2" width="18" height="24" rx="2" className="fill-zinc-800 stroke-zinc-600" strokeWidth="1" opacity="0.5" transform="rotate(-6 11 14)"/>
                    <rect x="0" y="2" width="18" height="24" rx="2" className="fill-zinc-900 stroke-zinc-500" strokeWidth="1.5"/>
                    <path d="M12 2 L18 2 Q20 2 20 4 L20 8 Z" className="fill-zinc-700" opacity="0.6"/>
                  </svg>
                  <span className="tabular-nums font-medium text-xs lg:text-sm">{state.playerDiscard.length}</span>
                </button>
              </div>
            </div>

            {/* Retained cards (shown during non-BotM phases when BotM has cards) */}
            {backOfMind.length > 0 && !isBotMSelect && (
              <div className="flex justify-center gap-4 items-center px-6 py-3 bg-zinc-950/60">
                <AnimatePresence>
                  {backOfMind.map(card => (
                    <CardView
                      key={card.instanceId}
                      card={card}
                      onClick={(e: React.MouseEvent) => {
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        openContextMenu(card.instanceId, rect.left + rect.width / 2, rect.top, 'botm');
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Hand Area */}
            <div data-testid="hand-area" className={`px-4 lg:px-6 pt-2 lg:pt-3 ${
              isBotMSelect ? 'animate-indigo-pulse' : 'bg-zinc-950/60'
            }`}>
              <div className="flex items-end gap-4">
                {/* Hand cards */}
                <div className="flex-1 min-w-0 h-[140px] lg:h-[160px] overflow-visible relative">
                  <div ref={handContainerRef} className="flex gap-2 lg:gap-4 flex-wrap justify-center absolute bottom-0 left-0 right-0 translate-y-[40%] lg:translate-y-[35%]">
                    <AnimatePresence mode="popLayout">
                      {playerHand.map(card => {
                        const canDrag = isPlayerTurn;
                        const isBotMSelected = isBotMSelect && backOfMind.some(c => c.instanceId === card.instanceId);
                        return (
                          <HandCard
                            key={card.instanceId}
                            card={card}
                            onClick={(e: React.MouseEvent) => {
                              if (isBotMSelect) {
                                dispatch({ type: 'SELECT_BOTM', cardInstanceId: card.instanceId });
                              } else if (isPlayerTurn) {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const x = rect.left + rect.width / 2;
                                const y = rect.top;
                                openContextMenu(card.instanceId, x, y, 'hand');
                              }
                            }}
                            onRightClick={(isPlayerTurn || isBotMSelect)
                              ? (x, y) => openContextMenu(card.instanceId, x, y, 'hand')
                              : undefined}
                            selected={isBotMSelected}
                            dimmed={!isBotMSelect && !isPlayerTurn}
                            isDraggable={canDrag}
                            isAnyDragging={isDragging}
                            onCardDragStart={canDrag ? () => handleCardDragStart(card.instanceId) : undefined}
                            onCardDrag={canDrag ? (e) => handleCardDrag(e) : undefined}
                            onCardDragEnd={canDrag ? (e) => handleCardDragEnd(card.instanceId, e) : undefined}
                            initialOffset={drawPileOffset.current}
                          />
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex flex-col gap-2 shrink-0 pb-2">
                  {isPlayerTurn && (
                    <button
                      onClick={() => dispatch({ type: 'END_TURN' })}
                      className="px-6 py-3 border border-zinc-600 text-zinc-300 hover:text-white hover:border-white text-base rounded-lg transition-colors whitespace-nowrap"
                    >
                      End Turn
                    </button>
                  )}
                  {isBotMSelect && (
                    <div className="flex flex-col items-center gap-2">
                      <span className="text-xs text-indigo-300 text-center leading-tight">
                        Keep up to {state.combatConfig.backOfMindLimit}
                      </span>
                      <button
                        onClick={() => dispatch({ type: 'CONFIRM_BOTM' })}
                        className={`px-4 py-2 border text-sm rounded-lg transition-colors whitespace-nowrap ${
                          backOfMind.length > 0
                            ? 'border-yellow-400 text-yellow-400 hover:bg-yellow-900'
                            : 'border-zinc-500 text-zinc-400 hover:bg-zinc-700'
                        }`}
                      >
                        {backOfMind.length > 0
                          ? `Confirm (${backOfMind.length}/${state.combatConfig.backOfMindLimit})`
                          : 'Pass'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ── Modals ── */}

      {/* Discovery modal */}
      <AnimatePresence>
        {state.pendingDiscovery && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="bg-zinc-900 border border-amber-600 rounded-xl p-10 max-w-md w-full mx-4 text-center"
            >
              <div className="text-sm uppercase tracking-widest text-amber-500 mb-3">
                Information Discovered
              </div>
              <div className="text-lg font-semibold text-amber-300 mb-2">
                {state.pendingDiscovery.nuggetName}
              </div>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.9 }}
                className="text-white text-xl leading-relaxed mb-8"
              >
                {state.pendingDiscovery.effectDescription}
              </motion.p>
              <button
                onClick={() => dispatch({ type: 'DISMISS_DISCOVERY' })}
                className="px-10 py-3 border border-amber-500 text-amber-400 hover:bg-amber-900 text-base uppercase tracking-widest rounded-lg transition-colors"
              >
                Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reveal modal */}
      <AnimatePresence>
        {isReveal && pendingReveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-600 rounded-xl p-10 max-w-md w-full mx-4 text-center"
            >
              <div className="text-sm uppercase tracking-widest text-zinc-500 mb-3">
                {pendingReveal.isHint ? 'Hint Revealed' : 'Shield Broken'}
              </div>
              <motion.p
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3, duration: 0.9 }}
                className="text-white text-xl leading-relaxed mb-8"
              >
                {pendingReveal.loreDescription ?? pendingReveal.hintText}
              </motion.p>
              <button
                onClick={() => dispatch({ type: 'DISMISS_REVEAL' })}
                className="px-10 py-3 border border-white text-white hover:bg-white hover:text-zinc-950 text-base uppercase tracking-widest rounded-lg transition-colors"
              >
                Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Terminal screen */}
      <AnimatePresence>
        {isTerminal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
          >
            <div className="text-center">
              <div className={`text-8xl font-bold tracking-widest mb-8 ${phase === 'WIN' ? 'text-green-400' : 'text-red-500'}`}>
                {phase === 'WIN' ? 'BREAKTHROUGH' : 'FAILED'}
              </div>
              <button
                onClick={onExit}
                className="px-12 py-4 border-2 border-white text-white hover:bg-white hover:text-zinc-950 uppercase tracking-widest text-lg transition-colors rounded-lg"
              >
                Exit
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pile viewer modal */}
      <AnimatePresence>
        {viewingPile && (
          <motion.div
            key="pile-viewer-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
            onClick={() => setViewingPile(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-xl p-8 max-w-2xl w-full mx-4 max-h-[70vh] flex flex-col"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-base font-bold uppercase tracking-widest text-zinc-200">
                  {viewingPile === 'draw' ? 'Draw Pile' : 'Discard Pile'}
                  <span className="ml-2 text-zinc-500 font-normal">
                    ({viewingPile === 'draw' ? state.playerDeck.length : state.playerDiscard.length} cards)
                  </span>
                </h2>
                <button
                  onClick={() => setViewingPile(null)}
                  className="text-zinc-500 hover:text-white transition-colors text-2xl leading-none"
                >
                  ✕
                </button>
              </div>

              {viewingPile === 'draw' && (
                <p className="text-sm text-zinc-500 italic mb-4">Sorted alphabetically — draw order is hidden.</p>
              )}

              <div className="overflow-y-auto flex-1 -mr-2 pr-2">
                {(() => {
                  const cards = viewingPile === 'draw'
                    ? [...state.playerDeck].sort((a, b) => a.definition.name.localeCompare(b.definition.name))
                    : [...state.playerDiscard].reverse();
                  if (cards.length === 0) {
                    return <p className="text-zinc-600 text-base text-center py-8">No cards.</p>;
                  }
                  return cards.map((card, i) => {
                    const def = card.definition;
                    const border = COLOR_BORDER[def.color] ?? 'border-zinc-500';
                    return (
                      <div
                        key={card.instanceId + '-' + i}
                        className={`flex items-center gap-4 px-4 py-3 rounded-lg border ${border} bg-zinc-800/60 mb-2`}
                      >
                        <span className="text-white text-base font-semibold min-w-0 flex-1 truncate">{def.name}</span>
                        <span className="text-zinc-400 text-sm shrink-0">{def.supertype}</span>
                        {def.keywords.length > 0 && (
                          <span className="text-zinc-500 text-xs shrink-0">{def.keywords.join(', ')}</span>
                        )}
                        <span className="text-zinc-300 text-sm font-bold shrink-0 w-8 text-right">{def.cost}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card detail modal */}
      <AnimatePresence>
        {detailCard && (
          <motion.div
            key="card-detail-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
            onClick={() => setDetailCard(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-xl p-8 max-w-md w-full mx-4 flex flex-col gap-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">{detailCard.definition.name}</h2>
                <button
                  onClick={() => setDetailCard(null)}
                  className="text-zinc-500 hover:text-white transition-colors text-2xl leading-none"
                >
                  ✕
                </button>
              </div>
              <div className="flex gap-2 flex-wrap text-sm">
                <span className={`px-2 py-1 rounded border ${COLOR_BORDER[detailCard.definition.color]} text-zinc-300`}>
                  {detailCard.definition.color}
                </span>
                <span className="px-2 py-1 rounded border border-zinc-600 text-zinc-400">
                  {detailCard.definition.supertype}
                </span>
                <span className="px-2 py-1 rounded border border-zinc-600 text-zinc-400">
                  Cost {detailCard.definition.cost}
                </span>
                {detailCard.definition.keywords.map(kw => (
                  <KeywordBadge key={kw} keyword={kw} />
                ))}
              </div>
              {(detailCard.definition.effectText ?? detailCard.definition.description) && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Effect</div>
                  <p className="text-base text-zinc-200 leading-relaxed">
                    {detailCard.definition.effectText ?? detailCard.definition.description}
                  </p>
                </div>
              )}
              {detailCard.definition.longDescription && (
                <div>
                  <div className="text-xs uppercase tracking-widest text-zinc-500 mb-1">Description</div>
                  <p className="text-base text-zinc-300 leading-relaxed">
                    {detailCard.definition.longDescription}
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dev panel */}
      <DevPanel
        open={devOpen}
        onClose={() => setDevOpen(false)}
        state={state}
        dispatch={dispatch}
        onLoadEncounter={loadEncounter}
      />
    </div>
  );
}
