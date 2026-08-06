import type { Question, QuestionDomain } from './question';

/**
 * A single recorded answer to a question, from any source (QBank today;
 * exams/AI-generated questions in later milestones — the shape doesn't
 * assume QBank). Persisted locally only (Phase 9 / this milestone's
 * explicit "do not sync remotely").
 */
export type AttemptAnswer =
  | { type: 'single'; label: string }
  | { type: 'sata'; labels: string[] }
  | { type: 'numeric'; text: string };

export type Attempt = {
  id: string;
  questionId: string;
  systemKey: string;
  domain: QuestionDomain;
  questionType: Question['type'];
  answer: AttemptAnswer;
  isCorrect: boolean;
  /** ISO 8601 timestamp — also serves as "last attempted" when multiple attempts exist for one question. */
  attemptedAt: string;
};
