import { computeExamResult } from './examResultService';
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
    expect(domain1).toEqual({ domain: 1, total: 2, correct: 1, accuracyPct: 100 }); // 1/1 answered
    expect(domain3).toEqual({ domain: 3, total: 2, correct: 0, accuracyPct: 0 }); // 0/1 answered
    // Domains with zero questions in this exam still appear, with a null accuracy.
    const domain5 = result.domainBreakdown.find((d) => d.domain === 5);
    expect(domain5).toEqual({ domain: 5, total: 0, correct: 0, accuracyPct: null });
  });

  test('system breakdown aggregates correctly and independently per system, sorted by key', () => {
    let state = createExamSession(1, [q1, q2, q3, q4], START);
    state = examSessionReducer(state, { type: 'SELECT_SINGLE', label: 'B' }); // q1 (cardio) correct

    const result = computeExamResult(state, 'result-1');
    const cardio = result.systemBreakdown.find((s) => s.systemKey === 'cardio');
    const derm = result.systemBreakdown.find((s) => s.systemKey === 'derm');
    expect(cardio).toEqual({ systemKey: 'cardio', total: 2, correct: 1, accuracyPct: 100 });
    expect(derm).toEqual({ systemKey: 'derm', total: 2, correct: 0, accuracyPct: null }); // 0 answered in derm
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
});
