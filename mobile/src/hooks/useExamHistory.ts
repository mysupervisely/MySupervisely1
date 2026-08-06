import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { computeExamHistory } from '../services/examResultService';
import { examResultsStorage } from '../storage/examResultsStorage';
import type { ExamResult } from '../models/examResult';

/** M7.7 — loads every stored exam result (refreshing on focus, so a just-finished exam shows up) and derives history entries via computeExamHistory. */
export function useExamHistory() {
  const [results, setResults] = useState<ExamResult[] | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    examResultsStorage.getAllResults().then((loaded) => {
      if (!cancelled) setResults(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);
  useFocusEffect(load);

  const history = useMemo(() => (results ? computeExamHistory(results) : null), [results]);

  return { isLoading: results === null, history };
}
