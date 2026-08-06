import { useCallback, useMemo, useReducer } from 'react';

import {
  canGoNext,
  canGoPrevious,
  createInitialEngineState,
  emptyDraftFor,
  getCurrentAttempt,
  getCurrentQuestion,
  questionEngineReducer,
  type EngineState,
  type QuestionAttemptState,
} from '../services/questionEngine';
import { isAnswerable, scoreQuestion } from '../services/scoringService';
import type { Question } from '../models';
import type { AttemptAnswer } from '../models/attempt';

type UseQuestionEngineParams = {
  questions: Question[];
  /**
   * Called once per submission, after the engine has locked and scored it.
   * This is the engine's only integration point for persistence — QBank
   * wires this to attemptsStorage (see useQBankSession.ts); a future
   * ephemeral AI-question flow could pass nothing at all. The engine
   * itself never imports a storage module.
   */
  onSubmit?: (question: Question, answer: AttemptAnswer, isCorrect: boolean) => void;
  /** Called whenever the current index changes (e.g. QBank persists it for resume). */
  onIndexChange?: (index: number) => void;
};

/**
 * React binding for the framework-agnostic reducer in
 * src/services/questionEngine.ts. Reusable across QBank (M4), Exams (M7),
 * and AI-generated questions (M9) — none of the logic here assumes a
 * particular question source.
 */
export function useQuestionEngine({ questions, onSubmit, onIndexChange }: UseQuestionEngineParams) {
  const [state, dispatch] = useReducer(questionEngineReducer, questions, createInitialEngineState);

  const currentQuestion = getCurrentQuestion(state);
  const currentAttempt = getCurrentAttempt(state);
  const currentDraft: AttemptAnswer | undefined =
    currentAttempt?.draft ?? (currentQuestion ? emptyDraftFor(currentQuestion) : undefined);

  const selectSingle = useCallback((label: string) => dispatch({ type: 'SELECT_SINGLE', label }), []);
  const toggleSata = useCallback((label: string) => dispatch({ type: 'TOGGLE_SATA', label }), []);
  const setNumeric = useCallback((text: string) => dispatch({ type: 'SET_NUMERIC', text }), []);

  const submit = useCallback(() => {
    if (!currentQuestion || !currentDraft) return;
    if (currentAttempt?.status === 'submitted') return; // already locked, nothing to do
    // Guarded here too, not just by the UI disabling the Submit button —
    // this function is a public part of the engine's contract, so it must
    // be safe to call regardless of whether the caller already checked.
    if (!isAnswerable(currentQuestion, currentDraft)) return;
    // Computed here (not read back from post-dispatch state, which isn't
    // available synchronously) using the exact same pure scoring function
    // the reducer itself calls internally — so this is guaranteed to match
    // what the reducer just recorded, not a separate/divergent judgment.
    const isCorrect = scoreQuestion(currentQuestion, currentDraft);
    dispatch({ type: 'SUBMIT' });
    onSubmit?.(currentQuestion, currentDraft, isCorrect);
  }, [currentQuestion, currentDraft, currentAttempt, onSubmit]);

  const hydrate = useCallback((currentIndex: number, answers: Record<string, QuestionAttemptState>) => {
    dispatch({ type: 'HYDRATE', currentIndex, answers });
  }, []);

  // Index changes fire onIndexChange as a plain callback (not a useEffect
  // watching state.currentIndex), so the caller's persistence write happens
  // immediately on navigation, not after an extra render/effect cycle.
  const next = useCallback(() => {
    const nextIndex = Math.min(state.currentIndex + 1, state.questions.length - 1);
    dispatch({ type: 'NEXT' });
    if (nextIndex !== state.currentIndex) onIndexChange?.(nextIndex);
  }, [onIndexChange, state.currentIndex, state.questions.length]);

  const previous = useCallback(() => {
    const prevIndex = Math.max(state.currentIndex - 1, 0);
    dispatch({ type: 'PREVIOUS' });
    if (prevIndex !== state.currentIndex) onIndexChange?.(prevIndex);
  }, [onIndexChange, state.currentIndex]);

  const derived = useMemo(
    () => ({
      canGoNext: canGoNext(state),
      canGoPrevious: canGoPrevious(state),
      total: state.questions.length,
      index: state.currentIndex,
    }),
    [state]
  );

  return {
    state,
    currentQuestion,
    currentAttempt,
    currentDraft,
    selectSingle,
    toggleSata,
    setNumeric,
    submit,
    next,
    previous,
    hydrate,
    ...derived,
  };
}

export type QuestionEngine = ReturnType<typeof useQuestionEngine>;
export type { EngineState };
