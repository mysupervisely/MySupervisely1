import { useMemo } from 'react';

import { useQuestionEngine } from './useQuestionEngine';
import { contentRepository } from '../services/contentRepository';
import { attemptsStorage } from '../storage/attemptsStorage';

/**
 * M7.5 — the thin, source-specific wiring a recommended study session
 * needs around the reusable Question Engine, following the exact pattern
 * useQBankSession.ts established: compose useQuestionEngine with this
 * source's own persistence, don't touch the engine or useQBankSession
 * itself. Two differences from QBank, both deliberate:
 *
 *  - Questions come from a caller-supplied id list (a recommendation's
 *    `questionIds`, resolved through the same contentRepository used
 *    everywhere else) instead of the full bank — this is what "link back
 *    into existing QBank/question engine" means concretely.
 *  - No session-position persistence (no equivalent of
 *    qbankSessionStorage): a recommended session is generated fresh from
 *    current weaknesses each time it's opened, not a resumable, permanent
 *    queue — see docs/M7_IMPLEMENTATION_NOTES.md for why that's an
 *    intentional scope line, not an oversight.
 *
 * Answers ARE still recorded to attemptsStorage, same as QBank — a
 * recommended session is real QBank practice with a curated question
 * list, not a separate, untracked mode, so it feeds back into future
 * weakness detection like any other QBank attempt.
 */
export function useStudySession(questionIds: string[]) {
  const questions = useMemo(
    () => questionIds.map((id) => contentRepository.getQuestionById(id)).filter((q) => q !== undefined),
    [questionIds]
  );

  const engine = useQuestionEngine({
    questions,
    onSubmit: (question, answer, isCorrect) => {
      attemptsStorage.recordAttempt({ question, answer, isCorrect }).catch(() => {
        // Best-effort — a failed write shouldn't block the student from continuing.
      });
    },
  });

  return { engine, questions };
}
