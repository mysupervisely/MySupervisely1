import { computeExamHistory, computeExamResult, getReviewPaletteEntries } from './examResultService';
import type { ExamResult } from '../models/examResult';
import { createExamSession, examSessionReducer } from './examSession';
import type { NumericQuestion, SataQuestion, SingleAnswerQuestion } from '../models/question';

const q1: SingleAnswerQuestion = {
  id: 'exam-1-0',
  type: 'single',
  stem: 's1',
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
  stem: 's2',
  rationale: 'r2',
  domain: 3,
  systemKey: 'derm',
  topicLabel: 'Dermatology',
  source: { kind: 'exam', examNumber: 1, slot: 1 },
  options: [
    { label: 'A', text: 'a' },
    { label: 'B', text: 'b' },
  ],
  correctLabels: ['A'],
};

const q3: NumericQuestion = {
  id: 'exam-1-2',
  type: 'numeric',
  stem: 's3',
  rationale: 'r3',
  domain: 1,
  systemKey: 'cardio',
  topicLabel: 'Cardiovascular',
  source: { kind: 'exam', examNumber: 1, slot: 2 },
  correctValue: 10,
  tolerance: 0,
};

const q4: SingleAnswerQuestion = {
  id: 'exam-1-3',
  type: 'single',
  stem: 's4',
  rationale: 'r4',
  domain: 3,
  systemKey: 'derm',
  topicLabel: 'Dermatology',
  source: { kind: 'exam', examNumber: 1, slot: 3 },
  options: [
    { label: 'A', text: 'a' },
    { label: 'B', text: 'b' },
  ],
  correctLabel: 'A',
};

const START = new Date(2026, 0, 1, 8, 0, 0);
const SUBMITTED_AT = new Date(2026, 0, 1, 9, 0, 0);

