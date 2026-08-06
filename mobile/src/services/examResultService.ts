import { isAnswerable, scoreQuestion } from './scoringService';
import type { Question, QuestionDomain } from '../models';
import type { ExamNumber } from '../models/exam';
import type { DomainBreakdown, ExamResult, ExamResultQuestionAnswer, SystemBreakdown } from '../models/examResult';
import type { ExamSessionState, PaletteEntry } from './examSession';

const ALL_DOMAINS: QuestionDomain[] = [1, 2, 3, 4, 5];

/**
 * Grades a just-submitted exam session into a permanent ExamResult
 * record. Pure — takes the session state, returns a value; does not touch
 * storage (that's src/storage/examResultsStorage.ts's job, called once by
 * the hook right after this). "Results must be generated from actual exam
 * session data. No hardcoded values." (M7.1) — every field below reads
 * from `state`; nothing here is a placeholder or an assumed default.
 */
export function computeExamResult(state: ExamSessionState, id: string): ExamResult {
  const questionAnswers: ExamResultQuestionAnswer[] = [];
  const incorrectQuestionIds: string[] = [];
  let correctCount = 0;
  let answeredCount = 0;

  for (const question of state.questions) {
    const draft = state.answers[question.id];
    const isFlagged = state.flaggedQuestionIds.includes(question.id);
    const isAnswered = draft !== undefined && isAnswerable(question, draft);

    if (!isAnswered) {
      questionAnswers.push({ questionId: question.id, isAnswered: false, isCorrect: false, isFlagged });
      continue; // unanswered — excluded from grading, per the audit's rule
    }

    answeredCount++;
    const isCorrect = scoreQuestion(question, draft);
    if (isCorrect) correctCount++;
    else incorrectQuestionIds.push(question.id);
    questionAnswers.push({ questionId: question.id, answer: draft, isAnswered: true, isCorrect, isFlagged });
  }

  const totalQuestions = state.questions.length;
  const unansweredCount = totalQuestions - answeredCount;
  const accuracyPct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  const scorePct = totalQuestions > 0 ? Math.round((correctCount / totalQuestions) * 100) : 0;

  const submittedAt = state.submittedAt ?? new Date().toISOString();
  const totalTimeSpentSeconds = Math.max(
    0,
    Math.round((new Date(submittedAt).getTime() - new Date(state.startedAt).getTime()) / 1000)
  );
  const averageTimePerQuestionSeconds = totalQuestions > 0 ? Math.round(totalTimeSpentSeconds / totalQuestions) : 0;

  return {
    id,
    examNumber: state.examNumber,
    submittedAt,
    totalQuestions,
    answeredCount,
    correctCount,
    incorrectCount: incorrectQuestionIds.length,
    unansweredCount,
    accuracyPct,
    scorePct,
    totalTimeSpentSeconds,
    averageTimePerQuestionSeconds,
    domainBreakdown: computeDomainBreakdown(state),
    systemBreakdown: computeSystemBreakdown(state),
    flaggedQuestionIds: state.flaggedQuestionIds,
    incorrectQuestionIds,
    questionAnswers,
  };
}

/**
 * M7.3 — the post-exam review palette's cell state, derived from a stored
 * ExamResult rather than a live ExamSessionState. Mirrors
 * examSession.ts's getPaletteEntries shape exactly (same PaletteEntry
 * type, reused as-is by PaletteGrid/QuestionPalette) but adds the one
 * thing a live exam palette can never show: `isIncorrect`, since
 * correctness is only ever real after submission.
 */
export function getReviewPaletteEntries(result: ExamResult, selectedIndex: number): PaletteEntry[] {
  return result.questionAnswers.map((qa, index) => ({
    index,
    questionId: qa.questionId,
    isAnswered: qa.isAnswered,
    isFlagged: qa.isFlagged,
    isIncorrect: qa.isAnswered && !qa.isCorrect,
    isCurrent: index === selectedIndex,
  }));
}

export type ExamHistoryEntry = {
  result: ExamResult;
  /**
   * M7.7 — this attempt's accuracyPct minus the PREVIOUS attempt of the
   * SAME exam number's accuracyPct (chronologically), or null if this is
   * that exam's first-ever recorded attempt. Compared exam-to-same-exam
   * (unlike readinessScoreService's trend, which compares the two most
   * recent results regardless of exam number) — "improvement over time"
   * on Exam 1 should mean improvement on Exam 1, not a jump from a
   * different, possibly harder/easier exam.
   */
  improvementDeltaPct: number | null;
};

/** Every stored exam result, most-recent-first, each tagged with its improvement over that SAME exam's previous attempt (if any). */
export function computeExamHistory(results: ExamResult[]): ExamHistoryEntry[] {
  const chronological = [...results].sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1));
  const previousByExam = new Map<ExamNumber, ExamResult>();
  const entries: ExamHistoryEntry[] = [];

  for (const result of chronological) {
    const previous = previousByExam.get(result.examNumber);
    entries.push({
      result,
      improvementDeltaPct: previous ? result.accuracyPct - previous.accuracyPct : null,
    });
    previousByExam.set(result.examNumber, result);
  }

  return entries.reverse();
}

function computeDomainBreakdown(state: ExamSessionState): DomainBreakdown[] {
  const byDomain = new Map<QuestionDomain, Question[]>();
  for (const q of state.questions) {
    const existing = byDomain.get(q.domain);
    if (existing) existing.push(q);
    else byDomain.set(q.domain, [q]);
  }

  return ALL_DOMAINS.map((domain) => {
    const questions = byDomain.get(domain) ?? [];
    return { domain, ...summarize(questions, state) };
  });
}

function computeSystemBreakdown(state: ExamSessionState): SystemBreakdown[] {
  const bySystem = new Map<string, Question[]>();
  for (const q of state.questions) {
    const existing = bySystem.get(q.systemKey);
    if (existing) existing.push(q);
    else bySystem.set(q.systemKey, [q]);
  }

  return [...bySystem.entries()]
    .map(([systemKey, questions]) => ({ systemKey, ...summarize(questions, state) }))
    .sort((a, b) => a.systemKey.localeCompare(b.systemKey));
}

function summarize(
  questions: Question[],
  state: ExamSessionState
): { total: number; answered: number; correct: number; accuracyPct: number | null } {
  let answered = 0;
  let correct = 0;
  for (const q of questions) {
    const draft = state.answers[q.id];
    if (draft === undefined || !isAnswerable(q, draft)) continue;
    answered++;
    if (scoreQuestion(q, draft)) correct++;
  }
  const accuracyPct = answered > 0 ? Math.round((correct / answered) * 100) : null;
  return { total: questions.length, answered, correct, accuracyPct };
}
