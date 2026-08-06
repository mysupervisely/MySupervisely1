import type { NavigatorScreenParams } from '@react-navigation/native';

import type { ExamNumber } from '../models/exam';

/**
 * Typed navigation param lists (Phase 3: "use strongly typed navigation").
 *
 * Architecture:
 *   RootStack
 *     - Onboarding                     (initial route)
 *     - Main (bottom tabs)
 *         - HomeTab (nested stack: Home / Body Map -> System -> Lesson,
 *           matching the Phase 6 core flow: Onboarding -> Home/Body Map ->
 *           System -> Lessons -> ...)
 *         - QBankTab
 *         - ExamTab (nested stack, M6: ExamList -> ExamTaking -> ExamReview -> ExamResults)
 *         - ProgressTab
 *         - PricingTab
 *
 * `System`/`Lesson` already accept the params M3/M4 will need (a system
 * key, and a lesson index within that system) so those milestones don't
 * have to touch this file. Nothing here reads real content in M1 — the
 * `systemKey` type is `string` for now; M2 should narrow it to the real
 * union of system keys once the content layer exists. `examNumber` is
 * typed as the real `ExamNumber` (1|2|3) from the start (M6) — unlike
 * `systemKey`, the set of exams is small, fixed, and fully known, so
 * there's no equivalent reason to defer narrowing it.
 */

export type HomeStackParamList = {
  Home: undefined;
  System: { systemKey: string };
  Lesson: { systemKey: string; lessonIndex: number };
};

export type ExamStackParamList = {
  ExamList: undefined;
  ExamTaking: { examNumber: ExamNumber };
  ExamReview: { examNumber: ExamNumber };
  ExamResults: { examNumber: ExamNumber; resultId: string };
  /** M7.3 — post-exam, read-only question review. `questionIndex` optional, defaults to 0 (the first question). */
  ExamQuestionReview: { examNumber: ExamNumber; resultId: string; questionIndex?: number };
};

/**
 * M7: Progress becomes a nested stack (was a single screen through M6) —
 * Progress -> StudyRecommendations -> StudySession (M7.5) and
 * Progress -> ExamHistory (M7.7). `questionIds` travels through
 * navigation params rather than a store, same as `examNumber` elsewhere —
 * a plain, serializable string array, nothing React Navigation needs
 * special handling for.
 */
export type ProgressStackParamList = {
  Progress: undefined;
  StudyRecommendations: undefined;
  StudySession: { title: string; questionIds: string[] };
  ExamHistory: undefined;
};

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  QBankTab: undefined;
  ExamTab: NavigatorScreenParams<ExamStackParamList>;
  ProgressTab: NavigatorScreenParams<ProgressStackParamList>;
  PricingTab: undefined;
};

export type RootStackParamList = {
  Onboarding: undefined;
  Main: NavigatorScreenParams<MainTabParamList>;
};

declare global {
  namespace ReactNavigation {
    // Standard React Navigation typing pattern: this interface's only job is
    // to merge with the library's own declaration, so it's intentionally
    // member-less.
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface RootParamList extends RootStackParamList {}
  }
}
