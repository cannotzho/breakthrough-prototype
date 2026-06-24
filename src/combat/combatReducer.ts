import { CombatState, CombatAction, CardInstance, CardEffect, CardOwner, NuggetOverride, SHIELD_PLACEMENT_COST, ActivatedAbilityCost } from './types';
import { applyEffect, selectEnemyCard, makeInstance, clampPriority, applyTurnHandoffBonus, priorityRestore, shuffle, resolveFieldTriggerCheck, classicTurnStart, npcTurnStart, addLog } from './effectHandlers';
import { COMBINATIONS } from '../data/combinations';
import { PONDER_DEFINITION } from '../data/devCards';

function computeCost(cost: number, _priority: number, _isFrame: boolean) {
  return { priorityCovered: cost, patienceCost: 0 };
}

function checkState(state: CombatState): CombatState {
  const isFrame = state.config.priorityMode === 'frame';

  // §4.3 Rule 1: Win — all opponent shields broken
  if (state.opponentShields.every(s => s.broken)) {
    return addLog({ ...state, phase: 'WIN' }, 'All opponent shields broken — WIN');
  }

  // §4.3 Rule 2: Lose — all player shields broken (only after at least one was placed)
  const hasAnyShield = state.playerShields.some(s => s !== null);
  if (
    !state.config.unbreakablePlayerShields &&
    state.shieldsEverPlaced > 0 &&
    !hasAnyShield
  ) {
    return addLog({ ...state, phase: 'LOSE' }, 'All player shields broken — LOSE');
  }

  // §4.3 Rule 3: Lose — Patience ≤ 0
  if (state.patience <= 0) {
    return addLog({ ...state, phase: 'LOSE' }, 'Patience reached 0 — LOSE');
  }

  // §4.3 Rule 4: Lose — Lie counter exceeded
  if (
    state.config.lieThreshold != null &&
    state.config.lieThreshold > 0 &&
    state.lieCounter > state.config.lieThreshold
  ) {
    return addLog({ ...state, phase: 'LOSE' }, 'Lie counter exceeded — LOSE');
  }

  if (isFrame) {
    // Frame Priority Mode routing (§4.3 rules 5–8)
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

    if (state.enemyDeck.length === 0 && state.enemyDiscard.length > 0) {
      return addLog(
        { ...state, phase: 'EnemyPending', enemyDeck: shuffle([...state.enemyDiscard]), enemyDiscard: [] },
        'NPC deck recycled.'
      );
    }
    return { ...state, phase: 'EnemyPending' };
  } else {
    // Classic Priority Mode — alternating turns with activeTurn flag
    if (state.activeTurn === 'player') {
      let s = state;
      if (s.stagedEnemyCard) {
        s = addLog(
          { ...s, enemyDiscard: [...s.enemyDiscard, s.stagedEnemyCard], stagedEnemyCard: null },
          'Staged enemy card cancelled → NPC discard'
        );
      }
      return { ...s, phase: 'PlayerPending' };
    }

    // activeTurn === 'npc'
    if (state.stagedEnemyCard) {
      return { ...state, phase: 'EnemyPlay' };
    }

    if (state.playerHand.length > 0) {
      return { ...state, phase: 'BotMSelect' };
    }

    if (state.npcPriority > 0) {
      if (state.enemyDeck.length === 0 && state.enemyDiscard.length > 0) {
        return addLog(
          { ...state, phase: 'EnemyPending', enemyDeck: shuffle([...state.enemyDiscard]), enemyDiscard: [] },
          'NPC deck recycled.'
        );
      }
      return { ...state, phase: 'EnemyPending' };
    }

    // npcPriority <= 0 and no staged card — Classic Turn Start
    return checkState(classicTurnStart(state));
  }
}

function resolveEffectList(
  state: CombatState,
  effects: CardEffect[],
  card: CardInstance,
  onComplete: (s: CombatState) => CombatState
): CombatState {
  const controller: CardOwner = card.controller;
  let s = state;
  for (let i = 0; i < effects.length; i++) {
    const effect = effects[i];
    const beforeReveal = s.pendingReveal;
    s = applyEffect(s, effect, controller);

    if (s.pendingReveal && s.pendingReveal !== beforeReveal) {
      return {
        ...s,
        phase: 'RevealPending',
        pendingEffects: effects.slice(i + 1),
        pendingEffectCard: card,
      };
    }
  }
  return onComplete(s);
}

