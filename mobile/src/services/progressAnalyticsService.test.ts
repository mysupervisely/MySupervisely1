import {
  computeCurrentStreak,
  computeDomainStats,
  computeOverallStats,
  computeSystemStats,
  getRecentActivity,
} from './progressAnalyticsService';
import type { Attempt } from '../models/attempt';
import type { System } from '../models';

// Fixed reference "now" so date-window tests (today/week/streak) are
// deterministic regardless of when the test suite actually runs.
const NOW = new Date(2026, 0, 15, 10, 0, 0); // Thursday, Jan 15 2026, 10:00 local

function isoOnDay(dayOffsetFromNow: number, hour = 12): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() + dayOffsetFromNow);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function makeAttempt(overrides: Partial<Attempt>): Attempt {
  return {
    id: `attempt-${Math.random().toString(36).slice(2)}`,
    questionId: 'qbank-0',
    systemKey: 'cardio',
    domain: 3,
    questionType: 'single',
    answer: { type: 'single', label: 'A' },
    isCorrect: true,
    attemptedAt: isoOnDay(0),
    ...overrides,
  };
}

describe('computeCurrentStreak', () => {
  test('no attempts at all is a streak of 0', () => {
    expect(computeCurrentStreak([], NOW)).toBe(0);
  });

  test('an attempt today only is a streak of 1', () => {
    const attempts = [makeAttempt({ attemptedAt: isoOnDay(0) })];
    expect(computeCurrentStreak(attempts, NOW)).toBe(1);
  });

  test('consecutive days (today, yesterday, day before) is a streak of 3', () => {
    const attempts = [
      makeAttempt({ attemptedAt: isoOnDay(0) }),
      makeAttempt({ attemptedAt: isoOnDay(-1) }),
      makeAttempt({ attemptedAt: isoOnDay(-2) }),
    ];
    expect(computeCurrentStreak(attempts, NOW)).toBe(3);
  });

  test('a gap breaks the streak — only the consecutive run counting back from today counts', () => {
    const attempts = [
      makeAttempt({ attemptedAt: isoOnDay(0) }),
      makeAttempt({ attemptedAt: isoOnDay(-1) }),
      // gap at day -2
      makeAttempt({ attemptedAt: isoOnDay(-3) }),
    ];
    expect(computeCurrentStreak(attempts, NOW)).toBe(2);
  });

  test('no activity yet today does not break a streak still active as of yesterday', () => {
    const attempts = [makeAttempt({ attemptedAt: isoOnDay(-1) }), makeAttempt({ attemptedAt: isoOnDay(-2) })];
    expect(computeCurrentStreak(attempts, NOW)).toBe(2);
  });

  test('a gap on yesterday (with no activity today either) breaks the streak to 0, even with older activity', () => {
    const attempts = [makeAttempt({ attemptedAt: isoOnDay(-2) }), makeAttempt({ attemptedAt: isoOnDay(-3) })];
    expect(computeCurrentStreak(attempts, NOW)).toBe(0);
  });

  test('multiple attempts on the same day only count once toward the streak length', () => {
    const attempts = [
      makeAttempt({ attemptedAt: isoOnDay(0, 8) }),
      makeAttempt({ attemptedAt: isoOnDay(0, 20) }),
      makeAttempt({ attemptedAt: isoOnDay(-1, 9) }),
    ];
    expect(computeCurrentStreak(attempts, NOW)).toBe(2);
  });
});

