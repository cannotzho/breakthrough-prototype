import { useReducer, useEffect, useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { combatReducer } from '../combat/combatReducer';
import { buildInitialCombatState, TEST_ENCOUNTER } from '../data/encounterDefs';
import { CardInstance, CombatState } from '../combat/types';
import DevPanel from '../components/dev/DevPanel';

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

function CardView({
  card,
  onClick,
  selected,
  dimmed,
  label,
}: {
  card: CardInstance;
  onClick?: () => void;
  selected?: boolean;
  dimmed?: boolean;
  label?: string;
}) {
  const def = card.definition;
  const border = COLOR_BORDER[def.color] ?? 'border-zinc-500';
  const bg = COLOR_BG[def.color] ?? 'bg-zinc-900';

  return (
    <motion.div
      onClick={onClick}
      className={`relative w-28 h-40 rounded-lg border-2 ${border} ${bg} flex flex-col p-2 cursor-pointer select-none
        ${selected ? 'ring-2 ring-yellow-400 scale-105' : ''}
        ${dimmed ? 'opacity-40' : ''}
        ${onClick ? 'hover:scale-105 transition-transform' : ''}`}
      whileTap={onClick ? { scale: 0.95 } : {}}
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
            <span key={kw} className="text-xs bg-zinc-700 text-zinc-300 px-1 rounded">{kw}</span>
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
    <div className={`w-24 h-32 rounded-lg border-2 flex flex-col items-center justify-center p-2
      ${broken ? 'border-zinc-600 bg-zinc-800/40 opacity-60' : 'border-zinc-500 bg-zinc-800'}
    `}>
      {broken ? (
        <div className="text-center">
          <div className="text-zinc-500 text-xs mb-1">{isHint ? 'HINT' : 'BROKEN'}</div>
          <p className="text-zinc-400 text-xs leading-tight">{hintText ?? loreText}</p>
        </div>
      ) : (
        <div className="text-zinc-600 text-2xl">?</div>
      )}
    </div>
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
    <div
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
            <span key={kw} className="text-xs bg-zinc-700 text-zinc-300 px-1 rounded mr-1">{kw}</span>
          ))}
        </div>
      ) : (
        <span className="text-zinc-600 text-xs">Slot {idx + 1}</span>
      )}
    </div>
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

