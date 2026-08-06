import {
  buildResumeState,
  canGoNext,
  canGoPrevious,
  createInitialEngineState,
  emptyDraftFor,
  getCurrentAttempt,
  getCurrentQuestion,
  questionEngineReducer,
  type EngineState,
} from './questionEngine';
import type { NumericQuestion, SataQuestion, SingleAnswerQuestion } from '../models/question';
import type { Attempt } from '../models/attempt';

const single: SingleAnswerQuestion = {
  id: 'q-single',
  type: 'single',
  stem: 'stem',
  rationale: 'rationale',
  domain: 1,
  systemKey: 'cardio',
  topicLabel: 'Cardiovascular',
  source: { kind: 'qbank', index: 0 },
  options: [
    { label: 'A', text: 'a' },
    { label: 'B', text: 'b' },
  ],
  correctLabel: 'B',
};

const sata: SataQuestion = {
  id: 'q-sata',
  type: 'sata',
  stem: 'stem',
  rationale: 'rationale',
  domain: 3,
  systemKey: 'derm',
  topicLabel: 'Dermatology',
  source: { kind: 'qbank', index: 1 },
  options: [
    { label: 'A', text: 'a' },
    { label: 'B', text: 'b' },
    { label: 'C', text: 'c' },
  ],
  correctLabels: ['A', 'C'],
};

const numeric: NumericQuestion = {
  id: 'q-numeric',
  type: 'numeric',
  stem: 'stem',
  rationale: 'rationale',
  domain: 1,
  systemKey: 'calc',
  topicLabel: 'Calculations Toolkit',
  source: { kind: 'qbank', index: 2 },
  correctValue: 10,
  tolerance: 0.5,
};

function initState(): EngineState {
  return createInitialEngineState([single, sata, numeric]);
}

describe('questionEngineReducer — single-answer flow', () => {
  test('selecting an option stores a draft, unsubmitted', () => {
    const state = questionEngineReducer(initState(), { type: 'SELECT_SINGLE', label: 'A' });
    const attempt = getCurrentAttempt(state);
    expect(attempt?.status).toBe('unanswered');
    expect(attempt?.draft).toEqual({ type: 'single', label: 'A' });
  });

  test('submit locks the answer and scores it', () => {
    let state = initState();
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: 'B' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    const attempt = getCurrentAttempt(state);
    expect(attempt?.status).toBe('submitted');
    expect(attempt?.isCorrect).toBe(true);
    expect(attempt?.submittedAnswer).toEqual({ type: 'single', label: 'B' });
  });

  test('an incorrect submission is scored as incorrect, not silently dropped', () => {
    let state = initState();
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: 'A' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    expect(getCurrentAttempt(state)?.isCorrect).toBe(false);
  });

  test('selecting a different option after submit is a no-op (locked)', () => {
    let state = initState();
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: 'B' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    const beforeRetry = getCurrentAttempt(state);
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: 'A' });
    expect(getCurrentAttempt(state)).toEqual(beforeRetry);
  });

  test('submitting twice is a no-op the second time', () => {
    let state = initState();
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: 'B' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    const first = getCurrentAttempt(state);
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    expect(getCurrentAttempt(state)).toEqual(first);
  });

  test('submitting with no draft yet is a no-op (nothing to score)', () => {
    const state = questionEngineReducer(initState(), { type: 'SUBMIT' });
    expect(getCurrentAttempt(state)).toBeUndefined();
  });

  test('submitting a blank/unanswerable draft is a no-op, not a locked-in incorrect answer', () => {
    let state = initState();
    // Select then immediately clear back to blank, as if the user typed
    // and deleted — draft exists (status stays 'unanswered') but is empty.
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: 'A' });
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: '' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    expect(getCurrentAttempt(state)?.status).toBe('unanswered');
  });
});