describe('computeOverallStats', () => {
  test('with no attempts, everything is honestly zero/null', () => {
    const stats = computeOverallStats([], NOW);
    expect(stats).toEqual({
      totalQuestionsAnswered: 0,
      overallAccuracyPct: null,
      answeredToday: 0,
      answeredThisWeek: 0,
      currentStreakDays: 0,
      lastStudySessionAt: null,
    });
  });

  test('totalQuestionsAnswered counts unique questions, not raw attempts', () => {
    const attempts = [
      makeAttempt({ questionId: 'qbank-0', attemptedAt: isoOnDay(0, 8) }),
      makeAttempt({ questionId: 'qbank-0', attemptedAt: isoOnDay(0, 9) }), // re-answered
      makeAttempt({ questionId: 'qbank-1', attemptedAt: isoOnDay(0, 10) }),
    ];
    expect(computeOverallStats(attempts, NOW).totalQuestionsAnswered).toBe(2);
  });

  test('overallAccuracyPct is scored on each question\'s latest attempt only', () => {
    const attempts = [
      makeAttempt({ questionId: 'qbank-0', isCorrect: false, attemptedAt: isoOnDay(0, 8) }),
      makeAttempt({ questionId: 'qbank-0', isCorrect: true, attemptedAt: isoOnDay(0, 9) }), // corrected on retry
      makeAttempt({ questionId: 'qbank-1', isCorrect: true, attemptedAt: isoOnDay(0, 8) }),
    ];
    expect(computeOverallStats(attempts, NOW).overallAccuracyPct).toBe(100);
  });

  test('answeredToday counts attempts (not unique questions) made today only', () => {
    const attempts = [
      makeAttempt({ attemptedAt: isoOnDay(0, 8) }),
      makeAttempt({ attemptedAt: isoOnDay(0, 9) }),
      makeAttempt({ attemptedAt: isoOnDay(-1, 8) }), // yesterday — excluded
    ];
    expect(computeOverallStats(attempts, NOW).answeredToday).toBe(2);
  });

  test('answeredThisWeek covers the rolling 7 days ending today, excludes day -7', () => {
    const attempts = [
      makeAttempt({ attemptedAt: isoOnDay(0) }),
      makeAttempt({ attemptedAt: isoOnDay(-6) }), // exactly 7 days ago including today — included
      makeAttempt({ attemptedAt: isoOnDay(-7) }), // 8 days ago — excluded
    ];
    expect(computeOverallStats(attempts, NOW).answeredThisWeek).toBe(2);
  });

  test('lastStudySessionAt is the most recent attempt timestamp, regardless of array order', () => {
    const attempts = [
      makeAttempt({ attemptedAt: isoOnDay(-2) }),
      makeAttempt({ attemptedAt: isoOnDay(0, 9) }),
      makeAttempt({ attemptedAt: isoOnDay(-1) }),
    ];
    expect(computeOverallStats(attempts, NOW).lastStudySessionAt).toBe(isoOnDay(0, 9));
  });
});

const systems: System[] = [
  {
    key: 'cardio',
    label: 'Cardiovascular',
    description: 'd',
    isAnatomical: true,
    x: 1,
    y: 1,
    chip: false,
    available: true,
    lessonIds: [],
    source: 'content-export',
  },
  {
    key: 'renal',
    label: 'Renal',
    description: 'd',
    isAnatomical: true,
    x: 2,
    y: 2,
    chip: false,
    available: true,
    lessonIds: [],
    source: 'content-export',
  },
];

describe('computeSystemStats', () => {
  test('a system with no attempts still appears, with zero/null stats and real questionsTotal', () => {
    const stats = computeSystemStats([], systems);
    const renalStat = stats.find((s) => s.systemKey === 'renal');
    expect(renalStat?.questionsAnswered).toBe(0);
    expect(renalStat?.accuracyPct).toBeNull();
    expect(renalStat?.lastAttemptedAt).toBeNull();
    expect(renalStat?.questionsTotal).toBeGreaterThan(0); // real content, not zero
  });

  test('attempts are correctly scoped to their own system, not leaking across systems', () => {
    const attempts = [
      makeAttempt({ systemKey: 'cardio', questionId: 'qbank-0', isCorrect: true }),
      makeAttempt({ systemKey: 'renal', questionId: 'qbank-1', isCorrect: false }),
    ];
    const stats = computeSystemStats(attempts, systems);
    expect(stats.find((s) => s.systemKey === 'cardio')?.questionsAnswered).toBe(1);
    expect(stats.find((s) => s.systemKey === 'cardio')?.accuracyPct).toBe(100);
    expect(stats.find((s) => s.systemKey === 'renal')?.accuracyPct).toBe(0);
  });

  test('lastAttemptedAt reflects the most recent attempt for that system', () => {
    const attempts = [
      makeAttempt({ systemKey: 'cardio', questionId: 'qbank-0', attemptedAt: isoOnDay(-2) }),
      makeAttempt({ systemKey: 'cardio', questionId: 'qbank-1', attemptedAt: isoOnDay(0, 8) }),
    ];
    const stat = computeSystemStats(attempts, systems).find((s) => s.systemKey === 'cardio');
    expect(stat?.lastAttemptedAt).toBe(isoOnDay(0, 8));
  });
});

