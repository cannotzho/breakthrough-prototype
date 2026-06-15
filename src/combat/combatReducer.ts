import { CombatState, CombatAction, CardInstance, CardEffect, RelevantCard } from './types';
import { applyEffect, priorityRestore, selectEnemyCard, makeInstance } from './effectHandlers';

function computeCost(cost: number, priority: number) {
  const priorityCovered = Math.min(cost, priority);
  const patienceCost = Math.max(0, cost - priority);
  return { priorityCovered, patienceCost };
}

function addLog(state: CombatState, msg: string): CombatState {
  return { ...state, actionLog: [...state.actionLog.slice(-49), msg] };
}

function checkState(state: CombatState): CombatState {
  if (state.opponentShields.every(s => s.broken)) {
    return addLog({ ...state, phase: 'WIN' }, 'All opponent shields broken — WIN');
  }

  if (state.patience <= 0) {
    return addLog({ ...state, phase: 'LOSE' }, 'Patience reached 0 — LOSE');
  }

  if (state.config.lieThreshold !== undefined && state.lieCounter > state.config.lieThreshold) {
    return addLog({ ...state, phase: 'LOSE' }, 'Lie counter exceeded — LOSE');
  }

  const hasPlayerShieldSlots = state.playerShields.length > 0;
  const allShieldsBroken = state.playerShields.every(s => s === null);
  if (
    !state.config.unbreakablePlayerShields &&
    hasPlayerShieldSlots &&
    allShieldsBroken &&
    state.config.playerShields &&
    state.config.playerShields.length > 0
  ) {
    return addLog({ ...state, phase: 'LOSE' }, 'All player shields broken — LOSE');
  }

  if (state.priority > 0) {
    let s = state;
    if (s.stagedEnemyCard) {
      s = addLog(
        { ...s, enemyDiscard: [...s.enemyDiscard, s.stagedEnemyCard], stagedEnemyCard: null },
        'Staged enemy card cancelled → NPC discard'
      );
    }
    return { ...s, phase: 'PlayerPending' };
  }

  if (state.stagedEnemyCard) {
    return { ...state, phase: 'EnemyPlay' };
  }

  if (state.playerHand.length > 0) {
    return { ...state, phase: 'BotMSelect' };
  }

  return { ...state, phase: 'EnemyPending' };
}

function resolveEffectList(
  state: CombatState,
  effects: CardEffect[],
  card: CardInstance,
  onComplete: (s: CombatState) => CombatState
): CombatState {
  let s = state;
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    const before = { pendingReveal: s.pendingReveal, pendingShieldChoiceSlotIdx: s.pendingShieldChoiceSlotIdx };
    s = applyEffect(s, effect);

    if (s.pendingReveal && s.pendingReveal !== before.pendingReveal) {
      return {
        ...s,
        phase: 'RevealPending',
        pendingEffects: effects.slice(i + 1),
        pendingEffectCard: card,
      };
    }
    if (s.pendingShieldChoiceSlotIdx === -1 && before.pendingShieldChoiceSlotIdx !== -1) {
      return {
        ...s,
        phase: 'PlayerShieldChoice',
        pendingEffects: effects.slice(i + 1),
        pendingEffectCard: card,
      };
    }
  }
  return onComplete(s);
}

