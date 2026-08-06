import { isAnswerable, scoreQuestion } from './scoringService';
import type { Question } from '../models';
import type { Attempt, AttemptAnswer } from '../models/attempt';

/**
 * The reusable Question Engine (Phase: M4 objective — "one reusable
 * Question Engine" for QBank/Exams/AI-generated questions, not a separate
 * implementation per source). Pure state + transitions, no React, no
 * storage, no network — it operates on whatever `Question[]` it's given
 * and doesn't know or care whether that array came from the local QBank,
 * a fixed exam, or an AI-generated set. Side effects (persisting an
 * attempt, persisting session position) are the caller's job — see
 * src/hooks/useQuestionEngine.ts and src/hooks/useQBankSession.ts.
 */

export type QuestionAttemptState = {
  status: 'unanswered' | 'submitted';
  /** In-progress selection — mutable until submitted. */
  draft: AttemptAnswer;
  /** Frozen at the moment of submission. Present iff status === 'submitted'. */
  submittedAnswer?: AttemptAnswer;
  isCorrect?: boolean;
};

export type EngineState = {
  questions: Question[];
  currentIndex: number;
  /** Keyed by question.id — persists across Previous/Next navigation within the session. */
  answers: Record<string, QuestionAttemptState>;
};

export type EngineAction =
  | { type: 'SELECT_SINGLE'; label: string }
  | { type: 'TOGGLE_SATA'; label: string }
  | { type: 'SET_NUMERIC'; text: string }
  | { type: 'SUBMIT' }
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'HYDRATE'; currentIndex: number; answers: Record<string, QuestionAttemptState> };

export function emptyDraftFor(question: Question): AttemptAnswer {
  if (question.type === 'single') return { type: 'single', label: '' };
  if (question.type === 'sata') return { type: 'sata', labels: [] };
  return { type: 'numeric', text: '' };
}

export function createInitialEngineState(questions: Question[]): EngineState {
  return { questions, currentIndex: 0, answers: {} };
}

function currentAttempt(state: EngineState): QuestionAttemptState | undefined {
  const question = state.questions[state.currentIndex];
  if (!question) return undefined;
  return state.answers[question.id];
}

export function questionEngineReducer(state: EngineState, action: EngineAction): EngineState {
  const question = state.questions[state.currentIndex];

  switch (action.type) {
    case 'SELECT_SINGLE': {
      if (!question || question.type !== 'single') return state;
      const attempt = currentAttempt(state);
      if (attempt?.status === 'submitted') return state; // locked
      return setDraft(state, question.id, { type: 'single', label: action.label });
    }

    case 'TOGGLE_SATA': {
      if (!question || question.type !== 'sata') return state;
      const attempt = currentAttempt(state);
      if (attempt?.status === 'submitted') return state;
      const draft = attempt?.draft;
      const current = draft?.type === 'sata' ? draft.labels : [];
      const next = current.includes(action.label)
        ? current.filter((l) => l !== action.label)
        : [...current, action.label];
      return setDraft(state, question.id, { type: 'sata', labels: next });
    }

    case 'SET_NUMERIC': {
      if (!question || question.type !== 'numeric') return state;
      const attempt = currentAttempt(state);
      if (attempt?.status === 'submitted') return state;
      return setDraft(state, question.id, { type: 'numeric', text: action.text });
    }

    case 'SUBMIT': {
      if (!question) return state;
      const attempt = currentAttempt(state);
      if (!attempt || attempt.status === 'submitted') return state;
      // A blank/unanswerable draft can never be locked in — this is a
      // business rule ("you can't submit nothing"), so it lives here, not
      // only in the UI disabling the Submit button.
      if (!isAnswerable(question, attempt.draft)) return state;
      const isCorrect = scoreQuestion(question, attempt.draft);
      return {
        ...state,
        answers: {
          ...state.answers,
          [question.id]: {
            ...attempt,
            status: 'submitted',
            submittedAnswer: attempt.draft,
            isCorrect,
          },
        },
      };
    }

    case 'NEXT': {
      const nextIndex = Math.min(state.currentIndex + 1, state.questions.length - 1);
      return { ...state, currentIndex: nextIndex };
    }

    case 'PREVIOUS': {
      const prevIndex = Math.max(state.currentIndex - 1, 0);
      return { ...state, currentIndex: prevIndex };
    }

    case 'HYDRATE': {
      return { ...state, currentIndex: action.currentIndex, answers: action.answers };
    }

    default:
      return state;
  }
}

function setDraft(state: EngineState, questionId: string, draft: AttemptAnswer): EngineState {
  const existing = state.answers[questionId];
  return {
    ...state,
    answers: {
      ...state.answers,
      [questionId]: existing
        ? { ...existing, draft }
        : { status: 'unanswered', draft },
    },
  };
}

export function getCurrentQuestion(state: EngineState): Question | undefined {
  return state.questions[state.currentIndex];
}

export function getCurrentAttempt(state: EngineState): QuestionAttemptState | undefined {
  return currentAttempt(state);
}

export function canGoNext(state: EngineState): boolean {
  return state.currentIndex < state.questions.length - 1;
}

export function canGoPrevious(state: EngineState): boolean {
  return state.currentIndex > 0;
}

/**
 * The pure "resume a session" computation: given a saved index, the full
 * attempt history, and how many questions exist, derive what
 * `EngineState.currentIndex`/`answers` should hydrate to. Deliberately
 * separated from useQBankSession's useEffect so this — the actual resume
 * *logic* (clamping a stale index, collapsing multiple attempts per
 * question down to the latest one, restoring locked state for
 * already-answered questions) — is unit-testable without rendering a
 * React hook. The hook itself becomes thin glue: call this, then dispatch
 * HYDRATE with the result.
 */
export function buildResumeState(
  savedIndex: number,
  attempts: Attempt[],
  questionsLength: number
): { currentIndex: number; answers: Record<string, QuestionAttemptState> } {
  const latestByQuestion = new Map<string, Attempt>();
  for (const attempt of attempts) {
    const existing = latestByQuestion.get(attempt.questionId);
    if (!existing || attempt.attemptedAt > existing.attemptedAt) {
      latestByQuestion.set(attempt.questionId, attempt);
    }
  }

  const answers: Record<string, QuestionAttemptState> = {};
  for (const [questionId, attempt] of latestByQuestion) {
    answers[questionId] = {
      status: 'submitted',
      draft: attempt.answer,
      submittedAnswer: attempt.answer,
      isCorrect: attempt.isCorrect,
    };
  }

  const currentIndex = questionsLength > 0 ? Math.min(Math.max(savedIndex, 0), questionsLength - 1) : 0;

  return { currentIndex, answers };
}
