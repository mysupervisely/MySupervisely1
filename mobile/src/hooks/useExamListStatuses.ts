import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';

import { contentRepository } from '../services/contentRepository';
import { examSessionStorage } from '../storage/examSessionStorage';
import { examResultsStorage } from '../storage/examResultsStorage';
import type { ExamNumber } from '../models/exam';
import type { ExamResult } from '../models/examResult';

export type ExamListItem = {
  examNumber: ExamNumber;
  totalQuestions: number;
  status: 'not_started' | 'in_progress' | 'completed';
  currentIndex: number;
  latestResult: ExamResult | null;
};

const ALL_EXAM_NUMBERS: ExamNumber[] = [1, 2, 3];

/** Drives the exam hub screen — real status per exam, refreshed on focus so returning from a session/results screen updates it. */
export function useExamListStatuses() {
  const [items, setItems] = useState<ExamListItem[] | null>(null);

  const load = useCallback(() => {
    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        ALL_EXAM_NUMBERS.map(async (examNumber) => {
          const exam = contentRepository.getExam(examNumber);
          const session = await examSessionStorage.load(examNumber);
          const latestResult = await examResultsStorage.getLatestResultForExam(examNumber);

          let status: ExamListItem['status'] = 'not_started';
          if (session?.status === 'in_progress') status = 'in_progress';
          else if (latestResult) status = 'completed';

          return {
            examNumber,
            totalQuestions: exam?.questions.length ?? 0,
            status,
            currentIndex: session?.currentIndex ?? 0,
            latestResult,
          };
        })
      );
      if (!cancelled) setItems(results);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => load(), [load]);
  useFocusEffect(load);

  return items;
}
