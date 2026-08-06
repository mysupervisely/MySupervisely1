import type { QuestionDomain } from './question';

/**
 * M7.8 — "Prepare architecture for instructor dashboard. Do not build
 * full instructor accounts yet." This is the shape a future instructor
 * dashboard would read one row per student — nothing here has a
 * consumer yet (there is no instructor UI, and no multi-student backend
 * in this app), but the shape is real and generatable today from the
 * exact same local data every other M7 feature reads.
 *
 * "Keep compatible with future cloud sync": every field is a plain,
 * JSON-serializable primitive (string/number/array of numbers) — no
 * class instances, no Dates (ISO strings instead), nothing that assumes
 * a particular storage/transport. `schemaVersion` exists specifically so
 * a future sync consumer can detect and migrate an older locally-cached
 * snapshot rather than silently misreading it.
 */
export type StudentAnalyticsSnapshot = {
  schemaVersion: 1;
  /**
   * Today, always the constant `LOCAL_STUDENT_ID` (see
   * instructorAnalyticsService.ts) — this app has no accounts, so there
   * is exactly one "student" per device. The field exists now, typed as
   * a real identifier rather than omitted, so a future multi-student
   * backend is a matter of populating it with a real account id, not
   * reshaping every snapshot consumer.
   */
  studentId: string;
  /** ISO timestamp of when this snapshot was computed — snapshots are derived on demand, never persisted as a second source of truth (see instructorAnalyticsService.ts). */
  generatedAt: string;
  examsCompleted: number;
  /** Average scorePct across every stored exam result (each retake counts once). Null if no exam has been completed yet — never fabricated as 0. */
  averageScorePct: number | null;
  /** Domain numbers only (1-5), from weaknessDetectionService's weakDomains — a compact, transport-friendly summary, not the full breakdown. */
  weakDomains: QuestionDomain[];
  /** Unique QBank questions answered, all-time. */
  questionVolume: number;
  /** ISO timestamp of the most recent QBank attempt OR exam submission, whichever is later. Null if there has been no activity at all. */
  lastActivityAt: string | null;
};
