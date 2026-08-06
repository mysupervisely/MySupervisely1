/**
 * Named thresholds for the M7 performance-analysis layer (weakness
 * detection, recommendations, readiness score) — "Do not hardcode
 * thresholds without constants/configuration." Every number a weak/
 * strong/risk/readiness calculation depends on lives here, not inline in
 * a service file, so a product decision to retune one is a one-line
 * change with an obvious place to make it.
 */

export const analyticsConfig = {
  /**
   * A domain/system needs at least this many attempted questions before
   * its accuracy is treated as a meaningful signal at all — 2 correct out
   * of 2 questions is not "90th percentile," it's not enough data yet.
   * Applies to weak/strong domain ranking (M7.4) and to which domains are
   * even eligible to appear in a recommendation (M7.5).
   */
  MIN_QUESTIONS_FOR_SIGNAL: 5,

  /** How many of the lowest-accuracy (signal-eligible) domains count as "Weak Areas." */
  WEAK_DOMAIN_COUNT: 3,

  /** How many of the highest-accuracy (signal-eligible) domains count as "Strong Areas." */
  STRONG_DOMAIN_COUNT: 3,

  /**
   * Any signal-eligible domain at or below this accuracy is a "Risk Area"
   * — an absolute safety-net threshold, independent of ranking (a student
   * could have zero domains under this, or more than WEAK_DOMAIN_COUNT).
   */
  RISK_DOMAIN_THRESHOLD_PCT: 65,

  /** Recommended-study-session default length when generated from a single weak domain. */
  RECOMMENDED_SESSION_QUESTION_COUNT: 20,

  /** How many of a domain's own past-incorrect questions to re-surface first in "recent misses"-based recommendations. */
  RECENT_MISSES_LOOKBACK_COUNT: 50,

  /**
   * Readiness score component weights (must sum to 1). See
   * readinessScoreService.ts for what each component measures. Kept as
   * named, documented constants rather than magic numbers inline, so the
   * weighting itself is a reviewable product decision.
   */
  READINESS_WEIGHTS: {
    examPerformance: 0.35,
    qbankAccuracy: 0.25,
    questionVolume: 0.2,
    domainCoverage: 0.2,
  },

  /** Question-volume component (readiness): full credit once a student has answered this many unique questions. */
  READINESS_FULL_VOLUME_QUESTION_COUNT: 500,

  /** Domain-coverage component (readiness): full credit once this many of the 5 NAPLEX domains have >= MIN_QUESTIONS_FOR_SIGNAL attempts. */
  READINESS_FULL_COVERAGE_DOMAIN_COUNT: 5,

  /**
   * Readiness "recent trend" (M7.6): the minimum accuracy-point swing
   * between the two most recent exam results to call it "improving" or
   * "declining" rather than "stable" — noise below this margin isn't a
   * trend.
   */
  READINESS_TREND_DELTA_PCT: 5,
} as const;
