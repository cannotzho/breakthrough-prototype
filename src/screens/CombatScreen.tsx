import { useReducer, useEffect, useLayoutEffect, useCallback, useState, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { combatReducer } from '../combat/combatReducer';
import { buildInitialCombatState, TEST_ENCOUNTER } from '../data/encounterDefs';
import { CardInstance, CombatState, EncounterConfig, Keyword, SHIELD_PLACEMENT_COST } from '../combat/types';
import DevPanel from '../components/dev/DevPanel';
import PriorityBar from '../components/combat/PriorityBar';
import PatienceDisplay from '../components/combat/PatienceDisplay';

interface CombatScreenProps {
  onExit: () => void;
  encounterConfig?: EncounterConfig;
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

const SHIELD_BREAK_SHAKE = [0, -8, 8, -6, 4, 0];

const KEYWORD_DEFINITIONS: Record<Keyword, string> = {
  Interrupt: 'May be played during the NPC\'s turn before the staged card resolves. No Priority cost.',
  Safety: 'No effect when played normally. When this card is used as a shield and that shield is broken, the NPC loses 0 Patience instead of 1.',
  Assemble: 'This card may be combined with another Assemble card.',
  Counter: 'When broken as a shield, its printed effects resolve before the break outcome fires.',
  Lie: 'Playing this card increments the Lie Counter. Exceeding the threshold loses the encounter.',
};

function KeywordBadge({ keyword }: { keyword: Keyword }) {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <span
      className="relative text-sm bg-zinc-700 text-zinc-300 px-2 py-0.5 rounded cursor-help"
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
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl text-sm text-zinc-200 leading-relaxed pointer-events-none"
          >
            <span className="font-semibold text-white">{keyword}:</span> {KEYWORD_DEFINITIONS[keyword]}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  );
}

function getCardEffectDisplay(def: import('../combat/types').CardDefinition): string {
  const lines: string[] = [];
  for (const kw of def.keywords) lines.push(kw);
  const text = def.effectText ?? def.description ?? '';
  if (text) lines.push(text);
  return lines.join('\n');
}

function getCardLongDesc(def: import('../combat/types').CardDefinition): string | undefined {
  return def.longDescription;
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
  initialOffset,
}: {
  card: CardInstance;
  onClick?: (e: React.MouseEvent) => void;
  onRightClick?: (x: number, y: number) => void;
  selected?: boolean;
  dimmed?: boolean;
  label?: string;
  isDraggable?: boolean;
  onCardDragStart?: () => void;
  onCardDrag?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
  onCardDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
  initialOffset?: { x: number; y: number };
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const def = card.definition;
  const border = COLOR_BORDER[def.color] ?? 'border-zinc-500';
  const bg = COLOR_BG[def.color] ?? 'bg-zinc-900';
  const effectDisplay = getCardEffectDisplay(def);
  const longDesc = getCardLongDesc(def);

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
      onMouseEnter={() => { if (longDesc) setShowTooltip(true); }}
      onMouseLeave={() => setShowTooltip(false)}
      drag={!!isDraggable}
      dragSnapToOrigin={isDraggable ? true : undefined}
      dragElastic={isDraggable ? 0.1 : undefined}
      onDragStart={isDraggable ? (_e: MouseEvent | TouchEvent | PointerEvent, _i: PanInfo) => onCardDragStart?.() : undefined}
      onDrag={isDraggable ? (e: MouseEvent | TouchEvent | PointerEvent, _i: PanInfo) => onCardDrag?.(e) : undefined}
      onDragEnd={isDraggable ? (e: MouseEvent | TouchEvent | PointerEvent, _i: PanInfo) => onCardDragEnd?.(e) : undefined}
      initial={initialOffset
        ? { opacity: 0, x: initialOffset.x, y: initialOffset.y, scale: 0.5 }
        : { opacity: 0, x: -60, scale: 0.9 }}
      animate={{ opacity: dimmed ? 0.4 : 1, x: 0, y: 0, scale: selected ? 1.05 : 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.8, transition: { duration: 0.7 } }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className={`relative w-[104px] h-36 lg:w-[156px] lg:h-[216px] shrink-0 rounded-xl border-2 ${border} ${bg} flex flex-col p-1.5 lg:p-3 select-none
        ${isDraggable ? 'cursor-grab active:cursor-grabbing' : onClick ? 'cursor-pointer hover:scale-105 transition-transform' : ''}
        ${selected ? 'ring-2 ring-yellow-400' : ''}`}
      whileTap={onClick && !isDraggable ? { scale: 0.95 } : {}}
    >
      {label && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-sm bg-yellow-400 text-black px-2 py-0.5 rounded">
          {label}
        </span>
      )}
      <div className="flex justify-between items-start gap-1">
        <span className="text-[10px] lg:text-sm text-white font-semibold truncate leading-tight">{def.name}</span>
        <span className="text-sm lg:text-lg font-bold text-white shrink-0">{def.cost}</span>
      </div>
      <div className="flex-1 flex items-center justify-center bg-zinc-800/50 rounded-lg overflow-hidden mt-1">
        {def.imageUrl ? (
          <img src={def.imageUrl} alt={def.name} className="w-full h-full object-cover" />
        ) : (
          <svg viewBox="0 0 48 48" className="w-10 h-10 lg:w-14 lg:h-14 text-zinc-600" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="6" y="10" width="36" height="28" rx="2" stroke="currentColor" strokeWidth="2" />
            <circle cx="17" cy="21" r="4" stroke="currentColor" strokeWidth="1.5" />
            <path d="M6 34l12-10 10 8 8-6 6 6v4a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-2z" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        )}
      </div>
      <p className="text-zinc-400 text-[10px] lg:text-xs mt-1 lg:mt-1.5 leading-tight line-clamp-2 lg:line-clamp-3 whitespace-pre-line">{effectDisplay}</p>

      {/* Long description hover tooltip */}
      <AnimatePresence>
        {showTooltip && longDesc && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-4 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl text-sm text-zinc-200 leading-relaxed pointer-events-none"
          >
            <span className="font-semibold text-white">{def.name}</span>
            <p className="mt-1">{longDesc}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function HandCard({
  card,
  onClick,
  onRightClick,
  selected,
  dimmed,
  isDraggable,
  isAnyDragging,
  onCardDragStart,
  onCardDrag,
  onCardDragEnd,
  initialOffset,
}: {
  card: CardInstance;
  onClick?: (e: React.MouseEvent) => void;
  onRightClick?: (x: number, y: number) => void;
  selected?: boolean;
  dimmed?: boolean;
  isDraggable?: boolean;
  isAnyDragging?: boolean;
  onCardDragStart?: () => void;
  onCardDrag?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
  onCardDragEnd?: (event: MouseEvent | TouchEvent | PointerEvent) => void;
  initialOffset?: { x: number; y: number };
}) {
  const [hovered, setHovered] = useState(false);
  const showHover = hovered && !isAnyDragging;

  return (
    <motion.div
      className="relative"
      style={{ zIndex: showHover ? 50 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      animate={{ y: showHover ? -80 : 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <CardView
        card={card}
        onClick={onClick}
        onRightClick={onRightClick}
        selected={selected}
        dimmed={dimmed}
        isDraggable={isDraggable}
        onCardDragStart={onCardDragStart}
        onCardDrag={onCardDrag}
        onCardDragEnd={onCardDragEnd}
        initialOffset={initialOffset}
      />
    </motion.div>
  );
}

function ShieldBack({ broken, loreText, hintText, isHint, compact }: {
  broken: boolean;
  loreText?: string;
  hintText?: string;
  isHint: boolean;
  compact?: boolean;
}) {
  return (
    <motion.div
      animate={{ opacity: broken ? 0.7 : 1 }}
      className={`rounded-xl border-2 flex flex-col items-center justify-center
        ${compact ? 'w-[6.5rem] h-[8.5rem] p-2' : 'w-44 h-60 p-4'}
        ${broken ? 'border-zinc-600 bg-zinc-800/40' : 'border-zinc-500 bg-zinc-800'}
      `}
    >
      <AnimatePresence mode="wait">
        {broken ? (
          <motion.div
            key="broken-content"
            initial={{ opacity: 0, scale: 1.15 }}
            animate={{ opacity: 1, scale: 1, x: SHIELD_BREAK_SHAKE }}
            exit={{ opacity: 0 }}
            transition={{
              x: { duration: 0.9, ease: 'easeOut' },
              opacity: { duration: 1.0 },
              scale: { type: 'spring', stiffness: 200, damping: 12 },
            }}
            className="text-center"
          >
            <div className={`text-zinc-500 mb-1 ${compact ? 'text-[10px]' : 'text-sm mb-2'}`}>{isHint ? 'HINT' : 'BROKEN'}</div>
            <p className={`text-zinc-400 leading-tight ${compact ? 'text-[10px] line-clamp-3' : 'text-sm'}`}>{hintText ?? loreText}</p>
          </motion.div>
        ) : (
          <motion.div
            key="intact-content"
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.7 } }}
          >
            <div className={`text-zinc-600 ${compact ? 'text-2xl' : 'text-5xl'}`}>?</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function PlayerShieldSlot({ slot, idx, selectable, selected, onSelect, isDropTarget, isDragHovered, onDrop }: {
  slot: CombatState['playerShields'][0];
  idx: number;
  selectable?: boolean;
  selected?: boolean;
  onSelect?: () => void;
  isDropTarget?: boolean;
  isDragHovered?: boolean;
  onDrop?: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const hovered = (dragOver || isDragHovered) && isDropTarget && !slot;

  return (
    <motion.div
      layout
      className={`w-44 h-[84px] rounded-lg border-2 flex items-center px-3 cursor-pointer transition-all
        ${slot ? 'border-blue-400 bg-blue-950' : 'border-zinc-700 bg-zinc-900/40 border-dashed'}
        ${selectable ? 'hover:border-yellow-400' : ''}
        ${selected ? 'border-yellow-400 ring-2 ring-yellow-400' : ''}
        ${isDropTarget && !slot ? 'border-amber-400 border-solid bg-amber-950/30' : ''}
        ${hovered ? 'ring-2 ring-amber-400 bg-amber-950/50 shadow-[0_0_16px_rgba(245,158,11,0.4)]' : ''}
      `}
      onClick={onSelect}
      onDragOver={isDropTarget && !slot ? (e) => { e.preventDefault(); setDragOver(true); } : undefined}
      onDragLeave={isDropTarget ? () => setDragOver(false) : undefined}
      onDrop={isDropTarget && !slot ? (e) => { e.preventDefault(); setDragOver(false); onDrop?.(); } : undefined}
    >
      <AnimatePresence mode="wait">
        {slot ? (
          <motion.div
            key="filled"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60, scale: 0.8, transition: { duration: 0.8 } }}
            className="flex items-center gap-2 min-w-0 w-full"
          >
            <span className="text-white text-sm font-semibold truncate flex-1">{slot.card.definition.name}</span>
            {slot.card.definition.keywords.includes('Safety') && (
              <span className="text-[11px] bg-green-900/60 text-green-400 px-1.5 py-0.5 rounded shrink-0">Safety</span>
            )}
            {slot.card.definition.keywords.includes('Counter') && (
              <span className="text-[11px] bg-blue-900/60 text-blue-400 px-1.5 py-0.5 rounded shrink-0">Counter</span>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center w-full"
          >
            <span className="text-zinc-600 text-sm">Slot {idx + 1}</span>
            {isDropTarget && (
              <span className="text-amber-500/60 text-xs ml-2">Drop</span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TraitZone({ traits, compact }: { traits: CombatState['config']['traits']; compact?: boolean }) {
  if (traits.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5 justify-center mt-0.5">
      <span className={`text-zinc-500 uppercase tracking-widest ${compact ? 'text-[9px]' : 'text-xs'}`}>Traits</span>
      {traits.map(trait => (
        <TraitIcon key={trait.id} trait={trait} compact={compact} />
      ))}
    </div>
  );
}

function TraitIcon({ trait, compact }: { trait: CombatState['config']['traits'][0]; compact?: boolean }) {
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
        className={`inline-flex items-center justify-center rounded-full border-2 font-bold
          ${compact ? 'w-7 h-7 text-xs' : 'w-12 h-12 text-base'}
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
            className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-zinc-800 border border-zinc-600 rounded-lg shadow-xl text-sm text-zinc-200 leading-relaxed pointer-events-none"
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

const PHASE_DISPLAY: Record<string, string> = {
  BotMSelect: 'Select',
};

function PhaseBar({ phase }: { phase: string }) {
  const isPlayer = ['PlayerPending', 'PlayerPlay', 'BotMSelect'].includes(phase);
  const isEnemy = ['EnemyPending', 'EnemyPlay', 'InterruptCheck', 'Interrupt'].includes(phase);

  return (
    <div className={`px-6 py-2 rounded-lg text-sm font-bold uppercase tracking-widest
      ${isPlayer ? 'bg-blue-900 text-blue-200' :
        isEnemy ? 'bg-red-900 text-red-200' :
        'bg-zinc-800 text-zinc-300'}
    `}>
      {PHASE_DISPLAY[phase] ?? phase}
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
          ref={zoneRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-0 pointer-events-none flex items-center justify-center transition-all duration-150 rounded-xl"
          style={{
            border: isHovered
              ? '2px solid rgba(251,191,36,0.8)'
              : '1px dashed rgba(161,161,170,0.18)',
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
                className="text-amber-400 text-xl font-semibold tracking-widest uppercase"
              >
                Play
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function CombatScreen({ onExit, encounterConfig }: CombatScreenProps) {
  const initialEncounter = encounterConfig ?? TEST_ENCOUNTER;
  const [state, dispatch] = useReducer(combatReducer, initialEncounter, buildInitialCombatState);
  const [activeEncounter, setActiveEncounter] = useState(initialEncounter);

  const loadEncounter = useCallback((config: EncounterConfig) => {
    setActiveEncounter(config);
    dispatch({ type: 'DEV_RESET', state: buildInitialCombatState(config) });
  }, []);
  const [devOpen, setDevOpen] = useState(false);
  const [playZoneHovered, setPlayZoneHovered] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ cardId: string; x: number; y: number; source: 'hand' | 'botm' } | null>(null);
  const [priorityRestoreFlash, setPriorityRestoreFlash] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [hoveredShieldIdx, setHoveredShieldIdx] = useState(-1);
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
  const dragOccurredRef = useRef(false);
  const prevPriorityRef = useRef(state.priority);
  const handRef = useRef(state.playerHand);
  const botmRef = useRef(state.backOfMind);
  handRef.current = state.playerHand;
  botmRef.current = state.backOfMind;

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

  useEffect(() => {
    if (state.phase === 'Check') {
      dispatch({ type: 'CHECK' });
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'EnemyPending') {
      const t = setTimeout(() => dispatch({ type: 'TRIGGER_ENEMY_ACTION' }), 1100);
      return () => clearTimeout(t);
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'InterruptCheck') {
      const t = setTimeout(() => {
        dispatch({ type: 'RESOLVE_INTERRUPT_CHECK' });
      }, 800);
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

  const handleCardDragStart = useCallback((instanceId: string) => {
    setDraggingCardId(instanceId);
    dragOccurredRef.current = true;
  }, []);

  const getClientPos = useCallback((event: MouseEvent | TouchEvent | PointerEvent) => {
    const clientX = 'clientX' in event
      ? (event as MouseEvent | PointerEvent).clientX
      : ((event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0])?.clientX ?? 0;
    const clientY = 'clientY' in event
      ? (event as MouseEvent | PointerEvent).clientY
      : ((event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0])?.clientY ?? 0;
    return { clientX, clientY };
  }, []);

  const handleCardDrag = useCallback((event: MouseEvent | TouchEvent | PointerEvent) => {
    setPlayZoneHovered(prev => {
      const over = Boolean(playZoneRef.current && isOverZone(event));
      return over === prev ? prev : over;
    });
    const { clientX, clientY } = getClientPos(event);
    let found = -1;
    for (let i = 0; i < shieldSlotRefs.current.length; i++) {
      const el = shieldSlotRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        found = i;
        break;
      }
    }
    setHoveredShieldIdx(prev => prev === found ? prev : found);
  }, [isOverZone, getClientPos]);

  const handleCardDragEnd = useCallback((instanceId: string, event: MouseEvent | TouchEvent | PointerEvent) => {
    if (isOverZone(event)) {
      capturePlayedCard(instanceId);
      if (state.phase === 'Interrupt') {
        dispatch({ type: 'PLAY_INTERRUPT', cardInstanceId: instanceId });
      } else {
        dispatch({ type: 'PLAY_CARD', cardInstanceId: instanceId });
      }
    } else if (state.phase === 'PlayerPending') {
      const { clientX, clientY } = getClientPos(event);
      for (let i = 0; i < shieldSlotRefs.current.length; i++) {
        const el = shieldSlotRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          if (state.playerShields[i] === null) {
            dispatch({ type: 'PLACE_SHIELD', cardInstanceId: instanceId, slotIdx: i });
          }
          break;
        }
      }
    }
    setPlayZoneHovered(false);
    setDraggingCardId(null);
    setHoveredShieldIdx(-1);
    setTimeout(() => { dragOccurredRef.current = false; }, 200);
  }, [isOverZone, state.phase, state.playerShields, getClientPos, capturePlayedCard]);

  const handleShieldDrop = useCallback((slotIdx: number) => {
    if (!draggingCardId) return;
    dispatch({ type: 'PLACE_SHIELD', cardInstanceId: draggingCardId, slotIdx });
    setDraggingCardId(null);
    setPlayZoneHovered(false);
  }, [draggingCardId]);

  const openContextMenu = useCallback((cardId: string, x: number, y: number, source: 'hand' | 'botm') => {
    if (dragOccurredRef.current) return;
    setContextMenu({ cardId, x, y, source });
  }, []);

  const { phase, priority, patience, playerHand, playerShields,
    opponentShields, stagedEnemyCard, backOfMind, pendingReveal,
    pendingShieldChoiceSlotIdx } = state;

  const isPlayerTurn = phase === 'PlayerPending';
  const isBotMSelect = phase === 'BotMSelect';
  const isReveal = phase === 'RevealPending';
  const isShieldChoice = phase === 'PlayerShieldChoice';
  const isInterrupt = phase === 'Interrupt';
  const isTerminal = phase === 'WIN' || phase === 'LOSE';

  const hasEmptyShieldSlot = playerShields.some(s => s === null);
  const showPlayZone = isPlayerTurn || isInterrupt;
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

            {/* Play Interrupt */}
            {isInterrupt && (() => {
              const ctxCard = contextMenu.source === 'botm'
                ? backOfMind.find(c => c.instanceId === contextMenu.cardId)
                : playerHand.find(c => c.instanceId === contextMenu.cardId);
              return ctxCard?.definition.keywords.includes('Interrupt') ? (
                <button
                  className="w-full text-left px-5 py-3 text-base text-zinc-200 hover:bg-zinc-700 transition-colors"
                  onClick={() => {
                    capturePlayedCard(contextMenu.cardId);
                    dispatch({ type: 'PLAY_INTERRUPT', cardInstanceId: contextMenu.cardId });
                    setContextMenu(null);
                  }}
                >
                  Play Interrupt
                </button>
              ) : null;
            })()}

            {/* Place as Shield — available for ALL cards during PlayerPending */}
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

            {/* Details — always available */}
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

            {/* Play zone overlay — covers entire top area */}
            <PlayZone
              isHovered={playZoneHovered}
              visible={showPlayZone}
              zoneRef={playZoneRef}
            />

            {/* Staged enemy card — centered in the play zone */}
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

              {/* Player played card — appears briefly then exits:
                   Impression cards dissolve in place (consumed),
                   normal cards shrink and fly toward the discard pile */}
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

            {/* Field impressions */}
            {state.fieldImpressions.length > 0 && (
              <div className="flex justify-center gap-4 relative z-10">
                <AnimatePresence>
                  {state.fieldImpressions.map(c => (
                    <CardView key={c.instanceId} card={c} label="Field" />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {/* Placement hint */}
            {state.pendingPlaceAsShield && (
              <div className="text-center text-base text-yellow-400 py-2 relative z-10">Choose a shield slot to place the card</div>
            )}

            {/* Enemy Panel — compact, bottom-left, collapsible */}
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
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ═══ BOTTOM: Stats row (Priority + Patience + Player Shields) + Hand ═══ */}
          <div className="flex flex-col">

            {/* Combat Bar */}
            <div data-testid="combat-bar" className="bg-zinc-950/80 backdrop-blur-sm border-t border-zinc-800 px-4 lg:px-6 py-2 lg:py-3">
              <div className="flex flex-col gap-2 lg:gap-3">
                {/* Top: draw pile + priority + patience + shields + discard pile */}
                <div className="flex items-center justify-center gap-3 lg:gap-6">

                  {/* Draw pile — left of priority bar */}
                  <button
                    ref={drawPileRef}
                    onClick={() => setViewingPile('draw')}
                    className="group flex flex-col items-center gap-1 text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
                    title="View draw pile"
                  >
                    <svg viewBox="0 0 24 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-9 h-10 lg:w-[72px] lg:h-[84px] group-hover:scale-110 transition-transform">
                      <rect x="4" y="0" width="18" height="24" rx="2" className="fill-zinc-700 stroke-zinc-500" strokeWidth="1"/>
                      <rect x="2" y="2" width="18" height="24" rx="2" className="fill-zinc-800 stroke-zinc-500" strokeWidth="1"/>
                      <rect x="0" y="4" width="18" height="24" rx="2" className="fill-zinc-900 stroke-zinc-400" strokeWidth="1.5"/>
                      <text x="9" y="19" textAnchor="middle" className="fill-zinc-400" fontSize="10" fontWeight="bold">?</text>
                    </svg>
                    <span className="tabular-nums font-medium text-sm lg:text-base">{state.playerDeck.length}</span>
                  </button>

                  {/* Priority bar */}
                  <div className="flex-1 max-w-md min-w-0">
                    <PriorityBar
                      priority={priority}
                      maxPriority={state.config.defaultRestorePriority}
                    />
                  </div>

                  {/* Patience */}
                  <PatienceDisplay
                    patience={patience}
                    maxPatience={state.config.opponentPatience}
                  />

                  {/* Player shields — also the drop zone for shield placement */}
                  <div className="flex gap-2 lg:gap-4 shrink-0">
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
                              } else if (isShieldChoice && slot !== null) {
                                dispatch({ type: 'SELECT_SHIELD_SACRIFICE', slotIdx: i });
                              } else if (slot !== null) {
                                setDetailCard(slot.card);
                              }
                            }}
                          />
                        </div>
                      ))}
                    </AnimatePresence>
                  </div>

                  {/* Discard pile — right of shields */}
                  <button
                    ref={discardPileRef}
                    onClick={() => setViewingPile('discard')}
                    className="group flex flex-col items-center gap-1 text-zinc-500 hover:text-zinc-200 transition-colors shrink-0"
                    title="View discard pile"
                  >
                    <svg viewBox="0 0 22 28" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-8 h-10 lg:w-[68px] lg:h-[84px] group-hover:scale-110 transition-transform">
                      <rect x="2" y="2" width="18" height="24" rx="2" className="fill-zinc-800 stroke-zinc-600" strokeWidth="1" opacity="0.5" transform="rotate(-6 11 14)"/>
                      <rect x="0" y="2" width="18" height="24" rx="2" className="fill-zinc-900 stroke-zinc-500" strokeWidth="1.5"/>
                      <path d="M12 2 L18 2 Q20 2 20 4 L20 8 Z" className="fill-zinc-700" opacity="0.6"/>
                    </svg>
                    <span className="tabular-nums font-medium text-sm lg:text-base">{state.playerDiscard.length}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Retained cards (shown during non-BotM, non-Interrupt phases when BotM has cards) */}
            {backOfMind.length > 0 && !isBotMSelect && !isInterrupt && (
              <div className="flex justify-center gap-4 items-center px-6 py-3 bg-zinc-950/60">
                <AnimatePresence>
                  {backOfMind.map(card => {
                    const isInterruptCard = card.definition.keywords.includes('Interrupt');
                    const canDragInterrupt = isInterrupt && isInterruptCard;
                    return (
                      <CardView
                        key={card.instanceId}
                        card={card}
                        onClick={(e: React.MouseEvent) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          openContextMenu(card.instanceId, rect.left + rect.width / 2, rect.top, 'botm');
                        }}
                        onRightClick={isInterrupt && isInterruptCard
                          ? (x, y) => openContextMenu(card.instanceId, x, y, 'botm')
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

            {/* Hand Area — sits partially below viewport, cards pop up on hover */}
            <div data-testid="hand-area" className={`px-4 lg:px-6 pt-2 lg:pt-3 ${
              isBotMSelect || isInterrupt ? 'animate-indigo-pulse' : 'bg-zinc-950/60'
            }`}>
              <div className="flex items-end gap-4">
                {/* Hand cards — clipped at bottom, individual cards pop up on hover */}
                <div className="flex-1 min-w-0 h-[140px] lg:h-[160px] overflow-visible relative">
                  <div ref={handContainerRef} className="flex gap-2 lg:gap-4 flex-wrap justify-center absolute bottom-0 left-0 right-0 translate-y-[40%] lg:translate-y-[35%]">
                    <AnimatePresence mode="popLayout">
                      {/* During interrupt, merge BotM interrupt cards into hand display */}
                      {(isInterrupt
                        ? [...playerHand, ...backOfMind.filter(c => c.definition.keywords.includes('Interrupt'))]
                        : playerHand
                      ).map(card => {
                        const isInterruptCard = card.definition.keywords.includes('Interrupt');
                        const isBotMCard = backOfMind.some(c => c.instanceId === card.instanceId);
                        const canDrag = isPlayerTurn || (isInterrupt && isInterruptCard);
                        const isBotMSelected = isBotMSelect && backOfMind.some(c => c.instanceId === card.instanceId);
                        return (
                          <HandCard
                            key={card.instanceId}
                            card={card}
                            onClick={(e: React.MouseEvent) => {
                              if (isBotMSelect) {
                                dispatch({ type: 'SELECT_BOTM', cardInstanceId: card.instanceId });
                              } else if (isInterrupt && isInterruptCard) {
                                capturePlayedCard(card.instanceId);
                                dispatch({ type: 'PLAY_INTERRUPT', cardInstanceId: card.instanceId });
                              } else if (isPlayerTurn) {
                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                const x = rect.left + rect.width / 2;
                                const y = rect.top;
                                openContextMenu(card.instanceId, x, y, 'hand');
                              }
                            }}
                            onRightClick={(isPlayerTurn || isBotMSelect || (isInterrupt && isInterruptCard))
                              ? (x, y) => openContextMenu(card.instanceId, x, y, isBotMCard ? 'botm' : 'hand')
                              : undefined}
                            selected={isBotMSelected}
                            dimmed={
                              (!isBotMSelect && !isPlayerTurn && !isInterrupt) ||
                              (isInterrupt && !isInterruptCard)
                            }
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

                {/* Action buttons — right of hand */}
                <div className="flex flex-col gap-2 shrink-0 pb-2">
                  {isPlayerTurn && (
                    <button
                      onClick={() => dispatch({ type: 'END_TURN' })}
                      className="px-6 py-3 border border-zinc-600 text-zinc-300 hover:text-white hover:border-white text-base rounded-lg transition-colors whitespace-nowrap"
                    >
                      End Turn
                    </button>
                  )}
                  {isInterrupt && (
                    <button
                      onClick={() => dispatch({ type: 'PASS_INTERRUPT' })}
                      className="px-6 py-3 border border-zinc-600 text-zinc-300 hover:text-white text-base rounded-lg transition-colors whitespace-nowrap"
                    >
                      Pass
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
              className="bg-zinc-900 border border-zinc-600 rounded-xl p-10 max-w-lg w-full mx-4 text-center"
            >
              <div className="text-sm uppercase tracking-widest text-zinc-500 mb-6">
                NPC breaks a shield — choose which to sacrifice
              </div>
              <div className="flex justify-center gap-4 mb-8">
                {playerShields.map((slot, i) => slot && (
                  <div
                    key={i}
                    onClick={() => dispatch({ type: 'SELECT_SHIELD_SACRIFICE', slotIdx: i })}
                    className={`w-44 h-60 rounded-xl border-2 cursor-pointer flex flex-col items-center justify-center p-4 transition-colors
                      ${pendingShieldChoiceSlotIdx === i
                        ? 'border-yellow-400 bg-yellow-950'
                        : 'border-blue-500 bg-blue-950 hover:border-yellow-400'}`}
                  >
                    <span className="text-white text-sm font-semibold text-center">{slot.card.definition.name}</span>
                    {slot.card.definition.keywords.includes('Safety') && (
                      <span className="text-sm text-green-400 mt-2">Safety</span>
                    )}
                    {slot.card.definition.keywords.includes('Counter') && (
                      <span className="text-sm text-blue-400 mt-2">Counter</span>
                    )}
                  </div>
                ))}
              </div>
              {pendingShieldChoiceSlotIdx !== null && pendingShieldChoiceSlotIdx !== -1 && (
                <button
                  onClick={() => dispatch({ type: 'CONFIRM_SHIELD_SACRIFICE' })}
                  className="px-10 py-3 border border-red-500 text-red-400 hover:bg-red-900 text-base uppercase tracking-widest rounded-lg transition-colors"
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