describe('computeDomainStats', () => {
  test('returns all 5 domains even with zero attempts', () => {
    const stats = computeDomainStats([]);
    expect(stats.map((s) => s.domain)).toEqual([1, 2, 3, 4, 5]);
    expect(stats.every((s) => s.questionsAnswered === 0 && s.accuracyPct === null)).toBe(true);
  });

  test('aggregates correctly per domain, independent of system', () => {
    const attempts = [
      makeAttempt({ domain: 1, questionId: 'qbank-0', isCorrect: true }),
      makeAttempt({ domain: 1, questionId: 'qbank-1', isCorrect: false }),
      makeAttempt({ domain: 3, questionId: 'qbank-2', isCorrect: true }),
    ];
    const stats = computeDomainStats(attempts);
    expect(stats.find((s) => s.domain === 1)).toMatchObject({ questionsAnswered: 2, accuracyPct: 50 });
    expect(stats.find((s) => s.domain === 3)).toMatchObject({ questionsAnswered: 1, accuracyPct: 100 });
    expect(stats.find((s) => s.domain === 2)).toMatchObject({ questionsAnswered: 0, accuracyPct: null });
  });
});

describe('getRecentActivity', () => {
  test('orders most-recent-first', () => {
    const attempts = [
      makeAttempt({ id: 'a1', attemptedAt: isoOnDay(-2) }),
      makeAttempt({ id: 'a3', attemptedAt: isoOnDay(0, 9) }),
      makeAttempt({ id: 'a2', attemptedAt: isoOnDay(-1) }),
    ];
    const recent = getRecentActivity(attempts, 10);
    expect(recent.map((r) => r.attemptId)).toEqual(['a3', 'a2', 'a1']);
  });

  test('respects the limit', () => {
    const attempts = Array.from({ length: 30 }, (_, i) =>
      makeAttempt({ id: `a${i}`, questionId: `qbank-${i}`, attemptedAt: isoOnDay(0, i % 20) })
    );
    expect(getRecentActivity(attempts, 5)).toHaveLength(5);
  });

  test('resolves a real question label from the question\'s own source (qbank index), not fabricated', () => {
    const attempts = [makeAttempt({ questionId: 'qbank-0' })];
    const recent = getRecentActivity(attempts, 1);
    expect(recent[0].questionLabel).toBe('QBank Q1'); // qbank-0 -> source.index 0 -> "Q1" (1-based display)
  });

  test('resolves an exam question label from its exam number and slot', () => {
    const attempts = [makeAttempt({ questionId: 'exam-1-0' })];
    const recent = getRecentActivity(attempts, 1);
    expect(recent[0].questionLabel).toBe('Exam 1 Q1');
  });

  test('resolves the real system label, not just the raw key', () => {
    const attempts = [makeAttempt({ questionId: 'qbank-0', systemKey: 'cardio' })];
    const recent = getRecentActivity(attempts, 1);
    expect(recent[0].systemLabel).toBe('Cardiovascular');
  });

  test('carries isCorrect through untouched', () => {
    const attempts = [makeAttempt({ questionId: 'qbank-0', isCorrect: false })];
    expect(getRecentActivity(attempts, 1)[0].isCorrect).toBe(false);
  });
});
