import { analyticsConfig } from '../constants/analyticsConfig';
import { computeOverallStats } from './progressAnalyticsService';
import { computeDomainPerformance } from './weaknessDetectionService';
import type { Attempt } from '../models/attempt';
import type { ExamNumber } from '../models/exam';
import type { ExamResult } from '../models/examResult';

/**
 * M7.6 — the "PharmDPrepped Readiness Score." Store calculation logic
 * here, separately from every UI that displays it (the Progress
 * dashboard). "Do not claim prediction of actual NAPLEX pass/fail" — this
 * is a composite study-completeness/performance score, always labeled
 * "PharmDPrepped Readiness Score" wherever it's shown, never "pass
 * probability" or similar. Every weight and threshold below comes from
 * src/constants/analyticsConfig.ts.
 */

export type ReadinessComponents = {
  /** Average accuracy (correct/answered) across each distinct practice exam's most recent attempt. 0 if no exam has been taken yet. */
  examPerformanceScore: number;
  /** Overall QBank accuracy (correct/answered, latest attempt per question, all-time). 0 if no QBank question has been answered. */
  qbankAccuracyScore: number;
  /** Unique QBank questions answered, as a percentage of READINESS_FULL_VOLUME_QUESTION_COUNT (capped at 100). */
  questionVolumeScore: number;
  /** NAPLEX domains with enough combined QBank+exam attempts to be signal-eligible, as a percentage of READINESS_FULL_COVERAGE_DOMAIN_COUNT. */
  domainCoverageScore: number;
};

export type ReadinessTrend = 'improving' | 'declining' | 'stable' | 'insufficient-data';

export type ReadinessResult = {
  /** 0-100, the weighted composite of `components` per analyticsConfig.READINESS_WEIGHTS. */
  score: number;
  components: ReadinessComponents;
  /** Direction between the two most-recent exam results' accuracy — 'insufficient-data' until at least 2 exams have been taken. */
  trend: ReadinessTrend;
};

function latestResultPerExam(examResults: ExamResult[]): ExamResult[] {
  const byExam = new Map<ExamNumber, ExamResult>();
  for (const result of examResults) {
    const existing = byExam.get(result.examNumber);
    if (!existing || result.submittedAt > existing.submittedAt) byExam.set(result.examNumber, result);
  }
  return [...byExam.values()];
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function computeExamPerformanceScore(examResults: ExamResult[]): number {
  return average(latestResultPerExam(examResults).map((r) => r.accuracyPct));
}

function computeQuestionVolumeScore(attempts: Attempt[]): number {
  const uniqueAnswered = computeOverallStats(attempts, new Date()).totalQuestionsAnswered;
  return Math.min(100, Math.round((uniqueAnswered / analyticsConfig.READINESS_FULL_VOLUME_QUESTION_COUNT) * 100));
}

function computeDomainCoverageScore(attempts: Attempt[], examResults: ExamResult[]): number {
  const coveredDomains = computeDomainPerformance(attempts, examResults).filter((d) => d.hasSignal).length;
  return Math.min(100, Math.round((coveredDomains / analyticsConfig.READINESS_FULL_COVERAGE_DOMAIN_COUNT) * 100));
}

/**
 * Trend between the two most recent exam results by submission date,
 * regardless of exam number — "recent performance direction" across
 * whichever exam was taken most recently and the one before it, not a
 * per-exam-number comparison (a student may not retake the same exam
 * back-to-back).
 */
export function computeReadinessTrend(examResults: ExamResult[]): ReadinessTrend {
  if (examResults.length < 2) return 'insufficient-data';
  const sorted = [...examResults].sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1));
  const previous = sorted[sorted.length - 2];
  const latest = sorted[sorted.length - 1];
  const delta = latest.accuracyPct - previous.accuracyPct;
  if (delta >= analyticsConfig.READINESS_TREND_DELTA_PCT) return 'improving';
  if (delta <= -analyticsConfig.READINESS_TREND_DELTA_PCT) return 'declining';
  return 'stable';
}

export function computeReadinessComponents(attempts: Attempt[], examResults: ExamResult[]): ReadinessComponents {
  return {
    examPerformanceScore: computeExamPerformanceScore(examResults),
    qbankAccuracyScore: computeOverallStats(attempts, new Date()).overallAccuracyPct ?? 0,
    questionVolumeScore: computeQuestionVolumeScore(attempts),
    domainCoverageScore: computeDomainCoverageScore(attempts, examResults),
  };
}

export function computeReadinessScore(attempts: Attempt[], examResults: ExamResult[]): ReadinessResult {
  const components = computeReadinessComponents(attempts, examResults);
  const weights = analyticsConfig.READINESS_WEIGHTS;
  const score = Math.round(
    components.examPerformanceScore * weights.examPerformance +
      components.qbankAccuracyScore * weights.qbankAccuracy +
      components.questionVolumeScore * weights.questionVolume +
      components.domainCoverageScore * weights.domainCoverage
  );

  return {
    score,
    components,
    trend: computeReadinessTrend(examResults),
  };
}
