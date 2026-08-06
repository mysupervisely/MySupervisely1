import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { progressRepository, type SystemProgress } from '../services/progressRepository';

/**
 * Loads a system's progress and refreshes on screen focus — so navigating
 * Home -> System -> QBank -> back to System shows the just-recorded
 * attempt's effect on accuracy/questionsAnswered, not a stale snapshot
 * from before the QBank session.
 */
export function useSystemProgress(systemKey: string): SystemProgress | null {
  const [progress, setProgress] = useState<SystemProgress | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    progressRepository.getSystemProgress(systemKey).then((result) => {
      if (!cancelled) setProgress(result);
    });
    return () => {
      cancelled = true;
    };
  }, [systemKey]);

  useEffect(() => load(), [load]);
  useFocusEffect(load);

  return progress;
}
