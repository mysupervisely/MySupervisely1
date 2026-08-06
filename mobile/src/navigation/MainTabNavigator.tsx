import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { HomeStackNavigator } from './HomeStackNavigator';
import { ExamStackNavigator } from './ExamStackNavigator';
import { QBankScreen } from '../screens/qbank/QBankScreen';
import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { PricingScreen } from '../screens/pricing/PricingScreen';
import { colors, fontFamily } from '../theme';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

/**
 * Bottom-tab shell for the app's main sections (Phase 6: "The app should
 * also provide access to QBank, Full-length exams, AI-generated practice,
 * Progress, Pricing/access"). AI-generated practice doesn't get its own tab
 * — per the audit it's an entry point reached from within QBank/Home, not a
 * standalone destination — so this tab bar covers the remaining four plus
 * the Home/Body Map core flow.
 *
 * No icon library is added for M1 (Phase 13: no unnecessary dependencies) —
 * label-only tabs for now, revisit if the design needs icons later.
 */
export function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarStyle: { backgroundColor: colors.paperRaised, borderTopColor: colors.line },
        tabBarLabelStyle: { fontFamily: fontFamily.displayMedium, fontSize: 11 },
      }}
    >
      <Tab.Screen name="HomeTab" component={HomeStackNavigator} options={{ title: 'Home' }} />
      <Tab.Screen name="QBankTab" component={QBankScreen} options={{ title: 'QBank' }} />
      <Tab.Screen name="ExamTab" component={ExamStackNavigator} options={{ title: 'Exams' }} />
      <Tab.Screen
        name="ProgressTab"
        component={ProgressScreen}
        options={{ title: 'Progress' }}
      />
      <Tab.Screen name="PricingTab" component={PricingScreen} options={{ title: 'Pricing' }} />
    </Tab.Navigator>
  );
}
