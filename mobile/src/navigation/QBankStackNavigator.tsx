import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { QBankScreen } from '../screens/qbank/QBankScreen';
import { AIQuestionSetupScreen } from '../screens/qbank/AIQuestionSetupScreen';
import { AIQuestionSessionScreen } from '../screens/qbank/AIQuestionSessionScreen';
import { colors, fontFamily } from '../theme';
import type { QBankStackParamList } from './types';

const Stack = createNativeStackNavigator<QBankStackParamList>();

/**
 * M8: QBank -> AIQuestionSetup -> AIQuestionSession — the nested stack
 * QBankTab needed once AI-generated practice gave it a real destination
 * beyond the single QBank session screen (M1-M7 had it as a plain,
 * un-nested tab screen, same as ProgressTab before M7).
 */
export function QBankStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fontFamily.displaySemiBold },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="QBank" component={QBankScreen} options={{ title: 'QBank' }} />
      <Stack.Screen name="AIQuestionSetup" component={AIQuestionSetupScreen} options={{ title: 'AI Practice' }} />
      <Stack.Screen name="AIQuestionSession" component={AIQuestionSessionScreen} options={{ title: 'AI Practice' }} />
    </Stack.Navigator>
  );
}
