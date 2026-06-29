import { useEffect, useRef, useState } from 'react';
import { CombatState, CombatAction, CardInstance } from '../../combat/types';
import { useNuggetDiscoveryStore } from '../../stores/nuggetDiscoveryStore';

interface UseCombatEffectsArgs {
  state: CombatState;
  dispatch: (action: CombatAction) => void;
  playedCardAnim: CardInstance | null;
  setPlayedCardAnim: (v: CardInstance | null) => void;
}

interface UseCombatEffectsReturn {
  priorityRestoreFlash: boolean;
  shieldTriggerAnim: string | null;
}

export default function useCombatEffects({
  state,
  dispatch,
  playedCardAnim,
  setPlayedCardAnim,
}: UseCombatEffectsArgs): UseCombatEffectsReturn {
  const [priorityRestoreFlash, setPriorityRestoreFlash] = useState(false);
  const [shieldTriggerAnim, setShieldTriggerAnim] = useState<string | null>(null);

  const prevPriorityRef = useRef(state.priority);
  const prevLogLenRef = useRef(0);
  const prevDiscoveredRef = useRef(state.discoveredNuggetIds.length);

  // Priority restore flash
  useEffect(() => {
    const prev = prevPriorityRef.current;
    prevPriorityRef.current = state.priority;
    if (prev <= 0 && state.priority > 0) {
      setPriorityRestoreFlash(true);
      const t = setTimeout(() => setPriorityRestoreFlash(false), 1300);
      return () => clearTimeout(t);
    }
  }, [state.priority]);

  // Played card animation clear
  useEffect(() => {
    if (playedCardAnim) {
      const t = setTimeout(() => setPlayedCardAnim(null), 1300);
      return () => clearTimeout(t);
    }
  }, [playedCardAnim]);

  // Shield trigger toast
  useEffect(() => {
    const log = state.actionLog;
    const prevLen = prevLogLenRef.current;
    prevLogLenRef.current = log.length;
    if (log.length > prevLen) {
      for (let i = prevLen; i < log.length; i++) {
        const match = log[i].match(/^Shield Trigger: (.+)$/);
        if (match) {
          setShieldTriggerAnim(match[1]);
          const t = setTimeout(() => setShieldTriggerAnim(null), 1800);
          return () => clearTimeout(t);
        }
      }
    }
  }, [state.actionLog]);

  // Nugget discovery recording
  const recordDiscovery = useNuggetDiscoveryStore(s => s.recordDiscovery);
  useEffect(() => {
    const ids = state.discoveredNuggetIds;
    if (ids.length > prevDiscoveredRef.current) {
      for (let i = prevDiscoveredRef.current; i < ids.length; i++) {
        recordDiscovery(state.config.id, ids[i]);
      }
    }
    prevDiscoveredRef.current = ids.length;
  }, [state.discoveredNuggetIds, state.config.id, recordDiscovery]);

  // Phase-transition auto-dispatches
  useEffect(() => {
    if (state.phase === 'Check') {
      dispatch({ type: 'CHECK' });
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'EnemyPending' && !state.manualEnemyMode) {
      const t = setTimeout(() => dispatch({ type: 'TRIGGER_ENEMY_ACTION' }), 1100);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.manualEnemyMode]);

  useEffect(() => {
    if (state.phase === 'FieldTriggerCheck') {
      const t = setTimeout(() => {
        dispatch({ type: 'RESOLVE_FIELD_TRIGGERS' });
      }, 400);
      return () => clearTimeout(t);
    }
  }, [state.phase]);

  useEffect(() => {
    if (state.phase === 'EnemyPlay' && state.stagedEnemyCard) {
      const t = setTimeout(() => {
        dispatch({ type: 'RESOLVE_ENEMY_CARD' });
      }, 1000);
      return () => clearTimeout(t);
    }
  }, [state.phase, state.stagedEnemyCard]);

  return { priorityRestoreFlash, shieldTriggerAnim };
}
