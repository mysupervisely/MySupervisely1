import {
  answeredCount,
  canGoNext,
  canGoPrevious,
  computeRemainingSeconds,
  createExamSession,
  examSessionReducer,
  fromPersisted,
  getCurrentQuestion,
  getPaletteEntries,
  isExpired,
  isQuestionAnswered,
  isQuestionCorrect,
  isQuestionFlagged,
  toPersisted,
  EXAM_DURATION_SECONDS,
  type ExamSessionState,
} from './examSession';
import type { NumericQuestion, SataQuestion, SingleAnswerQuestion } from '../models/question';

const q1: SingleAnswerQuestion = {
  id: 'exam-1-0',
  type: 'single',
  stem: 'stem1',
  rationale: 'r1',
  domain: 1,
  systemKey: 'cardio',
  topicLabel: 'Cardiovascular',
  source: { kind: 'exam', examNumber: 1, slot: 0 },
  options: [
    { label: 'A', text: 'a' },
    { label: 'B', text: 'b' },
  ],
  correctLabel: 'B',
};

const q2: SataQuestion = {
  id: 'exam-1-1',
  type: 'sata',
  stem: 'stem2',
  rationale: 'r2',
  domain: 3,
  systemKey: 'derm',
  topicLabel: 'Dermatology',
  source: { kind: 'exam', examNumber: 1, slot: 1 },
  options: [
    { label: 'A', text: 'a' },
    { label: 'B', text: 'b' },
    { label: 'C', text: 'c' },
  ],
  correctLabels: ['A', 'C'],
};

const q3: NumericQuestion = {
  id: 'exam-1-2',
  type: 'numeric',
  stem: 'stem3',
  rationale: 'r3',
  domain: 1,
  systemKey: 'calc',
  topicLabel: 'Calculations Toolkit',
  source: { kind: 'exam', examNumber: 1, slot: 2 },
  correctValue: 10,
  tolerance: 0.5,
};

const START = new Date(2026, 0, 1, 8, 0, 0);

function initState(): ExamSessionState {
  return createExamSession(1, [q1, q2, q3], START);
}

describe('createExamSession', () => {
  test('starts in_progress, at question 0, with the real 6-hour duration', () => {
    const state = initState();
    expect(state.status).toBe('in_progress');
    expect(state.currentIndex).toBe(0);
    expect(state.durationSeconds).toBe(EXAM_DURATION_SECONDS);
    expect(state.durationSeconds).toBe(6 * 60 * 60);
    expect(state.answers).toEqual({});
    expect(state.flaggedQuestionIds).toEqual([]);
  });
});

describe('examSessionReducer — answer capture', () => {
  test('single: selecting sets the draft for the current question', () => {
    const state = examSessionReducer(initState(), { type: 'SELECT_SINGLE', label: 'A' });
    expect(state.answers['exam-1-0']).toEqual({ type: 'single', label: 'A' });
  });

  test('single: an exam question can be RE-selected any number of times before submission (no locking)', () => {
    let state = initState();
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'A' });
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'B' });
    expect(state.answers['exam-1-0']).toEqual({ type: 'single', label: 'B' });
  });

  test('sata: toggling accumulates and removes', () => {
    let state = examSessionReducer(initState(), { type: 'NEXT' }); // -> q2 (sata)
    state = examSessionReducer(state, { type: 'TOGGLE_SATA', label: 'A' });
    state = examSessionReducer(state, { type: 'TOGGLE_SATA', label: 'C' });
    expect(state.answers['exam-1-1']).toEqual({ type: 'sata', labels: ['A', 'C'] });
    state = examSessionReducer(state, { type: 'TOGGLE_SATA', label: 'A' });
    expect(state.answers['exam-1-1']).toEqual({ type: 'sata', labels: ['C'] });
  });

  test('numeric: sets the draft text', () => {
    let state = examSessionReducer(initState(), { type: 'JUMP_TO', index: 2 });
    state = examSessionReducer(state, { type: 'SET_NUMERIC', text: '10.2' });
    expect(state.answers['exam-1-2']).toEqual({ type: 'numeric', text: '10.2' });
  });

  test('answers for OTHER questions are untouched by an action on the current one', () => {
    let state = initState();
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'A' });
    state = examSessionReducer(state, { type: 'NEXT' });
    state = examSessionReducer(state, { type: 'TOGGLE_SATA', label: 'A' });
    expect(state.answers['exam-1-0']).toEqual({ type: 'single', label: 'A' });
    expect(state.answers['exam-1-1']).toEqual({ type: 'sata', labels: ['A'] });
  });
});