describe('computeExamResult', () => {
  test('unanswered exam: 0 correct, denominators reflect 0 answered / real total', () => {
    const state = createExamSession(1, [q1, q2, q3, q4], START);
    const result = computeExamResult(state, 'result-1');
    expect(result.totalQuestions).toBe(4);
    expect(result.answeredCount).toBe(0);
    expect(result.correctCount).toBe(0);
    expect(result.accuracyPct).toBe(0); // guarded against 0/0
    expect(result.scorePct).toBe(0);
  });

  test('accuracyPct is scored over ANSWERED questions only (the audit-documented rule), not total', () => {
    // Answer 2 of 4, get 1 right, 1 wrong. Accuracy should be 50% (1/2
    // answered), NOT 25% (1/4 total).
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'B' }); // q1 correct
    state = examSessionReducer(state, { type: 'JUMP_TO', index: 1 });
    state = examSessionReducer(state, { type: 'TOGGLE_SATA', label: 'B' }); // q2 wrong (correct is ['A'])
    state = examSessionReducer(state, { type: 'SUBMIT_EXAM', now: SUBMITTED_AT });

    const result = computeExamResult(state, 'result-1');
    expect(result.answeredCount).toBe(2);
    expect(result.correctCount).toBe(1);
    expect(result.accuracyPct).toBe(50); // 1/2 answered
    expect(result.scorePct).toBe(25); // 1/4 of the full exam — the additive "raw score" framing
  });

  test('incorrectQuestionIds lists only answered-and-wrong questions, not unanswered ones', () => {
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'A' }); // q1 wrong (correct is B)
    // q2, q3, q4 left unanswered
    const result = computeExamResult(state, 'result-1');
    expect(result.incorrectQuestionIds).toEqual(['exam-1-0']);
  });

  test('flaggedQuestionIds passes through from the session state, regardless of answered status', () => {
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    state = examSessionReducer(state, { type: 'JUMP_TO', index: 2 });
    state = examSessionReducer(state, { type: 'TOGGLE_FLAG' }); // flag q3, unanswered
    const result = computeExamResult(state, 'result-1');
    expect(result.flaggedQuestionIds).toEqual(['exam-1-2']);
  });

  test('domain breakdown aggregates correctly and independently per domain', () => {
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    // Domain 1: q1 (correct), q3 (unanswered). Domain 3: q2 (wrong), q4 (unanswered).
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'B' }); // q1 correct
    state = examSessionReducer(state, { type: 'JUMP_TO', index: 1 });
    state = examSessionReducer(state, { type: 'TOGGLE_SATA', label: 'B' }); // q2 wrong

    const result = computeExamResult(state, 'result-1');
    const domain1 = result.domainBreakdown.find((d) => d.domain === 1);
    const domain3 = result.domainBreakdown.find((d) => d.domain === 3);
    expect(domain1).toEqual({ domain: 1, total: 2, answered: 1, correct: 1, accuracyPct: 100 }); // 1/1 answered
    expect(domain3).toEqual({ domain: 3, total: 2, answered: 1, correct: 0, accuracyPct: 0 }); // 0/1 answered
    // Domains with zero questions in this exam still appear, with a null accuracy.
    const domain5 = result.domainBreakdown.find((d) => d.domain === 5);
    expect(domain5).toEqual({ domain: 5, total: 0, answered: 0, correct: 0, accuracyPct: null });
  });

  test('system breakdown aggregates correctly and independently per system, sorted by key', () => {
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'B' }); // q1 (cardio) correct

    const result = computeExamResult(state, 'result-1');
    const cardio = result.systemBreakdown.find((s) => s.systemKey === 'cardio');
    const derm = result.systemBreakdown.find((s) => s.systemKey === 'derm');
    expect(cardio).toEqual({ systemKey: 'cardio', total: 2, answered: 1, correct: 1, accuracyPct: 100 });
    expect(derm).toEqual({ systemKey: 'derm', total: 2, answered: 0, correct: 0, accuracyPct: null }); // 0 answered in derm
    expect(result.systemBreakdown.map((s) => s.systemKey)).toEqual(
      [...result.systemBreakdown.map((s) => s.systemKey)].sort()
    );
  });

  test('a fully-answered, fully-correct exam scores 100% on both accuracy and score', () => {
    let state = createExamSession(1, [q1], START);
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'B' });
    const result = computeExamResult(state, 'result-1');
    expect(result.accuracyPct).toBe(100);
    expect(result.scorePct).toBe(100);
  });

  test('M7: incorrectCount and unansweredCount are real counts, not derived on the fly by the caller', () => {
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'A' }); // q1 wrong (correct B)
    // q2, q3, q4 left unanswered
    const result = computeExamResult(state, 'result-1');
    expect(result.incorrectCount).toBe(1);
    expect(result.incorrectCount).toBe(result.incorrectQuestionIds.length); // stays consistent with the existing list
    expect(result.unansweredCount).toBe(3);
    expect(result.answeredCount + result.unansweredCount).toBe(result.totalQuestions);
  });

  test('M7: totalTimeSpentSeconds is the real wall-clock gap between startedAt and submittedAt', () => {
    let state = createExamSession(1, [q1], START); // START = 08:00:00
    state = examSessionReducer(state, { type: 'SUBMIT_EXAM', now: SUBMITTED_AT }); // SUBMITTED_AT = 09:00:00
    const result = computeExamResult(state, 'result-1');
    expect(result.totalTimeSpentSeconds).toBe(60 * 60); // exactly 1 hour
  });

  test('M7: totalTimeSpentSeconds never goes negative even with a corrupt/out-of-order timestamp', () => {
    let state = createExamSession(1, [q1], START);
    const beforeStart = new Date(START.getTime() - 1000);
    state = examSessionReducer(state, { type: 'SUBMIT_EXAM', now: beforeStart });
    const result = computeExamResult(state, 'result-1');
    expect(result.totalTimeSpentSeconds).toBe(0);
  });

  test('M7: averageTimePerQuestionSeconds is totalTimeSpentSeconds spread over the FULL exam length', () => {
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    state = examSessionReducer(state, { type: 'SUBMIT_EXAM', now: SUBMITTED_AT }); // 3600s / 4 questions
    const result = computeExamResult(state, 'result-1');
    expect(result.averageTimePerQuestionSeconds).toBe(900); // 15 minutes/question
  });

  test('M7: questionAnswers snapshots every question in slot order, with the right shape per state', () => {
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'B' }); // q1: answered, correct
    state = examSessionReducer(state, { type: 'TOGGLE_FLAG' }); // q1 also flagged
    state = examSessionReducer(state, { type: 'JUMP_TO', index: 1 });
    state = examSessionReducer(state, { type: 'TOGGLE_SATA', label: 'B' }); // q2: answered, wrong
    // q3, q4 left untouched (unanswered)

    const result = computeExamResult(state, 'result-1');
    expect(result.questionAnswers).toHaveLength(4);
    expect(result.questionAnswers.map((qa) => qa.questionId)).toEqual([
      'exam-1-0',
      'exam-1-1',
      'exam-1-2',
      'exam-1-3',
    ]);

    expect(result.questionAnswers[0]).toEqual({
      questionId: 'exam-1-0',
      answer: { type: 'single', label: 'B' },
      isAnswered: true,
      isCorrect: true,
      isFlagged: true,
    });
    expect(result.questionAnswers[1]).toEqual({
      questionId: 'exam-1-1',
      answer: { type: 'sata', labels: ['B'] },
      isAnswered: true,
      isCorrect: false,
      isFlagged: false,
    });
    expect(result.questionAnswers[2]).toEqual({
      questionId: 'exam-1-2',
      isAnswered: false,
      isCorrect: false,
      isFlagged: false,
    });
    expect(result.questionAnswers[2]).not.toHaveProperty('answer');
  });
});

