import { useState, useEffect, useRef, useCallback } from 'react';
import type { CombatState } from '../combat/types';
import { CARDS } from '../data/cards';

const STORAGE_KEY = 'bt_tutorial_seen';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right' | 'center' | 'upper-center';

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
  position: TooltipPosition;
  // Highlight a specific UI element by its data-tutorial-id value.
  highlightTarget?: string;
  // Show a ghost drag animation for this card ID from the hand toward the play zone.
  showGhostDrag?: boolean;
  ghostDragCardId?: string;
  // Where the ghost drag animation ends (defaults to 'play-zone').
  ghostDragTarget?: 'play-zone' | 'shield-zone';
  // When this step fires, make the patience meter visible (tutorial encounter only).
  revealPatience?: boolean;
  // When this step fires, make the priority bar visible (tutorial encounter only).
  revealPriorityBar?: boolean;
  // When this step is active, hide the "Nothing to play — Pass" button.
  hidePassButton?: boolean;
  // When set, only this card is interactive in hand/BotM — no Got It button shown.
  forcedPlayCard?: string;
  // Override z-index for rendering above modals/pickers (e.g. 65 for reveal modal, 80 for BotM picker).
  overlayZIndex?: number;
  // When true, this step is skipped entirely (definition kept for reference).
  skip?: boolean;
  // Override the default "Play the card to continue" CTA shown when forcedPlayCard is set.
  forcedPlayCardLabel?: string;
}

// ── Gutterfang (original) steps ───────────────────────────────────────────────

const LEGACY_STEPS: Record<string, TutorialStep> = {
  priority_bar: {
    id: 'priority_bar',
    title: 'Priority Bar',
    body: 'The bar between shields shows who controls the conversation. Positive = your turn to act.',
    position: 'center',
  },
  play_card: {
    id: 'play_card',
    title: 'Playing Cards',
    body: 'Drag a card to the play zone, or tap it for options. After playing a card, a new one is automatically drawn from your deck.',
    position: 'bottom',
  },
  break_shield: {
    id: 'break_shield',
    title: 'Breaking Shields',
    body: "Some cards can break your opponent's shields — revealing hidden information.",
    position: 'upper-center',
  },
  player_shields: {
    id: 'player_shields',
    title: 'Your Shields',
    body: "Your shields protect you. Place cards face-down to defend against the opponent's moves.",
    position: 'bottom',
  },
  patience: {
    id: 'patience',
    title: 'Patience Meter',
    body: "The opponent's patience is their resolve — drain it to zero to win the confrontation. Your patience works the same way: if the opponent drains yours to zero, the case stalls.",
    position: 'top',
  },
  card_combination: {
    id: 'card_combination',
    title: 'Card Combinations',
    body: 'Two of your cards can be combined into something more powerful. Look for the purple COMBO badge — tap a card and choose "Combine →" from the menu.',
    position: 'bottom',
  },
  back_of_mind: {
    id: 'back_of_mind',
    title: 'Back of Mind',
    body: "When the opponent takes the floor, choose 1 card to keep in the back of your mind. The rest are discarded. Interrupt cards can still be played from here. You'll draw fresh cards when you regain priority.",
    position: 'center',
  },
};

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {}
}

// ── Tutorial 1 steps (sequential) ────────────────────────────────────────────

