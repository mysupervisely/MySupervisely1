import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Text } from "react-native";
import type { MainTabParamList } from "./types";
import { HomeScreen } from "../screens/home/HomeScreen";
import { CheckInStack } from "./CheckInStack";
import { CareScreen } from "../screens/care/CareScreen";
import { ProfileScreen } from "../screens/profile/ProfileScreen";
import { colors, fonts } from "../theme";

const Tab = createBottomTabNavigator<MainTabParamList>();

// Primary patient navigation (M5 brief §5): Home / Check-In / Care /
// Profile — deliberately simple, no Messages tab, no fake functionality.
// Icons are plain text glyphs rather than an icon-font dependency, kept
// legible and paired with a text label always visible (never
// icon-only, and never color-only for the active state — the active tab
// is bold AND gold, matching the same "not color alone" rule used
// throughout Noor's web accessibility work).
export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.cream },
        headerTitleStyle: { fontFamily: fonts.display, color: colors.ink },
        tabBarActiveTintColor: colors.goldDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.white, borderTopColor: colors.border },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 12 },
        tabBarIcon: ({ color, focused }) => (
          <Text style={{ color, fontSize: 18, fontWeight: focused ? "700" : "400" }}>{tabGlyph(route.name)}</Text>
        ),
      })}
    >
      <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: "Home" }} />
      <Tab.Screen name="CheckInTab" component={CheckInStack} options={{ title: "Check-In", headerShown: false }} />
      <Tab.Screen name="CareTab" component={CareScreen} options={{ title: "Care" }} />
      <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ title: "Profile" }} />
    </Tab.Navigator>
  );
}

function tabGlyph(routeName: keyof MainTabParamList): string {
  switch (routeName) {
    case "HomeTab":
      return "⌂";
    case "CheckInTab":
      return "✓";
    case "CareTab":
      return "♥";
    case "ProfileTab":
      return "●";
    default:
      return "•";
  }
}