const PONDER_EFFECTS: CardEffect[] = PONDER_DEFINITION.effects;
const PONDER_COST = PONDER_DEFINITION.cost;

function isDefaultNuggetVariant(card: CardInstance, nuggetOverrides: NuggetOverride[]): boolean {
  if (card.definition.supertype !== 'Information') return false;
  if (!card.definition.nuggetId) return false;
  const override = nuggetOverrides.find(o => o.nuggetId === card.definition.nuggetId);
  if (override && override.overrideCardDef.id === card.definition.id) return false;
  return true;
}

function completePlayerPlay(state: CombatState, card: CardInstance, isPonderConversion: boolean): CombatState {
  let s = state;
  if (s.pendingPlaceAsShield) {
    return addLog(
      { ...s, pendingEffectCard: card, pendingEffects: [], phase: 'PlayerPending' },
      `${card.definition.name}: choose a shield slot to place it in`
    );
  }

  const isTrap = card.definition.subtype === 'Trap';
  const isImpression = card.definition.subtype === 'Impression';
  const isCombined = !!card.combinedFrom;

  if (isTrap && card.definition.trapTrigger) {
    const trap = {
      card,
      triggerCondition: card.definition.trapTrigger,
      playOrder: s.trapPlayCounter,
    };
    s = {
      ...s,
      fieldTraps: [...s.fieldTraps, trap],
      trapPlayCounter: s.trapPlayCounter + 1,
    };
    s = addLog(s, `${card.definition.name} placed on the Field as Trap`);
  } else {
    const discardCard: CardInstance = isPonderConversion
      ? { ...card, definition: PONDER_DEFINITION }
      : card;
    let discardAdditions: CardInstance[];
    if (isCombined) {
      discardAdditions = card.combinedFrom!;
    } else {
      discardAdditions = isImpression ? [] : [discardCard];
    }
    s = {
      ...s,
      playerDiscard: [...s.playerDiscard, ...discardAdditions],
      fieldImpressions: isImpression ? [...s.fieldImpressions, card] : s.fieldImpressions,
    };
  }

  // Field Trigger Check after Player Play
  s = resolveFieldTriggerCheck(s);

  // Frame mode: if priority ≤ 0 and hand is empty, BotM will be skipped
  // and NPC turn starts immediately — apply the turn-handoff bonus here
  if (
    s.config.priorityMode === 'frame' &&
    s.priority <= 0 &&
    s.playerHand.length === 0
  ) {
    const before = s.priority;
    s = { ...s, priority: applyTurnHandoffBonus(s.priority, 'npc') };
    s = addLog(s, `Turn handoff bonus (priority ${before} → ${s.priority})`);
  }

  return checkState({
    ...s,
    pendingEffects: [],
    pendingEffectCard: null,
    phase: 'Check',
  });
}