const T1_STEPS: TutorialStep[] = [
  {
    id: 't1_intro',
    title: 'Breakthrough',
    body: 'In Breakthrough, conversations become a card game. Break all of your opponent\'s Shields to win.',
    position: 'center',
  },
  {
    id: 't1_shields',
    title: 'Opponent Shields',
    body: 'Your opponent hides information behind Shields. Break them all to win.',
    position: 'upper-center',
    highlightTarget: 'opp-shields',
  },
  {
    id: 't1_play_intimidate',
    title: 'Your Hand',
    body: 'Play a card by dragging it to the Play zone, or clicking it for options.',
    position: 'bottom',
    highlightTarget: 'hand',
    showGhostDrag: true,
    ghostDragCardId: 'intimidate',
    forcedPlayCard: 'intimidate',
  },
  {
    id: 't1_patience',
    title: 'Patience',
    body: "Some cards reduce your opponent's Patience. Let it reach zero and the conversation ends early.",
    position: 'top',
    highlightTarget: 'patience-meter',
    revealPatience: true,
    overlayZIndex: 65,
  },
  {
    id: 't1_priority',
    title: 'Priority',
    body: 'Priority determines whose turn it is. Spending it all passes the turn to your opponent.',
    position: 'center',
    highlightTarget: 'priority-bar',
    revealPriorityBar: true,
  },
  {
    id: 't1_play_ponder',
    title: '',
    body: '',
    position: 'bottom',
    showGhostDrag: true,
    ghostDragCardId: 'ponder',
    forcedPlayCard: 'ponder',
  },
  {
    id: 't1_play_dominate',
    title: 'Dominate',
    body: 'Play Dominate to break the final shield.',
    position: 'bottom',
    highlightTarget: 'card-dominate',
    showGhostDrag: true,
    ghostDragCardId: 'dominate',
    forcedPlayCard: 'dominate',
  },
];

// ── Tutorial 2 contextual steps ───────────────────────────────────────────────

const T2_BOTM_STEP: TutorialStep = {
  id: 't2_botm',
  title: 'Back of Mind',
  body: 'When you lose Priority, keep one card in the Back of Mind.',
  position: 'center',
  overlayZIndex: 80,
};

const T2_INTERRUPT_STEP: TutorialStep = {
  id: 't2_interrupt',
  title: 'Interrupt',
  body: "Some cards have Interrupt. You can play them during your opponent's turn — they resolve first.",
  position: 'center',
  hidePassButton: true,
};

// ── Tutorial 3 steps (sequential, based on former mumPhoneCall) ───────────────

const T3_STEPS: TutorialStep[] = [
  {
    id: 't3_intro',
    title: 'Protect Your Shields',
    body: 'Your shields are set. The opponent acts first — defend what\'s behind them.',
    position: 'center',
    hidePassButton: true,
  },
  {
    id: 't3_shield_broken',
    title: 'Shield Broken',
    body: 'Choose which shield to reveal. Opponent loses Patience and you regain Priority.',
    position: 'center',
    highlightTarget: 'player-shields',
  },
  {
    id: 't3_place_shield',
    title: 'Place a Shield',
    body: 'While you have Priority, you can place cards as Shields. Drag White Deer P.D. to the Shield zone or use the context menu.',
    position: 'bottom',
    highlightTarget: 'card-whiteDeerPD',
    showGhostDrag: true,
    ghostDragCardId: 'whiteDeerPD',
    ghostDragTarget: 'shield-zone',
    forcedPlayCard: 'whiteDeerPD',
  },
  {
    id: 't3_end_turn',
    title: 'End Your Turn',
    body: 'Click End Turn to pass Priority back to your opponent.',
    position: 'center',
    highlightTarget: 'end-turn-btn',
  },
  {
    id: 't3_effective_shield',
    title: 'Effective Shield',
    body: 'White Deer P.D. has the Effective Shield effect — more Priority on break, no Patience loss. Some cards make better shields than others.',
    position: 'center',
  },
  {
    id: 't3_sign_off',
    title: 'Conclude',
    body: 'Hit End Turn to conclude the conversation.',
    position: 'center',
    highlightTarget: 'end-turn-btn',
  },
];

// ── useTutorial hook ──────────────────────────────────────────────────────────

