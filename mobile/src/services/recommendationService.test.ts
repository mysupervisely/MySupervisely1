import {
  computeDomainRecommendations,
  computeRecentMissesRecommendation,
  computeStudyRecommendations,
} from './recommendationService';
import { detectWeaknesses } from './weaknessDetectionService';
import { analyticsConfig } from '../constants/analyticsConfig';
import { contentRepository } from './contentRepository';
import type { Attempt } from '../models/attempt';
import type { DomainPerformance } from './weaknessDetectionService';
import type { ExamResult, ExamResultQuestionAnswer } from '../models/examResult';
import type { QuestionDomain } from '../models';

function makeAttempt(overrides: Partial<Attempt>): Attempt {
  return {
    id: `attempt-${Math.random().toString(36).slice(2)}`,
    questionId: `qbank-${Math.random().toString(36).slice(2)}`,
    systemKey: 'cardio',
    domain: 1,
    questionType: 'single',
    answer: { type: 'single', label: 'A' },
    isCorrect: false,
    attemptedAt: '2026-01-01T09:00:00.000Z',
    ...overrides,
  };
}

function performanceFor(entries: { domain: QuestionDomain; answered: number; correct: number }[]): DomainPerformance[] {
  return [1, 2, 3, 4, 5].map((domain) => {
    const entry = entries.find((e) => e.domain === domain);
    const answered = entry?.answered ?? 0;
    const correct = entry?.correct ?? 0;
    return {
      domain: domain as QuestionDomain,
      answered,
      correct,
      accuracyPct: answered > 0 ? Math.round((correct / answered) * 100) : null,
      hasSignal: answered >= analyticsConfig.MIN_QUESTIONS_FOR_SIGNAL,
    };
  });
}

function makeQuestionAnswer(overrides: Partial<ExamResultQuestionAnswer>): ExamResultQuestionAnswer {
  return { questionId: 'exam-1-0', isAnswered: true, isCorrect: false, isFlagged: false, ...overrides };
}

function makeExamResult(questionAnswers: ExamResultQuestionAnswer[], overrides: Partial<ExamResult> = {}): ExamResult {
  return {
    id: `result-${Math.random().toString(36).slice(2)}`,
    examNumber: 1,
    submittedAt: '2026-01-01T09:00:00.000Z',
    totalQuestions: questionAnswers.length,
    answeredCount: questionAnswers.filter((q) => q.isAnswered).length,
    correctCount: questionAnswers.filter((q) => q.isCorrect).length,
    incorrectCount: questionAnswers.filter((q) => q.isAnswered && !q.isCorrect).length,
    unansweredCount: questionAnswers.filter((q) => !q.isAnswered).length,
    accuracyPct: 0,
    scorePct: 0,
    totalTimeSpentSeconds: 0,
    averageTimePerQuestionSeconds: 0,
    domainBreakdown: [],
    systemBreakdown: [],
    flaggedQuestionIds: [],
    incorrectQuestionIds: questionAnswers.filter((q) => q.isAnswered && !q.isCorrect).map((q) => q.questionId),
    questionAnswers,
    ...overrides,
  };
}

describe('computeDomainRecommendations', () => {
  test('one recommendation per domain in weakDomains ∪ riskDomains, real QBank question ids resolved via contentRepository', () => {
    const performance = performanceFor([{ domain: 2, answered: 10, correct: 3 }]); // 30%, both weak and risk
    const report = detectWeaknesses(performance);

    const recommendations = computeDomainRecommendations(report);
    expect(recommendations).toHaveLength(1);
    expect(recommendations[0]).toMatchObject({ domain: 2, reason: 'risk-domain' });
    expect(recommendations[0].questionIds.length).toBeGreaterThan(0);
    expect(recommendations[0].questionIds.length).toBeLessThanOrEqual(analyticsConfig.RECOMMENDED_SESSION_QUESTION_COUNT);
    // Every id must resolve through the real content repository — "must link back into existing QBank/question engine."
    for (const id of recommendations[0].questionIds) {
      expect(contentRepository.getQuestionById(id)).toBeDefined();
    }
  });

  test('a domain that is weak but not below the risk threshold is tagged weak-domain, not risk-domain', () => {
    // 70% is below the other 4 domains (90% each) so it's the sole weak domain, but above RISK_DOMAIN_THRESHOLD_PCT (65).
    const performance = performanceFor([
      { domain: 1, answered: 10, correct: 7 }, // 70%
      { domain: 2, answered: 10, correct: 9 },
      { domain: 3, answered: 10, correct: 9 },
      { domain: 4, answered: 10, correct: 9 },
      { domain: 5, answered: 10, correct: 9 },
    ]);
    const report = detectWeaknesses(performance);
    const recommendations = computeDomainRecommendations(report);
    const domain1 = recommendations.find((r) => r.domain === 1);
    expect(domain1?.reason).toBe('weak-domain');
  });

  test('no domain recommendations when nothing has enough signal yet', () => {
    const report = detectWeaknesses(performanceFor([]));
    expect(computeDomainRecommendations(report)).toHaveLength(0);
  });

  test('sorted lowest-accuracy-first', () => {
    const performance = performanceFor([
      { domain: 1, answered: 10, correct: 2 }, // 20%
      { domain: 2, answered: 10, correct: 5 }, // 50%
    ]);
    const report = detectWeaknesses(performance);
    const recommendations = computeDomainRecommendations(report);
    expect(recommendations.map((r) => r.domain)).toEqual([1, 2]);
  });
});

