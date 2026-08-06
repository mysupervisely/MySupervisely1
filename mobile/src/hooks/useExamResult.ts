import { useEffect, useState } from 'react';

import { examResultsStorage } from '../storage/examResultsStorage';
import type { ExamResult } from '../models/examResult';

export function useExamResult(resultId: string): { isLoading: boolean; result: ExamResult | null } {
  const [result, setResult] = useState<ExamResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    examResultsStorage.getResultById(resultId).then((loaded) => {
      if (cancelled) return;
      setResult(loaded);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [resultId]);

  return { isLoading, result };
}
