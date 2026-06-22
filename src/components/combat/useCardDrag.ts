import { useCallback, useRef, useState } from 'react';
import { CombatState } from '../../combat/types';

export default function useCardDrag(
  playZoneRef: React.RefObject<HTMLDivElement | null>,
  shieldSlotRefs: React.MutableRefObject<(HTMLDivElement | null)[]>,
  state: CombatState,
  dispatch: React.Dispatch<import('../../combat/types').CombatAction>,
  capturePlayedCard: (instanceId: string) => void,
) {
  const [playZoneHovered, setPlayZoneHovered] = useState(false);
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [hoveredShieldIdx, setHoveredShieldIdx] = useState(-1);
  const dragOccurredRef = useRef(false);

  const isOverZone = useCallback((event: MouseEvent | TouchEvent | PointerEvent): boolean => {
    const rect = playZoneRef.current?.getBoundingClientRect();
    if (!rect) return false;
    const clientX = 'clientX' in event
      ? (event as MouseEvent | PointerEvent).clientX
      : ((event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0])?.clientX ?? 0;
    const clientY = 'clientX' in event
      ? (event as MouseEvent | PointerEvent).clientY
      : ((event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0])?.clientY ?? 0;
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }, [playZoneRef]);

  const getClientPos = useCallback((event: MouseEvent | TouchEvent | PointerEvent) => {
    const clientX = 'clientX' in event
      ? (event as MouseEvent | PointerEvent).clientX
      : ((event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0])?.clientX ?? 0;
    const clientY = 'clientX' in event
      ? (event as MouseEvent | PointerEvent).clientY
      : ((event as TouchEvent).touches[0] ?? (event as TouchEvent).changedTouches[0])?.clientY ?? 0;
    return { clientX, clientY };
  }, []);

  const handleCardDragStart = useCallback((instanceId: string) => {
    setDraggingCardId(instanceId);
    dragOccurredRef.current = true;
  }, []);

  const handleCardDrag = useCallback((event: MouseEvent | TouchEvent | PointerEvent) => {
    setPlayZoneHovered(prev => {
      const over = Boolean(playZoneRef.current && isOverZone(event));
      return over === prev ? prev : over;
    });
    const { clientX, clientY } = getClientPos(event);
    let found = -1;
    for (let i = 0; i < shieldSlotRefs.current.length; i++) {
      const el = shieldSlotRefs.current[i];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        found = i;
        break;
      }
    }
    setHoveredShieldIdx(prev => prev === found ? prev : found);
  }, [isOverZone, getClientPos, playZoneRef, shieldSlotRefs]);

  const handleCardDragEnd = useCallback((instanceId: string, event: MouseEvent | TouchEvent | PointerEvent) => {
    if (isOverZone(event)) {
      capturePlayedCard(instanceId);
      dispatch({ type: 'PLAY_CARD', cardInstanceId: instanceId });
    } else if (state.phase === 'PlayerPending') {
      const { clientX, clientY } = getClientPos(event);
      for (let i = 0; i < shieldSlotRefs.current.length; i++) {
        const el = shieldSlotRefs.current[i];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          if (state.playerShields[i] === null) {
            dispatch({ type: 'PLACE_SHIELD', cardInstanceId: instanceId, slotIdx: i });
          }
          break;
        }
      }
    }
    setPlayZoneHovered(false);
    setDraggingCardId(null);
    setHoveredShieldIdx(-1);
    setTimeout(() => { dragOccurredRef.current = false; }, 200);
  }, [isOverZone, state.phase, state.playerShields, getClientPos, capturePlayedCard, dispatch, shieldSlotRefs]);

  const handleShieldDrop = useCallback((slotIdx: number) => {
    if (!draggingCardId) return;
    dispatch({ type: 'PLACE_SHIELD', cardInstanceId: draggingCardId, slotIdx });
    setDraggingCardId(null);
    setPlayZoneHovered(false);
  }, [draggingCardId, dispatch]);

  return {
    playZoneHovered,
    draggingCardId,
    hoveredShieldIdx,
    dragOccurredRef,
    handleCardDragStart,
    handleCardDrag,
    handleCardDragEnd,
    handleShieldDrop,
  };
}
