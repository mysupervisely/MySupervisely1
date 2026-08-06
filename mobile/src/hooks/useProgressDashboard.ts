import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import {
  computeDomainStats,
  computeOverallStats,
  computeSystemStats,
  getRecentActivity,
} from '../services/progressAnalyticsService';
import { contentRepository } from '../services/contentRepository';
import { attemptsStorage } from '../storage/attemptsStorage';
import type { Attempt } from '../models/attempt';

const RECENT_ACTIVITY_LIMIT = 20;

/**
 * Loads the full attempt history once (and on screen focus, so a QBank
 * session's just-recorded attempts show up when navigating back to
 * Progress), then derives every dashboard statistic via useMemo keyed on
 * that attempts array — the aggregation functions in
 * progressAnalyticsService.ts only re-run when the underlying attempts
 * actually changed, not on every render (M5's explicit performance
 * requirement: "avoid recomputing everything on every render").
 */
export function useProgressDashboard() {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const systems = useMemo(() => contentRepository.getAllSystems(), []);

  const load = useCallback(() => {
    let cancelled = false;
    attemptsStorage.getAllAttempts().then((result) => {
      if (!cancelled) setAttempts(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);
  useFocusEffect(load);

  const now = useMemo(() => new Date(), [attempts]); // eslint-disable-line react-hooks/exhaustive-deps

  const overallStats = useMemo(
    () => (attempts ? computeOverallStats(attempts, now) : null),
    [attempts, now]
  );
  const systemStats = useMemo(
    () => (attempts ? computeSystemStats(attempts, systems) : null),
    [attempts, systems]
  );
  const domainStats = useMemo(() => (attempts ? computeDomainStats(attempts) : null), [attempts]);
  const recentActivity = useMemo(
    () => (attempts ? getRecentActivity(attempts, RECENT_ACTIVITY_LIMIT) : null),
    [attempts]
  );

  return {
    isLoading: attempts === null,
    overallStats,
    systemStats,
    domainStats,
    recentActivity,
  };
}
