import { contentRepository } from './contentRepository';
import type { Attempt } from '../models/attempt';
import type { QuestionDomain, System } from '../models';

/**
 * All aggregation logic for the Progress dashboard (M5), kept pure and
 * framework-agnostic — same pattern as M4's scoringService/questionEngine:
 * these functions take an already-loaded `Attempt[]` (fetched once by
 * src/hooks/useProgressDashboard.ts) rather than reading storage
 * themselves, so they're directly unit-testable and so the hook can
 * memoize them instead of re-aggregating on every render.
 */

export type OverallStats = {
  /** Unique questions with at least one attempt, all-time. */
  totalQuestionsAnswered: number;
  /** Over each question's most recent attempt, all-time (null = no attempts yet). */
  overallAccuracyPct: number | null;
  /** Attempt COUNT (not unique questions) made today — re-answering a question counts as activity. */
  answeredToday: number;
  /** Attempt COUNT over the rolling 7-day window ending today (not a Mon-Sun calendar week — see docs). */
  answeredThisWeek: number;
  currentStreakDays: number;
  /** ISO timestamp of the single most recent attempt, or null if none exist. */
  lastStudySessionAt: string | null;
};

export type SystemStat = {
  systemKey: string;
  label: string;
  questionsAnswered: number;
  questionsTotal: number;
  accuracyPct: number | null;
  lastAttemptedAt: string | null;
};

export type DomainStat = {
  domain: QuestionDomain;
  questionsAnswered: number;
  accuracyPct: number | null;
};

export type RecentActivityItem = {
  attemptId: string;
  /** e.g. "QBank Q42" or "Exam 1 Q10" — resolved from the question's real source, never invented. */
  questionLabel: string;
  systemLabel: string;
  isCorrect: boolean;
  attemptedAt: string;
};

/** Local calendar-day key, e.g. "2026-0-14" — deliberately not UTC, since "today" means the
 * user's local today, not UTC today. `Date` getters (getFullYear/getMonth/getDate) are always
 * local-timezone, regardless of how the Date was constructed, so this is safe to call on a Date
 * built either from parsing an ISO timestamp or from local date arithmetic. */
function dateKeyOf(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function localDateKey(iso: string): string {
  return dateKeyOf(new Date(iso));
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Latest attempt per question — the basis for "answered" counts and accuracy everywhere in this file. */
function latestPerQuestion(attempts: Attempt[]): Map<string, Attempt> {
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    const existing = latest.get(attempt.questionId);
    if (!existing || attempt.attemptedAt > existing.attemptedAt) {
      latest.set(attempt.questionId, attempt);
    }
  }
  return latest;
}

function accuracyOf(attempts: Attempt[]): number | null {
  if (attempts.length === 0) return null;
  const correct = attempts.filter((a) => a.isCorrect).length;
  return Math.round((correct / attempts.length) * 100);
}

/**
 * Consecutive local calendar days with at least one attempt, counted
 * backwards from `now`. Today is allowed to have no activity yet without
 * breaking the streak (the day isn't over) — but only today; a genuine
 * gap on any earlier day stops the count.
 */
export function computeCurrentStreak(attempts: Attempt[], now: Date): number {
  if (attempts.length === 0) return 0;
  const activeDays = new Set(attempts.map((a) => localDateKey(a.attemptedAt)));

  let cursor = startOfLocalDay(now);
  if (!activeDays.has(dateKeyOf(cursor))) {
    cursor = addDays(cursor, -1);
  }

  let streak = 0;
  while (activeDays.has(dateKeyOf(cursor))) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function computeOverallStats(attempts: Attempt[], now: Date): OverallStats {
  const latest = latestPerQuestion(attempts);
  const latestAttempts = [...latest.values()];

  const todayKey = localDateKey(now.toISOString());
  const answeredToday = attempts.filter((a) => localDateKey(a.attemptedAt) === todayKey).length;

  const weekStart = addDays(startOfLocalDay(now), -6);
  const answeredThisWeek = attempts.filter((a) => new Date(a.attemptedAt) >= weekStart).length;

  const lastStudySessionAt =
    attempts.length === 0
      ? null
      : attempts.reduce((latestSoFar, a) => (a.attemptedAt > latestSoFar ? a.attemptedAt : latestSoFar), attempts[0].attemptedAt);

  return {
    totalQuestionsAnswered: latest.size,
    overallAccuracyPct: accuracyOf(latestAttempts),
    answeredToday,
    answeredThisWeek,
    currentStreakDays: computeCurrentStreak(attempts, now),
    lastStudySessionAt,
  };
}

export function computeSystemStats(attempts: Attempt[], systems: System[]): SystemStat[] {
  const bySystem = new Map<string, Attempt[]>();
  for (const attempt of attempts) {
    const existing = bySystem.get(attempt.systemKey);
    if (existing) existing.push(attempt);
    else bySystem.set(attempt.systemKey, [attempt]);
  }

  return systems.map((system) => {
    const systemAttempts = bySystem.get(system.key) ?? [];
    const latest = [...latestPerQuestion(systemAttempts).values()];
    const lastAttemptedAt =
      systemAttempts.length === 0
        ? null
        : systemAttempts.reduce((latestSoFar, a) => (a.attemptedAt > latestSoFar ? a.attemptedAt : latestSoFar), systemAttempts[0].attemptedAt);

    return {
      systemKey: system.key,
      label: system.label,
      questionsAnswered: latest.length,
      questionsTotal: contentRepository.getQuestions({ systemKey: system.key }).length,
      accuracyPct: accuracyOf(latest),
      lastAttemptedAt,
    };
  });
}

const ALL_DOMAINS: QuestionDomain[] = [1, 2, 3, 4, 5];

export function computeDomainStats(attempts: Attempt[]): DomainStat[] {
  const byDomain = new Map<QuestionDomain, Attempt[]>();
  for (const attempt of attempts) {
    const existing = byDomain.get(attempt.domain);
    if (existing) existing.push(attempt);
    else byDomain.set(attempt.domain, [attempt]);
  }

  return ALL_DOMAINS.map((domain) => {
    const domainAttempts = byDomain.get(domain) ?? [];
    const latest = [...latestPerQuestion(domainAttempts).values()];
    return {
      domain,
      questionsAnswered: latest.length,
      accuracyPct: accuracyOf(latest),
    };
  });
}

export function getRecentActivity(attempts: Attempt[], limit: number): RecentActivityItem[] {
  const sorted = [...attempts].sort((a, b) => (a.attemptedAt < b.attemptedAt ? 1 : -1));
  return sorted.slice(0, limit).map((attempt) => {
    const question = contentRepository.getQuestionById(attempt.questionId);
    const system = contentRepository.getSystem(attempt.systemKey);
    return {
      attemptId: attempt.id,
      questionLabel: questionLabelFor(question, attempt),
      systemLabel: system?.label ?? attempt.systemKey,
      isCorrect: attempt.isCorrect,
      attemptedAt: attempt.attemptedAt,
    };
  });
}

function questionLabelFor(
  question: ReturnType<typeof contentRepository.getQuestionById>,
  attempt: Attempt
): string {
  if (!question) return attempt.questionId; // defensive — content is validated at import time (M2), shouldn't happen
  if (question.source.kind === 'qbank') return `QBank Q${question.source.index + 1}`;
  return `Exam ${question.source.examNumber} Q${question.source.slot + 1}`;
}