export default function CombatScreen({ onExit }: CombatScreenProps) {
  const [state, dispatch] = useReducer(combatReducer, undefined, () =>
    buildInitialCombatState(TEST_ENCOUNTER)
  );
  const [devOpen, setDevOpen] = useState(false);
  const [selectedShieldSlot, setSelectedShieldSlot] = useState<number | null>(null);
  const [placeShieldMode, setPlaceShieldMode] = useState(false);

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
      const hasInterrupt =
        state.backOfMind?.definition.keywords.includes('Interrupt') ||
        state.playerHand.some(c => c.definition.keywords.includes('Interrupt'));
      const t = setTimeout(() => {
        dispatch({ type: 'DEV_SET_PHASE', phase: hasInterrupt ? 'Interrupt' : 'EnemyPlay' });
      }, 300);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.backOfMind, state.playerHand]);

  // Auto-resolve EnemyPlay — resolve staged card effects automatically
  useEffect(() => {
    if (state.phase === 'EnemyPlay' && state.stagedEnemyCard) {
      const t = setTimeout(() => {
        // Move card to enemy discard and apply each effect
        // For now, we apply effects by dispatching a DEV action that
        // mimics the enemy resolving. We inline the resolution via CHECK.
        // Full implementation: dispatch a new RESOLVE_ENEMY_CARD action.
        // Simple approach: apply effects manually via sequential dispatches.
        // We'll do a single state mutation by dispatching CHECK after clearing the staged card
        // and applying the enemy card's effects inline via a custom action.
        dispatch({ type: 'RESOLVE_ENEMY_CARD' });
      }, 500);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.stagedEnemyCard]);

  const playCard = useCallback((instanceId: string) => {
    if (placeShieldMode) {
      // pick a slot
      if (selectedShieldSlot !== null) {
        dispatch({ type: 'PLACE_SHIELD', cardInstanceId: instanceId, slotIdx: selectedShieldSlot });
        setPlaceShieldMode(false);
        setSelectedShieldSlot(null);
      }
      return;
    }
    dispatch({ type: 'PLAY_CARD', cardInstanceId: instanceId });
  }, [placeShieldMode, selectedShieldSlot]);

  const { phase, priority, patience, lieCounter, playerHand, playerShields,
    opponentShields, stagedEnemyCard, backOfMind, pendingReveal,
    pendingShieldChoiceSlotIdx } = state;

  const isPlayerTurn = phase === 'PlayerPending';
  const isBotMSelect = phase === 'BotMSelect';
  const isReveal = phase === 'RevealPending';
  const isShieldChoice = phase === 'PlayerShieldChoice';
  const isInterrupt = phase === 'Interrupt';
  const isTerminal = phase === 'WIN' || phase === 'LOSE';

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <button onClick={onExit} className="text-zinc-400 hover:text-white text-sm transition-colors">
          ← Exit
        </button>
        <div className="flex items-center gap-4">
          <PhaseBar phase={phase} />
          <span className="text-zinc-400 text-sm">
            Priority: <span className={`font-bold ${priority > 0 ? 'text-blue-400' : 'text-red-400'}`}>{priority}</span>
          </span>
          <span className="text-zinc-400 text-sm">
            Patience: <span className="font-bold text-amber-400">{patience}</span>
          </span>
          {lieCounter > 0 && (
            <span className="text-zinc-400 text-sm">
              Lies: <span className="font-bold text-red-500">{lieCounter}</span>
            </span>
          )}
        </div>
        <button
          onClick={() => setDevOpen(v => !v)}
          className="text-xs bg-zinc-800 border border-zinc-600 text-zinc-400 hover:text-white px-2 py-1 rounded transition-colors"
        >
          ⚙ DEV
        </button>
      </div>

      {/* Main layout */}
      <div className="flex-1 flex flex-col gap-4 p-4 overflow-auto">

        {/* Opponent shields */}
        <div className="flex flex-col items-center gap-2">
          <div className="text-xs text-zinc-500 uppercase tracking-widest">{TEST_ENCOUNTER.displayName}</div>
          <div className="flex gap-3">
            {opponentShields.map((shield, i) => (
              <ShieldBack
                key={i}
                broken={shield.broken}
                loreText={shield.loreDescription}
                hintText={shield.hintText}
                isHint={shield.isHint}
              />
            ))}
          </div>
        </div>

        {/* Staged enemy card */}
        <div className="flex justify-center min-h-[5rem]">
          <AnimatePresence>
            {stagedEnemyCard && (
              <motion.div
                key={stagedEnemyCard.instanceId}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
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
            {state.fieldImpressions.map(c => (
              <CardView key={c.instanceId} card={c} label="Field" />
            ))}
          </div>
        )}

        {/* Player shields */}
        <div className="flex justify-center gap-3">
          {playerShields.map((slot, i) => (
            <PlayerShieldSlot
              key={i}
              slot={slot}
              idx={i}
              selectable={placeShieldMode && slot === null}
              selected={selectedShieldSlot === i}
              onSelect={() => {
                if (placeShieldMode && slot === null) {
                  setSelectedShieldSlot(i);
                }
                if (isShieldChoice && slot !== null) {
                  dispatch({ type: 'SELECT_SHIELD_SACRIFICE', slotIdx: i });
                }
              }}
            />
          ))}
        </div>

        {/* Back of Mind */}
        {backOfMind && (
          <div className="flex justify-center gap-2 items-center">
            <span className="text-xs text-zinc-500">Back of Mind:</span>
            <CardView
              card={backOfMind}
              onClick={isInterrupt && backOfMind.definition.keywords.includes('Interrupt')
                ? () => dispatch({ type: 'PLAY_INTERRUPT', cardInstanceId: backOfMind.instanceId })
                : undefined}
            />
          </div>
        )}

        {/* Player hand */}
        <div className="flex flex-col items-center gap-2 mt-auto">
          <div className="flex gap-2 flex-wrap justify-center">
            {playerHand.map(card => (
              <CardView
                key={card.instanceId}
                card={card}
                onClick={
                  isBotMSelect ? () => dispatch({ type: 'SELECT_BOTM', cardInstanceId: card.instanceId }) :
                  isInterrupt && card.definition.keywords.includes('Interrupt') ? () => dispatch({ type: 'PLAY_INTERRUPT', cardInstanceId: card.instanceId }) :
                  isPlayerTurn ? () => playCard(card.instanceId) :
                  undefined
                }
                dimmed={
                  (isBotMSelect ? false : !isPlayerTurn && !isInterrupt) ||
                  (isInterrupt && !card.definition.keywords.includes('Interrupt'))
                }
              />
            ))}
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
                <button
                  onClick={() => setPlaceShieldMode(v => !v)}
                  className={`px-4 py-2 border text-sm rounded transition-colors
                    ${placeShieldMode ? 'border-blue-400 text-blue-300' : 'border-zinc-600 text-zinc-300 hover:text-white hover:border-white'}`}
                >
                  {placeShieldMode ? 'Cancel Shield' : 'Place Shield'}
                </button>
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
              <div className="text-xs text-zinc-400 py-2">Select a card to keep as Back of Mind</div>
            )}
          </div>
        </div>
      </div>

      {/* Deck/discard counters */}
      <div className="flex justify-between px-4 py-2 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-500">
        <span>Deck: {state.playerDeck.length} | Discard: {state.playerDiscard.length}</span>
        <span>Enemy deck: {state.enemyDeck.length} | Enemy discard: {state.enemyDiscard.length}</span>
      </div>

      {/* ── Modals ── */}

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
