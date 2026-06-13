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
  // When this step fires, make the patience meter visible (tutorial encounter only).
  revealPatience?: boolean;
  // When this step fires, make the priority bar visible (tutorial encounter only).
  revealPriorityBar?: boolean;
  // When this step is active, hide the "Nothing to play — Pass" button.
  hidePassButton?: boolean;
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
    body: "When the opponent takes the floor, choose up to 3 cards to keep in the back of your mind. The rest are discarded. Interrupt cards can still be played from here. You'll draw fresh cards when you regain priority.",
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

// ── Petty Criminal tutorial steps (sequential) ───────────────────────────────

const PC_STEPS: TutorialStep[] = [
  {
    id: 'pc_intro',
    title: 'Conversations as Cards',
    body: 'In Breakthrough, conversations become a card game. Every opponent has information you need, and/or a decision you want them to make.',
    position: 'center',
  },
  {
    id: 'pc_shields',
    title: "The Opponent's Shields",
    body: "That information hides behind Shield cards. In every conversation, your goal is to break all of your opponent's Shields.",
    position: 'upper-center',
    highlightTarget: 'opp-shields',
  },
  {
    id: 'pc_play_intimidate',
    title: 'Your Hand',
    body: 'This is your hand — where you play cards from. Try playing Intimidate now by dragging it into the Play zone, or by clicking the card to open its context menu.',
    position: 'bottom',
    highlightTarget: 'hand',
    showGhostDrag: true,
    ghostDragCardId: 'intimidate',
  },
  {
    id: 'pc_skill_card',
    title: 'Skill Cards',
    body: "You just played a Skill Card — Intimidate — which breaks Shield cards against weak-willed opponents. Skill Cards always have the same effects and come from the Detective's Self Deck. As you play Breakthrough, the Detective meets new people and obtains more Skill Cards that shape his approach.",
    position: 'center',
    revealPatience: true,
  },
  {
    id: 'pc_patience',
    title: 'Patience Meter',
    body: "Intimidate was effective, but notice that the opponent's Patience dropped by 2. When Patience hits zero, the Conversation ends immediately.",
    position: 'top',
    highlightTarget: 'patience-meter',
  },
  {
    id: 'pc_priority_intro',
    title: 'Priority and Ponder',
    body: 'Now the Priority bar is visible. Each card you play costs Priority. Try playing Ponder now — it costs 1 Priority and draws another card.',
    position: 'center',
    highlightTarget: 'priority-bar',
    revealPriorityBar: true,
  },
  {
    id: 'pc_ponder_played',
    title: 'Ponder',
    body: "Ponder is a Skill Card that costs 1 Priority and draws you another card from your Conversation Deck. Unlike Intimidate, most cards carry a Priority cost. When your Priority reaches zero or less, it becomes your opponent's turn to speak.",
    position: 'center',
  },
  {
    id: 'pc_dominate_hint',
    title: 'Dominate',
    body: 'Playing Ponder drew Dominate. Use your remaining Priority to play it now.',
    position: 'bottom',
    highlightTarget: 'card-dominate',
  },
  {
    id: 'pc_botm',
    title: 'Back of Mind',
    body: "Whenever Priority shifts to your opponent, the Detective is forced to discard all Hand cards — except for one, which you keep in the Back of Mind. Choose to keep Slap.",
    position: 'center',
    highlightTarget: 'card-slap',
    hidePassButton: true,
  },
  {
    id: 'pc_interrupt_intro',
    title: 'Interrupt Cards',
    body: "In negative Priority, the Detective doesn't normally get to play cards. However, Slap has a special property: Interrupt. As long as you have Interrupt cards in your Back of Mind, you'll be given a chance to respond to each opponent card. Interrupts always resolve before the opponent's card.",
    position: 'center',
    hidePassButton: true,
  },
  {
    id: 'pc_play_slap',
    title: 'Play Slap',
    body: 'Play Slap now in response to his Grovelling. If an Interrupt restores Priority back to you, the opponent\'s card effect is cancelled entirely.',
    position: 'bottom',
    highlightTarget: 'card-slap',
    hidePassButton: true,
  },
  {
    id: 'pc_white_deer',
    title: 'White Deer P.D.',
    body: "Restoring Priority means you draw a fresh hand. You drew a new type of card: an Information Card called White Deer P.D. This card represents your association with the city's police department. Hover over it for more info.",
    position: 'bottom',
    highlightTarget: 'card-whiteDeerPD',
  },
  {
    id: 'pc_play_white_deer',
    title: 'Play White Deer P.D.',
    body: "Notice that this card's effect is Unknown — you don't yet know how this person will react to it. Play it now to find out.",
    position: 'bottom',
    highlightTarget: 'card-whiteDeerPD',
  },
  {
    id: 'pc_victory',
    title: 'Breakthrough!',
    body: "This opponent caved under pressure from the authorities. Information Cards also break Shields — but unlike Skill Cards, their effects vary by opponent. By default they're Unknown, but studying your opponents or learning more about the world lets you discover their effects in advance.",
    position: 'center',
  },
];

