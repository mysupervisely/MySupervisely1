import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { computeWeaknessReport } from '../services/weaknessDetectionService';
import { computeStudyRecommendations } from '../services/recommendationService';
import { attemptsStorage } from '../storage/attemptsStorage';
import { examResultsStorage } from '../storage/examResultsStorage';
import type { Attempt } from '../models/attempt';
import type { ExamResult } from '../models/examResult';

/**
 * M7.4/M7.5 data loading, mirroring useProgressDashboard.ts's pattern:
 * load the raw records once (and again on focus, so a just-finished QBank
 * or exam session's results are reflected without a full app restart),
 * then derive the weakness report and recommendations via useMemo so
 * they only recompute when the underlying records actually change.
 */
export function useStudyRecommendations() {
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [examResults, setExamResults] = useState<ExamResult[] | null>(null);

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

  const weaknessReport = useMemo(
    () => (attempts && examResults ? computeWeaknessReport(attempts, examResults) : null),
    [attempts, examResults]
  );

  const recommendations = useMemo(
    () => (weaknessReport && attempts && examResults ? computeStudyRecommendations(weaknessReport, attempts, examResults) : null),
    [weaknessReport, attempts, examResults]
  );

  return {
    isLoading: attempts === null || examResults === null,
    weaknessReport,
    recommendations,
  };
}
