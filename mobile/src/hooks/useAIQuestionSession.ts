import { useEffect, useMemo, useState } from 'react';

import { useQuestionEngine } from './useQuestionEngine';
import { aiQuestionCacheStorage } from '../storage/aiQuestionCacheStorage';
import { attemptsStorage } from '../storage/attemptsStorage';
import type { SingleAnswerQuestion } from '../models';

/**
 * M8 — loads every cached AI-generated question once. Split from the
 * engine-consuming hook below on purpose: `useQuestionEngine`'s
 * `useReducer` only reads its `questions` argument on the component's
 * FIRST render (React's documented `useReducer` init behavior) — if this
 * hook fed a still-loading (`[]`) list straight into `useQuestionEngine`,
 * the engine would be permanently stuck with an empty question list once
 * the real cache resolved a moment later. The screen is expected to wait
 * for `isLoading` to clear before mounting whatever calls
 * `useAIQuestionEngineSession`, so that hook's very first render already
 * has the real data (see AIQuestionSessionScreen.tsx).
 */
export function useCachedAIQuestions() {
  const [questions, setQuestions] = useState<SingleAnswerQuestion[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    aiQuestionCacheStorage.getAll().then((cached) => {
      if (!cancelled) setQuestions(cached);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { isLoading: questions === null, questions: questions ?? [] };
}

/**
 * The reusable Question Engine, fed the cached AI questions newest-first
 * so the just-generated question (the reason the student is here) is
 * always the one showing first — no separate "jump to this question"
 * step needed. Same source-specific-wiring pattern as
 * useStudySession.ts (M7.5): compose useQuestionEngine with this
 * source's own persistence, don't touch the engine itself. Answers ARE
 * recorded to attemptsStorage, same as every other question source.
 *
 * Requires the caller to have already resolved the real question list
 * (see useCachedAIQuestions above) — `questions` here is captured once,
 * at this hook's first render, matching useQuestionEngine's own
 * once-at-creation contract.
 */
export function useAIQuestionEngineSession(questions: SingleAnswerQuestion[]) {
  const orderedQuestions = useMemo(
    () => [...questions].reverse(),
    // Deliberately captured once — this hook is only ever mounted after
    // the real cache has loaded (see AIQuestionSessionScreen.tsx), and a
    // stable initial ordering is exactly what a Question Engine session
    // needs (same "fixed question list per session" contract QBank/Exams
    // already rely on).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const engine = useQuestionEngine({
    questions: orderedQuestions,
    onSubmit: (question, answer, isCorrect) => {
      attemptsStorage.recordAttempt({ question, answer, isCorrect }).catch(() => {
        // Best-effort — a failed write shouldn't block the student from continuing.
      });
    },
  });

  return { engine, questions: orderedQuestions };
}