describe('examSessionReducer — navigation', () => {
  test('NEXT/PREVIOUS clamp at the bounds', () => {
    let state = initState();
    state = examSessionReducer(state, { type: 'PREVIOUS' }); // already at 0
    expect(state.currentIndex).toBe(0);
    state = examSessionReducer(state, { type: 'NEXT' });
    state = examSessionReducer(state, { type: 'NEXT' });
    state = examSessionReducer(state, { type: 'NEXT' }); // already at the last question (index 2)
    expect(state.currentIndex).toBe(2);
  });

  test('JUMP_TO moves directly to any index and clamps out-of-range values', () => {
    let state = examSessionReducer(initState(), { type: 'JUMP_TO', index: 2 });
    expect(state.currentIndex).toBe(2);
    state = examSessionReducer(state, { type: 'JUMP_TO', index: 999 });
    expect(state.currentIndex).toBe(2); // clamped to the last valid index
    state = examSessionReducer(state, { type: 'JUMP_TO', index: -5 });
    expect(state.currentIndex).toBe(0);
  });

  test('canGoNext/canGoPrevious reflect the bounds', () => {
    const state = initState();
    expect(canGoPrevious(state)).toBe(false);
    expect(canGoNext(state)).toBe(true);
  });
});

describe('examSessionReducer — flag for review', () => {
  test('TOGGLE_FLAG flags and unflags the CURRENT question', () => {
    let state = initState();
    state = examSessionReducer(state, { type: 'TOGGLE_FLAG' });
    expect(isQuestionFlagged(state, q1)).toBe(true);
    state = examSessionReducer(state, { type: 'TOGGLE_FLAG' });
    expect(isQuestionFlagged(state, q1)).toBe(false);
  });

  test('flags persist independently across multiple questions', () => {
    let state = initState();
    state = examSessionReducer(state, { type: 'TOGGLE_FLAG' }); // flag q1
    state = examSessionReducer(state, { type: 'NEXT' });
    state = examSessionReducer(state, { type: 'TOGGLE_FLAG' }); // flag q2
    expect(state.flaggedQuestionIds.sort()).toEqual(['exam-1-0', 'exam-1-1']);
  });

  test('flagging is independent of answering — a flagged question can be answered or not', () => {
    let state = initState();
    state = examSessionReducer(state, { type: 'TOGGLE_FLAG' });
    expect(isQuestionFlagged(state, q1)).toBe(true);
    expect(isQuestionAnswered(state, q1)).toBe(false);
  });
});

describe('examSessionReducer — submission', () => {
  test('SUBMIT_EXAM flips status and records submittedAt', () => {
    const now = new Date(2026, 0, 1, 10, 0, 0);
    const state = examSessionReducer(initState(), { type: 'SUBMIT_EXAM', now });
    expect(state.status).toBe('submitted');
    expect(state.submittedAt).toBe(now.toISOString());
  });

  test('a submitted exam is fully immutable — no further answers, navigation, or flags', () => {
    const now = new Date(2026, 0, 1, 10, 0, 0);
    let state = examSessionReducer(initState(), { type: 'SUBMIT_EXAM', now });
    const frozen = state;

    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'A' });
    expect(state).toEqual(frozen);
    state = examSessionReducer(state, { type: 'NEXT' });
    expect(state).toEqual(frozen);
    state = examSessionReducer(state, { type: 'TOGGLE_FLAG' });
    expect(state).toEqual(frozen);
    state = examSessionReducer(state, { type: 'JUMP_TO', index: 1 });
    expect(state).toEqual(frozen);
  });
});

describe('isQuestionAnswered / isQuestionCorrect', () => {
  test('an untouched question is unanswered', () => {
    expect(isQuestionAnswered(initState(), q1)).toBe(false);
  });

  test('a blank draft (selected then cleared) is still unanswered', () => {
    let state = examSessionReducer(initState(), { type: 'SELECT_SINGLE', label: 'A' });
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: '' });
    expect(isQuestionAnswered(state, q1)).toBe(false);
  });

  test('isQuestionCorrect reflects real scoring, live (not just at submission)', () => {
    let state = examSessionReducer(initState(), { type: 'SELECT_SINGLE', label: 'B' }); // correct
    expect(isQuestionCorrect(state, q1)).toBe(true);
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'A' }); // now wrong
    expect(isQuestionCorrect(state, q1)).toBe(false);
  });
});

describe('getPaletteEntries', () => {
  test('reflects answered/flagged/current independently for all questions, in order', () => {
    let state = initState();
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'A' }); // answer q1
    state = examSessionReducer(state, { type: 'TOGGLE_FLAG' }); // flag q1 too — independent, not mutually exclusive
    state = examSessionReducer(state, { type: 'JUMP_TO', index: 2 }); // move to q3

    const entries = getPaletteEntries(state);
    expect(entries).toHaveLength(3);
    expect(entries[0]).toEqual({
      index: 0,
      questionId: 'exam-1-0',
      isAnswered: true,
      isFlagged: true,
      isCurrent: false,
    });
    expect(entries[1]).toMatchObject({ isAnswered: false, isFlagged: false, isCurrent: false });
    expect(entries[2]).toMatchObject({ isAnswered: false, isFlagged: false, isCurrent: true });
  });
});

