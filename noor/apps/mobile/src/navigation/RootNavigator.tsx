import { useEffect, useState } from "react";
import { NavigationContainer, type LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { PatientProfileDTO } from "@noor/types";
import { useAuth } from "../lib/AuthContext";
import { apiFetch, ApiError } from "../lib/api";
import { LaunchScreen } from "../screens/LaunchScreen";
import { AuthStack } from "./AuthStack";
import { OnboardingScreen } from "../screens/onboarding/OnboardingScreen";
import { MainTabs } from "./MainTabs";
import type { RootStackParamList } from "./types";
import { colors } from "../theme";

const RootStack = createNativeStackNavigator<RootStackParamList>();

// Deep-link foundation (M5 brief §18): a future notification/link can
// open "noor://check-in" or "noor://home" — every path maps to a route
// name that already exists, and NONE carries PHI or a sensitive
// identifier (a check-in id, if ever linked directly, would be an opaque
// UUID — same rule as the web app). Universal links (https://) are
// deliberately not configured yet — the brief cautions against
// overbuilding this in M5 ("do not overbuild universal/app links unless
// necessary"); the custom `noor://` scheme alone is the integration
// point until a real hosted association file is needed.
const linking: LinkingOptions<RootStackParamList> = {
  prefixes: ["noor://"],
  config: {
    screens: {
      Main: {
        screens: {
          HomeTab: "home",
          CheckInTab: {
            screens: {
              CheckIn: "check-in",
              CheckInHistory: "check-in/history",
              // Deliberately NOT included: a direct deep link straight to
              // CheckInDetail with a checkInId in the URL — that would put
              // a specific record identifier in a link that could end up
              // in OS-level link history/logs outside Noor's control. A
              // notification can open the history LIST safely; opening one
              // specific check-in stays an in-app navigation action.
            },
          },
          CareTab: "care",
        },
      },
    },
  },
};

/** Gates Main vs. Onboarding for a signed-in user by checking
 * `onboardingCompletedAt` — the same decision the web app's Home page
 * makes, centralized here once so neither screen has to duplicate it. */
function PostAuthGate() {
  const [checking, setChecking] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const { signOut } = useAuth();

  useEffect(() => {
    let cancelled = false;
    apiFetch<PatientProfileDTO>("/patients/me")
      .then((profile) => {
        if (!cancelled) setNeedsOnboarding(!profile.onboardingCompletedAt);
      })
      .catch((err) => {
        // A non-patient account (shouldn't normally reach this native
        // patient-only app) or an unexpected error — fail safe to signed
        // out rather than getting stuck on a blank screen.
        if (!cancelled && !(err instanceof ApiError && err.status === 401)) {
          signOut().catch(() => undefined);
        }
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  if (checking) return <LaunchScreen />;
  return needsOnboarding ? <OnboardingScreen /> : <MainTabs />;
}

export function RootNavigator() {
  const { status } = useAuth();

  return (
    <NavigationContainer linking={linking} fallback={<LaunchScreen />}>
      <RootStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream } }}>
        {status === "loading" && <RootStack.Screen name="Launch" component={LaunchScreen} />}
        {status === "signedOut" && <RootStack.Screen name="Auth" component={AuthStack} />}
        {status === "signedIn" && <RootStack.Screen name="Main" component={PostAuthGate} />}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