export function combatReducer(state: CombatState, action: CombatAction): CombatState {
  switch (action.type) {

    case 'CHECK':
      return checkState(state);

    case 'PLAY_CARD': {
      if (state.phase !== 'PlayerPending') return state;
      const card = state.playerHand.find(c => c.instanceId === action.cardInstanceId);
      if (!card) return state;
      if (card.definition.subtype === 'Token') {
        return addLog(state, `Cannot play ${card.definition.name} — Token cards cannot be played from hand`);
      }

      const isFrame = state.config.priorityMode === 'frame';

      let effectiveCost = card.definition.cost;
      let effectiveEffects = card.definition.effects;
      let isPonderConversion = false;
      let discoveryEvent: CombatState['pendingDiscovery'] = null;

      if (isDefaultNuggetVariant(card, state.config.nuggetOverrides)) {
        const nuggetId = card.definition.nuggetId!;
        const override = state.config.nuggetOverrides.find(o => o.nuggetId === nuggetId);

        if (override) {
          effectiveEffects = override.overrideCardDef.effects;
          effectiveCost = override.overrideCardDef.cost;
        } else {
          effectiveCost = PONDER_COST;
          effectiveEffects = PONDER_EFFECTS;
          isPonderConversion = true;
        }

        if (!state.discoveredNuggetIds.includes(nuggetId)) {
          discoveryEvent = {
            nuggetId,
            nuggetName: card.definition.name,
            effectDescription: override
              ? (override.overrideCardDef.effectText ?? 'Override effect resolved.')
              : 'This information converts to Ponder in this encounter.',
          };
        }
      }

      // Classic mode: cannot play if cost > current priority
      if (!isFrame && effectiveCost > state.priority) {
        return addLog(state, `Cannot play ${card.definition.name} — cost ${effectiveCost} exceeds priority ${state.priority}`);
      }

      const cost = effectiveCost;
      const { priorityCovered, patienceCost } = computeCost(cost, state.priority, isFrame);

      let s: CombatState = {
        ...state,
        priority: isFrame ? state.priority - priorityCovered : Math.max(0, state.priority - priorityCovered),
        patience: state.patience - patienceCost,
        playerHand: state.playerHand.filter(c => c.instanceId !== action.cardInstanceId),
        pendingEffects: [],
        pendingEffectCard: null,
      };

      if (isPonderConversion) {
        s = {
          ...s,
          playedNonRelevantCards: [...s.playedNonRelevantCards, card.definition.id],
        };
        s = addLog(s, `Played ${card.definition.name} (non-relevant) → Ponder (cost ${PONDER_COST}, draw 1)`);
      } else {
        s = addLog(s, `Played ${card.definition.name} (cost ${cost}${patienceCost > 0 ? `, −${patienceCost} Patience` : ''})`);
      }

      if (discoveryEvent) {
        const nuggetId = discoveryEvent.nuggetId;
        s = {
          ...s,
          pendingDiscovery: discoveryEvent,
          discoveredNuggetIds: [...s.discoveredNuggetIds, nuggetId],
        };
        s = addLog(s, `Discovered: ${discoveryEvent.effectDescription}`);
      }

      if (card.definition.keywords.includes('Lie')) {
        s = { ...s, lieCounter: s.lieCounter + 1 };
      }

      // Trap cards: skip effect resolution, go straight to field placement
      if (card.definition.subtype === 'Trap') {
        return completePlayerPlay(s, card, isPonderConversion);
      }

      return resolveEffectList(s, effectiveEffects, card, (resolved) => {
        return completePlayerPlay(resolved, card, isPonderConversion);
      });
    }

    case 'CONFIRM_PLACE_AS_SHIELD': {
      if (!state.pendingPlaceAsShield || !state.pendingEffectCard) return state;
      const card = state.pendingEffectCard;
      if (action.slotIdx >= state.playerShields.length || state.playerShields[action.slotIdx] !== null) return state;
      const newShields = [...state.playerShields];
      newShields[action.slotIdx] = { card, shieldType: 'dummy', patienceCostOnBreak: 1 };
      let s: CombatState = {
        ...state,
        playerShields: newShields,
        shieldsEverPlaced: state.shieldsEverPlaced + 1,
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

      const isFrame = state.config.priorityMode === 'frame';

      // Classic mode: cannot place if cost > current priority
      if (!isFrame && SHIELD_PLACEMENT_COST > state.priority) {
        return addLog(state, `Cannot place shield — cost ${SHIELD_PLACEMENT_COST} exceeds priority ${state.priority}`);
      }

      const { priorityCovered, patienceCost } = computeCost(SHIELD_PLACEMENT_COST, state.priority, isFrame);

      const newShields = [...state.playerShields];
      newShields[action.slotIdx] = { card, shieldType: 'dummy', patienceCostOnBreak: 1 };

      let s: CombatState = {
        ...state,
        priority: isFrame ? state.priority - priorityCovered : Math.max(0, state.priority - priorityCovered),
        patience: state.patience - patienceCost,
        playerHand: state.playerHand.filter(c => c.instanceId !== action.cardInstanceId),
        playerShields: newShields,
        shieldsEverPlaced: state.shieldsEverPlaced + 1,
      };
      s = addLog(s, `${card.definition.name} placed as shield in slot ${action.slotIdx} (cost ${SHIELD_PLACEMENT_COST} priority)`);

      if (isFrame && s.priority <= 0 && s.playerHand.length === 0) {
        const before = s.priority;
        s = { ...s, priority: applyTurnHandoffBonus(s.priority, 'npc') };
        s = addLog(s, `Turn handoff bonus (priority ${before} → ${s.priority})`);
      }

      return checkState({ ...s, phase: 'Check' });
    }

    case 'RESEQUENCE_SHIELDS': {
      if (state.phase !== 'PlayerPending') return state;
      const { newOrder } = action;
      if (newOrder.length !== state.playerShields.length) return state;
      const reordered = newOrder.map(i => state.playerShields[i]);
      return { ...state, playerShields: reordered };
    }

    case 'END_TURN': {
      if (state.phase !== 'PlayerPending') return state;
      const isFrame = state.config.priorityMode === 'frame';
      if (isFrame) {
        let s = addLog({ ...state, priority: 0 }, `Player ended turn (priority ${state.priority} → 0)`);
        if (s.playerHand.length === 0) {
          const before = s.priority;
          s = { ...s, priority: applyTurnHandoffBonus(s.priority, 'npc') };
          s = addLog(s, `Turn handoff bonus (priority ${before} → ${s.priority})`);
        }
        return checkState(s);
      } else {
        return checkState(npcTurnStart(state));
      }
    }

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
      const selectedIds = new Set(state.backOfMind.map(c => c.instanceId));
      const rest = state.playerHand.filter(c => !selectedIds.has(c.instanceId));
      const isFrameBotm = state.config.priorityMode === 'frame';
      const bonusPriorityBotm = isFrameBotm ? applyTurnHandoffBonus(state.priority, 'npc') : state.priority;
      let s: CombatState = {
        ...state,
        priority: bonusPriorityBotm,
        playerHand: [],
        playerDiscard: [...state.playerDiscard, ...rest],
        phase: 'EnemyPending',
      };
      if (isFrameBotm) {
        s = addLog(s, `Turn handoff bonus (priority ${state.priority} → ${bonusPriorityBotm})`);
      }
      if (state.backOfMind.length === 0) {
        s = addLog(s, 'Back of Mind: passed (no cards kept)');
      } else {
        s = addLog(s, `Back of Mind: ${state.backOfMind.map(c => c.definition.name).join(', ')}`);
      }
      if (s.enemyDeck.length === 0 && s.enemyDiscard.length > 0) {
        s = addLog({ ...s, enemyDeck: shuffle([...s.enemyDiscard]), enemyDiscard: [] }, 'NPC deck recycled.');
      }
      if (s.manualEnemyMode) return s;
      return selectEnemyCard(s);
    }

    case 'DISMISS_REVEAL': {
      if (state.phase !== 'RevealPending') return state;
      let s: CombatState = { ...state, pendingReveal: null };
      const remainingEffects = state.pendingEffects;
      const card = state.pendingEffectCard;

      if (!card || remainingEffects.length === 0) {
        let final: CombatState = { ...s, phase: 'Check', pendingEffects: [], pendingEffectCard: null };
        if (final.stagedEnemyCard && card && final.stagedEnemyCard.instanceId === card.instanceId) {
          final = { ...final, enemyDiscard: [...final.enemyDiscard, final.stagedEnemyCard], stagedEnemyCard: null };
        }
        final = resolveFieldTriggerCheck(final);
        return checkState(addLog(final, 'Reveal dismissed'));
      }
      return resolveEffectList(s, remainingEffects, card, (resolved) => {
        let final: CombatState = { ...resolved, phase: 'Check', pendingEffects: [], pendingEffectCard: null };
        if (final.stagedEnemyCard && card && final.stagedEnemyCard.instanceId === card.instanceId) {
          final = { ...final, enemyDiscard: [...final.enemyDiscard, final.stagedEnemyCard], stagedEnemyCard: null };
        }
        final = resolveFieldTriggerCheck(final);
        return checkState(final);
      });
    }

    case 'TRIGGER_ENEMY_ACTION': {
      if (state.phase !== 'EnemyPending') return state;
      return selectEnemyCard(state);
    }

    case 'RESOLVE_FIELD_TRIGGERS': {
      if (state.phase !== 'FieldTriggerCheck') return state;
      let s = resolveFieldTriggerCheck(state);
      if (s.stagedEnemyCard) {
        return { ...s, phase: 'EnemyPlay' };
      }
      return checkState({ ...s, phase: 'Check' });
    }

    case 'COMBINE': {
      if (state.phase !== 'PlayerPending') return state;
      const [idA, idB] = action.cardInstanceIds;
      const cardA = state.playerHand.find(c => c.instanceId === idA);
      const cardB = state.playerHand.find(c => c.instanceId === idB);
      if (!cardA || !cardB) return state;
      if (!cardA.definition.keywords.includes('Assemble') || !cardB.definition.keywords.includes('Assemble')) {
        return addLog(state, 'Combine failed: both cards must have Assemble');
      }

      const recipe = COMBINATIONS.find(r => {
        const ids = [cardA.definition.id, cardB.definition.id].sort();
        const ingredients = [...r.ingredients].sort();
        return ids.length === ingredients.length && ids.every((id, i) => id === ingredients[i]);
      });

      if (!recipe) {
        return addLog(state, `Combine failed: no recipe for ${cardA.definition.name} + ${cardB.definition.name}`);
      }

      const combinedInstance: CardInstance = {
        instanceId: crypto.randomUUID(),
        definition: recipe.result,
        owner: 'player',
        controller: 'player',
        combinedFrom: [cardA, cardB],
      };
      const newHand = state.playerHand
        .filter(c => c.instanceId !== idA && c.instanceId !== idB)
        .concat(combinedInstance);

      return addLog(
        { ...state, playerHand: newHand },
        `Combined ${cardA.definition.name} + ${cardB.definition.name} → ${recipe.result.name}`
      );
    }

    case 'DISMISS_DISCOVERY': {
      return { ...state, pendingDiscovery: null };
    }

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
      const instance: CardInstance = makeInstance(action.card, 'player');
      return addLog(
        { ...state, playerHand: [...state.playerHand, instance] },
        `[DEV] Added ${action.card.name} to hand`
      );
    }

    case 'DEV_SET_ENEMY_CARD': {
      const instance: CardInstance = makeInstance(action.card, 'npc');
      return addLog({ ...state, stagedEnemyCard: instance }, `[DEV] Staged enemy card → ${action.card.name}`);
    }

    case 'RESOLVE_ENEMY_CARD': {
      if (state.phase !== 'EnemyPlay' || !state.stagedEnemyCard) return state;
      const card = state.stagedEnemyCard;
      let s: CombatState = addLog(state, `NPC played ${card.definition.name}`);

      if (s.config.priorityMode === 'frame') {
        // Frame mode: enemy card cost pushes priority toward positive (self-limiting)
        if (card.definition.cost > 0) {
          const oldPriority = s.priority;
          const newPriority = clampPriority(s.priority + card.definition.cost);
          s = addLog({ ...s, priority: newPriority },
            `NPC spent ${card.definition.cost} initiative (priority ${oldPriority} → ${newPriority})`);
          if (oldPriority <= 0 && newPriority > 0) {
            s = priorityRestore(s);
          }
        }
      } else {
        // Classic mode: deduct cost from npcPriority
        if (card.definition.cost > 0) {
          const newNpcPriority = Math.max(0, s.npcPriority - card.definition.cost);
          s = addLog({ ...s, npcPriority: newNpcPriority },
            `NPC spent ${card.definition.cost} priority (npcPriority ${s.npcPriority} → ${newNpcPriority})`);
        }
      }

      return resolveEffectList(s, card.definition.effects, card, (resolved) => {
        let final: CombatState = {
          ...resolved,
          stagedEnemyCard: null,
          enemyDiscard: [...resolved.enemyDiscard, card],
          pendingEffects: [],
          pendingEffectCard: null,
        };
        final = resolveFieldTriggerCheck(final);
        return checkState({ ...final, phase: 'Check' });
      });
    }

    case 'DEV_ADD_NUGGET_OVERRIDE': {
      const override: NuggetOverride = action.override;
      const config = {
        ...state.config,
        nuggetOverrides: [...state.config.nuggetOverrides, override],
      };
      return addLog({ ...state, config }, `[DEV] Added nugget override for ${override.nuggetId}`);
    }

    case 'ACTIVATE_ABILITY': {
      if (state.phase !== 'PlayerPending') return state;

      const fieldCard =
        state.fieldImpressions.find(c => c.instanceId === action.cardInstanceId) ??
        state.fieldTokens.find(c => c.instanceId === action.cardInstanceId);
      if (!fieldCard) return addLog(state, 'Activate failed: card not found on field');

      const abilities = fieldCard.definition.activatedAbilities;
      if (!abilities || abilities.length === 0) return addLog(state, 'Activate failed: card has no activated abilities');

      const ability = abilities.find(a => a.id === action.abilityId);
      if (!ability) return addLog(state, `Activate failed: ability "${action.abilityId}" not found`);

      const cost: ActivatedAbilityCost = ability.cost;
      const isFrame = state.config.priorityMode === 'frame';

      if (cost.priority && !isFrame && cost.priority > state.priority) {
        return addLog(state, `Cannot activate ${ability.name} — priority cost ${cost.priority} exceeds available ${state.priority}`);
      }
      if (cost.patience && cost.patience >= state.patience) {
        return addLog(state, `Cannot activate ${ability.name} — patience cost ${cost.patience} would reduce patience to 0 or below`);
      }
      if (cost.shields) {
        const activeShields = state.playerShields.filter(s => s !== null).length;
        if (cost.shields > activeShields) {
          return addLog(state, `Cannot activate ${ability.name} — shield cost ${cost.shields} exceeds active shields ${activeShields}`);
        }
      }
      if (cost.discard) {
        const discardIds = action.discardCardIds ?? [];
        if (discardIds.length < cost.discard) {
          return addLog(state, `Cannot activate ${ability.name} — discard cost ${cost.discard} but only ${discardIds.length} cards selected`);
        }
        const handIds = new Set(state.playerHand.map(c => c.instanceId));
        if (!discardIds.every(id => handIds.has(id))) {
          return addLog(state, `Cannot activate ${ability.name} — some discard targets not in hand`);
        }
      }

      let s: CombatState = state;

      if (cost.priority) {
        s = isFrame
          ? { ...s, priority: s.priority - cost.priority }
          : { ...s, priority: Math.max(0, s.priority - cost.priority) };
      }
      if (cost.patience) {
        s = { ...s, patience: s.patience - cost.patience };
      }
      if (cost.shields) {
        let remaining = cost.shields;
        const newShields = [...s.playerShields];
        for (let i = 0; i < newShields.length && remaining > 0; i++) {
          if (newShields[i] !== null) {
            s = addLog(s, `Shield sacrificed: ${newShields[i]!.card.definition.name}`);
            newShields[i] = null;
            remaining--;
          }
        }
        s = { ...s, playerShields: newShields };
      }
      if (cost.discard && action.discardCardIds) {
        const discardSet = new Set(action.discardCardIds.slice(0, cost.discard));
        const discarded = s.playerHand.filter(c => discardSet.has(c.instanceId));
        s = {
          ...s,
          playerHand: s.playerHand.filter(c => !discardSet.has(c.instanceId)),
          playerDiscard: [...s.playerDiscard, ...discarded],
        };
        s = addLog(s, `Discarded ${discarded.map(c => c.definition.name).join(', ')} as ability cost`);
      }

      s = addLog(s, `Activated ${ability.name} on ${fieldCard.definition.name}`);

      return resolveEffectList(s, ability.effects, fieldCard, (resolved) => {
        let final: CombatState = {
          ...resolved,
          pendingEffects: [],
          pendingEffectCard: null,
          phase: 'Check',
        };
        final = resolveFieldTriggerCheck(final);
        return checkState(final);
      });
    }

    case 'DESTROY_TOKEN': {
      const token = state.fieldTokens.find(t => t.instanceId === action.instanceId);
      if (!token) return state;
      return addLog(
        { ...state, fieldTokens: state.fieldTokens.filter(t => t.instanceId !== action.instanceId) },
        `Token destroyed: ${token.definition.name} (removed from combat)`
      );
    }

    case 'DEV_RESET':
      return action.state;

    case 'DEV_SET_MANUAL_ENEMY':
      return { ...state, manualEnemyMode: action.enabled };

    case 'DEV_PICK_ENEMY_FROM_DECK': {
      if (state.phase !== 'EnemyPending') return state;
      const idx = state.enemyDeck.findIndex(c => c.instanceId === action.instanceId);
      if (idx === -1) return state;
      const card = state.enemyDeck[idx];
      const rest = [...state.enemyDeck.slice(0, idx), ...state.enemyDeck.slice(idx + 1)];
      return addLog(
        { ...state, stagedEnemyCard: card, enemyDeck: rest, phase: 'FieldTriggerCheck' },
        `[Manual] Enemy plays ${card.definition.name}`
      );
    }

    default:
      return state;
  }
}