// ── Mum Phone Call tutorial steps (sequential) ───────────────────────────────

const MUM_STEPS: TutorialStep[] = [
  {
    id: 'mum_intro',
    title: "Mum's Phone Call",
    body: "Before each encounter, you can place up to 3 of your own Shields, chosen from your Conversation Deck. The Detective has been keeping the fact that he's a PI from his mum — losing all your Shields means leaking your secret. Your White Lie shields are already placed. Protect them well.",
    position: 'center',
    hidePassButton: true,
  },
  {
    id: 'mum_shield_broken',
    title: 'Shield Broken',
    body: "Whenever your opponent breaks a Shield, you choose which one to reveal. Since you only have White Lie, choose any and hit Confirm. Your opponent also loses 1 Patience and Priority is restored to +3. When all your Shields are broken, the Conversation also ends.",
    position: 'center',
    highlightTarget: 'player-shields',
  },
  {
    id: 'mum_place_shield',
    title: 'Place a Shield',
    body: "While you have Priority, you can place new Shields. Try placing White Deer P.D. as a Shield by dragging it to the Shield zone or using the context menu. Placing a Shield costs 2 Priority.",
    position: 'bottom',
    highlightTarget: 'card-whiteDeerPD',
  },
  {
    id: 'mum_end_turn',
    title: 'End Your Turn',
    body: "You have some Priority remaining but nothing else to do. Click End Turn to pass Priority back to your opponent.",
    position: 'center',
    highlightTarget: 'end-turn-btn',
  },
  {
    id: 'mum_effective_shield',
    title: 'Effective Shield',
    body: "White Deer P.D. had the Effective Shield effect — it restored you to +5 Priority instead of +3, and caused no Patience loss. Any card can be used as a Shield, but cards with Effective Shield do a better job of protecting you. Notice that the same card's effect was known this time — the Detective understands his mum.",
    position: 'center',
  },
  {
    id: 'mum_sign_off',
    title: 'Conclude the Conversation',
    body: "Hit End Turn again to conclude the Conversation.",
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
  const isPettyCriminal = encounterId === 'pettyCriminal';
  const isMumPhoneCall = encounterId === 'mumPhoneCall';

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

  // ── Petty Criminal (sequential state machine) ─────────────────────────────
  const [pcStepIdx, setPcStepIdx] = useState(0);
  const [pcRevealPatience, setPcRevealPatience] = useState(false);
  const [pcRevealPriorityBar, setPcRevealPriorityBar] = useState(false);
  const pcPonderPlayedRef = useRef(false);
  const pcOppBrokenCount = useRef(0);
  const pcStepIdxRef = useRef(0);
  pcStepIdxRef.current = pcStepIdx;

  // Track ponder being played (hand loses ponder, dominate appears)
  useEffect(() => {
    if (!isPettyCriminal || pcPonderPlayedRef.current) return;
    if (!state.hand.includes('ponder') && state.hand.includes('dominate')) {
      pcPonderPlayedRef.current = true;
    }
  }, [state.hand, isPettyCriminal]);

  // Track shields broken for petty criminal
  useEffect(() => {
    if (!isPettyCriminal) return;
    pcOppBrokenCount.current = state.oppShields.filter(s => s.broken).length;
  }, [state.oppShields, isPettyCriminal]);

  const dismissPc = useCallback(() => {
    setPcStepIdx(prev => prev + 1);
  }, []);

  // Auto-advance from pc_play_intimidate (step 2) as soon as the first shield breaks,
  // so playing Intimidate without first clicking "Got it" still moves the tutorial forward.
  useEffect(() => {
    if (!isPettyCriminal || pcStepIdxRef.current !== 2) return;
    if (state.oppShields.filter(s => s.broken).length >= 1) {
      setPcStepIdx(3);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPettyCriminal, state.oppShields]);

  // Reveal patience meter when pc_skill_card (step 3) becomes active
  useEffect(() => {
    if (!isPettyCriminal) return;
    if (pcStepIdx >= 3 && state.oppShields.filter(s => s.broken).length >= 1) {
      setPcRevealPatience(true);
    }
  }, [isPettyCriminal, pcStepIdx, state.oppShields]);

  // Reveal priority bar when pc_priority_intro (step 5) is reached
  useEffect(() => {
    if (!isPettyCriminal) return;
    if (pcStepIdx >= 5) setPcRevealPriorityBar(true);
  }, [isPettyCriminal, pcStepIdx]);

  // Determine which PC step should show
  const pcCurrentStep: TutorialStep | null = (() => {
    if (!isPettyCriminal || pcStepIdx >= PC_STEPS.length) return null;
    const step = PC_STEPS[pcStepIdx];
    // Some steps need to wait for a game condition to be true before displaying
    switch (step.id) {
      case 'pc_skill_card':
        // Wait for at least 1 opp shield broken
        if (state.oppShields.filter(s => s.broken).length < 1) return null;
        break;
      case 'pc_ponder_played':
        // Wait for ponder to have been played (dominate drawn)
        if (!pcPonderPlayedRef.current) return null;
        break;
      case 'pc_botm':
        // Wait for BotM picker
        if (!state.awaitingBackOfMindChoice) return null;
        break;
      case 'pc_interrupt_intro':
        // Wait for opponent ack (opponent about to play)
        if (!state.awaitingOpponentAck || state.awaitingBackOfMindChoice) return null;
        break;
      case 'pc_white_deer':
        // Wait for whiteDeerPD to be in hand and in attack phase
        if (!state.hand.includes('whiteDeerPD') || state.phase !== 'attack') return null;
        break;
      case 'pc_victory':
        // Wait for game won
        if (!state.gameOver || state.winner !== 'player') return null;
        break;
      default:
        break;
    }
    return step;
  })();

  // ── Mum Phone Call (sequential state machine) ─────────────────────────────
  const [mumStepIdx, setMumStepIdx] = useState(0);
  const mumStepIdxRef = useRef(0);
  mumStepIdxRef.current = mumStepIdx;
  const mumShieldPlacedRef = useRef(false);

  // Track whiteDeerPD being placed as a shield
  useEffect(() => {
    if (!isMumPhoneCall) return;
    const hasWhiteDeerShield = state.playerShields.some(s => s.usedCardId === 'whiteDeerPD' && !s.broken);
    if (hasWhiteDeerShield) mumShieldPlacedRef.current = true;
  }, [state.playerShields, isMumPhoneCall]);

  const dismissMum = useCallback(() => {
    setMumStepIdx(prev => prev + 1);
  }, []);

  // When intro is dismissed, acknowledge opponent so first action fires
  const mumPrevStepIdx = useRef(-1);
  useEffect(() => {
    if (!isMumPhoneCall) return;
    if (mumPrevStepIdx.current === 0 && mumStepIdx === 1) {
      // Intro dismissed → let first opponent action run
      callbacks?.acknowledgeOpponent?.();
    }
    mumPrevStepIdx.current = mumStepIdx;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mumStepIdx, isMumPhoneCall]);

  // Track player shield breaks in mum encounter
  const mumPrevBrokenCount = useRef(0);
  useEffect(() => {
    if (!isMumPhoneCall) return;
    const broken = state.playerShields.filter(s => s.broken).length;
    if (broken > mumPrevBrokenCount.current) {
      mumPrevBrokenCount.current = broken;
      // Advance to shield_broken step if we haven't yet
      if (mumStepIdxRef.current < 1) setMumStepIdx(1);
    }
  }, [state.playerShields, isMumPhoneCall]);

  const mumCurrentStep: TutorialStep | null = (() => {
    if (!isMumPhoneCall || mumStepIdx >= MUM_STEPS.length) return null;
    const step = MUM_STEPS[mumStepIdx];
    switch (step.id) {
      case 'mum_shield_broken':
        // Wait until first player shield is broken (then show during shield choice)
        if (state.playerShields.filter(s => s.broken).length < 1 && !state.awaitingShieldChoice) return null;
        break;
      case 'mum_place_shield':
        // Wait until player has priority and whiteDeerPD in hand
        if (state.phase !== 'attack') return null;
        if (!state.hand.includes('whiteDeerPD')) return null;
        break;
      case 'mum_end_turn':
        // After whiteDeerPD is placed as shield
        if (!mumShieldPlacedRef.current) return null;
        break;
      case 'mum_effective_shield': {
        // After whiteDeerPD shield is broken
        const effectiveBroken = state.playerShields.some(s => s.usedCardId === 'whiteDeerPD' && s.broken);
        if (!effectiveBroken) return null;
        break;
      }
      case 'mum_sign_off':
        // After effective shield explained
        if (mumStepIdx < 5) return null;
        break;
      default:
        break;
    }
    return step;
  })();

  // ── Return the active step ────────────────────────────────────────────────

  if (isPettyCriminal) {
    return {
      active: pcCurrentStep,
      dismiss: dismissPc,
      revealPatience: pcRevealPatience,
      revealPriorityBar: pcRevealPriorityBar,
    };
  }

  if (isMumPhoneCall) {
    return {
      active: mumCurrentStep,
      dismiss: dismissMum,
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
