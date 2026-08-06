import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ProgressScreen } from '../screens/progress/ProgressScreen';
import { StudyRecommendationsScreen } from '../screens/progress/StudyRecommendationsScreen';
import { StudySessionScreen } from '../screens/progress/StudySessionScreen';
import { ExamHistoryScreen } from '../screens/progress/ExamHistoryScreen';
import { colors, fontFamily } from '../theme';
import type { ProgressStackParamList } from './types';

const Stack = createNativeStackNavigator<ProgressStackParamList>();

/**
 * M7: Progress -> StudyRecommendations -> StudySession, and Progress ->
 * ExamHistory — the nested stack ProgressTab needed once M7.5/M7.7 gave
 * it real destinations beyond the single dashboard screen (M5/M6 had it
 * as a plain, un-nested tab screen).
 */
export function ProgressStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fontFamily.displaySemiBold },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Progress" component={ProgressScreen} options={{ title: 'Progress' }} />
      <Stack.Screen
        name="StudyRecommendations"
        component={StudyRecommendationsScreen}
        options={{ title: 'Recommended Study' }}
      />
      <Stack.Screen name="StudySession" component={StudySessionScreen} options={{ title: 'Study Session' }} />
      <Stack.Screen name="ExamHistory" component={ExamHistoryScreen} options={{ title: 'Exam History' }} />
    </Stack.Navigator>
  );
}
