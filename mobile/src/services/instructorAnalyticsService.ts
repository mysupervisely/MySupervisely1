import { computeOverallStats } from './progressAnalyticsService';
import { computeWeaknessReport } from './weaknessDetectionService';
import type { Attempt } from '../models/attempt';
import type { ExamResult } from '../models/examResult';
import type { StudentAnalyticsSnapshot } from '../models/studentAnalyticsSnapshot';

/**
 * M7.8 — Instructor Analytics Foundation. A pure function, same pattern
 * as the rest of M7: given already-loaded Attempts + ExamResults, produce
 * the per-student summary shape a future instructor dashboard would
 * consume. There is deliberately no storage module here — a
 * StudentAnalyticsSnapshot is always computed fresh from
 * attemptsStorage/examResultsStorage (the real source of truth), never
 * cached as a second, driftable copy. When a real backend/instructor
 * account system exists, this same function is what would run
 * server-side per student (or run locally and get synced up) — this
 * milestone only builds the shape and the pure computation, not the sync.
 */

/** This app has no accounts — every local student maps to this one constant id until real accounts exist. */
export const LOCAL_STUDENT_ID = 'local-student';

export function computeStudentAnalyticsSnapshot(
  studentId: string,
  attempts: Attempt[],
  examResults: ExamResult[]
): StudentAnalyticsSnapshot {
  const weaknessReport = computeWeaknessReport(attempts, examResults);
  const questionVolume = computeOverallStats(attempts, new Date()).totalQuestionsAnswered;

  const averageScorePct =
    examResults.length > 0
      ? Math.round(examResults.reduce((sum, r) => sum + r.scorePct, 0) / examResults.length)
      : null;

  const lastAttemptAt = latestTimestamp(attempts.map((a) => a.attemptedAt));
  const lastExamAt = latestTimestamp(examResults.map((r) => r.submittedAt));
  const lastActivityAt = latestTimestamp([lastAttemptAt, lastExamAt].filter((t): t is string => t !== null));

  return {
    schemaVersion: 1,
    studentId,
    generatedAt: new Date().toISOString(),
    examsCompleted: examResults.length,
    averageScorePct,
    weakDomains: weaknessReport.weakDomains.map((d) => d.domain),
    questionVolume,
    lastActivityAt,
  };
}

/** Convenience wrapper for this app's single local student. */
export function computeLocalStudentAnalyticsSnapshot(
  attempts: Attempt[],
  examResults: ExamResult[]
): StudentAnalyticsSnapshot {
  return computeStudentAnalyticsSnapshot(LOCAL_STUDENT_ID, attempts, examResults);
}

function latestTimestamp(timestamps: string[]): string | null {
  if (timestamps.length === 0) return null;
  return timestamps.reduce((latest, t) => (t > latest ? t : latest), timestamps[0]);
}
