import { useEffect, useRef, useState } from 'react';
import { useCombat } from '../combat/Combat';
import { ENCOUNTERS } from '../data/encounters';
import { CARDS } from '../data/cards';
import CombatHUD from './CombatHUD';
import Battlefield from './Battlefield';
import HandArea from './HandArea';
import CombatLog from './CombatLog';
import CardComponent from './CardComponent';
import TutorialTooltip from './TutorialTooltip';
import { useTutorial } from '../tutorial/useTutorial';

interface Props {
  encounterId: string;
  chosenWorldDeck: string[];
  preShields?: string[];
  compendium: string[];
  addToCompendium: (cardId: string) => void;
  onEnd: (won: boolean, collectedInfo?: string[]) => void;
}

export default function CombatScreen({ encounterId, chosenWorldDeck, preShields = [], addToCompendium, onEnd }: Props) {
  const encounter = ENCOUNTERS[encounterId];
  const { state, selectCard, playCard, placeShield, endTurn, chooseShieldToBreak, dismissDialogue, dismissReveal, resetCombat, combineCards } = useCombat(encounter, chosenWorldDeck, preShields);
  const { active: tutorialStep, dismiss: dismissTutorial } = useTutorial(encounterId, state);

  // Add newly revealed info cards to the player's compendium
  const prevCollectedRef = useRef<string[]>([]);
  useEffect(() => {
    const prev = prevCollectedRef.current;
    state.collectedInfo.forEach(id => {
      if (!prev.includes(id)) addToCompendium(id);
    });
    prevCollectedRef.current = state.collectedInfo;
  }, [state.collectedInfo, addToCompendium]);

  // Auto-dismiss NPC dialogue after 2 seconds
  useEffect(() => {
    if (!state.activeDialogue) return;
    const timer = setTimeout(dismissDialogue, 2000);
    return () => clearTimeout(timer);
  }, [state.activeDialogue, dismissDialogue]);

  // Shield break animation — track which player shield was just broken
  const prevPlayerShieldsRef = useRef(state.playerShields);
  const [justBrokenShieldIdx, setJustBrokenShieldIdx] = useState<number | null>(null);
  const justBrokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const prev = prevPlayerShieldsRef.current;
    const curr = state.playerShields;
    for (let i = 0; i < curr.length; i++) {
      if (curr[i].broken && (!prev[i] || !prev[i].broken)) {
        if (justBrokenTimerRef.current) clearTimeout(justBrokenTimerRef.current);
        setJustBrokenShieldIdx(i);
        justBrokenTimerRef.current = setTimeout(() => setJustBrokenShieldIdx(null), 900);
        break;
      }
    }
    prevPlayerShieldsRef.current = curr;
  }, [state.playerShields]);

  // Shield peek — player clicked a face-down shield to inspect it
  const [peekShieldCardId, setPeekShieldCardId] = useState<string | null>(null);

  // Priority toast — shown briefly when player tries to play an unaffordable card
  const [showPriorityToast, setShowPriorityToast] = useState(false);
  const priorityToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag state — shared between HandArea (source) and Battlefield/ShieldRow (targets)
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);

  // Ghost card — follows cursor during HTML5 drag via dragover (mousemove doesn't fire during native drag)
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!draggingCardId) { setGhostPos(null); return; }
    const onMove = (e: DragEvent) => setGhostPos({ x: e.clientX, y: e.clientY });
    document.addEventListener('dragover', onMove);
    return () => document.removeEventListener('dragover', onMove);
  }, [draggingCardId]);

  // Card staging — show played card for 1000 ms before resolving effects
  const [stagedCardId, setStagedCardId] = useState<string | null>(null);
  const stagedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (stagedTimerRef.current) clearTimeout(stagedTimerRef.current);
      if (priorityToastTimerRef.current) clearTimeout(priorityToastTimerRef.current);
    };
  }, []);

  function canAfford(cardId: string): boolean {
    const card = CARDS[cardId];
    if (!card) return false;
    const vnActive = state.field.includes('vampireNetwork');
    const reduction = vnActive && card.supertype === 'Information'
      ? (CARDS['vampireNetwork']?.effects.reduceInfoCost ?? 0) : 0;
    return state.priority >= Math.max(0, card.cost - reduction);
  }

  function handlePlayCard(cardId: string) {
    if (!canAfford(cardId)) {
      if (priorityToastTimerRef.current) clearTimeout(priorityToastTimerRef.current);
      setShowPriorityToast(true);
      priorityToastTimerRef.current = setTimeout(() => setShowPriorityToast(false), 1500);
      return;
    }
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

  function handleRetry() {
    prevCollectedRef.current = [];
    handleCancelStaged();
    resetCombat();
  }

  const hiddenShields = state.oppShields.filter(s => !s.broken);
  const ghostCard = ghostPos && draggingCardId ? CARDS[draggingCardId] : null;

  return (
    <div className="flex flex-col h-full bg-[#0a0a1a] relative">

      {/* HUD */}
      <CombatHUD state={state} encounterName={encounter.name} />

      {/* Main area: battlefield + log side by side on larger screens */}
      <div className="flex flex-1 overflow-hidden">
        <Battlefield
          state={state}
          onChooseShield={chooseShieldToBreak}
          onPeekShield={(cardId) => setPeekShieldCardId(cardId)}
          isDragging={draggingCardId !== null}
          onDropPlay={(cardId) => { setDraggingCardId(null); handlePlayCard(cardId); }}
          onDropShield={() => { setDraggingCardId(null); placeShield(); }}
          stagedCardId={stagedCardId}
          onCancelStaged={handleCancelStaged}
          justBrokenPlayerShieldIdx={justBrokenShieldIdx}
          encounterName={encounter.name}
          portraitUrl={encounter.portraitUrl}
        />

        {/* Log — sidebar on desktop, hidden on very small screens */}
        <div className="hidden sm:flex flex-col w-[200px] flex-shrink-0 p-2">
          <CombatLog logs={state.logs} />

          {/* Collected info cards */}
          {state.collectedInfo.length > 0 && (
            <div className="mt-2 bg-[rgba(10,15,30,0.92)] border border-[#0f3460] rounded-md p-2">
              <p className="text-[#4ecca3] text-[10px] uppercase tracking-wider mb-1">Intel Obtained</p>
              {state.collectedInfo.map((id, i) => (
                <p key={i} className="text-[#bbb] text-[9px] py-0.5 border-b border-[#1a1a2e] last:border-0">
                  {CARDS[id]?.name ?? id}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Mobile log — shown below battlefield on small screens */}
      <div className="sm:hidden px-2 pb-1 max-h-[100px] overflow-hidden">
        <CombatLog logs={state.logs} />
      </div>

      {/* Hand */}
      <HandArea
        state={state}
        onSelectCard={selectCard}
        onPlayCard={handlePlayCard}
        onPlaceShield={placeShield}
        onEndTurn={endTurn}
        onDragStart={(cardId) => setDraggingCardId(cardId)}
        onDragEnd={() => setDraggingCardId(null)}
        onGhostMove={(x, y) => setGhostPos({ x, y })}
        draggingCardId={draggingCardId}
        stagedCardId={stagedCardId}
        onCombineCards={combineCards}
      />

      {/* Ghost card — follows cursor/finger during drag */}
      {ghostCard && ghostPos && (
        <div
          className="fixed pointer-events-none z-50 opacity-80 shadow-2xl"
          style={{ left: ghostPos.x - 44, top: ghostPos.y - 30, transform: 'scale(1.05)' }}
        >
          <CardComponent card={ghostCard} />
        </div>
      )}

      {/* Not enough priority toast */}
      {showPriorityToast && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
          <div className="bg-[rgba(233,69,96,0.95)] border border-[#e94560] rounded-lg px-5 py-2.5 shadow-2xl">
            <p className="text-white text-sm font-bold font-mono tracking-wide">Not enough priority</p>
          </div>
        </div>
      )}

      {/* Shield peek overlay — only visible to player, no game state change */}
      {peekShieldCardId && CARDS[peekShieldCardId] && (
        <div
          className="absolute inset-0 z-50 bg-black/70 flex flex-col items-center justify-center p-4"
          onClick={() => setPeekShieldCardId(null)}
        >
          <p className="text-[#4ecca3] text-xs uppercase tracking-widest mb-3 font-mono">Your Shield — Eyes Only</p>
          <div style={{ transform: 'scale(1.6)', transformOrigin: 'center' }}>
            <CardComponent card={CARDS[peekShieldCardId]!} />
          </div>
          <p className="text-[#555] text-[10px] mt-8 font-mono">tap anywhere to close</p>
        </div>
      )}

      {/* NPC dialogue bubble */}
      {state.activeDialogue && !state.gameOver && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-xs w-full px-4 pointer-events-none">
          <div className="bg-[rgba(15,52,96,0.95)] border border-[#4ecca3] rounded-lg p-3 shadow-lg">
            <p className="text-[#4ecca3] text-[10px] uppercase tracking-wider mb-1">{encounter.name}</p>
            <p className="text-[#eee] text-sm italic">"{state.activeDialogue}"</p>
          </div>
        </div>
      )}

      {/* Shield reveal modal — shown when the player breaks an opponent shield */}
      {state.revealedShieldCard && CARDS[state.revealedShieldCard] && (() => {
        const revealed = CARDS[state.revealedShieldCard!]!;
        return (
          <div className="absolute inset-0 z-[60] bg-black/92 flex flex-col items-center justify-center p-6">
            <div
              className="flex flex-col items-center text-center w-full max-w-xs"
              onClick={e => e.stopPropagation()}
            >
              <p className="text-[#e94560] text-[10px] uppercase tracking-[0.25em] mb-1 font-mono">Shield Broken</p>
              <h2 className="text-[#4ecca3] text-lg font-bold mb-6 font-mono">Evidence Revealed</h2>

              {/* Card at 2× scale — transformOrigin top so extra height flows downward */}
              <div style={{ transform: 'scale(2)', transformOrigin: 'center top', marginBottom: 140 }}>
                <CardComponent card={revealed} />
              </div>

              {/* Detail panel */}
              <div className="bg-[#0d1625] border border-[#1e2a40] rounded-lg p-4 text-left w-full">
                <p className="text-[#4ecca3] text-xs font-bold font-mono mb-2">{revealed.name}</p>
                <p className="text-[#bbb] text-xs leading-relaxed">{revealed.effectText}</p>
                {revealed.flavorText && (
                  <>
                    <div className="border-t border-[#1e2a40] my-2.5" />
                    <p className="text-[#666] text-xs italic leading-relaxed">{revealed.flavorText}</p>
                  </>
                )}
              </div>

              <button
                onClick={dismissReveal}
                className="mt-5 px-8 py-2.5 bg-[#4ecca3] text-black rounded font-bold font-mono text-sm hover:bg-[#3db892] transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        );
      })()}

      {/* Tutorial tooltip — one step at a time, Gutterfang only */}
      {tutorialStep && !state.gameOver && !peekShieldCardId && (
        <TutorialTooltip step={tutorialStep} onDismiss={dismissTutorial} />
      )}

      {/* Game over overlay */}
      {state.gameOver && (
        <div className="absolute inset-0 bg-[rgba(0,0,0,0.9)] flex flex-col items-center justify-center z-10 p-6">
          {state.winner === 'player' ? (
            <>
              <h2 className="text-4xl font-bold mb-4 text-[#4ecca3]">Breakthrough!</h2>
              <p className="text-[#bbb] text-center max-w-sm mb-4">
                You extracted the key information.
              </p>
              {state.collectedInfo.length > 0 && (
                <div className="mb-6 text-center">
                  <p className="text-[#4ecca3] text-sm font-semibold mb-1">Intel collected:</p>
                  {state.collectedInfo.map((id, i) => (
                    <p key={i} className="text-[#bbb] text-sm">{CARDS[id]?.name ?? id}</p>
                  ))}
                </div>
              )}
              <button
                onClick={() => onEnd(true, state.collectedInfo)}
                className="px-6 py-2 bg-[#4ecca3] text-black rounded font-bold hover:bg-[#3db892] transition-colors"
              >
                Leave
              </button>
            </>
          ) : (
            <>
              <h2 className="text-4xl font-bold mb-4 text-[#e94560]">Case Stalled</h2>
              <p className="text-[#bbb] text-center max-w-sm mb-4">
                They shut you out. The conversation is over.
              </p>
              {hiddenShields.length > 0 && (
                <div className="mb-6 text-center">
                  <p className="text-[#e94560] text-sm mb-3">
                    {hiddenShields.length} piece{hiddenShields.length !== 1 ? 's' : ''} of information remain hidden
                  </p>
                  {hiddenShields.map((_, i) => (
                    <div key={i} className="flex items-center justify-center gap-2 py-1">
                      <div className="w-3 h-5 bg-[#2a2a4e] border border-[#333] rounded" />
                      <span className="text-[#555] text-sm tracking-widest font-mono">[ REDACTED ]</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-4">
                <button
                  onClick={handleRetry}
                  className="px-6 py-2 bg-[#e94560] text-white rounded font-bold hover:bg-[#d03550] transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={() => onEnd(false)}
                  className="px-6 py-2 bg-[#0f3460] text-white rounded hover:bg-[#1a4580] transition-colors"
                >
                  Leave
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
