import { useReducer, useEffect, useLayoutEffect, useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { combatReducer } from '../combat/combatReducer';
import { buildInitialCombatState, TEST_ENCOUNTER } from '../data/encounterDefs';
import { CardInstance, CombatState, CombatAction, EncounterConfig, SHIELD_PLACEMENT_COST } from '../combat/types';
import DevPanel from '../components/dev/DevPanel';
import CombatConsole from '../components/dev/CombatConsole';
import { DualSession, shouldBroadcast, isActionAllowed } from '../lib/realtimeChannel';
import PriorityBar from '../components/combat/PriorityBar';
import PatienceDisplay from '../components/combat/PatienceDisplay';
import CardView from '../components/combat/CardView';
import HandCard from '../components/combat/HandCard';
import ShieldBack from '../components/combat/ShieldBack';
import PlayerShieldSlot from '../components/combat/PlayerShieldSlot';
import TraitZone from '../components/combat/TraitZone';
import PhaseBar from '../components/combat/PhaseBar';
import PlayZone from '../components/combat/PlayZone';
import useCardDrag from '../components/combat/useCardDrag';
import DiscoveryModal from '../components/combat/DiscoveryModal';
import RevealModal from '../components/combat/RevealModal';
import TerminalScreen from '../components/combat/TerminalScreen';
import PileViewerModal from '../components/combat/PileViewerModal';
import CardDetailModal from '../components/combat/CardDetailModal';
import NumberChoiceModal from '../components/combat/NumberChoiceModal';
import DeckRevealModal from '../components/combat/DeckRevealModal';
import { formatAbilityCost } from '../components/combat/formatters';
import useCombatEffects from '../components/combat/useCombatEffects';

function formatTrapCondition(cond: import('../combat/types').TrapTriggerCondition): string {
  switch (cond.triggerType) {
    case 'OPPONENT_PLAYS_CARD': return 'Triggers when opponent plays a card';
    case 'OPPONENT_BREAKS_SHIELD': return 'Triggers when opponent breaks a shield';
    case 'PATIENCE_CHANGE': {
      if (!cond.comparator || cond.value === undefined) return 'Triggers on patience change';
      const op = { eq: '=', gt: '>', lt: '<', gte: '≥', lte: '≤' }[cond.comparator];
      return `Triggers when patience ${op} ${cond.value}`;
    }
    case 'PRIORITY_CHANGE': {
      if (!cond.comparator || cond.value === undefined) return 'Triggers on priority change';
      const op = { eq: '=', gt: '>', lt: '<', gte: '≥', lte: '≤' }[cond.comparator];
      return `Triggers when priority ${op} ${cond.value}`;
    }
    default: return 'Trap';
  }
}

interface CombatScreenProps {
  onExit: () => void;
  encounterConfig?: EncounterConfig;
  playerDeckDefs?: import('../combat/types').CardDefinition[];
  dualSession?: DualSession;
  initialCombatState?: CombatState;
}

export default function CombatScreen({ onExit, encounterConfig, playerDeckDefs, dualSession, initialCombatState }: CombatScreenProps) {
  const initialEncounter = encounterConfig ?? TEST_ENCOUNTER;
  const [state, rawDispatch] = useReducer(
    combatReducer,
    undefined,
    () => initialCombatState ?? buildInitialCombatState(initialEncounter, playerDeckDefs),
  );
  const [activeEncounter, setActiveEncounter] = useState(initialEncounter);

  const isDual = !!dualSession;
  const dualRole = dualSession?.role ?? 'player';

  const dispatch = useCallback((action: CombatAction) => {
    if (dualSession && !isActionAllowed(action, dualSession.role)) return;
    rawDispatch(action);
    if (dualSession && shouldBroadcast(action)) {
      dualSession.broadcastAction(action);
    }
  }, [dualSession, rawDispatch]);

  useEffect(() => {
    if (!dualSession) return;
    dualSession.callbacks.current.onAction = (action: CombatAction) => {
      rawDispatch(action);
    };
    return () => { dualSession.callbacks.current.onAction = undefined; };
  }, [dualSession, rawDispatch]);

  useEffect(() => {
    if (isDual && !state.manualEnemyMode) {
      rawDispatch({ type: 'DEV_SET_MANUAL_ENEMY', enabled: true });
    }
  }, [isDual]);

  const loadEncounter = useCallback((config: EncounterConfig) => {
    setActiveEncounter(config);
    dispatch({ type: 'DEV_RESET', state: buildInitialCombatState(config, playerDeckDefs) });
  }, [playerDeckDefs]);
  const [devOpen, setDevOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ cardId: string; x: number; y: number; source: 'hand' | 'botm' } | null>(null);
  const [viewingPile, setViewingPile] = useState<'draw' | 'discard' | null>(null);
  const [enemyPanelCollapsed, setEnemyPanelCollapsed] = useState(false);
  const [detailCard, setDetailCard] = useState<CardInstance | null>(null);
  const [heavyHandPending, setHeavyHandPending] = useState<string | null>(null);
  const [playedCardAnim, setPlayedCardAnim] = useState<CardInstance | null>(null);
  const [reorderDragIdx, setReorderDragIdx] = useState(-1);
  const playedCardContainerRef = useRef<HTMLDivElement | null>(null);
  const [discardExitOffset, setDiscardExitOffset] = useState<{ x: number; y: number }>({ x: 80, y: 0 });
  const playZoneRef = useRef<HTMLDivElement | null>(null);
  const drawPileRef = useRef<HTMLButtonElement | null>(null);
  const discardPileRef = useRef<HTMLButtonElement | null>(null);
  const handContainerRef = useRef<HTMLDivElement | null>(null);
  const drawPileOffset = useRef<{ x: number; y: number } | undefined>(undefined);
  const shieldSlotRefs = useRef<(HTMLDivElement | null)[]>([]);
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
  } = useCardDrag(playZoneRef, shieldSlotRefs, state, dispatch, capturePlayedCard, setHeavyHandPending);

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

  const { priorityRestoreFlash, shieldTriggerAnim } = useCombatEffects({
    state,
    dispatch,
    playedCardAnim,
    setPlayedCardAnim,
  });

  const handleShieldReorderDrop = useCallback((targetIdx: number) => {
    if (reorderDragIdx === -1 || reorderDragIdx === targetIdx) return;
    const newOrder = state.playerShields.map((_s, i) => i);
    const [removed] = newOrder.splice(reorderDragIdx, 1);
    newOrder.splice(targetIdx, 0, removed);
    dispatch({ type: 'RESEQUENCE_SHIELDS', newOrder });
    setReorderDragIdx(-1);
  }, [reorderDragIdx, state.playerShields, dispatch]);

  const openContextMenu = useCallback((cardId: string, x: number, y: number, source: 'hand' | 'botm') => {
    if (dragOccurredRef.current) return;
    setContextMenu({ cardId, x, y, source });
  }, [dragOccurredRef]);

  const { phase, priority, patience, playerHand, playerShields,
    opponentShields, stagedEnemyCard, backOfMind, pendingReveal } = state;

  const isPlayerTurn = phase === 'PlayerPending';
  const isBotMSelect = phase === 'BotMSelect';
  const isReveal = phase === 'RevealPending';
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

      {/* Shield Trigger activation toast */}
      <AnimatePresence>
        {shieldTriggerAnim && (
          <motion.div
            key="shield-trigger-toast"
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="fixed bottom-48 left-1/2 -translate-x-1/2 z-40 pointer-events-none"
          >
            <div className="bg-blue-950/90 border-2 border-blue-400 rounded-xl px-8 py-4 shadow-[0_0_30px_rgba(96,165,250,0.4)] flex items-center gap-3">
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-blue-400 shrink-0">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
              </svg>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-blue-400">Shield Trigger</div>
                <div className="text-sm font-semibold text-white">{shieldTriggerAnim}</div>
              </div>
            </div>
          </motion.div>
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
            {(() => {
              const ctxCard = contextMenu.source === 'botm'
                ? backOfMind.find(c => c.instanceId === contextMenu.cardId)
                : playerHand.find(c => c.instanceId === contextMenu.cardId);
              if (!ctxCard) return null;
              return (
                <>
                  {/* Header */}
                  <div className="px-4 py-2 border-b border-zinc-700">
                    <div className="text-white text-sm font-semibold">{ctxCard.definition.name}</div>
                    <div className="text-zinc-500 text-xs">{ctxCard.definition.supertype} · cost {ctxCard.definition.cost}</div>
                  </div>

                  {/* Play action */}
                  {isPlayerTurn && (
                    ctxCard.definition.keywords.includes('Heavy Hand') ? (
                      <>
                        <button
                          className="w-full text-left px-5 py-3 text-base text-zinc-200 hover:bg-zinc-700 transition-colors"
                          onClick={() => {
                            capturePlayedCard(contextMenu.cardId);
                            dispatch({ type: 'PLAY_CARD', cardInstanceId: contextMenu.cardId });
                            setContextMenu(null);
                          }}
                        >
                          Play Normal (cost {ctxCard.definition.cost})
                        </button>
                        <button
                          className="w-full text-left px-5 py-3 text-base text-orange-300 hover:bg-zinc-700 transition-colors"
                          onClick={() => {
                            capturePlayedCard(contextMenu.cardId);
                            dispatch({ type: 'PLAY_CARD', cardInstanceId: contextMenu.cardId, heavyHand: true });
                            setContextMenu(null);
                          }}
                        >
                          Heavy Hand (cost {ctxCard.definition.cost * 2})
                        </button>
                      </>
                    ) : (
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
                    )
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
                  <button
                    className="w-full text-left px-5 py-3 text-base text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors border-t border-zinc-800"
                    onClick={() => {
                      setDetailCard(ctxCard);
                      setContextMenu(null);
                    }}
                  >
                    Details
                  </button>
                </>
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
          {isDual ? (
            <span className={`text-sm px-4 py-2 rounded border font-bold ${dualRole === 'player' ? 'border-blue-600 text-blue-400' : 'border-red-600 text-red-400'}`}>
              {dualRole === 'player' ? 'PLAYER' : 'NPC'}
            </span>
          ) : (
            <button
              onClick={() => setDevOpen(v => !v)}
              className="text-sm bg-zinc-800 border border-zinc-600 text-zinc-400 hover:text-white px-4 py-2 rounded transition-colors"
            >
              DEV
            </button>
          )}
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

            {/* Spacer pushes field cards to bottom of play area */}
            <div className="flex-1" />

            {/* Field — Impressions, Traps, and Tokens (bottom of play area) */}
            {(state.fieldImpressions.length > 0 || state.fieldTraps.length > 0 || state.fieldTokens.length > 0) && (
              <div className="flex justify-center gap-4 flex-wrap relative z-10 pb-2">
                {state.fieldImpressions.map(fi => (
                  <div key={fi.card.instanceId} className="flex flex-col items-center gap-1">
                    <CardView card={fi.card} label="Impression" onClick={() => setDetailCard(fi.card)} />
                    {fi.card.definition.activatedAbilities?.map(ab => (
                      <button key={ab.id}
                        onClick={() => dispatch({ type: 'ACTIVATE_ABILITY', cardInstanceId: fi.card.instanceId, abilityId: ab.id })}
                        disabled={state.phase !== 'PlayerPending'}
                        className="text-[10px] px-2 py-0.5 rounded border border-amber-600 text-amber-400 hover:bg-amber-900/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        {ab.name} {formatAbilityCost(ab.cost)}
                      </button>
                    ))}
                  </div>
                ))}
                {state.fieldTraps.map(t => (
                  <div key={t.card.instanceId} className="flex flex-col items-center gap-1 group/trap relative">
                    <CardView card={t.card} label="Trap" onClick={() => setDetailCard(t.card)} />
                    <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 opacity-0 group-hover/trap:opacity-100 transition-opacity pointer-events-none z-20 whitespace-nowrap">
                      <span className="text-[10px] bg-zinc-800 border border-zinc-600 text-zinc-300 px-2 py-1 rounded shadow-lg">
                        {formatTrapCondition(t.triggerCondition)}
                      </span>
                    </div>
                  </div>
                ))}
                {state.fieldTokens.map(c => (
                  <div key={c.instanceId} className="flex flex-col items-center gap-1">
                    <CardView card={c} label="Token" onClick={() => setDetailCard(c)} />
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
                      {state.npcHandRevealed && <span className="text-green-400">Hand Revealed</span>}
                      {state.npcDeckTopRevealed && <span className="text-green-400">Top Revealed</span>}
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
                            reorderable={isPlayerTurn && !isDragging}
                            onReorderDragStart={() => setReorderDragIdx(i)}
                            onReorderDrop={() => handleShieldReorderDrop(i)}
                            triggerFlash={shieldTriggerAnim !== null && slot?.card.definition.keywords.includes('Shield Trigger')}
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
                {/* Hand cards — hidden for NPC role in dual mode */}
                {isDual && dualRole === 'npc' ? (
                  <div className="flex-1 min-w-0 h-[140px] lg:h-[160px] flex flex-col items-center justify-center gap-3">
                    <div className="text-zinc-500 text-sm">Player Hand: {playerHand.length} cards</div>
                    {state.phase === 'EnemyPending' && state.enemyDeck.length > 0 && (
                      <div className="w-full max-w-md border border-red-700 rounded-lg p-3 bg-red-950/30">
                        <div className="text-xs text-red-400 font-bold mb-2">Pick enemy card to play ({state.enemyDeck.length} in deck)</div>
                        <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                          {state.enemyDeck.map((inst, i) => (
                            <button key={inst.instanceId}
                              onClick={() => dispatch({ type: 'DEV_PICK_ENEMY_FROM_DECK', instanceId: inst.instanceId })}
                              className="text-left text-xs px-2 py-1.5 rounded border border-zinc-700 text-zinc-200 hover:border-red-400 hover:text-red-300 hover:bg-red-950/50 transition-colors flex justify-between items-center"
                            >
                              <span>{i === 0 && <span className="text-zinc-500 mr-1">[top]</span>}{inst.definition.name}</span>
                              <span className="text-zinc-500 text-[10px]">cost {inst.definition.cost} · {inst.definition.color}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {state.phase === 'EnemyPending' && state.enemyDeck.length === 0 && (
                      <div className="text-amber-500/60 text-xs">No cards in enemy deck</div>
                    )}
                    {state.phase !== 'EnemyPending' && (
                      <div className="text-zinc-600 text-xs">
                        {state.phase === 'PlayerPending' ? 'Waiting for player...' : `Phase: ${state.phase}`}
                      </div>
                    )}
                  </div>
                ) : (
                <div className="flex-1 min-w-0 h-[140px] lg:h-[160px] overflow-visible relative">
                  <div ref={handContainerRef} className="flex gap-2 lg:gap-4 flex-wrap justify-center absolute bottom-0 left-0 right-0 translate-y-[40%] lg:translate-y-[35%]">
                    <AnimatePresence mode="popLayout">
                      {playerHand.map(card => {
                        const canDrag = isPlayerTurn && !(isDual && dualRole === 'npc');
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
                )}

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

      <DiscoveryModal
        pendingDiscovery={state.pendingDiscovery}
        onDismiss={() => dispatch({ type: 'DISMISS_DISCOVERY' })}
      />

      <RevealModal
        visible={isReveal}
        pendingReveal={pendingReveal}
        onDismiss={() => dispatch({ type: 'DISMISS_REVEAL' })}
      />

      <TerminalScreen phase={phase} onExit={onExit} />

      <PileViewerModal
        viewingPile={viewingPile}
        onClose={() => setViewingPile(null)}
        playerDeck={state.playerDeck}
        playerDiscard={state.playerDiscard}
      />

      <CardDetailModal card={detailCard} onClose={() => setDetailCard(null)} />

      <NumberChoiceModal
        visible={state.phase === 'ChooseNumberPending'}
        range={state.pendingNumberChoice}
        onChoose={(value) => dispatch({ type: 'RESOLVE_NUMBER_CHOICE', value })}
      />

      <DeckRevealModal
        visible={state.phase === 'DeckRevealPending'}
        cards={state.pendingDeckReveal}
        onDismiss={() => dispatch({ type: 'DISMISS_DECK_REVEAL' })}
      />

      {/* Heavy Hand choice modal */}
      <AnimatePresence>
        {heavyHandPending && (() => {
          const hhCard = state.playerHand.find(c => c.instanceId === heavyHandPending)
            ?? state.backOfMind.find(c => c.instanceId === heavyHandPending);
          if (!hhCard) return null;
          return (
            <motion.div
              key="heavy-hand-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
              onClick={() => setHeavyHandPending(null)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-zinc-900 border border-zinc-600 rounded-xl p-6 shadow-2xl max-w-sm w-full mx-4"
                onClick={e => e.stopPropagation()}
              >
                <h3 className="text-white text-lg font-semibold mb-1">{hhCard.definition.name}</h3>
                <p className="text-zinc-400 text-sm mb-4">Choose how to play this card:</p>
                <div className="flex flex-col gap-3">
                  <button
                    className="w-full py-3 px-4 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 rounded-lg transition-colors text-left"
                    onClick={() => {
                      capturePlayedCard(heavyHandPending);
                      dispatch({ type: 'PLAY_CARD', cardInstanceId: heavyHandPending, heavyHand: false });
                      setHeavyHandPending(null);
                    }}
                  >
                    <span className="font-semibold">Normal</span>
                    <span className="text-zinc-400 ml-2">— cost {hhCard.definition.cost}</span>
                  </button>
                  <button
                    className="w-full py-3 px-4 bg-orange-900/50 hover:bg-orange-800/60 text-orange-200 border border-orange-700/50 rounded-lg transition-colors text-left"
                    onClick={() => {
                      capturePlayedCard(heavyHandPending);
                      dispatch({ type: 'PLAY_CARD', cardInstanceId: heavyHandPending, heavyHand: true });
                      setHeavyHandPending(null);
                    }}
                  >
                    <span className="font-semibold">Heavy Hand</span>
                    <span className="text-orange-300/70 ml-2">— cost {hhCard.definition.cost * 2}</span>
                  </button>
                </div>
                <button
                  className="mt-4 w-full py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
                  onClick={() => setHeavyHandPending(null)}
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Dev panel / Combat console */}
      {isDual ? (
        <CombatConsole state={state} role={dualRole} />
      ) : (
        <DevPanel
          open={devOpen}
          onClose={() => setDevOpen(false)}
          state={state}
          dispatch={dispatch}
          onLoadEncounter={loadEncounter}
        />
      )}
    </div>
  );
}
