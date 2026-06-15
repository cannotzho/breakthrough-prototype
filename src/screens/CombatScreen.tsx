import { useReducer, useEffect, useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { combatReducer } from '../combat/combatReducer';
import { buildInitialCombatState, TEST_ENCOUNTER } from '../data/encounterDefs';
import { CardInstance, CombatState, Keyword } from '../combat/types';
import DevPanel from '../components/dev/DevPanel';
import PriorityBar from '../components/combat/PriorityBar';
import PatienceDisplay from '../components/combat/PatienceDisplay';

interface CombatScreenProps {
  onExit: () => void;
}

const COLOR_BORDER: Record<string, string> = {
  Red: 'border-red-500',
  Blue: 'border-blue-500',
  Green: 'border-green-500',
  White: 'border-white',
  Black: 'border-purple-900',
  Orange: 'border-orange-400',
  Purple: 'border-purple-500',
  Colorless: 'border-zinc-500',
};

const COLOR_BG: Record<string, string> = {
  Red: 'bg-red-950',
  Blue: 'bg-blue-950',
  Green: 'bg-green-950',
  White: 'bg-zinc-800',
  Black: 'bg-purple-950',
  Orange: 'bg-orange-950',
  Purple: 'bg-purple-950',
  Colorless: 'bg-zinc-900',
};

// §8.3 keyword definitions (Gap #10)
const KEYWORD_DEFINITIONS: Record<Keyword, string> = {
  Interrupt: 'May be played during the NPC\'s turn before the staged card resolves. No Priority cost.',
  Safety: 'When this shield is broken, the NPC loses 0 Patience instead of 1.',
  Assemble: 'This card may be combined with another Assemble card.',
  Counter: 'When broken as a shield, its printed effects resolve before the break outcome fires.',
  Lie: 'Playing this card increments the Lie Counter. Exceeding the threshold loses the encounter.',
};

function KeywordBadge({ keyword }: { keyword: Keyword }) {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <span
      className="relative text-xs bg-zinc-700 text-zinc-300 px-1 rounded cursor-help"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {keyword}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-52 p-2 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl text-xs text-zinc-200 leading-relaxed pointer-events-none"
          >
            <span className="font-semibold text-white">{keyword}:</span> {KEYWORD_DEFINITIONS[keyword]}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

function CardView({
  card,
  onClick,
  onRightClick,
  selected,
  dimmed,
  label,
  isDraggable,
  onCardDragStart,
  onCardDrag,
  onCardDragEnd,
}: {
  card: CardInstance;
  onClick?: () => void;
  onRightClick?: (x: number, y: number) => void;
  selected?: boolean;
  dimmed?: boolean;
  label?: string;
  isDraggable?: boolean;
  onCardDragStart?: () => void;
  onCardDrag?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
  onCardDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
}) {
  const def = card.definition;
  const border = COLOR_BORDER[def.color] ?? 'border-zinc-500';
  const bg = COLOR_BG[def.color] ?? 'bg-zinc-900';

  return (
    <motion.div
      layout
      onClick={onClick}
      onContextMenu={(e) => {
        if (onRightClick) {
          e.preventDefault();
          onRightClick(e.clientX, e.clientY);
        }
      }}
      drag={!!isDraggable}
      dragSnapToOrigin={isDraggable ? true : undefined}
      dragElastic={isDraggable ? 0.1 : undefined}
      onDragStart={isDraggable ? (_e: MouseEvent | TouchEvent | PointerEvent, _i: PanInfo) => onCardDragStart?.() : undefined}
      onDrag={isDraggable ? (e: MouseEvent | TouchEvent | PointerEvent, _i: PanInfo) => onCardDrag?.(e) : undefined}
      onDragEnd={isDraggable ? (e: MouseEvent | TouchEvent | PointerEvent, _i: PanInfo) => onCardDragEnd?.(e) : undefined}
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: dimmed ? 0.4 : 1, y: 0, scale: selected ? 1.05 : 1 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`relative w-28 h-40 rounded-lg border-2 ${border} ${bg} flex flex-col p-2 select-none
        ${isDraggable ? 'cursor-grab active:cursor-grabbing' : onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}
        ${selected ? 'ring-2 ring-yellow-400' : ''}`}
      whileTap={onClick && !isDraggable ? { scale: 0.95 } : {}}
    >
      {label && (
        <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-xs bg-yellow-400 text-black px-1 rounded">
          {label}
        </span>
      )}
      <div className="flex justify-between items-start">
        <span className="text-xs text-zinc-400">{def.color}</span>
        <span className="text-sm font-bold text-white">{def.cost}</span>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <span className="text-white text-xs text-center font-semibold leading-tight">{def.name}</span>
      </div>
      {def.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {def.keywords.map(kw => (
            <KeywordBadge key={kw} keyword={kw} />
          ))}
        </div>
      )}
      <p className="text-zinc-400 text-xs mt-1 leading-tight line-clamp-2">{def.description}</p>
    </motion.div>
  );
}

