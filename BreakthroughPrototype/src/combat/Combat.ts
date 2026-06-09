import { useReducer, useEffect, useCallback } from 'react';
import type { EncounterConfig, CombatConfig } from './types';
import { initCombat, combatReducer } from './combatEngine';

// ── Public hook ────────────────────────────────────────────────────────────────

export function useCombat(encounter: EncounterConfig, chosenWorldDeck: string[], preShields: string[] = [], playtestMode = false, personalDeck?: string[]) {
  const [state, dispatch] = useReducer(combatReducer, { encounter, chosenWorldDeck, preShields, personalDeck }, initCombat);

  // Schedule opponent action after player acknowledgment clears the ack gate.
  // Paused while: playtest mode, game over, awaiting shield/BotM choice, reveal dialog, or awaiting ack.
  useEffect(() => {
    if (playtestMode) return;
    if (state.gameOver || state.awaitingShieldChoice || state.awaitingBackOfMindChoice || state.phase !== 'defense') return;
    if (state.revealedShieldCard) return;
    if (state.awaitingOpponentAck) return; // wait for player to click "Pass"
    const timer = setTimeout(() => dispatch({ type: 'OPPONENT_ACT' }), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // intentional: fires only when opponentActionTrigger increments; guard state is read inside the effect, not as deps
  }, [state.opponentActionTrigger, state.awaitingOpponentAck, playtestMode]);

  const selectCard = useCallback((cardId: string) => dispatch({ type: 'SELECT_CARD', cardId }), []);
  const playCard = useCallback((cardId: string) => dispatch({ type: 'PLAY_CARD', cardId }), []);
  const placeShield = useCallback(() => dispatch({ type: 'PLACE_SHIELD' }), []);
  const endTurn = useCallback(() => dispatch({ type: 'END_TURN' }), []);
  const chooseShieldToBreak = useCallback((index: number) => dispatch({ type: 'CHOOSE_SHIELD_TO_BREAK', index }), []);
  const dismissDialogue = useCallback(() => dispatch({ type: 'DISMISS_DIALOGUE' }), []);
  const dismissReveal = useCallback(() => dispatch({ type: 'DISMISS_REVEAL' }), []);
  const resetCombat = useCallback(
    () => dispatch({ type: 'RESET', encounter, chosenWorldDeck, preShields, personalDeck }),
    [encounter, chosenWorldDeck, preShields, personalDeck],
  );
  const opponentAct = useCallback(
    (specificCardId?: string) => dispatch({ type: 'OPPONENT_ACT', specificCardId }),
    [],
  );
  const opponentEndTurn = useCallback(
    () => dispatch({ type: 'OPPONENT_END_TURN' }),
    [],
  );
  const combineCards = useCallback(
    (ingredient1: string, ingredient2: string) => dispatch({ type: 'COMBINE_CARDS', ingredient1, ingredient2 }),
    [],
  );
  const confirmBackOfMind = useCallback(
    (keptIds: string[]) => dispatch({ type: 'CONFIRM_BACK_OF_MIND', keptIds }),
    [],
  );
  const acknowledgeOpponent = useCallback(
    () => dispatch({ type: 'ACKNOWLEDGE_OPPONENT' }),
    [],
  );
  const updateConfig = useCallback(
    (config: Partial<CombatConfig>) => dispatch({ type: 'UPDATE_CONFIG', config }),
    [],
  );

  return { state, selectCard, playCard, placeShield, endTurn, chooseShieldToBreak, dismissDialogue, dismissReveal, resetCombat, opponentAct, opponentEndTurn, combineCards, confirmBackOfMind, acknowledgeOpponent, updateConfig };
}
