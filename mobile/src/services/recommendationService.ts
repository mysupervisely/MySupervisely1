import { analyticsConfig } from '../constants/analyticsConfig';
import { domainLabel } from '../constants/domains';
import { contentRepository } from './contentRepository';
import type { Attempt } from '../models/attempt';
import type { ExamResult } from '../models/examResult';
import type { QuestionDomain } from '../models';
import type { DomainPerformance, WeaknessReport } from './weaknessDetectionService';

/**
 * M7.5 — Recommended Study Sessions. Pure functions (same pattern as the
 * rest of M7): a caller loads Attempts/ExamResults/a WeaknessReport once
 * and passes them in. "Recommendations must link back into existing
 * QBank/question engine" — every recommendation below carries real
 * `questionIds` resolved through contentRepository, exactly the input
 * shape src/hooks/useQuestionEngine.ts already accepts (`{ questions:
 * Question[] }`), so a screen can turn a recommendation into a live
 * session with `questionIds.map(contentRepository.getQuestionById)`
 * (filtering out any `undefined`) and nothing else.
 */

export type StudyRecommendationReason = 'weak-domain' | 'risk-domain' | 'recent-misses';

export type StudyRecommendation = {
  id: string;
  title: string;
  reason: StudyRecommendationReason;
  /** Short, student-facing explanation — e.g. "Based on recent misses." */
  reasonLabel: string;
  domain?: QuestionDomain;
  questionIds: string[];
  questionCount: number;
};

/**
 * One recommendation per domain in the union of weakDomains + riskDomains
 * (a domain that's both is still one recommendation, tagged 'risk-domain'
 * — risk is the stronger claim), sorted lowest-accuracy-first. Domains
 * with zero resolvable QBank questions (shouldn't happen against real
 * content, but content is generated data, not a compile-time guarantee)
 * are dropped rather than shown as an empty session.
 */
export function computeDomainRecommendations(weaknessReport: WeaknessReport): StudyRecommendation[] {
  const riskDomainSet = new Set(weaknessReport.riskDomains.map((d) => d.domain));
  const byDomain = new Map<QuestionDomain, DomainPerformance>();
  for (const d of weaknessReport.weakDomains) byDomain.set(d.domain, d);
  for (const d of weaknessReport.riskDomains) byDomain.set(d.domain, d);

  const ordered = [...byDomain.values()].sort((a, b) => (a.accuracyPct ?? 0) - (b.accuracyPct ?? 0));

  return ordered
    .map((perf): StudyRecommendation => {
      const isRisk = riskDomainSet.has(perf.domain);
      const questionIds = contentRepository
        .getQuestions({ domain: perf.domain })
        .slice(0, analyticsConfig.RECOMMENDED_SESSION_QUESTION_COUNT)
        .map((q) => q.id);
      return {
        id: `domain-${perf.domain}`,
        title: `${domainLabel(perf.domain)} Review`,
        reason: isRisk ? 'risk-domain' : 'weak-domain',
        reasonLabel: isRisk
          ? `Accuracy at or below ${analyticsConfig.RISK_DOMAIN_THRESHOLD_PCT}% (${perf.accuracyPct ?? 0}%)`
          : `One of your lowest-accuracy domains (${perf.accuracyPct ?? 0}%)`,
        domain: perf.domain,
        questionIds,
        questionCount: questionIds.length,
      };
    })
    .filter((r) => r.questionCount > 0);
}

type MissRecord = { questionId: string; missedAt: string };

/**
 * A question is a "recent miss" if the STUDENT'S MOST RECENT interaction
 * with it (any QBank attempt, or its answer in the most recent exam
 * result that included it) was answered-and-wrong. A question later
 * fixed on retry stops counting — this is a "what's still wrong right
 * now" list, not a lifetime miss log.
 */
function collectRecentMisses(attempts: Attempt[], examResults: ExamResult[]): MissRecord[] {
  const latest = new Map<string, MissRecord & { isCorrect: boolean; isAnswered: boolean }>();

  const consider = (questionId: string, at: string, isAnswered: boolean, isCorrect: boolean) => {
    const existing = latest.get(questionId);
    if (!existing || at > existing.missedAt) {
      latest.set(questionId, { questionId, missedAt: at, isAnswered, isCorrect });
    }
  };

  for (const attempt of attempts) {
    consider(attempt.questionId, attempt.attemptedAt, true, attempt.isCorrect);
  }
  // Exam results are processed oldest-first so a later retake's per-question
  // outcome naturally overwrites an earlier one in `consider` (it compares `at`).
  const byDate = [...examResults].sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1));
  for (const result of byDate) {
    for (const qa of result.questionAnswers) {
      consider(qa.questionId, result.submittedAt, qa.isAnswered, qa.isCorrect);
    }
  }

  return [...latest.values()]
    .filter((m) => m.isAnswered && !m.isCorrect)
    .sort((a, b) => (a.missedAt < b.missedAt ? 1 : -1))
    .slice(0, analyticsConfig.RECENT_MISSES_LOOKBACK_COUNT)
    .map((m) => ({ questionId: m.questionId, missedAt: m.missedAt }));
}

/** A single "Recent Misses Review" recommendation, or null once there's nothing currently missed. */
export function computeRecentMissesRecommendation(
  attempts: Attempt[],
  examResults: ExamResult[]
): StudyRecommendation | null {
  const misses = collectRecentMisses(attempts, examResults);
  if (misses.length === 0) return null;

  const questionIds = misses.slice(0, analyticsConfig.RECOMMENDED_SESSION_QUESTION_COUNT).map((m) => m.questionId);
  return {
    id: 'recent-misses',
    title: 'Recent Misses Review',
    reason: 'recent-misses',
    reasonLabel: 'Based on recent misses',
    questionIds,
    questionCount: questionIds.length,
  };
}

/** Recent misses first (most actionable/specific), then one recommendation per weak/risk domain. */
export function computeStudyRecommendations(
  weaknessReport: WeaknessReport,
  attempts: Attempt[],
  examResults: ExamResult[]
): StudyRecommendation[] {
  const recentMisses = computeRecentMissesRecommendation(attempts, examResults);
  const domainRecommendations = computeDomainRecommendations(weaknessReport);
  return recentMisses ? [recentMisses, ...domainRecommendations] : domainRecommendations;
}