export function useTutorial(
  encounterId: string,
  state: CombatState,
  callbacks?: { opponentAct?: (cardId?: string) => void; acknowledgeOpponent?: () => void },
) {
  const isGutterfang = encounterId === 'gutterfang';
  const isMaryann = encounterId === 'maryann';
  const isT1 = encounterId === 'tutorial1';
  const isT2 = encounterId === 'tutorial2';
  const isT3 = encounterId === 'tutorial3';

  // ── Gutterfang / Mary-Ann (legacy queue-based) ────────────────────────────
  const seenRef = useRef<Set<string>>(loadSeen());
  const [legacyQueue, setLegacyQueue] = useState<TutorialStep[]>([]);
  const enqueuedRef = useRef<Set<string>>(new Set());

  const enqueue = useCallback((id: string) => {
    if (seenRef.current.has(id)) return;
    if (enqueuedRef.current.has(id)) return;
    const step = LEGACY_STEPS[id];
    if (!step) return;
    enqueuedRef.current.add(id);
    setLegacyQueue(q => [...q, step]);
  }, []);

  const dismissLegacy = useCallback(() => {
    setLegacyQueue(q => {
      if (q.length === 0) return q;
      const [first, ...rest] = q;
      seenRef.current.add(first.id);
      saveSeen(seenRef.current);
      return rest;
    });
  }, []);

  // Gutterfang steps
  useEffect(() => {
    if (!isGutterfang || state.gameOver) return;
    enqueue('priority_bar');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGutterfang]);

  useEffect(() => {
    if (!isGutterfang || state.gameOver) return;
    if (state.phase === 'attack' && state.priority > 0) enqueue('play_card');
  }, [state.phase, state.priority, isGutterfang, state.gameOver, enqueue]);

  useEffect(() => {
    if (!isGutterfang || state.gameOver) return;
    if (state.hand.some(id => CARDS[id]?.effects.breakShield)) enqueue('break_shield');
  }, [state.hand, isGutterfang, state.gameOver, enqueue]);

  const prevShieldsRef = useRef(state.playerShields);
  const prevGameOverRef = useRef(state.gameOver);
  useEffect(() => {
    const wasGameOver = prevGameOverRef.current;
    prevGameOverRef.current = state.gameOver;
    if (wasGameOver && !state.gameOver) {
      prevShieldsRef.current = state.playerShields;
      return;
    }
    if (!isGutterfang || state.gameOver) return;
    const prev = prevShieldsRef.current;
    for (let i = 0; i < state.playerShields.length; i++) {
      if (state.playerShields[i].broken && (!prev[i] || !prev[i].broken)) {
        enqueue('player_shields');
        break;
      }
    }
    prevShieldsRef.current = state.playerShields;
  }, [state.playerShields, state.gameOver, isGutterfang, enqueue]);

  useEffect(() => {
    if (!isGutterfang || state.gameOver) return;
    if (state.oppMaxPatience > 0 && state.oppPatience / state.oppMaxPatience < 0.5) {
      enqueue('patience');
    }
  }, [state.oppPatience, state.oppMaxPatience, isGutterfang, state.gameOver, enqueue]);

  useEffect(() => {
    if (state.gameOver) return;
    if (state.awaitingBackOfMindChoice) enqueue('back_of_mind');
  }, [state.awaitingBackOfMindChoice, state.gameOver, enqueue]);

  // Mary-Ann combo step
  useEffect(() => {
    if (!isMaryann || state.gameOver) return;
    if (state.availableCombinations.length > 0) enqueue('card_combination');
  }, [state.availableCombinations, isMaryann, state.gameOver, enqueue]);

  // ── Tutorial 1 (sequential state machine) ────────────────────────────────
  const [t1StepIdx, setT1StepIdx] = useState(0);
  const [t1RevealPatience, setT1RevealPatience] = useState(false);
  const [t1RevealPriorityBar, setT1RevealPriorityBar] = useState(false);
  const t1PonderPlayedRef = useRef(false);
  const t1StepIdxRef = useRef(0);
  t1StepIdxRef.current = t1StepIdx;

  // Track ponder played via discard
  useEffect(() => {
    if (!isT1 || t1PonderPlayedRef.current) return;
    if (state.worldDeck.discard.includes('ponder')) {
      t1PonderPlayedRef.current = true;
    }
  }, [state.worldDeck.discard, isT1]);

  const dismissT1 = useCallback(() => {
    setT1StepIdx(prev => prev + 1);
  }, []);

  // Auto-advance from t1_play_intimidate (idx 2) when first shield breaks
  useEffect(() => {
    if (!isT1 || t1StepIdxRef.current !== 2) return;
    if (state.oppShields.filter(s => s.broken).length >= 1) setT1StepIdx(3);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isT1, state.oppShields]);

  // Auto-advance from t1_play_ponder (idx 5) when ponder is in discard
  useEffect(() => {
    if (!isT1 || t1StepIdxRef.current !== 5) return;
    if (state.worldDeck.discard.includes('ponder')) setT1StepIdx(6);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isT1, state.worldDeck.discard, t1StepIdx]);

  // Auto-advance from t1_play_dominate (idx 6) when dominate leaves hand or game over
  useEffect(() => {
    if (!isT1 || t1StepIdxRef.current !== 6) return;
    if (!state.hand.includes('dominate') || state.gameOver) setT1StepIdx(7);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isT1, state.hand, state.gameOver, t1StepIdx]);

  // Reveal patience when first shield broken
  useEffect(() => {
    if (!isT1) return;
    if (state.oppShields.filter(s => s.broken).length >= 1) setT1RevealPatience(true);
  }, [isT1, state.oppShields]);

  // Reveal priority bar at step 4+
  useEffect(() => {
    if (!isT1) return;
    if (t1StepIdx >= 4) setT1RevealPriorityBar(true);
  }, [isT1, t1StepIdx]);

  const t1CurrentStep: TutorialStep | null = (() => {
    if (!isT1 || t1StepIdx >= T1_STEPS.length) return null;
    const step = T1_STEPS[t1StepIdx];
    switch (step.id) {
      case 't1_patience':
        // Show only after first shield breaks
        if (state.oppShields.filter(s => s.broken).length < 1) return null;
        break;
      case 't1_play_ponder':
        // Show only after patience/priority steps passed
        if (t1StepIdx < 5) return null;
        break;
      case 't1_play_dominate':
        // Show only when dominate in hand; hide once played
        if (!state.hand.includes('dominate')) return null;
        break;
      default:
        break;
    }
    return step;
  })();

  // ── Tutorial 2 (contextual, lightweight) ─────────────────────────────────
  const [t2BotmShown, setT2BotmShown] = useState(false);
  const [t2BotmDismissed, setT2BotmDismissed] = useState(false);
  const [t2InterruptDismissed, setT2InterruptDismissed] = useState(false);

  // Mark BotM as shown when first triggered
  useEffect(() => {
    if (!isT2 || t2BotmShown) return;
    if (state.awaitingBackOfMindChoice) setT2BotmShown(true);
  }, [isT2, state.awaitingBackOfMindChoice, t2BotmShown]);

  // Auto-dismiss BotM tooltip when choice is confirmed
  useEffect(() => {
    if (!isT2 || !t2BotmShown || t2BotmDismissed) return;
    if (!state.awaitingBackOfMindChoice) setT2BotmDismissed(true);
  }, [isT2, t2BotmShown, t2BotmDismissed, state.awaitingBackOfMindChoice]);

  const t2ShowBotm = isT2 && t2BotmShown && !t2BotmDismissed;
  const t2ShowInterrupt = isT2 && t2BotmDismissed && !t2InterruptDismissed &&
    state.awaitingOpponentAck && !state.awaitingBackOfMindChoice;

  const t2CurrentStep: TutorialStep | null =
    isT2 ? (t2ShowBotm ? T2_BOTM_STEP : t2ShowInterrupt ? T2_INTERRUPT_STEP : null) : null;

  const dismissT2 = useCallback(() => {
    if (t2ShowBotm) setT2BotmDismissed(true);
    else if (t2ShowInterrupt) setT2InterruptDismissed(true);
  }, [t2ShowBotm, t2ShowInterrupt]);

  // ── Tutorial 3 (sequential state machine, based on former mumPhoneCall) ───
  const [t3StepIdx, setT3StepIdx] = useState(0);
  const t3StepIdxRef = useRef(0);
  t3StepIdxRef.current = t3StepIdx;
  const t3ShieldPlacedRef = useRef(false);

  // Track whiteDeerPD being placed as a shield
  useEffect(() => {
    if (!isT3) return;
    const hasWhiteDeerShield = state.playerShields.some(s => s.usedCardId === 'whiteDeerPD' && !s.broken);
    if (hasWhiteDeerShield) t3ShieldPlacedRef.current = true;
  }, [state.playerShields, isT3]);

  const dismissT3 = useCallback(() => {
    setT3StepIdx(prev => prev + 1);
  }, []);

  // When T3 intro is dismissed, acknowledge opponent so first action fires
  const t3PrevStepIdx = useRef(-1);
  useEffect(() => {
    if (!isT3) return;
    if (t3PrevStepIdx.current === 0 && t3StepIdx === 1) {
      callbacks?.acknowledgeOpponent?.();
    }
    t3PrevStepIdx.current = t3StepIdx;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t3StepIdx, isT3]);

  // Track player shield breaks in T3
  const t3PrevBrokenCount = useRef(0);
  useEffect(() => {
    if (!isT3) return;
    const broken = state.playerShields.filter(s => s.broken).length;
    if (broken > t3PrevBrokenCount.current) {
      t3PrevBrokenCount.current = broken;
      if (t3StepIdxRef.current < 1) setT3StepIdx(1);
    }
  }, [state.playerShields, isT3]);

  // Auto-advance from t3_place_shield (idx 2) when whiteDeerPD is placed as shield
  useEffect(() => {
    if (!isT3 || t3StepIdxRef.current !== 2) return;
    if (t3ShieldPlacedRef.current) setT3StepIdx(3);
  }, [isT3, state.playerShields, t3StepIdx]);

  const t3CurrentStep: TutorialStep | null = (() => {
    if (!isT3 || t3StepIdx >= T3_STEPS.length) return null;
    const step = T3_STEPS[t3StepIdx];
    switch (step.id) {
      case 't3_shield_broken':
        if (state.playerShields.filter(s => s.broken).length < 1 && !state.awaitingShieldChoice) return null;
        break;
      case 't3_place_shield':
        if (state.phase !== 'attack') return null;
        if (!state.hand.includes('whiteDeerPD')) return null;
        break;
      case 't3_end_turn':
        if (!t3ShieldPlacedRef.current) return null;
        break;
      case 't3_effective_shield': {
        const effectiveBroken = state.playerShields.some(s => s.usedCardId === 'whiteDeerPD' && s.broken);
        if (!effectiveBroken) return null;
        break;
      }
      case 't3_sign_off':
        if (t3StepIdx < 5) return null;
        break;
      default:
        break;
    }
    return step;
  })();

  // ── Return the active step ────────────────────────────────────────────────

  if (isT1) {
    return {
      active: t1CurrentStep,
      dismiss: dismissT1,
      revealPatience: t1RevealPatience,
      revealPriorityBar: t1RevealPriorityBar,
    };
  }

  if (isT2) {
    return {
      active: t2CurrentStep,
      dismiss: dismissT2,
      revealPatience: true,
      revealPriorityBar: true,
    };
  }

  if (isT3) {
    return {
      active: t3CurrentStep,
      dismiss: dismissT3,
      revealPatience: true,
      revealPriorityBar: true,
    };
  }

  // Legacy Gutterfang / Mary-Ann
  return {
    active: legacyQueue[0] ?? null,
    dismiss: dismissLegacy,
    revealPatience: true,
    revealPriorityBar: true,
  };
}
