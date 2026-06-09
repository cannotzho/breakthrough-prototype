import { useEffect, useRef, useState } from 'react';
import { useCombat } from '../combat/Combat';
import { computeCardCost } from '../combat/effects';
import { ENCOUNTERS } from '../data/encounters';
import { CARDS } from '../data/cards';
import CombatHUD from './CombatHUD';
import Battlefield from './Battlefield';
import HandArea from './HandArea';
import CombatLog from './CombatLog';
import CardComponent from './CardComponent';
import TutorialTooltip from './TutorialTooltip';
import { useTutorial } from '../tutorial/useTutorial';
import BackOfMindPicker from './BackOfMindPicker';
import { useCombatTimers } from '../hooks/useCombatTimers';

interface Props {
  encounterId: string;
  chosenWorldDeck: string[];
  preShields?: string[];
  personalDeck?: string[];
  addToCompendium: (cardId: string) => void;
  onEnd: (won: boolean, collectedInfo?: string[]) => void;
}

export default function CombatScreen({ encounterId, chosenWorldDeck, preShields = [], personalDeck, addToCompendium, onEnd }: Props) {
  const encounter = ENCOUNTERS[encounterId];
  const { state, playCard, placeShield, endTurn, chooseShieldToBreak, dismissDialogue, dismissReveal, resetCombat, combineCards, confirmBackOfMind, acknowledgeOpponent } = useCombat(encounter, chosenWorldDeck, preShields, false, personalDeck);
  const { active: tutorialStep, dismiss: dismissTutorial } = useTutorial(encounterId, state);
  const animDelay = state.combatConfig.animDelay;
  const hasInstants = state.hand.some(id => { const c = CARDS[id]; return c && (c.type === 'instant' || c.effects.isInstant); });

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

  const { priorityBannerTimerRef, justBrokenTimerRef, priorityToastTimerRef, stagedTimerRef } = useCombatTimers();

  // Priority transition banner — shown briefly when phase changes (#88)
  const prevPhaseRef = useRef(state.phase);
  const [priorityBanner, setPriorityBanner] = useState<string | null>(null);
  const [botmPickerReady, setBotmPickerReady] = useState(true);

  // Shield break animation — track which player shield was just broken
  const prevPlayerShieldsRef = useRef(state.playerShields);
  const [justBrokenShieldIdx, setJustBrokenShieldIdx] = useState<number | null>(null);
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
    // intentional: oppHand is read to capture the announced card at trigger time; not a dep to avoid re-running mid-decision
  }, [state.opponentActionTrigger, state.awaitingOpponentAck, state.phase, state.gameOver]);

  // Auto-acknowledge opponent when player has no instants to play (#96)
  useEffect(() => {
    if (!state.awaitingOpponentAck || state.gameOver || state.awaitingBackOfMindChoice || state.awaitingShieldChoice || !botmPickerReady) return;
    if (hasInstants) return;
    const t = setTimeout(acknowledgeOpponent, Math.round(2000 * animDelay));
    return () => clearTimeout(t);
  }, [state.awaitingOpponentAck, state.gameOver, state.awaitingBackOfMindChoice, state.awaitingShieldChoice, botmPickerReady, hasInstants, acknowledgeOpponent, animDelay]);

  // Priority transition banner — fires on attack↔defense phase change (#88)
  useEffect(() => {
    const prev = prevPhaseRef.current;
    prevPhaseRef.current = state.phase;
    if (state.gameOver) {
      setPriorityBanner(null);
      setBotmPickerReady(true);
      if (priorityBannerTimerRef.current) clearTimeout(priorityBannerTimerRef.current);
      return;
    }
    if (prev === 'attack' && state.phase === 'defense') {
      if (priorityBannerTimerRef.current) clearTimeout(priorityBannerTimerRef.current);
      if (animDelay === 0) {
        setPriorityBanner(null);
        setBotmPickerReady(true);
      } else {
        setPriorityBanner('They push back —');
        setBotmPickerReady(false);
        priorityBannerTimerRef.current = setTimeout(() => {
          setPriorityBanner(null);
          setBotmPickerReady(true);
          priorityBannerTimerRef.current = null;
        }, Math.round(700 * animDelay));
      }
    } else if (prev === 'defense' && state.phase === 'attack') {
      setBotmPickerReady(true);
      if (priorityBannerTimerRef.current) clearTimeout(priorityBannerTimerRef.current);
      if (animDelay > 0) {
        setPriorityBanner('You have the initiative');
        priorityBannerTimerRef.current = setTimeout(() => {
          setPriorityBanner(null);
          priorityBannerTimerRef.current = null;
        }, Math.round(800 * animDelay));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // intentional: prevPhaseRef is a mutable ref — not a reactive dep; animDelay read from combatConfig
  }, [state.phase, state.gameOver, animDelay]);

  function canAfford(cardId: string): boolean {
    const card = CARDS[cardId];
    if (!card) return false;
    // Instant cards bypass the priority gate — cost is only a delta, not a prerequisite
    if (card.type === 'instant' || card.effects.isInstant) return true;
    return state.priority >= computeCardCost(cardId, state.field);
  }

  function handlePlayCard(cardId: string) {
    if (!canAfford(cardId)) {
      if (priorityToastTimerRef.current) clearTimeout(priorityToastTimerRef.current);
      setShowPriorityToast(true);
      priorityToastTimerRef.current = setTimeout(() => setShowPriorityToast(false), 1500);
      return;
    }
    if (animDelay === 0) {
      playCard(cardId);
      return;
    }
    if (stagedTimerRef.current) clearTimeout(stagedTimerRef.current);
    setStagedCardId(cardId);
    stagedTimerRef.current = setTimeout(() => {
      playCard(cardId);
      setStagedCardId(null);
      stagedTimerRef.current = null;
    }, Math.round(1000 * animDelay));
  }

  function handleCancelStaged() {
    if (stagedTimerRef.current) { clearTimeout(stagedTimerRef.current); stagedTimerRef.current = null; }
    setStagedCardId(null);
  }

  function handleRetry() {
    prevCollectedRef.current = [];
    prevPlayerShieldsRef.current = [];
    handleCancelStaged();
    // Clear all local animation state so nothing from the previous run bleeds through (#87)
    if (justBrokenTimerRef.current) { clearTimeout(justBrokenTimerRef.current); justBrokenTimerRef.current = null; }
    setJustBrokenShieldIdx(null);
    if (priorityBannerTimerRef.current) { clearTimeout(priorityBannerTimerRef.current); priorityBannerTimerRef.current = null; }
    setPriorityBanner(null);
    setBotmPickerReady(true);
    prevPhaseRef.current = 'attack';
    resetCombat();
    setEndingChoice(null);
  }

  const hiddenShields = state.oppShields.filter(s => !s.broken);
  const ghostCard = ghostPos && draggingCardId ? CARDS[draggingCardId] : null;

  return (
    <div className="flex flex-col h-full bg-[#0a0a1a] relative">
      <style>{`
        @keyframes priorityBannerFade {
          0%   { opacity: 0; transform: translateY(-8px) scale(0.97); }
          15%  { opacity: 1; transform: translateY(0) scale(1); }
          70%  { opacity: 1; transform: translateY(0) scale(1); }
          100% { opacity: 0; transform: translateY(4px) scale(0.99); }
        }
      `}</style>

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

      {/* Priority transition banner — flashes on phase change before picker/ack appears (#88) */}
      {priorityBanner && !state.gameOver && (
        <div className="absolute inset-x-0 top-[38%] flex justify-center z-40 pointer-events-none">
          <div style={{ animation: 'priorityBannerFade 0.75s ease-out forwards' }}
            className="bg-black/80 border border-[#4ecca3]/40 rounded-lg px-8 py-3 shadow-2xl">
            <p className="text-[#4ecca3] font-mono text-sm tracking-[0.2em] uppercase">{priorityBanner}</p>
          </div>
        </div>
      )}

      {/* Opponent-action acknowledgment — only shown when player has an instant to play; otherwise auto-resolved (#96) */}
      {state.awaitingOpponentAck && !state.gameOver && !state.awaitingBackOfMindChoice && !state.awaitingShieldChoice && botmPickerReady && hasInstants && (
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

      {/* Back of Mind picker — shown when player loses priority (delayed by banner, #88) */}
      {state.awaitingBackOfMindChoice && botmPickerReady && !state.gameOver && (
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
