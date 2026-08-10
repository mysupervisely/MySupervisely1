import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import {
  computeDomainStats,
  computeOverallStats,
  computeSystemStats,
  getRecentActivity,
} from '../services/progressAnalyticsService';
import { computeReadinessScore } from '../services/readinessScoreService';
import { contentRepository } from '../services/contentRepository';
import { attemptsStorage } from '../storage/attemptsStorage';
import { examResultsStorage } from '../storage/examResultsStorage';
import type { Attempt } from '../models/attempt';
import type { ExamResult } from '../models/examResult';

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
  const [examResults, setExamResults] = useState<ExamResult[] | null>(null);
  const systems = useMemo(() => contentRepository.getAllSystems(), []);

  const load = useCallback(() => {
    let cancelled = false;
    Promise.all([attemptsStorage.getAllAttempts(), examResultsStorage.getAllResults()]).then(
      ([loadedAttempts, loadedResults]) => {
        if (cancelled) return;
        setAttempts(loadedAttempts);
        setExamResults(loadedResults);
      }
    );
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
  // M7.6 — "PharmDPrepped Readiness Score," computed alongside the rest of the dashboard's
  // stats from the same already-loaded attempts + exam results (see readinessScoreService.ts).
  const readiness = useMemo(
    () => (attempts && examResults ? computeReadinessScore(attempts, examResults) : null),
    [attempts, examResults]
  );
  // M10 polish: a brand-new student's readiness score is 0 for the same reason a real 0% score
  // would be — the component scores can't tell those two cases apart on their own. This flag lets
  // ReadinessScoreCard show "not enough data yet" instead of a stark, possibly-discouraging 0.
  const hasActivity = (attempts?.length ?? 0) > 0 || (examResults?.length ?? 0) > 0;

  return {
    isLoading: attempts === null || examResults === null,
    overallStats,
    systemStats,
    domainStats,
    recentActivity,
    readiness,
    hasActivity,
  };
}