describe('answeredCount', () => {
  test('counts only real, answerable drafts across the whole exam', () => {
    let state = initState();
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'A' });
    state = examSessionReducer(state, { type: 'NEXT' });
    state = examSessionReducer(state, { type: 'TOGGLE_SATA', label: 'A' });
    // q3 left untouched
    expect(answeredCount(state)).toBe(2);
  });
});

describe('computeRemainingSeconds — timer behavior', () => {
  test('at the start, remaining equals the full duration', () => {
    expect(computeRemainingSeconds(START.toISOString(), EXAM_DURATION_SECONDS, START)).toBe(
      EXAM_DURATION_SECONDS
    );
  });

  test('counts down as time passes', () => {
    const oneHourLater = new Date(START.getTime() + 60 * 60 * 1000);
    expect(computeRemainingSeconds(START.toISOString(), EXAM_DURATION_SECONDS, oneHourLater)).toBe(
      EXAM_DURATION_SECONDS - 60 * 60
    );
  });

  test('reaches exactly 0 at the duration boundary, not negative', () => {
    const exactlyAtLimit = new Date(START.getTime() + EXAM_DURATION_SECONDS * 1000);
    expect(computeRemainingSeconds(START.toISOString(), EXAM_DURATION_SECONDS, exactlyAtLimit)).toBe(0);
  });

  test('never goes negative past the duration', () => {
    const wayPast = new Date(START.getTime() + (EXAM_DURATION_SECONDS + 3600) * 1000);
    expect(computeRemainingSeconds(START.toISOString(), EXAM_DURATION_SECONDS, wayPast)).toBe(0);
  });

  test('rolling the clock BACKWARD cannot manufacture extra time (elapsed clamped to >= 0)', () => {
    const beforeStart = new Date(START.getTime() - 60 * 60 * 1000); // "now" an hour before the exam even started
    expect(computeRemainingSeconds(START.toISOString(), EXAM_DURATION_SECONDS, beforeStart)).toBe(
      EXAM_DURATION_SECONDS
    );
  });

  test('survives an "app restart" — remaining is derived purely from startedAt + now, with no other state', () => {
    // Simulates: exam started, app was killed, reopened 2 hours later — the
    // only thing that had to persist was the startedAt anchor.
    const reopenedTwoHoursLater = new Date(START.getTime() + 2 * 60 * 60 * 1000);
    const remaining = computeRemainingSeconds(START.toISOString(), EXAM_DURATION_SECONDS, reopenedTwoHoursLater);
    expect(remaining).toBe(EXAM_DURATION_SECONDS - 2 * 60 * 60);
  });
});

describe('isExpired', () => {
  test('not expired at the start or mid-exam', () => {
    expect(isExpired(START.toISOString(), EXAM_DURATION_SECONDS, START)).toBe(false);
  });

  test('expired exactly at and after the duration boundary', () => {
    const atLimit = new Date(START.getTime() + EXAM_DURATION_SECONDS * 1000);
    const pastLimit = new Date(START.getTime() + (EXAM_DURATION_SECONDS + 1) * 1000);
    expect(isExpired(START.toISOString(), EXAM_DURATION_SECONDS, atLimit)).toBe(true);
    expect(isExpired(START.toISOString(), EXAM_DURATION_SECONDS, pastLimit)).toBe(true);
  });
});

describe('toPersisted / fromPersisted — resume round-trip', () => {
  test('toPersisted strips the questions array; fromPersisted restores a working state with it re-supplied', () => {
    let state = initState();
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'B' });
    state = examSessionReducer(state, { type: 'TOGGLE_FLAG' });
    state = examSessionReducer(state, { type: 'NEXT' });

    const persisted = toPersisted(state);
    expect(persisted).not.toHaveProperty('questions');
    expect(persisted.currentIndex).toBe(1);
    expect(persisted.answers['exam-1-0']).toEqual({ type: 'single', label: 'B' });
    expect(persisted.flaggedQuestionIds).toEqual(['exam-1-0']);

    const restored = fromPersisted(persisted, [q1, q2, q3]);
    expect(getCurrentQuestion(restored)?.id).toBe('exam-1-1');
    expect(isQuestionAnswered(restored, q1)).toBe(true);
    expect(isQuestionFlagged(restored, q1)).toBe(true);
  });
});

describe('examSessionReducer — HYDRATE', () => {
  test('replaces the entire state wholesale, bypassing the submitted-immutability guard', () => {
    const submittedElsewhere: ExamSessionState = {
      ...initState(),
      status: 'submitted',
      submittedAt: new Date(2026, 0, 1, 12, 0, 0).toISOString(),
    };
    // Dispatched against a completely different (fresh) state — HYDRATE
    // doesn't merge, it replaces, which is exactly what "restore from
    // storage" needs.
    const state = examSessionReducer(initState(), { type: 'HYDRATE', state: submittedElsewhere });
    expect(state).toEqual(submittedElsewhere);
  });
});
