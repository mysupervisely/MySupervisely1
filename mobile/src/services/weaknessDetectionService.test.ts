import { computeDomainPerformance, computeWeaknessReport, detectWeaknesses } from './weaknessDetectionService';
import { analyticsConfig } from '../constants/analyticsConfig';
import type { Attempt } from '../models/attempt';
import type { DomainBreakdown, ExamResult, SystemBreakdown } from '../models/examResult';
import type { QuestionDomain } from '../models';

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

function makeDomainBreakdown(overrides: Partial<DomainBreakdown>): DomainBreakdown {
  return { domain: 1, total: 0, answered: 0, correct: 0, accuracyPct: null, ...overrides };
}

function makeExamResult(domainBreakdown: DomainBreakdown[], overrides: Partial<ExamResult> = {}): ExamResult {
  return {
    id: `result-${Math.random().toString(36).slice(2)}`,
    examNumber: 1,
    submittedAt: '2026-01-01T09:00:00.000Z',
    totalQuestions: domainBreakdown.reduce((sum, d) => sum + d.total, 0),
    answeredCount: domainBreakdown.reduce((sum, d) => sum + d.answered, 0),
    correctCount: domainBreakdown.reduce((sum, d) => sum + d.correct, 0),
    incorrectCount: 0,
    unansweredCount: 0,
    accuracyPct: 0,
    scorePct: 0,
    totalTimeSpentSeconds: 0,
    averageTimePerQuestionSeconds: 0,
    domainBreakdown,
    systemBreakdown: [] as SystemBreakdown[],
    flaggedQuestionIds: [],
    incorrectQuestionIds: [],
    questionAnswers: [],
    ...overrides,
  };
}

describe('computeDomainPerformance', () => {
  test('all 5 domains are always present, even with zero data', () => {
    const performance = computeDomainPerformance([], []);
    expect(performance.map((d) => d.domain)).toEqual([1, 2, 3, 4, 5]);
    expect(performance.every((d) => d.answered === 0 && d.accuracyPct === null && !d.hasSignal)).toBe(true);
  });

  test('combines QBank attempts and exam domainBreakdown into one answered/correct total per domain', () => {
    const attempts = [
      makeAttempt({ domain: 1, questionId: 'qbank-1', isCorrect: true }),
      makeAttempt({ domain: 1, questionId: 'qbank-2', isCorrect: false }),
    ];
    const examResults = [makeExamResult([makeDomainBreakdown({ domain: 1, total: 3, answered: 3, correct: 2 })])];

    const performance = computeDomainPerformance(attempts, examResults);
    const domain1 = performance.find((d) => d.domain === 1);
    // QBank: 2 answered, 1 correct. Exam: 3 answered, 2 correct. Combined: 5 answered, 3 correct.
    expect(domain1).toMatchObject({ answered: 5, correct: 3, accuracyPct: 60 });
  });

  test('a question re-attempted in QBank only counts once (computeDomainStats already dedupes to latest attempt)', () => {
    const attempts = [
      makeAttempt({ domain: 2, questionId: 'qbank-1', isCorrect: false, attemptedAt: '2026-01-01T08:00:00.000Z' }),
      makeAttempt({ domain: 2, questionId: 'qbank-1', isCorrect: true, attemptedAt: '2026-01-01T09:00:00.000Z' }),
    ];
    const performance = computeDomainPerformance(attempts, []);
    expect(performance.find((d) => d.domain === 2)).toMatchObject({ answered: 1, correct: 1, accuracyPct: 100 });
  });

  test('sums domainBreakdown across multiple stored exam results (retakes), not just the latest', () => {
    const examResults = [
      makeExamResult([makeDomainBreakdown({ domain: 3, total: 2, answered: 2, correct: 1 })]),
      makeExamResult([makeDomainBreakdown({ domain: 3, total: 2, answered: 2, correct: 2 })]),
    ];
    const domain3 = computeDomainPerformance([], examResults).find((d) => d.domain === 3);
    expect(domain3).toMatchObject({ answered: 4, correct: 3, accuracyPct: 75 });
  });

  test('hasSignal is true only once answered reaches MIN_QUESTIONS_FOR_SIGNAL', () => {
    const attempts = Array.from({ length: analyticsConfig.MIN_QUESTIONS_FOR_SIGNAL - 1 }, (_, i) =>
      makeAttempt({ domain: 4, questionId: `qbank-${i}` })
    );
    const belowThreshold = computeDomainPerformance(attempts, []).find((d) => d.domain === 4);
    expect(belowThreshold?.hasSignal).toBe(false);

    attempts.push(makeAttempt({ domain: 4, questionId: 'qbank-last' }));
    const atThreshold = computeDomainPerformance(attempts, []).find((d) => d.domain === 4);
    expect(atThreshold?.hasSignal).toBe(true);
  });
});

