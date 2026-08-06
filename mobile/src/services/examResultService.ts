import { isAnswerable, scoreQuestion } from './scoringService';
import type { Question, QuestionDomain } from '../models';
import type { DomainBreakdown, ExamResult, SystemBreakdown } from '../models/examResult';
import type { ExamSessionState } from './examSession';

const ALL_DOMAINS: QuestionDomain[] = [1, 2, 3, 4, 5];

/**
 * Grades a just-submitted exam session into a permanent ExamResult
 * record. Pure — takes the session state, returns a value; does not touch
 * storage (that's src/storage/examResultsStorage.ts's job, called once by
 * the hook right after this).
 */
export function computeExamResult(state: ExamSessionState, id: string): ExamResult {
  const answeredQuestions: Question[] = [];
  const incorrectQuestionIds: string[] = [];
  let correctCount = 0;

  for (const question of state.questions) {
    const draft = state.answers[question.id];
    if (draft === undefined || !isAnswerable(question, draft)) continue; // unanswered — excluded from grading, per the audit's rule
    answeredQuestions.push(question);
    const isCorrect = scoreQuestion(question, draft);
    if (isCorrect) {
      correctCount++;
    } else {
      incorrectQuestionIds.push(question.id);
    }
  }

  const answeredCount = answeredQuestions.length;
  const accuracyPct = answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;
  const scorePct = state.questions.length > 0 ? Math.round((correctCount / state.questions.length) * 100) : 0;

  return {
    id,
    examNumber: state.examNumber,
    submittedAt: state.submittedAt ?? new Date().toISOString(),
    totalQuestions: state.questions.length,
    answeredCount,
    correctCount,
    accuracyPct,
    scorePct,
    domainBreakdown: computeDomainBreakdown(state),
    systemBreakdown: computeSystemBreakdown(state),
    flaggedQuestionIds: state.flaggedQuestionIds,
    incorrectQuestionIds,
  };
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
): { total: number; correct: number; accuracyPct: number | null } {
  let answered = 0;
  let correct = 0;
  for (const q of questions) {
    const draft = state.answers[q.id];
    if (draft === undefined || !isAnswerable(q, draft)) continue;
    answered++;
    if (scoreQuestion(q, draft)) correct++;
  }
  const accuracyPct = answered > 0 ? Math.round((correct / answered) * 100) : null;
  return { total: questions.length, correct, accuracyPct };
}