export function combatReducer(state: CombatState, action: CombatAction): CombatState {
  switch (action.type) {

    case 'CHECK':
      return checkState(state);

    // ── Player actions ────────────────────────────────────────
    case 'PLAY_CARD': {
      if (state.phase !== 'PlayerPending') return state;
      const card = state.playerHand.find(c => c.instanceId === action.cardInstanceId);
      if (!card) return state;

      const cost = card.definition.cost;
      const { priorityCovered, patienceCost } = computeCost(cost, state.priority);

      let s: CombatState = {
        ...state,
        priority: state.priority - priorityCovered,
        patience: state.patience - patienceCost,
        playerHand: state.playerHand.filter(c => c.instanceId !== action.cardInstanceId),
        pendingEffects: [],
        pendingEffectCard: null,
      };
      s = addLog(s, `Played ${card.definition.name} (cost ${cost}${patienceCost > 0 ? `, −${patienceCost} Patience` : ''})`);

      if (card.definition.keywords.includes('Lie')) {
        s = { ...s, lieCounter: s.lieCounter + 1 };
      }

      return resolveEffectList(s, card.definition.effects, card, (resolved) => {
        if (resolved.pendingPlaceAsShield) {
          return addLog(
            { ...resolved, pendingEffectCard: card, pendingEffects: [], phase: 'PlayerPending' },
            `${card.definition.name}: choose a shield slot to place it in`
          );
        }
        const isImpression = card.definition.subtype === 'Impression';
        return checkState({
          ...resolved,
          playerDiscard: isImpression ? resolved.playerDiscard : [...resolved.playerDiscard, card],
          fieldImpressions: isImpression ? [...resolved.fieldImpressions, card] : resolved.fieldImpressions,
          pendingEffects: [],
          pendingEffectCard: null,
          phase: 'Check',
        });
      });
    }

    case 'CONFIRM_PLACE_AS_SHIELD': {
      if (!state.pendingPlaceAsShield || !state.pendingEffectCard) return state;
      const card = state.pendingEffectCard;
      if (action.slotIdx >= state.playerShields.length || state.playerShields[action.slotIdx] !== null) return state;
      const newShields = [...state.playerShields];
      newShields[action.slotIdx] = { card };
      let s: CombatState = {
        ...state,
        playerShields: newShields,
        pendingPlaceAsShield: false,
        pendingEffectCard: null,
        pendingEffects: [],
      };
      s = addLog(s, `${card.definition.name} placed as shield in slot ${action.slotIdx} (via effect)`);
      return checkState({ ...s, phase: 'Check' });
    }

    case 'PLACE_SHIELD': {
      if (state.phase !== 'PlayerPending') return state;
      const card = state.playerHand.find(c => c.instanceId === action.cardInstanceId);
      if (!card || action.slotIdx >= state.playerShields.length) return state;
      if (state.playerShields[action.slotIdx] !== null) return state;

      const cost = card.definition.cost;
      const { priorityCovered, patienceCost } = computeCost(cost, state.priority);

      const newShields = [...state.playerShields];
      newShields[action.slotIdx] = { card };

      let s: CombatState = {
        ...state,
        priority: state.priority - priorityCovered,
        patience: state.patience - patienceCost,
        playerHand: state.playerHand.filter(c => c.instanceId !== action.cardInstanceId),
        playerShields: newShields,
      };
      s = addLog(s, `${card.definition.name} placed as shield in slot ${action.slotIdx}`);
      return checkState({ ...s, phase: 'Check' });
    }

    case 'END_TURN': {
      if (state.phase !== 'PlayerPending') return state;
      return checkState(addLog({ ...state, priority: 0 }, 'Player ended turn'));
    }

    // ── BotM Select ───────────────────────────────────────────
    case 'SELECT_BOTM': {
      if (state.phase !== 'BotMSelect') return state;
      const card = state.playerHand.find(c => c.instanceId === action.cardInstanceId);
      if (!card) return state;
      const alreadySelected = state.backOfMind.some(c => c.instanceId === action.cardInstanceId);
      if (alreadySelected) {
        return addLog(
          { ...state, backOfMind: state.backOfMind.filter(c => c.instanceId !== action.cardInstanceId) },
          `${card.definition.name} deselected from Back of Mind`
        );
      }
      if (state.backOfMind.length >= state.combatConfig.backOfMindLimit) return state;
      return addLog(
        { ...state, backOfMind: [...state.backOfMind, card] },
        `${card.definition.name} selected for Back of Mind`
      );
    }

    case 'CONFIRM_BOTM': {
      if (state.phase !== 'BotMSelect') return state;
      if (state.backOfMind.length === 0) return state;
      const selectedIds = new Set(state.backOfMind.map(c => c.instanceId));
      const rest = state.playerHand.filter(c => !selectedIds.has(c.instanceId));
      let s: CombatState = {
        ...state,
        playerHand: [],
        playerDiscard: [...state.playerDiscard, ...rest],
        phase: 'EnemyPending',
      };
      s = addLog(s, `Back of Mind: ${state.backOfMind.map(c => c.definition.name).join(', ')}`);
      return selectEnemyCard(s);
    }

    // ── Reveal Pending ────────────────────────────────────────
    case 'DISMISS_REVEAL': {
      if (state.phase !== 'RevealPending') return state;
      let s: CombatState = { ...state, pendingReveal: null };
      const remainingEffects = state.pendingEffects;
      const card = state.pendingEffectCard;
      if (!card || remainingEffects.length === 0) {
        return checkState(addLog({ ...s, phase: 'Check', pendingEffects: [], pendingEffectCard: null }, 'Reveal dismissed'));
      }
      return resolveEffectList(s, remainingEffects, card, (resolved) => {
        return checkState({ ...resolved, phase: 'Check', pendingEffects: [], pendingEffectCard: null });
      });
    }

    // ── Player Shield Choice ──────────────────────────────────
    case 'SELECT_SHIELD_SACRIFICE': {
      if (state.phase !== 'PlayerShieldChoice') return state;
      if (state.playerShields[action.slotIdx] === null) return state;
      return { ...state, pendingShieldChoiceSlotIdx: action.slotIdx };
    }

    case 'CONFIRM_SHIELD_SACRIFICE': {
      if (state.phase !== 'PlayerShieldChoice') return state;
      const idx = state.pendingShieldChoiceSlotIdx;
      if (idx === null || idx === -1 || !state.playerShields[idx]) return state;
      const sacrificed = state.playerShields[idx]!.card;
      const hasSafety = sacrificed.definition.keywords.includes('Safety');

      let s: CombatState = {
        ...state,
        playerShields: state.playerShields.map((slot, i) => i === idx ? null : slot),
        pendingShieldChoiceSlotIdx: null,
      };

      if (hasSafety) {
        s = addLog(s, `${sacrificed.definition.name} broken (Safety) — NPC loses 0 Patience, Priority Restore`);
      } else {
        s = addLog(s, `${sacrificed.definition.name} broken — NPC loses 1 Patience, Priority Restore`);
        s = { ...s, patience: s.patience - 1 };
      }

      s = priorityRestore(s);

      const remaining = s.pendingEffects;
      const card = s.pendingEffectCard;
      if (!card || remaining.length === 0) {
        return checkState({ ...s, phase: 'Check', pendingEffects: [], pendingEffectCard: null });
      }
      return resolveEffectList(s, remaining, card, (resolved) => {
        return checkState({ ...resolved, phase: 'Check', pendingEffects: [], pendingEffectCard: null });
      });
    }

    // ── Enemy Pending ─────────────────────────────────────────
    case 'TRIGGER_ENEMY_ACTION': {
      if (state.phase !== 'EnemyPending') return state;
      return selectEnemyCard(state);
    }

    // ── Interrupt ─────────────────────────────────────────────
    case 'PLAY_INTERRUPT': {
      if (state.phase !== 'Interrupt') return state;
      const card =
        state.backOfMind.find(c => c.instanceId === action.cardInstanceId) ??
        state.playerHand.find(c => c.instanceId === action.cardInstanceId);
      if (!card || !card.definition.keywords.includes('Interrupt')) return state;

      let s: CombatState = {
        ...state,
        backOfMind: state.backOfMind.filter(c => c.instanceId !== action.cardInstanceId),
        playerHand: state.playerHand.filter(c => c.instanceId !== action.cardInstanceId),
        pendingEffects: [],
        pendingEffectCard: null,
        phase: 'InterruptPlay',
      };
      s = addLog(s, `Interrupt played: ${card.definition.name}`);

      return resolveEffectList(s, card.definition.effects, card, (resolved) => {
        return checkState({
          ...resolved,
          playerDiscard: [...resolved.playerDiscard, card],
          phase: 'Check',
          pendingEffects: [],
          pendingEffectCard: null,
        });
      });
    }

    case 'PASS_INTERRUPT': {
      if (state.phase !== 'Interrupt') return state;
      return addLog({ ...state, phase: 'EnemyPlay' }, 'Player passed interrupt');
    }

    // ── Interrupt Check ───────────────────────────────────────
    case 'RESOLVE_INTERRUPT_CHECK': {
      if (state.phase !== 'InterruptCheck') return state;
      const hasInterrupt =
        state.backOfMind.some(c => c.definition.keywords.includes('Interrupt')) ||
        state.playerHand.some(c => c.definition.keywords.includes('Interrupt'));
      return addLog(
        { ...state, phase: hasInterrupt ? 'Interrupt' : 'EnemyPlay' },
        hasInterrupt ? 'Interrupt available' : 'No interrupts — Enemy Play'
      );
    }

    // ── Dev Actions ───────────────────────────────────────────
    case 'DEV_SET_PRIORITY':
      return addLog({ ...state, priority: action.value }, `[DEV] Priority → ${action.value}`);

    case 'DEV_SET_PATIENCE':
      return addLog({ ...state, patience: action.value }, `[DEV] Patience → ${action.value}`);

    case 'DEV_SET_LIE_COUNTER':
      return addLog({ ...state, lieCounter: action.value }, `[DEV] Lie Counter → ${action.value}`);

    case 'DEV_BREAK_OPPONENT_SHIELD': {
      const shields = state.opponentShields.map((s, i) =>
        i === action.idx ? { ...s, broken: true } : s
      );
      return addLog({ ...state, opponentShields: shields }, `[DEV] Broke opponent shield ${action.idx}`);
    }

    case 'DEV_BREAK_PLAYER_SHIELD': {
      const shields = state.playerShields.map((s, i) =>
        i === action.idx ? null : s
      );
      return addLog({ ...state, playerShields: shields }, `[DEV] Broke player shield ${action.idx}`);
    }

    case 'DEV_SET_PHASE':
      return addLog({ ...state, phase: action.phase }, `[DEV] Phase → ${action.phase}`);

    case 'DEV_ADD_CARD_TO_HAND': {
      const instance: CardInstance = makeInstance(action.card);
      return addLog(
        { ...state, playerHand: [...state.playerHand, instance] },
        `[DEV] Added ${action.card.name} to hand`
      );
    }

    case 'DEV_SET_ENEMY_CARD': {
      const instance: CardInstance = makeInstance(action.card);
      return addLog({ ...state, stagedEnemyCard: instance }, `[DEV] Staged enemy card → ${action.card.name}`);
    }

    // ── Enemy Card Resolution ─────────────────────────────────
    case 'RESOLVE_ENEMY_CARD': {
      if (state.phase !== 'EnemyPlay' || !state.stagedEnemyCard) return state;
      const card = state.stagedEnemyCard;
      let s: CombatState = addLog(
        { ...state, stagedEnemyCard: null, enemyDiscard: [...state.enemyDiscard, card] },
        `NPC played ${card.definition.name}`
      );
      return resolveEffectList(s, card.definition.effects, card, (resolved) => {
        return checkState({ ...resolved, phase: 'Check', pendingEffects: [], pendingEffectCard: null });
      });
    }

    case 'DEV_ADD_RELEVANT_CARD': {
      const rc: RelevantCard = action.card;
      const config = {
        ...state.config,
        relevantCards: [...state.config.relevantCards, rc],
      };
      return addLog({ ...state, config }, `[DEV] Added relevant card ${rc.cardId}`);
    }

    default:
      return state;
  }
}
