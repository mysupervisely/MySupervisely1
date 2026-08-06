import { analyticsConfig } from '../constants/analyticsConfig';
import { computeDomainStats } from './progressAnalyticsService';
import type { Attempt } from '../models/attempt';
import type { ExamResult } from '../models/examResult';
import type { QuestionDomain } from '../models';

/**
 * M7.4 — Weakness Detection Engine. Pure functions, same pattern as
 * progressAnalyticsService.ts/examResultService.ts: callers (a future
 * hook) load Attempts + ExamResults from storage once and pass them in
 * here; nothing in this file touches AsyncStorage or React.
 *
 * "Calculate weak domains (lowest accuracy, minimum question threshold
 * required), strong domains (highest accuracy), risk areas (domains
 * below configurable threshold)." All thresholds come from
 * src/constants/analyticsConfig.ts — nothing here is a magic number.
 */

const ALL_DOMAINS: QuestionDomain[] = [1, 2, 3, 4, 5];

export type DomainPerformance = {
  domain: QuestionDomain;
  /** Combined QBank + exam answered count for this domain, all-time. */
  answered: number;
  correct: number;
  /** correct / answered, rounded — null when answered is 0. */
  accuracyPct: number | null;
  /** answered >= analyticsConfig.MIN_QUESTIONS_FOR_SIGNAL — domains below this are excluded from weak/strong/risk ranking, not just low-confidence. */
  hasSignal: boolean;
};

export type WeaknessReport = {
  /** All 5 NAPLEX domains, always present, sorted by domain number — the full picture, signal or not. */
  domainPerformance: DomainPerformance[];
  /** Up to analyticsConfig.WEAK_DOMAIN_COUNT signal-eligible domains, lowest accuracy first. Empty if no domain has enough signal yet. */
  weakDomains: DomainPerformance[];
  /** Up to analyticsConfig.STRONG_DOMAIN_COUNT signal-eligible domains, highest accuracy first. */
  strongDomains: DomainPerformance[];
  /** Every signal-eligible domain at or below analyticsConfig.RISK_DOMAIN_THRESHOLD_PCT — independent of the weak/strong ranking, could be 0, could be more than WEAK_DOMAIN_COUNT. */
  riskDomains: DomainPerformance[];
};

/**
 * Merges QBank domain performance (from all-time Attempts) with exam
 * domain performance (from every stored ExamResult's domainBreakdown) into
 * one combined answered/correct count per NAPLEX domain. A question
 * answered in both QBank and an exam counts once per venue — this is
 * activity volume, not unique-question mastery (see
 * docs/M7_IMPLEMENTATION_NOTES.md).
 */
export function computeDomainPerformance(attempts: Attempt[], examResults: ExamResult[]): DomainPerformance[] {
  const qbankByDomain = new Map(computeDomainStats(attempts).map((d) => [d.domain, d]));

  const examAnsweredByDomain = new Map<QuestionDomain, number>();
  const examCorrectByDomain = new Map<QuestionDomain, number>();
  for (const result of examResults) {
    for (const breakdown of result.domainBreakdown) {
      examAnsweredByDomain.set(breakdown.domain, (examAnsweredByDomain.get(breakdown.domain) ?? 0) + breakdown.answered);
      examCorrectByDomain.set(breakdown.domain, (examCorrectByDomain.get(breakdown.domain) ?? 0) + breakdown.correct);
    }
  }

  return ALL_DOMAINS.map((domain) => {
    const qbank = qbankByDomain.get(domain);
    const answered = (qbank?.questionsAnswered ?? 0) + (examAnsweredByDomain.get(domain) ?? 0);
    const correct = (qbank?.correctCount ?? 0) + (examCorrectByDomain.get(domain) ?? 0);
    return {
      domain,
      answered,
      correct,
      accuracyPct: answered > 0 ? Math.round((correct / answered) * 100) : null,
      hasSignal: answered >= analyticsConfig.MIN_QUESTIONS_FOR_SIGNAL,
    };
  });
}

/** Domains with enough attempts to be a meaningful signal, sorted lowest-accuracy-first. Accuracy is never null here (hasSignal implies answered > 0). */
function signalEligible(domainPerformance: DomainPerformance[]): DomainPerformance[] {
  return domainPerformance.filter((d) => d.hasSignal).sort((a, b) => (a.accuracyPct ?? 0) - (b.accuracyPct ?? 0));
}

/**
 * Builds the full weak/strong/risk report from combined domain
 * performance. Split out from computeDomainPerformance so a caller that
 * already has the combined performance (e.g. a screen showing the raw
 * per-domain table) doesn't pay for re-deriving it.
 */
export function detectWeaknesses(domainPerformance: DomainPerformance[]): WeaknessReport {
  const eligible = signalEligible(domainPerformance);
  const weakestFirst = eligible;
  const strongestFirst = [...eligible].reverse();

  return {
    domainPerformance,
    weakDomains: weakestFirst.slice(0, analyticsConfig.WEAK_DOMAIN_COUNT),
    strongDomains: strongestFirst.slice(0, analyticsConfig.STRONG_DOMAIN_COUNT),
    riskDomains: eligible.filter((d) => (d.accuracyPct ?? 0) <= analyticsConfig.RISK_DOMAIN_THRESHOLD_PCT),
  };
}

/** Convenience wrapper combining both steps — what a hook will normally call. */
export function computeWeaknessReport(attempts: Attempt[], examResults: ExamResult[]): WeaknessReport {
  return detectWeaknesses(computeDomainPerformance(attempts, examResults));
}
