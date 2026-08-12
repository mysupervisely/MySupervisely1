import type { NavigatorScreenParams } from "@react-navigation/native";

// Deep-link foundation (M5 brief §18): every route name below doubles as
// its deep-link path via the `linking` config in RootNavigator.tsx — see
// that file. No PHI or sensitive identifier is ever part of a public
// path segment; a check-in id is an opaque UUID, same rule as the web
// app (docs/noor/M3-IMPLEMENTATION.md §11).

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  Signup: undefined;
};

export type CheckInStackParamList = {
  // A single screen owns every phase (intro/question/review/confirmation)
  // internally, same structure as the web wizard
  // (apps/patient/src/app/check-in/page.tsx) — one data-driven flow, not
  // one nav screen per question, since the number/order of questions is
  // server-driven and shouldn't dictate the navigation stack shape.
  CheckIn: undefined;
  CheckInHistory: undefined;
  CheckInDetail: { checkInId: string };
};

export type MainTabParamList = {
  HomeTab: undefined;
  CheckInTab: NavigatorScreenParams<CheckInStackParamList>;
  CareTab: undefined;
  ProfileTab: undefined;
};

export type RootStackParamList = {
  Launch: undefined;
  Auth: NavigatorScreenParams<AuthStackParamList>;
  // Once signed in, PostAuthGate (RootNavigator.tsx) decides between
  // onboarding and the main tabs internally, rather than that being a
  // distinct route here — see that file's comment.
  Main: NavigatorScreenParams<MainTabParamList>;
};

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
