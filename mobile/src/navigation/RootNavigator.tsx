import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { OnboardingScreen } from '../screens/onboarding/OnboardingScreen';
import { MainTabNavigator } from './MainTabNavigator';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Root stack: Onboarding, then the tabbed Main app. No auth/persistence gating yet (M6). */
export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
      <Stack.Screen name="Main" component={MainTabNavigator} />
    </Stack.Navigator>
  );
}