function ShieldBack({ broken, loreText, hintText, isHint }: {
  broken: boolean;
  loreText?: string;
  hintText?: string;
  isHint: boolean;
}) {
  return (
    <motion.div
      animate={broken
        ? { opacity: 0.6, scale: 1 }
        : { opacity: 1, scale: 1 }}
      className={`w-24 h-32 rounded-lg border-2 flex flex-col items-center justify-center p-2
        ${broken ? 'border-zinc-600 bg-zinc-800/40' : 'border-zinc-500 bg-zinc-800'}
      `}
    >
      {broken ? (
        <motion.div
          initial={{ rotateZ: -2, scale: 1.05 }}
          animate={{ rotateZ: 0, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 10 }}
          className="text-center"
        >
          <div className="text-zinc-500 text-xs mb-1">{isHint ? 'HINT' : 'BROKEN'}</div>
          <p className="text-zinc-400 text-xs leading-tight">{hintText ?? loreText}</p>
        </motion.div>
      ) : (
        <div className="text-zinc-600 text-2xl">?</div>
      )}
    </motion.div>
  );
}

function PlayerShieldSlot({ slot, idx, selectable, selected, onSelect }: {
  slot: CombatState['playerShields'][0];
  idx: number;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
}) {
  return (
    <motion.div
      layout
      className={`w-24 h-32 rounded-lg border-2 flex items-center justify-center cursor-pointer
        ${slot ? 'border-blue-400 bg-blue-950' : 'border-zinc-700 bg-zinc-900/40 border-dashed'}
        ${selectable ? 'hover:border-yellow-400' : ''}
        ${selected ? 'border-yellow-400 ring-2 ring-yellow-400' : ''}
      `}
      onClick={onSelect}
    >
      {slot ? (
        <div className="text-center p-2">
          <div className="text-white text-xs font-semibold">{slot.card.definition.name}</div>
          {slot.card.definition.keywords.map(kw => (
            <KeywordBadge key={kw} keyword={kw} />
          ))}
        </div>
      ) : (
        <span className="text-zinc-600 text-xs">Slot {idx + 1}</span>
      )}
    </motion.div>
  );
}

// Trait display component (Gap #8, #14)
function TraitZone({ traits }: { traits: CombatState['config']['traits'] }) {
  if (traits.length === 0) return null;
  return (
    <div className="flex items-center gap-2 justify-center mt-1">
      <span className="text-xs text-zinc-500 uppercase tracking-widest">Traits</span>
      {traits.map(trait => (
        <TraitIcon key={trait.id} trait={trait} />
      ))}
    </div>
  );
}

