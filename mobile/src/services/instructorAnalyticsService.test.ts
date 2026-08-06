import {
  computeLocalStudentAnalyticsSnapshot,
  computeStudentAnalyticsSnapshot,
  LOCAL_STUDENT_ID,
} from './instructorAnalyticsService';
import { analyticsConfig } from '../constants/analyticsConfig';
import type { Attempt } from '../models/attempt';
import type { ExamResult } from '../models/examResult';

function makeAttempt(overrides: Partial<Attempt>): Attempt {
  return {
    id: `attempt-${Math.random().toString(36).slice(2)}`,
    questionId: `qbank-${Math.random().toString(36).slice(2)}`,
    systemKey: 'cardio',
    domain: 1,
    questionType: 'single',
    answer: { type: 'single', label: 'A' },
    isCorrect: true,
    attemptedAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
  };
}

function makeExamResult(overrides: Partial<ExamResult> = {}): ExamResult {
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
    scorePct: 60,
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

describe('computeStudentAnalyticsSnapshot', () => {
  test('a brand-new student has zero/null values, never fabricated activity', () => {
    const snapshot = computeStudentAnalyticsSnapshot('student-1', [], []);
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      studentId: 'student-1',
      examsCompleted: 0,
      averageScorePct: null,
      weakDomains: [],
      questionVolume: 0,
      lastActivityAt: null,
    });
    expect(typeof snapshot.generatedAt).toBe('string');
  });

  test('examsCompleted counts every stored exam result, including retakes', () => {
    const examResults = [
      makeExamResult({ examNumber: 1, submittedAt: '2026-01-01T09:00:00.000Z' }),
      makeExamResult({ examNumber: 1, submittedAt: '2026-01-05T09:00:00.000Z' }), // retake, still counted
    ];
    expect(computeStudentAnalyticsSnapshot('s1', [], examResults).examsCompleted).toBe(2);
  });

  test('averageScorePct is the mean scorePct across all stored exam results', () => {
    const examResults = [makeExamResult({ scorePct: 60 }), makeExamResult({ scorePct: 80 })];
    expect(computeStudentAnalyticsSnapshot('s1', [], examResults).averageScorePct).toBe(70);
  });

  test('questionVolume is unique QBank questions answered, matching progressAnalyticsService', () => {
    const attempts = [
      makeAttempt({ questionId: 'qbank-1' }),
      makeAttempt({ questionId: 'qbank-1' }), // re-attempt, same question
      makeAttempt({ questionId: 'qbank-2' }),
    ];
    expect(computeStudentAnalyticsSnapshot('s1', attempts, []).questionVolume).toBe(2);
  });

  test('weakDomains mirrors weaknessDetectionService.detectWeaknesses, domain numbers only', () => {
    const attempts = Array.from({ length: analyticsConfig.MIN_QUESTIONS_FOR_SIGNAL }, (_, i) =>
      makeAttempt({ domain: 4, questionId: `qbank-${i}`, isCorrect: false })
    );
    const snapshot = computeStudentAnalyticsSnapshot('s1', attempts, []);
    expect(snapshot.weakDomains).toContain(4);
    expect(snapshot.weakDomains.every((d) => typeof d === 'number')).toBe(true);
  });

  test('lastActivityAt is the later of the most recent QBank attempt and the most recent exam submission', () => {
    const attempts = [makeAttempt({ attemptedAt: '2026-01-01T09:00:00.000Z' })];
    const examResults = [makeExamResult({ submittedAt: '2026-01-10T09:00:00.000Z' })];
    expect(computeStudentAnalyticsSnapshot('s1', attempts, examResults).lastActivityAt).toBe('2026-01-10T09:00:00.000Z');

    const examResultsOlder = [makeExamResult({ submittedAt: '2025-12-01T09:00:00.000Z' })];
    expect(computeStudentAnalyticsSnapshot('s1', attempts, examResultsOlder).lastActivityAt).toBe(
      '2026-01-01T09:00:00.000Z'
    );
  });

  test('the snapshot is JSON-serializable (cloud-sync compatible) — round-trips through JSON with no loss', () => {
    const attempts = [makeAttempt({})];
    const examResults = [makeExamResult({})];
    const snapshot = computeStudentAnalyticsSnapshot('s1', attempts, examResults);
    expect(JSON.parse(JSON.stringify(snapshot))).toEqual(snapshot);
  });
});

describe('computeLocalStudentAnalyticsSnapshot', () => {
  test('always uses LOCAL_STUDENT_ID — this app has no accounts yet', () => {
    const snapshot = computeLocalStudentAnalyticsSnapshot([], []);
    expect(snapshot.studentId).toBe(LOCAL_STUDENT_ID);
  });
});