describe('detectWeaknesses', () => {
  function performanceFor(entries: { domain: QuestionDomain; answered: number; correct: number }[]) {
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

  test('domains below MIN_QUESTIONS_FOR_SIGNAL never appear in weak/strong/risk, however low their accuracy', () => {
    const performance = performanceFor([{ domain: 1, answered: 1, correct: 0 }]); // 0% but only 1 question
    const report = detectWeaknesses(performance);
    expect(report.weakDomains).toHaveLength(0);
    expect(report.strongDomains).toHaveLength(0);
    expect(report.riskDomains).toHaveLength(0);
    expect(report.domainPerformance).toHaveLength(5); // still reported in full, just not ranked
  });

  test('weakDomains is signal-eligible domains sorted lowest-accuracy-first, capped at WEAK_DOMAIN_COUNT', () => {
    const performance = performanceFor([
      { domain: 1, answered: 10, correct: 9 }, // 90%
      { domain: 2, answered: 10, correct: 2 }, // 20%
      { domain: 3, answered: 10, correct: 5 }, // 50%
      { domain: 4, answered: 10, correct: 8 }, // 80%
      { domain: 5, answered: 10, correct: 6 }, // 60%
    ]);
    const report = detectWeaknesses(performance);
    expect(report.weakDomains.map((d) => d.domain)).toEqual([2, 3, 5].slice(0, analyticsConfig.WEAK_DOMAIN_COUNT));
    expect(report.weakDomains).toHaveLength(analyticsConfig.WEAK_DOMAIN_COUNT);
  });

  test('strongDomains is signal-eligible domains sorted highest-accuracy-first, capped at STRONG_DOMAIN_COUNT', () => {
    const performance = performanceFor([
      { domain: 1, answered: 10, correct: 9 }, // 90%
      { domain: 2, answered: 10, correct: 2 }, // 20%
      { domain: 3, answered: 10, correct: 5 }, // 50%
      { domain: 4, answered: 10, correct: 8 }, // 80%
      { domain: 5, answered: 10, correct: 6 }, // 60%
    ]);
    const report = detectWeaknesses(performance);
    expect(report.strongDomains.map((d) => d.domain)).toEqual([1, 4, 5].slice(0, analyticsConfig.STRONG_DOMAIN_COUNT));
  });

  test('riskDomains is every signal-eligible domain at or below RISK_DOMAIN_THRESHOLD_PCT, independent of WEAK_DOMAIN_COUNT', () => {
    // Every domain at exactly the threshold or below, all signal-eligible — 4 domains qualify,
    // more than WEAK_DOMAIN_COUNT (3), proving risk isn't just "the weak list truncated differently."
    const performance = performanceFor([
      { domain: 1, answered: 10, correct: 6 }, // 60% <= 65
      { domain: 2, answered: 10, correct: 6 }, // 60% <= 65
      { domain: 3, answered: 10, correct: 6 }, // 60% <= 65
      { domain: 4, answered: 10, correct: 6 }, // 60% <= 65
      { domain: 5, answered: 10, correct: 9 }, // 90%, above threshold
    ]);
    const report = detectWeaknesses(performance);
    expect(report.riskDomains).toHaveLength(4);
    expect(report.riskDomains.every((d) => (d.accuracyPct ?? 0) <= analyticsConfig.RISK_DOMAIN_THRESHOLD_PCT)).toBe(true);
  });

  test('no risk domains when every signal-eligible domain is above the threshold', () => {
    const performance = performanceFor([{ domain: 1, answered: 10, correct: 10 }]);
    expect(detectWeaknesses(performance).riskDomains).toHaveLength(0);
  });
});

describe('computeWeaknessReport', () => {
  test('is the composition of computeDomainPerformance + detectWeaknesses', () => {
    const attempts = Array.from({ length: analyticsConfig.MIN_QUESTIONS_FOR_SIGNAL }, (_, i) =>
      makeAttempt({ domain: 2, questionId: `qbank-${i}`, isCorrect: i < 2 }) // 2/5 = 40%
    );
    const report = computeWeaknessReport(attempts, []);
    expect(report.weakDomains.map((d) => d.domain)).toContain(2);
    const domain2 = report.domainPerformance.find((d) => d.domain === 2);
    expect(domain2).toMatchObject({ answered: 5, correct: 2, accuracyPct: 40, hasSignal: true });
  });
});
