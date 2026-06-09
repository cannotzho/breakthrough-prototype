import { useEffect, useRef } from 'react';

export function useCombatTimers() {
  const priorityBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const justBrokenTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const priorityToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stagedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (stagedTimerRef.current) clearTimeout(stagedTimerRef.current);
      if (priorityToastTimerRef.current) clearTimeout(priorityToastTimerRef.current);
      if (priorityBannerTimerRef.current) clearTimeout(priorityBannerTimerRef.current);
      if (justBrokenTimerRef.current) clearTimeout(justBrokenTimerRef.current);
    };
  }, []);

  return { priorityBannerTimerRef, justBrokenTimerRef, priorityToastTimerRef, stagedTimerRef };
}
