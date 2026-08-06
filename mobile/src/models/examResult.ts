import type { ExamNumber } from './exam';
import type { QuestionDomain } from './question';

export type DomainBreakdown = {
  domain: QuestionDomain;
  total: number;
  correct: number;
  /** Over ANSWERED questions in this domain, matching the exam-wide score rule — see examResultService.ts. */
  accuracyPct: number | null;
};

export type SystemBreakdown = {
  systemKey: string;
  total: number;
  correct: number;
  accuracyPct: number | null;
};

/**
 * A completed exam attempt's graded summary. Computed once at submission
 * (src/services/examResultService.ts) and stored permanently — this is
 * the historical record a student reviews later, independent of the live
 * ExamSessionState (which reflects the current/most recent attempt only).
 */
export type ExamResult = {
  id: string;
  examNumber: ExamNumber;
  submittedAt: string;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
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
   * get right," the classic raw-score framing. Displayed as "Score."
   */
  scorePct: number;
  domainBreakdown: DomainBreakdown[];
  systemBreakdown: SystemBreakdown[];
  flaggedQuestionIds: string[];
  incorrectQuestionIds: string[];
};
