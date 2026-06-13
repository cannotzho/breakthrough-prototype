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
}

const STEPS: Record<string, TutorialStep> = {
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
    body: "When the opponent takes the floor, choose up to 3 cards to keep in the back of your mind. The rest are discarded. Interrupt cards can still be played from here. You'll draw 5 fresh cards when you regain priority.",
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

export function useTutorial(encounterId: string, state: CombatState) {
  const isGutterfang = encounterId === 'gutterfang';
  const isMaryann = encounterId === 'maryann';
  const seenRef = useRef<Set<string>>(loadSeen());
  const [queue, setQueue] = useState<TutorialStep[]>([]);
  const enqueuedRef = useRef<Set<string>>(new Set());

  const enqueue = useCallback((id: string) => {
    if (seenRef.current.has(id)) return;
    if (enqueuedRef.current.has(id)) return;
    const step = STEPS[id];
    if (!step) return;
    enqueuedRef.current.add(id);
    setQueue(q => [...q, step]);
  }, []);

  const dismiss = useCallback(() => {
    setQueue(q => {
      if (q.length === 0) return q;
      const [first, ...rest] = q;
      seenRef.current.add(first.id);
      saveSeen(seenRef.current);
      return rest;
    });
  }, []);

  // Gutterfang steps 1–5 ──────────────────────────────────────────────────

  // Step 1: priority bar — fires once on Gutterfang encounter start
  useEffect(() => {
    if (!isGutterfang || state.gameOver) return;
    enqueue('priority_bar');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // intentional: fires once on Gutterfang entry; enqueue is stable (empty useCallback dep array)
  }, [isGutterfang]);

  // Step 2: play card — first time attack phase is active with priority to spend
  useEffect(() => {
    if (!isGutterfang || state.gameOver) return;
    if (state.phase === 'attack' && state.priority > 0) enqueue('play_card');
  }, [state.phase, state.priority, isGutterfang, state.gameOver, enqueue]);

  // Step 3: break shield — first time player holds a card with breakShield
  useEffect(() => {
    if (!isGutterfang || state.gameOver) return;
    if (state.hand.some(id => CARDS[id]?.effects.breakShield)) enqueue('break_shield');
  }, [state.hand, isGutterfang, state.gameOver, enqueue]);

  // Step 4: player shields — first time the opponent breaks one of the player's shields
  const prevShieldsRef = useRef(state.playerShields);
  const prevGameOverRef = useRef(state.gameOver);
  useEffect(() => {
    const wasGameOver = prevGameOverRef.current;
    prevGameOverRef.current = state.gameOver;
    // Reset tracking ref on retry (gameOver → false) so a re-broken shield correctly fires the step
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

  // Step 5: patience — first time opponent patience drops below 50%
  useEffect(() => {
    if (!isGutterfang || state.gameOver) return;
    if (state.oppMaxPatience > 0 && state.oppPatience / state.oppMaxPatience < 0.5) {
      enqueue('patience');
    }
  }, [state.oppPatience, state.oppMaxPatience, isGutterfang, state.gameOver, enqueue]);

  // Any-encounter steps ────────────────────────────────────────────────────

  // BotM step — first time the player needs to choose Back of Mind cards (any fight)
  useEffect(() => {
    if (state.gameOver) return;
    if (state.awaitingBackOfMindChoice) enqueue('back_of_mind');
  }, [state.awaitingBackOfMindChoice, state.gameOver, enqueue]);

  // Mary-Ann steps ─────────────────────────────────────────────────────────

  // Card combination step — fires in Mary-Ann the first time a combo becomes available
  useEffect(() => {
    if (!isMaryann || state.gameOver) return;
    if (state.availableCombinations.length > 0) enqueue('card_combination');
  }, [state.availableCombinations, isMaryann, state.gameOver, enqueue]);

  return { active: queue[0] ?? null, dismiss };
}
