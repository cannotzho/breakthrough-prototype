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

// EXPERIMENTAL (BotM #84): picker shown when the player loses priority
function BackOfMindPicker({ hand, onConfirm }: { hand: string[]; onConfirm: (keptIds: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(cardId: string) {
    setSelected(prev => {
      if (prev.includes(cardId)) return prev.filter(id => id !== cardId);
      if (prev.length >= 3) return prev;
      return [...prev, cardId];
    });
  }

  return (
    <div className="absolute inset-0 z-[70] bg-black/90 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm flex flex-col items-center gap-4">
        <div className="text-center">
          <p className="text-[#c4b5fd] text-xs uppercase tracking-[0.2em] font-mono mb-1">Back of Mind</p>
          <h2 className="text-white text-lg font-bold font-mono mb-1">Choose up to 3 cards to keep</h2>
          <p className="text-[#888] text-xs leading-relaxed">
            The rest are discarded. Kept cards can only be played if they're Instants.
            You'll draw 5 new cards when you regain priority.
          </p>
        </div>

        {hand.length === 0 ? (
          <p className="text-[#555] text-sm font-mono italic">No cards in hand.</p>
        ) : (
          <div className="flex flex-wrap gap-2 justify-center">
            {hand.map((cardId, idx) => {
              const card = CARDS[cardId];
              if (!card) return null;
              const isSelected = selected.includes(cardId);
              const isInstant = !!card.effects.isInstant;
              return (
                <div
                  key={idx}
                  onClick={() => toggle(cardId)}
                  style={{
                    cursor: 'pointer',
                    position: 'relative',
                    opacity: !isSelected && selected.length >= 3 ? 0.35 : 1,
                    transition: 'opacity 0.15s, transform 0.15s',
                    transform: isSelected ? 'translateY(-8px)' : undefined,
                    outline: isSelected ? '2px solid #c4b5fd' : undefined,
                    borderRadius: 6,
                  }}
                >
                  <CardComponent card={card} />
                  {isSelected && (
                    <div style={{
                      position: 'absolute', top: -8, right: -6,
                      background: '#7c3aed', color: '#fff', borderRadius: '50%',
                      width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 'bold', pointerEvents: 'none',
                    }}>✓</div>
                  )}
                  {isInstant && (
                    <div style={{
                      position: 'absolute', bottom: -8, left: '50%', transform: 'translateX(-50%)',
                      background: '#d97706', color: '#fff', borderRadius: 3,
                      fontSize: 8, fontWeight: 'bold', padding: '2px 5px', whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                    }}>INSTANT</div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3 mt-2">
          <span className="text-[#888] text-xs font-mono">{selected.length}/3 selected</span>
          <button
            onClick={() => onConfirm(selected)}
            className="px-6 py-2.5 bg-[#7c3aed] text-white rounded font-bold font-mono text-sm hover:bg-[#6d28d9] transition-colors"
          >
            {selected.length === 0 ? 'Discard All' : `Keep ${selected.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const { state, selectCard, playCard, placeShield, endTurn, chooseShieldToBreak, dismissDialogue, dismissReveal, resetCombat, combineCards, confirmBackOfMind, acknowledgeOpponent } = useCombat(encounter, chosenWorldDeck, preShields);
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

  // Priority toast — shown briefly when player tries to play an unaffordable card
  const [showPriorityToast, setShowPriorityToast] = useState(false);
  const priorityToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mary-Ann ending choice — null until game won, then 'pending' → 'completeJob' | 'letHerGo'
  const [endingChoice, setEndingChoice] = useState<null | 'completeJob' | 'letHerGo'>(null);

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

  // Opponent card staging — show opponent's card for ~1.2 s before OPPONENT_ACT resolves
  const [oppStagedCardId, setOppStagedCardId] = useState<string | null>(null);

  // Show the staged opponent card while the player is deciding whether to play an instant.
  // Clears when: ack is cleared (player passed or priority returned to attack).
  useEffect(() => {
    if (!state.awaitingOpponentAck || state.phase !== 'defense' || state.gameOver) {
      setOppStagedCardId(null);
      return;
    }
    setOppStagedCardId(state.oppHand[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.opponentActionTrigger, state.awaitingOpponentAck, state.phase, state.gameOver]);

  useEffect(() => {
    return () => {
      if (stagedTimerRef.current) clearTimeout(stagedTimerRef.current);
      if (priorityToastTimerRef.current) clearTimeout(priorityToastTimerRef.current);
    };
  }, []);

  function canAfford(cardId: string): boolean {
    const card = CARDS[cardId];
    if (!card) return false;
    // Instant cards bypass the priority gate — cost is only a delta, not a prerequisite
    if (card.type === 'instant' || card.effects.isInstant) return true;
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
    setEndingChoice(null);
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
          isDragging={draggingCardId !== null}
          onDropPlay={(cardId) => { setDraggingCardId(null); handlePlayCard(cardId); }}
          onDropShield={() => { setDraggingCardId(null); placeShield(); }}
          stagedCardId={stagedCardId}
          onCancelStaged={handleCancelStaged}
          oppStagedCardId={oppStagedCardId}
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
              <p className="text-[#4ecca3] text-xs uppercase tracking-wider mb-1">Intel Obtained</p>
              {state.collectedInfo.map((id, i) => (
                <p key={i} className="text-[#bbb] text-[10px] py-0.5 border-b border-[#1a1a2e] last:border-0">
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

      {/* NPC dialogue bubble */}
      {state.activeDialogue && !state.gameOver && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 max-w-xs w-full px-4 pointer-events-none">
          <div className="bg-[rgba(15,52,96,0.95)] border border-[#4ecca3] rounded-lg p-3 shadow-lg">
            <p className="text-[#4ecca3] text-xs uppercase tracking-wider mb-1">{encounter.name}</p>
            <p className="text-[#eee] text-base italic">"{state.activeDialogue}"</p>
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
              <p className="text-[#e94560] text-xs uppercase tracking-[0.25em] mb-1 font-mono">Shield Broken</p>
              <h2 className="text-[#4ecca3] text-xl font-bold mb-6 font-mono">Evidence Revealed</h2>

              {/* Card at 2× scale — transformOrigin top so extra height flows downward */}
              <div style={{ transform: 'scale(2)', transformOrigin: 'center top', marginBottom: 140 }}>
                <CardComponent card={revealed} />
              </div>

              {/* Detail panel */}
              <div className="bg-[#0d1625] border border-[#1e2a40] rounded-lg p-4 text-left w-full">
                <p className="text-[#4ecca3] text-sm font-bold font-mono mb-2">{revealed.name}</p>
                <p className="text-[#bbb] text-sm leading-relaxed">{revealed.effectText}</p>
                {revealed.flavorText && (
                  <>
                    <div className="border-t border-[#1e2a40] my-2.5" />
                    <p className="text-[#666] text-sm italic leading-relaxed">{revealed.flavorText}</p>
                  </>
                )}
              </div>

              <button
                onClick={dismissReveal}
                className="mt-5 px-8 py-2.5 bg-[#4ecca3] text-black rounded font-bold font-mono text-base hover:bg-[#3db892] transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        );
      })()}

      {/* Opponent-action acknowledgment — player must click "Pass" before each opponent action fires */}
      {state.awaitingOpponentAck && !state.gameOver && !state.awaitingBackOfMindChoice && !state.awaitingShieldChoice && (
        <div className="absolute bottom-[180px] left-1/2 -translate-x-1/2 z-30 flex flex-col items-center gap-2 pointer-events-auto">
          <button
            onClick={acknowledgeOpponent}
            className="px-6 py-2.5 bg-[#0f3460] border border-[#4ecca3] text-[#4ecca3] rounded-lg font-bold font-mono text-sm hover:bg-[#1a4580] transition-colors shadow-lg"
          >
            Nothing to play — Pass
          </button>
          <p className="text-[#555] text-[10px] font-mono">or play a Back of Mind instant above</p>
        </div>
      )}

      {/* Back of Mind picker — shown when player loses priority */}
      {state.awaitingBackOfMindChoice && !state.gameOver && (
        <BackOfMindPicker
          hand={state.hand}
          onConfirm={confirmBackOfMind}
        />
      )}

      {/* Tutorial tooltip — one step at a time, Gutterfang only */}
      {tutorialStep && !state.gameOver && (
        <TutorialTooltip step={tutorialStep} onDismiss={dismissTutorial} />
      )}

      {/* Game over overlay */}
      {state.gameOver && (
        <div className="absolute inset-0 bg-[rgba(0,0,0,0.9)] flex flex-col items-center justify-center z-10 p-6">
          {state.winner === 'player' ? (
            encounterId === 'maryann' ? (
              /* ── Mary-Ann ending choice ── */
              endingChoice === null ? (
                <>
                  <h2 className="text-3xl font-bold mb-3 text-[#4ecca3] font-mono">Breakthrough</h2>
                  <p className="text-[#bbb] text-center max-w-sm mb-6 text-sm leading-relaxed">
                    Mary-Ann's confession is out. You have everything your sponsors want —
                    and a promise you made her that it would stay between the two of you.
                    What happens next is yours to decide.
                  </p>
                  <div className="flex flex-col gap-3 w-full max-w-xs">
                    <div className="border border-[#2a2a3a] rounded-lg p-4 bg-[#0d1625]">
                      <p className="text-[#e94560] font-mono text-sm font-bold mb-1">Complete the Job</p>
                      <p className="text-[#777] text-xs leading-relaxed mb-3">
                        Turn her over to the beast-man's sponsors. The fee is paid. A promise broken.
                      </p>
                      <button
                        onClick={() => setEndingChoice('completeJob')}
                        className="w-full px-4 py-2 bg-[#e94560] text-white rounded font-bold font-mono text-sm hover:bg-[#d03550] transition-colors"
                      >
                        Complete the Job
                      </button>
                    </div>
                    <div className="border border-[#4ecca3] rounded-lg p-4 bg-[#0a1f18]">
                      <p className="text-[#4ecca3] font-mono text-sm font-bold mb-1">Let Her Go</p>
                      <p className="text-[#777] text-xs leading-relaxed mb-3">
                        Break the deal with the sponsors. Call in a favour at White Deer. Adds{' '}
                        <span className="text-[#4ecca3]">A Promise Kept</span> to your compendium.
                      </p>
                      <button
                        onClick={() => { addToCompendium('promiseKept'); setEndingChoice('letHerGo'); }}
                        className="w-full px-4 py-2 bg-[#4ecca3] text-black rounded font-bold font-mono text-sm hover:bg-[#3db892] transition-colors"
                      >
                        Let Her Go
                      </button>
                    </div>
                  </div>
                </>
              ) : endingChoice === 'completeJob' ? (
                <>
                  <h2 className="text-3xl font-bold mb-4 text-[#e94560] font-mono">Case Closed</h2>
                  <p className="text-[#bbb] text-center max-w-sm mb-2 text-sm leading-relaxed">
                    You hand the confession over to the sponsors. They're satisfied.
                    The fee clears by morning.
                  </p>
                  <p className="text-[#555] text-center max-w-sm mb-8 text-xs leading-relaxed italic">
                    You don't think about her much after that. That's the job.
                  </p>
                  <button
                    onClick={() => onEnd(true, state.collectedInfo)}
                    className="px-6 py-2 bg-[#0f3460] text-white rounded font-bold font-mono hover:bg-[#1a4580] transition-colors"
                  >
                    Leave
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-3xl font-bold mb-4 text-[#4ecca3] font-mono">A Promise Kept</h2>
                  <p className="text-[#bbb] text-center max-w-sm mb-2 text-sm leading-relaxed">
                    You let her go. The sponsors won't be pleased — but you call in a favour
                    at White Deer and bury the debt. A promise is a promise.
                  </p>
                  <p className="text-[#4ecca3] text-center max-w-sm mb-2 text-xs leading-relaxed">
                    New card added to your compendium:{' '}
                    <span className="font-bold">A Promise Kept</span>.
                  </p>
                  <p className="text-[#555] text-center max-w-sm mb-8 text-xs italic">
                    Some things matter more than the fee.
                  </p>
                  <button
                    onClick={() => onEnd(true, [...state.collectedInfo, 'promiseKept'])}
                    className="px-6 py-2 bg-[#4ecca3] text-black rounded font-bold font-mono hover:bg-[#3db892] transition-colors"
                  >
                    Leave
                  </button>
                </>
              )
            ) : (
              /* ── Normal win screen (all other encounters) ── */
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
            )
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
