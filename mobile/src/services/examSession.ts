import { emptyDraftFor } from './questionEngine';
import { isAnswerable, scoreQuestion } from './scoringService';
import type { Question } from '../models';
import type { AttemptAnswer } from '../models/attempt';
import type { ExamNumber } from '../models/exam';

/**
 * The dedicated Exam Session layer (M6 — explicitly its own thing, not a
 * reuse of useQBankSession/qbankSessionStorage). What IS reused from the
 * Question Engine (M4): `scoreQuestion`, `isAnswerable`, `emptyDraftFor`,
 * and the `AttemptAnswer` draft shape itself — the same scoring core and
 * answer representation QBank uses.
 *
 * What is deliberately NOT reused: questionEngine.ts's reducer/EngineState
 * and QuestionEngineView. M4's own notes assumed QuestionEngineView could
 * be reused as-is for exams — that assumption doesn't survive contact with
 * real exam semantics: QBank locks a question and reveals its rationale
 * the moment you submit it; a NAPLEX-style exam never reveals correctness
 * per-question at all — you can revisit and change any answer up until
 * final submission, and grading only happens once, at the end. Because
 * the per-question state shape genuinely differs (no lock/submittedAnswer/
 * isCorrect per question until the whole exam ends), this needed its own
 * reducer rather than questionEngine.ts's SUBMIT-per-question one. See
 * docs/M6_IMPLEMENTATION_NOTES.md for the full reasoning.
 */

export type ExamStatus = 'in_progress' | 'submitted';

/** The exact fixed duration the real NAPLEX (and the web app, per the audit) uses. */
export const EXAM_DURATION_SECONDS = 6 * 60 * 60;

/** What actually gets written to storage — no `questions` array (see storage/examSessionStorage.ts for why). */
export type PersistedExamSession = {
  examNumber: ExamNumber;
  currentIndex: number;
  answers: Record<string, AttemptAnswer>;
  flaggedQuestionIds: string[];
  startedAt: string;
  durationSeconds: number;
  status: ExamStatus;
  submittedAt?: string;
};

/** The live, in-memory session — `questions` is always re-supplied fresh from contentRepository, never persisted. */
export type ExamSessionState = PersistedExamSession & {
  questions: Question[];
};

export function toPersisted(state: ExamSessionState): PersistedExamSession {
  const { questions: _questions, ...persisted } = state;
  return persisted;
}

export function fromPersisted(persisted: PersistedExamSession, questions: Question[]): ExamSessionState {
  return { ...persisted, questions };
}

export function createExamSession(examNumber: ExamNumber, questions: Question[], startedAt: Date): ExamSessionState {
  return {
    examNumber,
    questions,
    currentIndex: 0,
    answers: {},
    flaggedQuestionIds: [],
    startedAt: startedAt.toISOString(),
    durationSeconds: EXAM_DURATION_SECONDS,
    status: 'in_progress',
  };
}

export type ExamSessionAction =
  | { type: 'SELECT_SINGLE'; label: string }
  | { type: 'TOGGLE_SATA'; label: string }
  | { type: 'SET_NUMERIC'; text: string }
  | { type: 'NEXT' }
  | { type: 'PREVIOUS' }
  | { type: 'JUMP_TO'; index: number }
  | { type: 'TOGGLE_FLAG' }
  | { type: 'SUBMIT_EXAM'; now: Date }
  | { type: 'HYDRATE'; state: ExamSessionState };

