import { contentRepository } from './contentRepository';

/**
 * STUB for M3. Real attempt/completion tracking is M6 (offline storage) +
 * M8 (dashboard aggregation) — this exists now because the System screen
 * and "More Topics" cards need *some* progress values today, and the task
 * is explicit that they "should come from the repository/progress layer
 * where possible, even if currently zero" rather than being hardcoded
 * inline in a screen component.
 *
 * `lessonsTotal`/`questionsTotal` are real, computed from the validated
 * content repository — not placeholders. `lessonsCompleted`/
 * `questionsAnswered`/`accuracyPct` are honestly zero/null today because
 * no attempt data exists yet; M6 replaces the body of this function with
 * real reads from its storage layer without changing this function's
 * signature, so screens consuming it don't change.
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
  getSystemProgress(systemKey: string): SystemProgress {
    return {
      lessonsCompleted: 0,
      lessonsTotal: contentRepository.getLessonsForSystem(systemKey).length,
      questionsAnswered: 0,
      questionsTotal: contentRepository.getQuestions({ systemKey }).length,
      accuracyPct: null,
    };
  },
};