describe('getReviewPaletteEntries', () => {
  test('M7.3: marks answered-and-wrong questions isIncorrect, leaves unanswered/correct ones false', () => {
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'B' }); // q1: correct
    state = examSessionReducer(state, { type: 'JUMP_TO', index: 1 });
    state = examSessionReducer(state, { type: 'TOGGLE_SATA', label: 'B' }); // q2: wrong
    // q3, q4 left unanswered
    const result = computeExamResult(state, 'result-1');

    const entries = getReviewPaletteEntries(result, 0);
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({ isAnswered: true, isIncorrect: false }); // q1: answered, correct
    expect(entries[1]).toMatchObject({ isAnswered: true, isIncorrect: true }); // q2: answered, wrong
    expect(entries[2]).toMatchObject({ isAnswered: false, isIncorrect: false }); // q3: never answered, not "incorrect"
    expect(entries[3]).toMatchObject({ isAnswered: false, isIncorrect: false });
  });

  test('M7.3: isCurrent reflects the selectedIndex argument, not any live session state', () => {
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    state = examSessionReducer(state, { type: 'SUBMIT_EXAM', now: SUBMITTED_AT });
    const result = computeExamResult(state, 'result-1');

    const entries = getReviewPaletteEntries(result, 2);
    expect(entries.map((e) => e.isCurrent)).toEqual([false, false, true, false]);
  });

  test('M7.3: carries isFlagged through from the stored result, independent of answered/correct status', () => {
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    state = examSessionReducer(state, { type: 'JUMP_TO', index: 2 });
    state = examSessionReducer(state, { type: 'TOGGLE_FLAG' }); // flag q3, unanswered
    const result = computeExamResult(state, 'result-1');

    const entries = getReviewPaletteEntries(result, 0);
    expect(entries[2]).toMatchObject({ isFlagged: true, isAnswered: false });
  });
});

function makeHistoryResult(overrides: Partial<ExamResult>): ExamResult {
  return {
    id: `result-${Math.random().toString(36).slice(2)}`,
    examNumber: 1,
    submittedAt: '2026-01-01T09:00:00.000Z',
    totalQuestions: 225,
    answeredCount: 200,
    correctCount: 150,
    incorrectCount: 50,
    unansweredCount: 25,
    accuracyPct: 75,
    scorePct: 67,
    totalTimeSpentSeconds: 14400,
    averageTimePerQuestionSeconds: 64,
    domainBreakdown: [],
    systemBreakdown: [],
    flaggedQuestionIds: [],
    incorrectQuestionIds: [],
    questionAnswers: [],
    ...overrides,
  };
}

describe('computeExamHistory', () => {
  test('a single attempt has a null improvementDeltaPct — nothing to compare against yet', () => {
    const results = [makeHistoryResult({ id: 'r1', examNumber: 1, accuracyPct: 60 })];
    const history = computeExamHistory(results);
    expect(history).toEqual([{ result: results[0], improvementDeltaPct: null }]);
  });

  test('improvementDeltaPct compares against the PREVIOUS attempt of the SAME exam number only', () => {
    const results = [
      makeHistoryResult({ id: 'r1', examNumber: 1, submittedAt: '2026-01-01T09:00:00.000Z', accuracyPct: 50 }),
      makeHistoryResult({ id: 'r2', examNumber: 2, submittedAt: '2026-01-02T09:00:00.000Z', accuracyPct: 90 }), // different exam — no relation to r1
      makeHistoryResult({ id: 'r3', examNumber: 1, submittedAt: '2026-01-03T09:00:00.000Z', accuracyPct: 65 }), // retake of exam 1
    ];
    const history = computeExamHistory(results);
    const r3Entry = history.find((e) => e.result.id === 'r3');
    const r2Entry = history.find((e) => e.result.id === 'r2');
    expect(r3Entry?.improvementDeltaPct).toBe(15); // 65 - 50, vs r1 (same exam), not r2
    expect(r2Entry?.improvementDeltaPct).toBeNull(); // exam 2's first attempt
  });

  test('is sorted most-recent-first regardless of input order', () => {
    const results = [
      makeHistoryResult({ id: 'newest', submittedAt: '2026-01-05T09:00:00.000Z' }),
      makeHistoryResult({ id: 'oldest', submittedAt: '2026-01-01T09:00:00.000Z' }),
      makeHistoryResult({ id: 'middle', submittedAt: '2026-01-03T09:00:00.000Z' }),
    ];
    const history = computeExamHistory(results);
    expect(history.map((e) => e.result.id)).toEqual(['newest', 'middle', 'oldest']);
  });

  test('a negative delta reflects a real score drop between attempts of the same exam', () => {
    const results = [
      makeHistoryResult({ id: 'r1', examNumber: 1, submittedAt: '2026-01-01T09:00:00.000Z', accuracyPct: 80 }),
      makeHistoryResult({ id: 'r2', examNumber: 1, submittedAt: '2026-01-02T09:00:00.000Z', accuracyPct: 70 }),
    ];
    const history = computeExamHistory(results);
    expect(history.find((e) => e.result.id === 'r2')?.improvementDeltaPct).toBe(-10);
  });

  test('empty input returns empty history, not an error', () => {
    expect(computeExamHistory([])).toEqual([]);
  });
});