export function examSessionReducer(state: ExamSessionState, action: ExamSessionAction): ExamSessionState {
  // HYDRATE bypasses the immutability guard below on purpose — it's how
  // useExamSession restores a session (fresh or resumed, in_progress or
  // already submitted) after the async storage read completes; it's not a
  // normal in-exam action a screen ever dispatches mid-session.
  if (action.type === 'HYDRATE') return action.state;

  // A submitted exam is immutable — no further mutation of any kind.
  if (state.status === 'submitted') return state;

  const question = state.questions[state.currentIndex];

  switch (action.type) {
    case 'SELECT_SINGLE': {
      if (!question || question.type !== 'single') return state;
      return setDraft(state, question.id, { type: 'single', label: action.label });
    }
    case 'TOGGLE_SATA': {
      if (!question || question.type !== 'sata') return state;
      const current = state.answers[question.id];
      const currentLabels = current?.type === 'sata' ? current.labels : [];
      const next = currentLabels.includes(action.label)
        ? currentLabels.filter((l) => l !== action.label)
        : [...currentLabels, action.label];
      return setDraft(state, question.id, { type: 'sata', labels: next });
    }
    case 'SET_NUMERIC': {
      if (!question || question.type !== 'numeric') return state;
      return setDraft(state, question.id, { type: 'numeric', text: action.text });
    }
    case 'NEXT':
      return { ...state, currentIndex: Math.min(state.currentIndex + 1, state.questions.length - 1) };
    case 'PREVIOUS':
      return { ...state, currentIndex: Math.max(state.currentIndex - 1, 0) };
    case 'JUMP_TO': {
      const clamped = Math.max(0, Math.min(action.index, state.questions.length - 1));
      return { ...state, currentIndex: clamped };
    }
    case 'TOGGLE_FLAG': {
      if (!question) return state;
      const isFlagged = state.flaggedQuestionIds.includes(question.id);
      return {
        ...state,
        flaggedQuestionIds: isFlagged
          ? state.flaggedQuestionIds.filter((id) => id !== question.id)
          : [...state.flaggedQuestionIds, question.id],
      };
    }
    case 'SUBMIT_EXAM':
      return { ...state, status: 'submitted', submittedAt: action.now.toISOString() };
    default:
      return state;
  }
}

function setDraft(state: ExamSessionState, questionId: string, draft: AttemptAnswer): ExamSessionState {
  return { ...state, answers: { ...state.answers, [questionId]: draft } };
}

export function getCurrentQuestion(state: ExamSessionState): Question | undefined {
  return state.questions[state.currentIndex];
}

export function getDraftFor(state: ExamSessionState, question: Question): AttemptAnswer {
  return state.answers[question.id] ?? emptyDraftFor(question);
}

export function isQuestionAnswered(state: ExamSessionState, question: Question): boolean {
  const draft = state.answers[question.id];
  return draft !== undefined && isAnswerable(question, draft);
}

export function isQuestionFlagged(state: ExamSessionState, question: Question): boolean {
  return state.flaggedQuestionIds.includes(question.id);
}

export function isQuestionCorrect(state: ExamSessionState, question: Question): boolean {
  const draft = state.answers[question.id];
  if (draft === undefined || !isAnswerable(question, draft)) return false;
  return scoreQuestion(question, draft);
}

export type PaletteEntry = {
  index: number;
  questionId: string;
  isAnswered: boolean;
  isFlagged: boolean;
  isCurrent: boolean;
};

/** Palette state for all 225 questions — answered/flagged/current are independent, not mutually exclusive. */
export function getPaletteEntries(state: ExamSessionState): PaletteEntry[] {
  return state.questions.map((question, index) => ({
    index,
    questionId: question.id,
    isAnswered: isQuestionAnswered(state, question),
    isFlagged: isQuestionFlagged(state, question),
    isCurrent: index === state.currentIndex,
  }));
}

export function canGoNext(state: ExamSessionState): boolean {
  return state.currentIndex < state.questions.length - 1;
}

export function canGoPrevious(state: ExamSessionState): boolean {
  return state.currentIndex > 0;
}

export function answeredCount(state: ExamSessionState): number {
  return state.questions.filter((q) => isQuestionAnswered(state, q)).length;
}

/**
 * Remaining seconds, derived from the wall-clock anchor rather than a
 * ticking counter that could be paused by backgrounding/killing the app —
 * this is what makes "continue after app restarts" and "persist safely"
 * true for free: only `startedAt` needs to ever be written, once, at exam
 * start. `elapsed` is clamped to >= 0 so rolling the device clock
 * *backward* can't manufacture extra time — see
 * docs/M6_IMPLEMENTATION_NOTES.md's Timer section for exactly what this
 * does and doesn't defend against ("where practical" — full tamper-
 * resistance needs a server, which a fully offline app doesn't have).
 */
export function computeRemainingSeconds(startedAt: string, durationSeconds: number, now: Date): number {
  const elapsedMs = Math.max(0, now.getTime() - new Date(startedAt).getTime());
  const remaining = durationSeconds - Math.floor(elapsedMs / 1000);
  return Math.max(0, remaining);
}

export function isExpired(startedAt: string, durationSeconds: number, now: Date): boolean {
  return computeRemainingSeconds(startedAt, durationSeconds, now) <= 0;
}