function TraitIcon({ trait }: { trait: CombatState['config']['traits'][0] }) {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <span
      className="relative cursor-help"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <motion.span
        key={trait.discovered ? 'discovered' : 'hidden'}
        initial={{ rotateY: 90 }}
        animate={{ rotateY: 0 }}
        className={`inline-flex items-center justify-center w-7 h-7 rounded-full border text-xs font-bold
          ${trait.discovered
            ? 'border-amber-500 bg-amber-950 text-amber-400'
            : 'border-zinc-600 bg-zinc-800 text-zinc-500'}`}
      >
        {trait.discovered ? trait.name.charAt(0).toUpperCase() : '?'}
      </motion.span>
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-1 w-48 p-2 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl text-xs text-zinc-200 leading-relaxed pointer-events-none"
          >
            {trait.discovered ? (
              <>
                <span className="font-semibold text-amber-400">{trait.name}</span>
                <p className="mt-0.5">{trait.description}</p>
              </>
            ) : (
              <span className="italic text-zinc-400">Unknown trait — trigger it to discover.</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

function PhaseBar({ phase }: { phase: string }) {
  const isPlayer = ['PlayerPending', 'PlayerPlay', 'BotMSelect'].includes(phase);
  const isEnemy = ['EnemyPending', 'EnemyPlay', 'InterruptCheck', 'Interrupt'].includes(phase);

  return (
    <div className={`px-4 py-1 rounded text-xs font-bold uppercase tracking-widest
      ${isPlayer ? 'bg-blue-900 text-blue-200' :
        isEnemy ? 'bg-red-900 text-red-200' :
        'bg-zinc-800 text-zinc-300'}
    `}>
      {phase}
    </div>
  );
}

function PlayZone({
  isHovered,
  visible,
  zoneRef,
}: {
  isHovered: boolean;
  visible: boolean;
  zoneRef: { current: HTMLDivElement | null };
}) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="play-zone-outer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20"
          style={{ width: 480, height: 220 }}
        >
          <div
            ref={zoneRef}
            className="w-full h-full rounded-[50%] flex items-center justify-center transition-all duration-150"
            style={{
              border: isHovered
                ? '2px solid rgba(251,191,36,0.8)'
                : '1px dashed rgba(161,161,170,0.28)',
              background: isHovered
                ? 'radial-gradient(ellipse, rgba(248,200,80,0.08) 0%, transparent 70%)'
                : 'transparent',
            }}
          >
            <AnimatePresence>
              {isHovered && (
                <motion.span
                  key="play-label"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-amber-400 text-sm font-semibold tracking-widest uppercase"
                >
                  Play
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function CombatScreen({ onExit }: CombatScreenProps) {
  const [state, dispatch] = useReducer(combatReducer, undefined, () =>
    buildInitialCombatState(TEST_ENCOUNTER)
  );
  const [devOpen, setDevOpen] = useState(false);
  const [selectedShieldSlot, setSelectedShieldSlot] = useState<number | null>(null);
  const [placeShieldMode, setPlaceShieldMode] = useState(false);
  const [placeShieldCardId, setPlaceShieldCardId] = useState<string | null>(null);
  const [playZoneHovered, setPlayZoneHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ cardId: string; x: number; y: number; source: 'hand' | 'botm' } | null>(null);
  const [priorityRestoreFlash, setPriorityRestoreFlash] = useState(false);
  const playZoneRef = useRef<HTMLDivElement | null>(null);
  const prevPriorityRef = useRef(state.priority);

  // Priority Restore visual event (Gap #18)
  useEffect(() => {
    const prev = prevPriorityRef.current;
    prevPriorityRef.current = state.priority;
    if (prev <= 0 && state.priority > 0) {
      setPriorityRestoreFlash(true);
      const t = setTimeout(() => setPriorityRestoreFlash(false), 800);
      return () => clearTimeout(t);
    }
  }, [state.priority]);

  // Auto-resolve Check phase
  useEffect(() => {
    if (state.phase === 'Check') {
      dispatch({ type: 'CHECK' });
    }
  }, [state.phase]);

  // Auto-resolve EnemyPending
  useEffect(() => {
    if (state.phase === 'EnemyPending') {
      const t = setTimeout(() => dispatch({ type: 'TRIGGER_ENEMY_ACTION' }), 600);
      return () => clearTimeout(t);
    }
  }, [state.phase]);

  // Auto-resolve InterruptCheck
  useEffect(() => {
    if (state.phase === 'InterruptCheck') {
      const t = setTimeout(() => {
        dispatch({ type: 'RESOLVE_INTERRUPT_CHECK' });
      }, 300);
      return () => clearTimeout(t);
    }
  }, [state.phase]);

  // Auto-resolve EnemyPlay
  useEffect(() => {
    if (state.phase === 'EnemyPlay' && state.stagedEnemyCard) {
      const t = setTimeout(() => {
        dispatch({ type: 'RESOLVE_ENEMY_CARD' });
      }, 500);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.stagedEnemyCard]);

  const isOverZone = useCallback((event: MouseEvent | TouchEvent | PointerEvent): boolean => {
    const rect = playZoneRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const clientX = 'clientX' in event
      ? (event as MouseEvent | PointerEvent).clientX
      : ((event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0])?.clientX ?? 0;
    const clientY = 'clientY' in event
      ? (event as MouseEvent | PointerEvent).clientY
      : ((event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0])?.clientY ?? 0;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }, []);

  const handleCardDragStart = useCallback((_instanceId: string) => {
    // drag start — play zone hover tracked via handleCardDrag
  }, []);

  const handleCardDrag = useCallback((event: MouseEvent | TouchEvent | PointerEvent) => {
    setPlayZoneHovered(prev => {
      const over = Boolean(playZoneRef.current && isOverZone(event));
      return over === prev ? prev : over;
    });
  }, [isOverZone]);

  // Unified drag end: dispatches PLAY_CARD or PLAY_INTERRUPT based on phase (Gap #4)
  const handleCardDragEnd = useCallback((instanceId: string, event: MouseEvent | TouchEvent | PointerEvent) => {
    if (isOverZone(event)) {
      if (state.phase === 'Interrupt') {
        dispatch({ type: 'PLAY_INTERRUPT', cardInstanceId: instanceId });
      } else {
        dispatch({ type: 'PLAY_CARD', cardInstanceId: instanceId });
      }
    }
    setPlayZoneHovered(false);
  }, [isOverZone, state.phase]);

  const cancelShieldMode = useCallback(() => {
    setPlaceShieldMode(false);
    setPlaceShieldCardId(null);
    setSelectedShieldSlot(null);
  }, []);

  const { phase, priority, patience, lieCounter, playerHand, playerShields,
    opponentShields, stagedEnemyCard, backOfMind, pendingReveal,
    pendingShieldChoiceSlotIdx } = state;

  const isPlayerTurn = phase === 'PlayerPending';
  const isBotMSelect = phase === 'BotMSelect';
  const isReveal = phase === 'RevealPending';
  const isShieldChoice = phase === 'PlayerShieldChoice';
  const isInterrupt = phase === 'Interrupt';
  const isTerminal = phase === 'WIN' || phase === 'LOSE';

  const hasEmptyShieldSlot = playerShields.some(s => s === null);
  const placeShieldCardName = placeShieldCardId
    ? playerHand.find(c => c.instanceId === placeShieldCardId)?.definition.name
    : null;

  // Show play zone for both player turn and interrupt phase (Gap #4)
  const showPlayZone = isPlayerTurn || isInterrupt;

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Background */}
      <img
        src="/breakthrough-prototype/assets/bg-placeholder.svg"
        className="absolute inset-0 w-full h-full object-cover"
        alt=""
        aria-hidden
      />

      {/* Priority Restore flash (Gap #18) */}
      <AnimatePresence>
        {priorityRestoreFlash && (
          <motion.div
            key="priority-restore-flash"
            initial={{ opacity: 0.5 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="fixed inset-0 z-15 pointer-events-none bg-blue-400/10"
          />
        )}
      </AnimatePresence>

      {/* Play zone — visible during PlayerPending AND Interrupt (Gap #4) */}
      <PlayZone
        isHovered={playZoneHovered}
        visible={showPlayZone}
        zoneRef={playZoneRef}
      />

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
            className="fixed z-40 bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl py-1 min-w-[168px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            {/* Play Interrupt via context menu (Gap #4) */}
            {isInterrupt && (() => {
              const ctxCard = contextMenu.source === 'botm'
                ? backOfMind.find(c => c.instanceId === contextMenu.cardId)
                : playerHand.find(c => c.instanceId === contextMenu.cardId);
              return ctxCard?.definition.keywords.includes('Interrupt') ? (
                <button
                  className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
                  onClick={() => {
                    dispatch({ type: 'PLAY_INTERRUPT', cardInstanceId: contextMenu.cardId });
                    setContextMenu(null);
                  }}
                >
                  Play Interrupt
                </button>
              ) : null;
            })()}
            {isPlayerTurn && !placeShieldMode && hasEmptyShieldSlot && (
              <button
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
                onClick={() => {
                  setPlaceShieldCardId(contextMenu.cardId);
                  setPlaceShieldMode(true);
                  setContextMenu(null);
                }}
              >
                Place as Shield
              </button>
            )}
            {isBotMSelect && (
              <button
                className="w-full text-left px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
                onClick={() => {
                  dispatch({ type: 'SELECT_BOTM', cardInstanceId: contextMenu.cardId });
                  setContextMenu(null);
                }}
              >
                Set as Back of Mind
              </button>
            )}
            {!isPlayerTurn && !isBotMSelect && !isInterrupt && (
              <div className="px-4 py-2 text-xs text-zinc-500 italic">No actions available</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game UI */}
      <div className="relative z-10 min-h-screen text-white flex flex-col select-none">

        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/90 border-b border-zinc-800 backdrop-blur-sm">
          <button onClick={onExit} className="text-zinc-400 hover:text-white text-sm transition-colors">
            ← Exit
          </button>
          <PhaseBar phase={phase} />
          <button
            onClick={() => setDevOpen(v => !v)}
            className="text-xs bg-zinc-800 border border-zinc-600 text-zinc-400 hover:text-white px-2 py-1 rounded transition-colors"
          >
            ⚙ DEV
          </button>
        </div>

        {/* Main layout */}
        <div className="flex-1 flex flex-col gap-4 p-4 overflow-auto">

          {/* Opponent shields + traits */}
          <div className="flex justify-center">
            <div className="bg-zinc-950/70 backdrop-blur-sm rounded-xl p-4 inline-flex flex-col items-center gap-2">
              <div className="text-xs text-zinc-500 uppercase tracking-widest">{TEST_ENCOUNTER.displayName}</div>
              <div className="flex gap-3">
                <AnimatePresence mode="popLayout">
                  {opponentShields.map((shield, i) => (
                    <motion.div key={i} layout>
                      <ShieldBack
                        broken={shield.broken}
                        loreText={shield.loreDescription}
                        hintText={shield.hintText}
                        isHint={shield.isHint}
                      />
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
              {/* Trait display (Gap #8, #14) */}
              <TraitZone traits={state.config.traits} />
            </div>
          </div>

          {/* Staged enemy card */}
          <div className="flex justify-center min-h-[5rem]">
            <AnimatePresence>
              {stagedEnemyCard && (
                <motion.div
                  key={stagedEnemyCard.instanceId}
                  initial={{ opacity: 0, y: -30, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 60, scale: 0.7, transition: { duration: 0.3 } }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  className="flex flex-col items-center gap-1"
                >
                  <span className="text-xs text-red-400 uppercase tracking-widest">NPC plays</span>
                  <CardView card={stagedEnemyCard} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Field impressions */}
          {state.fieldImpressions.length > 0 && (
            <div className="flex justify-center gap-2">
              <AnimatePresence>
                {state.fieldImpressions.map(c => (
                  <CardView key={c.instanceId} card={c} label="Field" />
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* Hints */}
          {state.pendingPlaceAsShield && (
            <div className="text-center text-xs text-yellow-400 py-1">Choose a shield slot to place the card</div>
          )}
          {placeShieldMode && !state.pendingPlaceAsShield && (
            <div className="text-center text-xs text-yellow-400 py-1">
              Click a shield slot to place{placeShieldCardName ? ` "${placeShieldCardName}"` : ' the card'}
            </div>
          )}
          {/* Player shields */}
          <div className="flex justify-center gap-3">
            <AnimatePresence mode="popLayout">
              {playerShields.map((slot, i) => (
                <PlayerShieldSlot
                  key={i}
                  slot={slot}
                  idx={i}
                  selectable={(state.pendingPlaceAsShield && slot === null) || (placeShieldMode && slot === null)}
                  selected={selectedShieldSlot === i}
                  onSelect={() => {
                    if (state.pendingPlaceAsShield && slot === null) {
                      dispatch({ type: 'CONFIRM_PLACE_AS_SHIELD', slotIdx: i });
                    } else if (placeShieldMode && placeShieldCardId && slot === null) {
                      dispatch({ type: 'PLACE_SHIELD', cardInstanceId: placeShieldCardId, slotIdx: i });
                      cancelShieldMode();
                    }
                    if (isShieldChoice && slot !== null) {
                      dispatch({ type: 'SELECT_SHIELD_SACRIFICE', slotIdx: i });
                    }
                  }}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* ── Priority bar — central UI element ── */}
          <div className="py-2">
            <PriorityBar
              priority={priority}
              maxPriority={state.config.defaultRestorePriority}
            />
          </div>

          {/* Patience + Lie counter row */}
          <PatienceDisplay
            patience={patience}
            maxPatience={state.config.opponentPatience}
            lieCounter={lieCounter}
            lieThreshold={state.config.lieThreshold}
          />

          {/* Back of Mind — interrupt cards are draggable, no single-click play (Gap #4) */}
          {backOfMind.length > 0 && !isBotMSelect && (
            <div className="flex justify-center gap-2 items-center">
              <span className="text-xs text-zinc-500">Back of Mind:</span>
              <AnimatePresence>
                {backOfMind.map(card => {
                  const isInterruptCard = card.definition.keywords.includes('Interrupt');
                  const canDragInterrupt = isInterrupt && isInterruptCard;
                  return (
                    <CardView
                      key={card.instanceId}
                      card={card}
                      onRightClick={isInterrupt && isInterruptCard
                        ? (x, y) => setContextMenu({ cardId: card.instanceId, x, y, source: 'botm' })
                        : undefined}
                      isDraggable={canDragInterrupt}
                      onCardDragStart={canDragInterrupt ? () => handleCardDragStart(card.instanceId) : undefined}
                      onCardDrag={canDragInterrupt ? (e) => handleCardDrag(e) : undefined}
                      onCardDragEnd={canDragInterrupt ? (e) => handleCardDragEnd(card.instanceId, e) : undefined}
                      dimmed={isInterrupt && !isInterruptCard}
                    />
                  );
                })}
              </AnimatePresence>
            </div>
          )}

          {/* Player hand */}
          <div className="flex flex-col items-center gap-2 mt-auto">
            <div className="bg-zinc-950/60 backdrop-blur-sm rounded-xl p-3">
              <div className="flex gap-2 flex-wrap justify-center">
                <AnimatePresence mode="popLayout">
                  {playerHand.map(card => {
                    const isInterruptCard = card.definition.keywords.includes('Interrupt');
                    const canDrag = isPlayerTurn || (isInterrupt && isInterruptCard);
                    return (
                      <CardView
                        key={card.instanceId}
                        card={card}
                        onClick={
                          isBotMSelect
                            ? () => dispatch({ type: 'SELECT_BOTM', cardInstanceId: card.instanceId })
                            : undefined
                        }
                        onRightClick={(isPlayerTurn || isBotMSelect || (isInterrupt && isInterruptCard))
                          ? (x, y) => setContextMenu({ cardId: card.instanceId, x, y, source: 'hand' })
                          : undefined}
                        selected={isBotMSelect && backOfMind.some(c => c.instanceId === card.instanceId)}
                        dimmed={
                          (!isBotMSelect && !isPlayerTurn && !isInterrupt) ||
                          (isInterrupt && !isInterruptCard)
                        }
                        isDraggable={canDrag}
                        onCardDragStart={canDrag ? () => handleCardDragStart(card.instanceId) : undefined}
                        onCardDrag={canDrag ? (e) => handleCardDrag(e) : undefined}
                        onCardDragEnd={canDrag ? (e) => handleCardDragEnd(card.instanceId, e) : undefined}
                      />
                    );
                  })}
                </AnimatePresence>
              </div>
            </div>

            {/* Action bar */}
            <div className="flex gap-3 mt-2">
              {isPlayerTurn && (
                <>
                  <button
                    onClick={() => dispatch({ type: 'END_TURN' })}
                    className="px-4 py-2 border border-zinc-600 text-zinc-300 hover:text-white hover:border-white text-sm rounded transition-colors"
                  >
                    End Turn
                  </button>
                  {placeShieldMode && (
                    <button
                      onClick={cancelShieldMode}
                      className="px-4 py-2 border border-blue-400 text-blue-300 text-sm rounded transition-colors"
                    >
                      Cancel Shield
                    </button>
                  )}
                </>
              )}
              {isInterrupt && (
                <button
                  onClick={() => dispatch({ type: 'PASS_INTERRUPT' })}
                  className="px-4 py-2 border border-zinc-600 text-zinc-300 hover:text-white text-sm rounded transition-colors"
                >
                  Pass
                </button>
              )}
              {isBotMSelect && (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-zinc-400 py-2">
                    Select up to {state.combatConfig.backOfMindLimit} card(s) to keep
                  </span>
                  {backOfMind.length > 0 && (
                    <button
                      onClick={() => dispatch({ type: 'CONFIRM_BOTM' })}
                      className="px-3 py-1 border border-yellow-400 text-yellow-400 hover:bg-yellow-900 text-xs rounded transition-colors"
                    >
                      Confirm ({backOfMind.length}/{state.combatConfig.backOfMindLimit})
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Deck/discard counters */}
        <div className="flex justify-between px-4 py-2 bg-zinc-900/90 border-t border-zinc-800 text-xs text-zinc-500 backdrop-blur-sm">
          <span>Deck: {state.playerDeck.length} | Discard: {state.playerDiscard.length}</span>
          <span>Enemy deck: {state.enemyDeck.length} | Enemy discard: {state.enemyDiscard.length}</span>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Discovery modal (Gap #6) */}
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
              className="bg-zinc-900 border border-amber-600 rounded-xl p-8 max-w-sm w-full mx-4 text-center"
            >
              <div className="text-xs uppercase tracking-widest text-amber-500 mb-2">
                Information Discovered
              </div>
              <p className="text-white text-base leading-relaxed mb-6">
                {state.pendingDiscovery.effectDescription}
              </p>
              <button
                onClick={() => dispatch({ type: 'DISMISS_DISCOVERY' })}
                className="px-8 py-2 border border-amber-500 text-amber-400 hover:bg-amber-900 text-sm uppercase tracking-widest rounded transition-colors"
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
              className="bg-zinc-900 border border-zinc-600 rounded-xl p-8 max-w-sm w-full mx-4 text-center"
            >
              <div className="text-xs uppercase tracking-widest text-zinc-500 mb-2">
                {pendingReveal.isHint ? 'Hint Revealed' : 'Shield Broken'}
              </div>
              <p className="text-white text-base leading-relaxed mb-6">
                {pendingReveal.loreDescription ?? pendingReveal.hintText}
              </p>
              <button
                onClick={() => dispatch({ type: 'DISMISS_REVEAL' })}
                className="px-8 py-2 border border-white text-white hover:bg-white hover:text-zinc-950 text-sm uppercase tracking-widest rounded transition-colors"
              >
                Continue
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Shield choice modal */}
      <AnimatePresence>
        {isShieldChoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-zinc-900 border border-zinc-600 rounded-xl p-8 max-w-md w-full mx-4 text-center"
            >
              <div className="text-xs uppercase tracking-widest text-zinc-500 mb-4">
                NPC breaks a shield — choose which to sacrifice
              </div>
              <div className="flex justify-center gap-3 mb-6">
                {playerShields.map((slot, i) => slot && (
                  <div
                    key={i}
                    onClick={() => dispatch({ type: 'SELECT_SHIELD_SACRIFICE', slotIdx: i })}
                    className={`w-24 h-32 rounded-lg border-2 cursor-pointer flex flex-col items-center justify-center p-2 transition-colors
                      ${pendingShieldChoiceSlotIdx === i
                        ? 'border-yellow-400 bg-yellow-950'
                        : 'border-blue-500 bg-blue-950 hover:border-yellow-400'}`}
                  >
                    <span className="text-white text-xs font-semibold text-center">{slot.card.definition.name}</span>
                    {slot.card.definition.keywords.includes('Safety') && (
                      <span className="text-xs text-green-400 mt-1">Safety</span>
                    )}
                    {slot.card.definition.keywords.includes('Counter') && (
                      <span className="text-xs text-blue-400 mt-1">Counter</span>
                    )}
                  </div>
                ))}
              </div>
              {pendingShieldChoiceSlotIdx !== null && pendingShieldChoiceSlotIdx !== -1 && (
                <button
                  onClick={() => dispatch({ type: 'CONFIRM_SHIELD_SACRIFICE' })}
                  className="px-8 py-2 border border-red-500 text-red-400 hover:bg-red-900 text-sm uppercase tracking-widest rounded transition-colors"
                >
                  Sacrifice
                </button>
              )}
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
              <div className={`text-6xl font-bold tracking-widest mb-6 ${phase === 'WIN' ? 'text-green-400' : 'text-red-500'}`}>
                {phase === 'WIN' ? 'BREAKTHROUGH' : 'FAILED'}
              </div>
              <button
                onClick={onExit}
                className="px-8 py-3 border border-white text-white hover:bg-white hover:text-zinc-950 uppercase tracking-widest text-sm transition-colors"
              >
                Exit
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dev panel */}
      <DevPanel
        open={devOpen}
        state={state}
        dispatch={dispatch}
      />
    </div>
  );
}