describe('computeRecentMissesRecommendation', () => {
  test('null when there are no misses at all', () => {
    expect(computeRecentMissesRecommendation([], [])).toBeNull();
  });

  test('includes a QBank question only answered-and-wrong, and gives it back as a linkable question id', () => {
    const attempts = [makeAttempt({ questionId: 'qbank-0', isCorrect: false })];
    const recommendation = computeRecentMissesRecommendation(attempts, []);
    expect(recommendation?.questionIds).toEqual(['qbank-0']);
    expect(recommendation?.reason).toBe('recent-misses');
  });

  test('a question later answered correctly on retry is NOT a current miss', () => {
    const attempts = [
      makeAttempt({ questionId: 'qbank-0', isCorrect: false, attemptedAt: '2026-01-01T08:00:00.000Z' }),
      makeAttempt({ questionId: 'qbank-0', isCorrect: true, attemptedAt: '2026-01-01T09:00:00.000Z' }),
    ];
    expect(computeRecentMissesRecommendation(attempts, [])).toBeNull();
  });

  test('a question answered wrong on retry AFTER an earlier correct answer IS a current miss', () => {
    const attempts = [
      makeAttempt({ questionId: 'qbank-0', isCorrect: true, attemptedAt: '2026-01-01T08:00:00.000Z' }),
      makeAttempt({ questionId: 'qbank-0', isCorrect: false, attemptedAt: '2026-01-01T09:00:00.000Z' }),
    ];
    expect(computeRecentMissesRecommendation(attempts, [])?.questionIds).toEqual(['qbank-0']);
  });

  test('pulls exam-sourced misses too, from the LATEST exam result covering that question', () => {
    const earlierResult = makeExamResult(
      [makeQuestionAnswer({ questionId: 'exam-1-0', isAnswered: true, isCorrect: false })],
      { submittedAt: '2026-01-01T08:00:00.000Z' }
    );
    const laterResult = makeExamResult(
      [makeQuestionAnswer({ questionId: 'exam-1-0', isAnswered: true, isCorrect: true })],
      { submittedAt: '2026-01-05T08:00:00.000Z' }
    );
    // Fixed second first to prove sort-by-date, not array order, decides which wins.
    expect(computeRecentMissesRecommendation([], [laterResult, earlierResult])).toBeNull();
  });

  test('an unanswered question is not a "miss" — only answered-and-wrong counts', () => {
    const result = makeExamResult([makeQuestionAnswer({ questionId: 'exam-1-0', isAnswered: false, isCorrect: false })]);
    expect(computeRecentMissesRecommendation([], [result])).toBeNull();
  });

  test('most-recent misses come first and the list is capped at RECOMMENDED_SESSION_QUESTION_COUNT', () => {
    const attempts = Array.from({ length: analyticsConfig.RECOMMENDED_SESSION_QUESTION_COUNT + 5 }, (_, i) =>
      makeAttempt({
        questionId: `qbank-${i}`,
        isCorrect: false,
        attemptedAt: new Date(2026, 0, 1, 0, i).toISOString(), // strictly increasing — higher i is more recent
      })
    );
    const recommendation = computeRecentMissesRecommendation(attempts, []);
    expect(recommendation?.questionIds).toHaveLength(analyticsConfig.RECOMMENDED_SESSION_QUESTION_COUNT);
    // Most recent (highest index) should be first.
    expect(recommendation?.questionIds[0]).toBe(`qbank-${analyticsConfig.RECOMMENDED_SESSION_QUESTION_COUNT + 4}`);
  });
});

describe('computeStudyRecommendations', () => {
  test('puts recent misses first, then domain recommendations', () => {
    const attempts = [makeAttempt({ questionId: 'qbank-0', domain: 1, isCorrect: false })];
    const performance = performanceFor([{ domain: 3, answered: 10, correct: 2 }]);
    const report = detectWeaknesses(performance);

    const recommendations = computeStudyRecommendations(report, attempts, []);
    expect(recommendations[0].reason).toBe('recent-misses');
    expect(recommendations.slice(1).every((r) => r.reason !== 'recent-misses')).toBe(true);
  });

  test('omits the recent-misses entry entirely when there are none', () => {
    const performance = performanceFor([{ domain: 3, answered: 10, correct: 2 }]);
    const report = detectWeaknesses(performance);
    const recommendations = computeStudyRecommendations(report, [], []);
    expect(recommendations.every((r) => r.reason !== 'recent-misses')).toBe(true);
  });
});