describe('questionEngineReducer — SATA flow', () => {
  function goToSata(): EngineState {
    return questionEngineReducer(initState(), { type: 'NEXT' }); // index 1 = sata
  }

  test('toggling accumulates a label set', () => {
    let state = goToSata();
    state = questionEngineReducer(state, { type: 'TOGGLE_SATA', label: 'A' });
    state = questionEngineReducer(state, { type: 'TOGGLE_SATA', label: 'C' });
    expect(getCurrentAttempt(state)?.draft).toEqual({ type: 'sata', labels: ['A', 'C'] });
  });

  test('toggling the same label twice removes it', () => {
    let state = goToSata();
    state = questionEngineReducer(state, { type: 'TOGGLE_SATA', label: 'A' });
    state = questionEngineReducer(state, { type: 'TOGGLE_SATA', label: 'A' });
    expect(getCurrentAttempt(state)?.draft).toEqual({ type: 'sata', labels: [] });
  });

  test('exact-set submission scores correct regardless of toggle order', () => {
    let state = goToSata();
    state = questionEngineReducer(state, { type: 'TOGGLE_SATA', label: 'C' });
    state = questionEngineReducer(state, { type: 'TOGGLE_SATA', label: 'A' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    expect(getCurrentAttempt(state)?.isCorrect).toBe(true);
  });

  test('a partial selection scores incorrect', () => {
    let state = goToSata();
    state = questionEngineReducer(state, { type: 'TOGGLE_SATA', label: 'A' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    expect(getCurrentAttempt(state)?.isCorrect).toBe(false);
  });
});

describe('questionEngineReducer — numeric flow', () => {
  function goToNumeric(): EngineState {
    let state = initState();
    state = questionEngineReducer(state, { type: 'NEXT' });
    state = questionEngineReducer(state, { type: 'NEXT' }); // index 2 = numeric
    return state;
  }

  test('within tolerance scores correct', () => {
    let state = goToNumeric();
    state = questionEngineReducer(state, { type: 'SET_NUMERIC', text: '10.3' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    expect(getCurrentAttempt(state)?.isCorrect).toBe(true);
  });

  test('outside tolerance scores incorrect', () => {
    let state = goToNumeric();
    state = questionEngineReducer(state, { type: 'SET_NUMERIC', text: '11' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    expect(getCurrentAttempt(state)?.isCorrect).toBe(false);
  });

  test('typing after submit does not change the locked draft', () => {
    let state = goToNumeric();
    state = questionEngineReducer(state, { type: 'SET_NUMERIC', text: '10' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    const locked = getCurrentAttempt(state);
    state = questionEngineReducer(state, { type: 'SET_NUMERIC', text: '999' });
    expect(getCurrentAttempt(state)).toEqual(locked);
  });
});

describe('questionEngineReducer — navigation', () => {
  test('NEXT/PREVIOUS move the current index and clamp at the bounds', () => {
    let state = initState();
    expect(getCurrentQuestion(state)?.id).toBe('q-single');
    state = questionEngineReducer(state, { type: 'PREVIOUS' }); // already at 0
    expect(state.currentIndex).toBe(0);

    state = questionEngineReducer(state, { type: 'NEXT' });
    state = questionEngineReducer(state, { type: 'NEXT' });
    expect(getCurrentQuestion(state)?.id).toBe('q-numeric');
    state = questionEngineReducer(state, { type: 'NEXT' }); // already at the last question
    expect(state.currentIndex).toBe(2);

    state = questionEngineReducer(state, { type: 'PREVIOUS' });
    expect(getCurrentQuestion(state)?.id).toBe('q-sata');
  });

  test('canGoNext/canGoPrevious reflect the bounds', () => {
    const state = initState();
    expect(canGoPrevious(state)).toBe(false);
    expect(canGoNext(state)).toBe(true);
  });

  test('answers persist across navigation — revisiting a question shows its locked state', () => {
    let state = initState();
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: 'B' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    state = questionEngineReducer(state, { type: 'NEXT' });
    state = questionEngineReducer(state, { type: 'PREVIOUS' });
    const attempt = getCurrentAttempt(state);
    expect(attempt?.status).toBe('submitted');
    expect(attempt?.isCorrect).toBe(true);
  });
});

describe('questionEngineReducer — HYDRATE (resume support)', () => {
  test('restores the current index and previously-recorded answers', () => {
    const seedAnswers = {
      'q-single': {
        status: 'submitted' as const,
        draft: { type: 'single' as const, label: 'B' },
        submittedAnswer: { type: 'single' as const, label: 'B' },
        isCorrect: true,
      },
    };
    const state = questionEngineReducer(initState(), {
      type: 'HYDRATE',
      currentIndex: 1,
      answers: seedAnswers,
    });
    expect(state.currentIndex).toBe(1);
    expect(state.answers['q-single']).toEqual(seedAnswers['q-single']);
  });
});

describe('emptyDraftFor', () => {
  test('returns the correctly-shaped empty draft per question type', () => {
    expect(emptyDraftFor(single)).toEqual({ type: 'single', label: '' });
    expect(emptyDraftFor(sata)).toEqual({ type: 'sata', labels: [] });
    expect(emptyDraftFor(numeric)).toEqual({ type: 'numeric', text: '' });
  });
});

function makeAttempt(overrides: Partial<Attempt>): Attempt {
  return {
    id: 'attempt-1',
    questionId: 'q-single',
    systemKey: 'cardio',
    domain: 1,
    questionType: 'single',
    answer: { type: 'single', label: 'B' },
    isCorrect: true,
    attemptedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildResumeState — real "Resume session" behavior, tested in isolation from React', () => {
  test('a fresh install with no saved index and no attempts resumes at question 0, no locked answers', () => {
    const { currentIndex, answers } = buildResumeState(0, [], 3);
    expect(currentIndex).toBe(0);
    expect(answers).toEqual({});
  });

  test('restores the saved index', () => {
    const { currentIndex } = buildResumeState(47, [], 100);
    expect(currentIndex).toBe(47);
  });

  test('clamps a saved index that is now out of range (e.g. content shrank)', () => {
    expect(buildResumeState(999, [], 10).currentIndex).toBe(9);
    expect(buildResumeState(-5, [], 10).currentIndex).toBe(0);
  });

  test('handles an empty question list without dividing by zero / going negative', () => {
    expect(buildResumeState(5, [], 0).currentIndex).toBe(0);
  });

  test('previously-answered questions come back locked, with their recorded correctness', () => {
    const attempts = [
      makeAttempt({ questionId: 'q-single', isCorrect: true, answer: { type: 'single', label: 'B' } }),
    ];
    const { answers } = buildResumeState(0, attempts, 3);
    expect(answers['q-single']).toEqual({
      status: 'submitted',
      draft: { type: 'single', label: 'B' },
      submittedAnswer: { type: 'single', label: 'B' },
      isCorrect: true,
    });
  });

  test('a question with no attempt is absent from the seed map (renders as fresh/unanswered)', () => {
    const attempts = [makeAttempt({ questionId: 'q-single' })];
    const { answers } = buildResumeState(0, attempts, 3);
    expect(answers['q-numeric']).toBeUndefined();
  });

  test('re-answering a question uses the LATEST attempt, not the first one', () => {
    const attempts = [
      makeAttempt({ id: 'a1', attemptedAt: '2026-01-01T00:00:00.000Z', isCorrect: false, answer: { type: 'single', label: 'A' } }),
      makeAttempt({ id: 'a2', attemptedAt: '2026-01-02T00:00:00.000Z', isCorrect: true, answer: { type: 'single', label: 'B' } }),
    ];
    const { answers } = buildResumeState(0, attempts, 3);
    expect(answers['q-single'].isCorrect).toBe(true);
    expect(answers['q-single'].submittedAnswer).toEqual({ type: 'single', label: 'B' });
  });

  test('attempts from many different questions each produce their own seed entry', () => {
    const attempts = [
      makeAttempt({ questionId: 'q-single' }),
      makeAttempt({ id: 'a2', questionId: 'q-sata', questionType: 'sata', answer: { type: 'sata', labels: ['A', 'C'] } }),
      makeAttempt({ id: 'a3', questionId: 'q-numeric', questionType: 'numeric', answer: { type: 'numeric', text: '10' } }),
    ];
    const { answers } = buildResumeState(0, attempts, 3);
    expect(Object.keys(answers).sort()).toEqual(['q-numeric', 'q-sata', 'q-single']);
  });
});
