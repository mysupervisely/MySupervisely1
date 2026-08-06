import type { NavigatorScreenParams } from '@react-navigation/native';

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
 *         - ExamTab
 *         - ProgressTab
 *         - PricingTab
 *
 * `System`/`Lesson` already accept the params M3/M4 will need (a system
 * key, and a lesson index within that system) so those milestones don't
 * have to touch this file. Nothing here reads real content in M1 — the
 * `systemKey` type is `string` for now; M2 should narrow it to the real
 * union of system keys once the content layer exists.
 */

export type HomeStackParamList = {
  Home: undefined;
  System: { systemKey: string };
  Lesson: { systemKey: string; lessonIndex: number };
};

export type MainTabParamList = {
  HomeTab: NavigatorScreenParams<HomeStackParamList>;
  QBankTab: undefined;
  ExamTab: undefined;
  ProgressTab: undefined;
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
