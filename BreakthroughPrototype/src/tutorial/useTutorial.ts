import { useState, useEffect, useRef, useCallback } from 'react';
import type { CombatState } from '../combat/types';
import { CARDS } from '../data/cards';

const STORAGE_KEY = 'bt_tutorial_seen';

export interface TutorialStep {
  id: string;
  title: string;
  body: string;
}

const STEPS: Record<string, TutorialStep> = {
  priority_bar: {
    id: 'priority_bar',
    title: 'Priority Bar',
    body: 'The bar between shields shows who controls the conversation. Positive = your turn to act.',
  },
  play_card: {
    id: 'play_card',
    title: 'Playing Cards',
    body: 'Drag a card to the play zone, or tap it for options.',
  },
  break_shield: {
    id: 'break_shield',
    title: 'Breaking Shields',
    body: "Some cards can break your opponent's shields — revealing hidden information.",
  },
  player_shields: {
    id: 'player_shields',
    title: 'Your Shields',
    body: "Your shields protect you. Place cards face-down to defend against the opponent's moves.",
  },
  patience: {
    id: 'patience',
    title: 'Patience Meter',
    body: "Drain your opponent's patience to zero to win the conversation.",
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
  const seenRef = useRef<Set<string>>(loadSeen());
  const [queue, setQueue] = useState<TutorialStep[]>([]);
  const enqueuedRef = useRef<Set<string>>(new Set());

  const enqueue = useCallback((id: string) => {
    if (!isGutterfang) return;
    if (seenRef.current.has(id)) return;
    if (enqueuedRef.current.has(id)) return;
    const step = STEPS[id];
    if (!step) return;
    enqueuedRef.current.add(id);
    setQueue(q => [...q, step]);
  }, [isGutterfang]);

  const dismiss = useCallback(() => {
    setQueue(q => {
      if (q.length === 0) return q;
      const [first, ...rest] = q;
      seenRef.current.add(first.id);
      saveSeen(seenRef.current);
      return rest;
    });
  }, []);

  // Step 1: priority bar — fires once on Gutterfang encounter start
  useEffect(() => {
    if (!isGutterfang || state.gameOver) return;
    enqueue('priority_bar');
  // Only run once on mount; isGutterfang is stable for the lifetime of the encounter
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
  useEffect(() => {
    if (!isGutterfang || state.gameOver) return;
    const prev = prevShieldsRef.current;
    for (let i = 0; i < state.playerShields.length; i++) {
      if (state.playerShields[i].broken && (!prev[i] || !prev[i].broken)) {
        enqueue('player_shields');
        break;
      }
    }
    prevShieldsRef.current = state.playerShields;
  }, [state.playerShields, isGutterfang, state.gameOver, enqueue]);

  // Step 5: patience — first time opponent patience drops below 50%
  useEffect(() => {
    if (!isGutterfang || state.gameOver) return;
    if (state.oppMaxPatience > 0 && state.oppPatience / state.oppMaxPatience < 0.5) {
      enqueue('patience');
    }
  }, [state.oppPatience, state.oppMaxPatience, isGutterfang, state.gameOver, enqueue]);

  return { active: queue[0] ?? null, dismiss };
}
