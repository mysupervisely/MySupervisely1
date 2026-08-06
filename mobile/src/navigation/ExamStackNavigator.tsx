import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ExamListScreen } from '../screens/exam/ExamListScreen';
import { ExamTakingScreen } from '../screens/exam/ExamTakingScreen';
import { ExamReviewScreen } from '../screens/exam/ExamReviewScreen';
import { ExamResultsScreen } from '../screens/exam/ExamResultsScreen';
import { ExamQuestionReviewScreen } from '../screens/exam/ExamQuestionReviewScreen';
import { colors, fontFamily } from '../theme';
import type { ExamStackParamList } from './types';

const Stack = createNativeStackNavigator<ExamStackParamList>();

/**
 * ExamList -> ExamTaking -> ExamReview -> ExamResults (M6), plus
 * ExamResults -> ExamQuestionReview (M7.3) for read-only post-exam
 * question review. Both ExamTaking and ExamQuestionReview manage their
 * own in-screen header (timer/palette button, or just a palette button)
 * so they hide the default native-stack header; the other screens use
 * the same brand-styled default header as HomeStackNavigator.
 */
export function ExamStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fontFamily.displaySemiBold },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="ExamList" component={ExamListScreen} options={{ title: 'Exams' }} />
      <Stack.Screen name="ExamTaking" component={ExamTakingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ExamReview" component={ExamReviewScreen} options={{ title: 'Review' }} />
      <Stack.Screen name="ExamResults" component={ExamResultsScreen} options={{ title: 'Results' }} />
      <Stack.Screen name="ExamQuestionReview" component={ExamQuestionReviewScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
