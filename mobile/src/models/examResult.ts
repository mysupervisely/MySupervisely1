import type { ExamNumber } from './exam';
import type { QuestionDomain } from './question';
import type { AttemptAnswer } from './attempt';

export type DomainBreakdown = {
  domain: QuestionDomain;
  total: number;
  /** M7 addition — was computed internally but discarded before this; needed to combine exam + QBank domain performance (weaknessDetectionService.ts) without reverse-engineering it from accuracyPct. */
  answered: number;
  correct: number;
  /** Over ANSWERED questions in this domain, matching the exam-wide score rule — see examResultService.ts. */
  accuracyPct: number | null;
};

export type SystemBreakdown = {
  systemKey: string;
  total: number;
  answered: number;
  correct: number;
  accuracyPct: number | null;
};

/** One question's outcome, snapshotted permanently at submission — the basis for M7.3's post-exam review. */
export type ExamResultQuestionAnswer = {
  questionId: string;
  /** undefined if the question was left unanswered. */
  answer?: AttemptAnswer;
  isAnswered: boolean;
  isCorrect: boolean;
  isFlagged: boolean;
};

/**
 * A completed exam attempt's graded summary. Computed once at submission
 * (src/services/examResultService.ts) and stored permanently — this is
 * the historical record a student reviews later, independent of the live
 * ExamSessionState (which reflects the current/most recent attempt only,
 * and which "Retake" clears — see docs/M6_IMPLEMENTATION_NOTES.md). M7
 * extends this with the fields needed for question-level review, timing,
 * and the unanswered/incorrect counts the task calls for by name — all
 * additive; no M6 field was renamed or removed (`examNumber` already
 * serves as this record's "examId", `submittedAt` as its "completedAt" —
 * see docs/M7_IMPLEMENTATION_NOTES.md for the explicit field-naming
 * mapping rather than silently renaming established M6 fields).
 */
export type ExamResult = {
  id: string;
  examNumber: ExamNumber;
  submittedAt: string;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  /** M7 addition — previously only derivable via `incorrectQuestionIds.length`. */
  incorrectCount: number;
  /** M7 addition — `totalQuestions - answeredCount`, named explicitly per the task's field list. */
  unansweredCount: number;
  /**
   * correctCount / answeredCount * 100, rounded — the EXACT rule
   * documented in docs/MOBILE_MIGRATION_AUDIT.md §E and preserved
   * unchanged here ("the denominator is answered questions, not total
   * 225" — an established business rule, not something this milestone
   * gets to redefine). Displayed as "Accuracy."
   */
  accuracyPct: number;
  /**
   * correctCount / totalQuestions * 100, rounded — a second, additive
   * framing not present in the web app: "how many of the full 225 did you
   * get right," the classic raw-score framing. Displayed as "Score" /
   * "percentageScore."
   */
  scorePct: number;
  /**
   * M7 addition. Wall-clock seconds from `startedAt` to `submittedAt` —
   * NOT a measure of active/focused study time (this app has no per-
   * question dwell-time instrumentation; see docs/M7_IMPLEMENTATION_NOTES.md
   * for exactly what this can and can't claim to represent).
   */
  totalTimeSpentSeconds: number;
  /**
   * M7 addition. totalTimeSpentSeconds / totalQuestions — an exam-wide
   * pacing average (matches the real exam's own "6 hours / 225 questions"
   * framing), not a true per-question measurement (see above).
   */
  averageTimePerQuestionSeconds: number;
  domainBreakdown: DomainBreakdown[];
  systemBreakdown: SystemBreakdown[];
  flaggedQuestionIds: string[];
  incorrectQuestionIds: string[];
  /** M7 addition — every question's outcome, in exam slot order, for post-exam review (M7.3). */
  questionAnswers: ExamResultQuestionAnswer[];
};
