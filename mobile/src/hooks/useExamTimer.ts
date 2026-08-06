import { useEffect, useRef, useState } from 'react';

import { computeRemainingSeconds } from '../services/examSession';

/**
 * Pure display hook: ticks `remainingSeconds` once a second, always
 * re-derived from the wall-clock anchor (never incremented locally), so
 * backgrounding/foregrounding the app never desyncs it — the next tick
 * just recomputes from `startedAt` and gets the right answer immediately.
 *
 * `onExpire` fires once, the first tick where remaining hits 0, purely as
 * a UI-layer signal (e.g. show "Time's up," trigger the submit
 * transition). It is NOT the sole mechanism the app relies on to actually
 * end an expired exam — useExamSession.ts also checks on load, so an exam
 * that expired while the app was closed/backgrounded still gets submitted
 * the moment its screen is reopened, not only while this hook happens to
 * be ticking live.
 */
export function useExamTimer(startedAt: string, durationSeconds: number, onExpire: () => void): number {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    computeRemainingSeconds(startedAt, durationSeconds, new Date())
  );
  const hasExpiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire; // always call the latest callback without re-subscribing the tick interval below
  });

  useEffect(() => {
    hasExpiredRef.current = false;

    const tick = () => {
      const remaining = computeRemainingSeconds(startedAt, durationSeconds, new Date());
      setRemainingSeconds(remaining);
      if (remaining <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true;
        onExpireRef.current();
      }
    };

    tick(); // sync immediately, don't wait a full second for the first render
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, durationSeconds]);

  return remainingSeconds;
}
