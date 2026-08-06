import { contentRepository } from './contentRepository';
import { attemptsStorage } from '../storage/attemptsStorage';
import type { Attempt } from '../models/attempt';

/**
 * `questionsAnswered`/`accuracyPct` became real in M4, now that
 * src/storage/attemptsStorage.ts actually records attempts — this is the
 * upgrade the M3 stub's own doc comment predicted ("M6 replaces the body
 * ... without changing this function's signature"), just landing a couple
 * milestones earlier than planned because M4's Question Engine is what
 * produces the attempt data in the first place. The function signature is
 * unchanged from M3 except for becoming async (an AsyncStorage read is
 * inherently async) — see docs/M4_IMPLEMENTATION_NOTES.md for the screen-
 * side fallout of that (SystemScreen now loads this via a small hook
 * instead of a synchronous useMemo).
 *
 * `lessonsCompleted` is still honestly `0` — lesson-completion tracking is
 * a separate concern from question attempts and isn't part of M4's scope
 * (the lesson reader itself remains blocked on content, per
 * docs/M2_IMPLEMENTATION_NOTES.md and docs/M3_IMPLEMENTATION_NOTES.md).
 */

export type SystemProgress = {
  lessonsCompleted: number;
  lessonsTotal: number;
  questionsAnswered: number;
  questionsTotal: number;
  /** null = no attempts yet (distinct from 0% accuracy on attempts that were all wrong). */
  accuracyPct: number | null;
};

export const progressRepository = {
  async getSystemProgress(systemKey: string): Promise<SystemProgress> {
    const lessonsTotal = contentRepository.getLessonsForSystem(systemKey).length;
    const questionsTotal = contentRepository.getQuestions({ systemKey }).length;

    const attempts = await attemptsStorage.getAttemptsForSystem(systemKey);
    const latestByQuestion = latestAttemptPerQuestion(attempts);
    const questionsAnswered = latestByQuestion.size;
    const correctCount = [...latestByQuestion.values()].filter((a) => a.isCorrect).length;
    // Accuracy is computed over each question's MOST RECENT attempt, not
    // every historical attempt — this reflects current mastery (did you
    // get it right the last time you saw it), not a lifetime batting
    // average that a student could never improve past a bad first pass.
    const accuracyPct = questionsAnswered > 0 ? Math.round((correctCount / questionsAnswered) * 100) : null;

    return {
      lessonsCompleted: 0,
      lessonsTotal,
      questionsAnswered,
      questionsTotal,
      accuracyPct,
    };
  },
};

function latestAttemptPerQuestion(attempts: Attempt[]): Map<string, Attempt> {
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    const existing = latest.get(attempt.questionId);
    if (!existing || attempt.attemptedAt > existing.attemptedAt) {
      latest.set(attempt.questionId, attempt);
    }
  }
  return latest;
}
