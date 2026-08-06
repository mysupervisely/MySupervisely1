import { useEffect, useMemo, useState } from 'react';

import { useQuestionEngine } from './useQuestionEngine';
import { contentRepository } from '../services/contentRepository';
import { attemptsStorage } from '../storage/attemptsStorage';
import { qbankSessionStorage } from '../storage/qbankSessionStorage';
import { buildResumeState } from '../services/questionEngine';

/**
 * QBank-specific wiring around the reusable Question Engine: feeds it the
 * full QBank (sequential, no filters/randomization yet — M4 scope), wires
 * submissions to attemptsStorage, and wires navigation to
 * qbankSessionStorage so relaunching the app resumes where the student
 * left off — including which already-answered questions show as locked
 * with their prior result when revisited via Previous, not just the raw
 * index.
 *
 * This is the pattern Exams (M7) and AI-generated questions (M9) are
 * expected to follow: their own thin session hook composing the same
 * useQuestionEngine with their own persistence, not a copy of the engine
 * itself.
 */
export function useQBankSession() {
  // contentRepository.getQuestions() is synchronous (bundled, indexed at
  // module load — see M2) — only the resume state below is actually async.
  const questions = useMemo(() => contentRepository.getQuestions(), []);
  const [isHydrating, setIsHydrating] = useState(true);

  const engine = useQuestionEngine({
    questions,
    onSubmit: (question, answer, isCorrect) => {
      attemptsStorage.recordAttempt({ question, answer, isCorrect }).catch(() => {
        // Best-effort — a failed write shouldn't block the student from continuing.
      });
    },
    onIndexChange: (index) => {
      qbankSessionStorage.setCurrentIndex(index).catch(() => {});
    },
  });

  const { hydrate } = engine;

  useEffect(() => {
    let cancelled = false;

    async function resume() {
      const [savedIndex, allAttempts] = await Promise.all([
        qbankSessionStorage.getCurrentIndex(),
        attemptsStorage.getAllAttempts(),
      ]);
      if (cancelled) return;

      const { currentIndex, answers } = buildResumeState(savedIndex, allAttempts, questions.length);
      hydrate(currentIndex, answers);
      setIsHydrating(false);
    }

    resume();
    return () => {
      cancelled = true;
    };
    // Intentionally runs once on mount only — resuming a session shouldn't
    // re-trigger on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isHydrating, engine };
}
