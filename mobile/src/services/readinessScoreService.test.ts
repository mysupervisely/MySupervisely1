import { computeReadinessComponents, computeReadinessScore, computeReadinessTrend } from './readinessScoreService';
import { analyticsConfig } from '../constants/analyticsConfig';
import type { Attempt } from '../models/attempt';
import type { ExamNumber } from '../models/exam';
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

describe('computeReadinessComponents', () => {
  test('everything is 0 with no data at all — never a fabricated baseline', () => {
    const components = computeReadinessComponents([], []);
    expect(components).toEqual({
      examPerformanceScore: 0,
      qbankAccuracyScore: 0,
      questionVolumeScore: 0,
      domainCoverageScore: 0,
    });
  });

  test('examPerformanceScore averages the LATEST attempt per distinct exam, not every retake', () => {
    const examResults = [
      makeExamResult({ examNumber: 1 as ExamNumber, submittedAt: '2026-01-01T09:00:00.000Z', accuracyPct: 50 }),
      makeExamResult({ examNumber: 1 as ExamNumber, submittedAt: '2026-01-05T09:00:00.000Z', accuracyPct: 90 }), // retake, supersedes the 50
      makeExamResult({ examNumber: 2 as ExamNumber, submittedAt: '2026-01-02T09:00:00.000Z', accuracyPct: 70 }),
    ];
    const components = computeReadinessComponents([], examResults);
    // Latest per exam: exam 1 -> 90, exam 2 -> 70. Average = 80. The superseded 50 is excluded.
    expect(components.examPerformanceScore).toBe(80);
  });

  test('qbankAccuracyScore is overall QBank accuracy over the latest attempt per question', () => {
    const attempts = [
      makeAttempt({ questionId: 'qbank-1', isCorrect: true }),
      makeAttempt({ questionId: 'qbank-2', isCorrect: false }),
    ];
    expect(computeReadinessComponents(attempts, []).qbankAccuracyScore).toBe(50);
  });

  test('questionVolumeScore is unique questions answered as a % of READINESS_FULL_VOLUME_QUESTION_COUNT, capped at 100', () => {
    const half = Math.round(analyticsConfig.READINESS_FULL_VOLUME_QUESTION_COUNT / 2);
    const attempts = Array.from({ length: half }, (_, i) => makeAttempt({ questionId: `qbank-${i}` }));
    expect(computeReadinessComponents(attempts, []).questionVolumeScore).toBe(50);

    const full = Array.from({ length: analyticsConfig.READINESS_FULL_VOLUME_QUESTION_COUNT * 2 }, (_, i) =>
      makeAttempt({ questionId: `qbank-${i}` })
    );
    expect(computeReadinessComponents(full, []).questionVolumeScore).toBe(100); // capped, not 200
  });

  test('domainCoverageScore counts only signal-eligible domains (>= MIN_QUESTIONS_FOR_SIGNAL), as a % of all 5', () => {
    // Domain 1 gets enough attempts to be signal-eligible; domain 2 gets only 1 (not eligible).
    const attempts = [
      ...Array.from({ length: analyticsConfig.MIN_QUESTIONS_FOR_SIGNAL }, (_, i) =>
        makeAttempt({ domain: 1, questionId: `d1-${i}` })
      ),
      makeAttempt({ domain: 2, questionId: 'd2-0' }),
    ];
    // 1 of 5 domains covered = 20%.
    expect(computeReadinessComponents(attempts, []).domainCoverageScore).toBe(20);
  });
});

describe('computeReadinessTrend', () => {
  test('insufficient-data with fewer than 2 exam results', () => {
    expect(computeReadinessTrend([])).toBe('insufficient-data');
    expect(computeReadinessTrend([makeExamResult()])).toBe('insufficient-data');
  });

  test('improving when the most recent result is enough points above the one before it', () => {
    const results = [
      makeExamResult({ submittedAt: '2026-01-01T09:00:00.000Z', accuracyPct: 60 }),
      makeExamResult({ submittedAt: '2026-01-05T09:00:00.000Z', accuracyPct: 60 + analyticsConfig.READINESS_TREND_DELTA_PCT }),
    ];
    expect(computeReadinessTrend(results)).toBe('improving');
  });

  test('declining when the most recent result is enough points below the one before it', () => {
    const results = [
      makeExamResult({ submittedAt: '2026-01-01T09:00:00.000Z', accuracyPct: 80 }),
      makeExamResult({ submittedAt: '2026-01-05T09:00:00.000Z', accuracyPct: 80 - analyticsConfig.READINESS_TREND_DELTA_PCT }),
    ];
    expect(computeReadinessTrend(results)).toBe('declining');
  });

  test('stable when the swing is smaller than READINESS_TREND_DELTA_PCT', () => {
    const results = [
      makeExamResult({ submittedAt: '2026-01-01T09:00:00.000Z', accuracyPct: 70 }),
      makeExamResult({ submittedAt: '2026-01-05T09:00:00.000Z', accuracyPct: 71 }),
    ];
    expect(computeReadinessTrend(results)).toBe('stable');
  });

  test('compares the two most recent results by submission date, regardless of array order', () => {
    const results = [
      makeExamResult({ submittedAt: '2026-01-05T09:00:00.000Z', accuracyPct: 90 }), // most recent, listed first
      makeExamResult({ submittedAt: '2026-01-01T09:00:00.000Z', accuracyPct: 50 }), // oldest, listed second
    ];
    expect(computeReadinessTrend(results)).toBe('improving'); // 90 vs 50, chronologically — not array order
  });
});

describe('computeReadinessScore', () => {
  test('score is the weighted sum of components per analyticsConfig.READINESS_WEIGHTS', () => {
    const attempts = Array.from({ length: analyticsConfig.READINESS_FULL_VOLUME_QUESTION_COUNT }, (_, i) =>
      makeAttempt({ questionId: `qbank-${i}`, isCorrect: true })
    );
    const examResults = [makeExamResult({ accuracyPct: 100 })];

    const result = computeReadinessScore(attempts, examResults);
    // examPerformance=100, qbankAccuracy=100, questionVolume=100. domainCoverage=20 (only domain 1 covered, fixture default).
    const weights = analyticsConfig.READINESS_WEIGHTS;
    const expectedScore = Math.round(100 * weights.examPerformance + 100 * weights.qbankAccuracy + 100 * weights.questionVolume + 20 * weights.domainCoverage);
    expect(result.score).toBe(expectedScore);
    expect(result.components.domainCoverageScore).toBe(20);
  });

  test('score is 0 with zero data, and trend is insufficient-data', () => {
    const result = computeReadinessScore([], []);
    expect(result.score).toBe(0);
    expect(result.trend).toBe('insufficient-data');
  });

  test('score never exceeds 100 even at maximum volume/coverage/accuracy', () => {
    const attempts: Attempt[] = [];
    for (let domain = 1; domain <= 5; domain++) {
      for (let i = 0; i < analyticsConfig.MIN_QUESTIONS_FOR_SIGNAL; i++) {
        attempts.push(makeAttempt({ domain: domain as Attempt['domain'], questionId: `d${domain}-${i}`, isCorrect: true }));
      }
    }
    const examResults = [1, 2, 3].map((examNumber) => makeExamResult({ examNumber: examNumber as ExamNumber, accuracyPct: 100 }));
    const result = computeReadinessScore(attempts, examResults);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
