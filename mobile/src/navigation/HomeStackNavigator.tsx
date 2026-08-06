import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { HomeScreen } from '../screens/home/HomeScreen';
import { SystemScreen } from '../screens/home/SystemScreen';
import { LessonScreen } from '../screens/home/LessonScreen';
import { colors, fontFamily } from '../theme';
import type { HomeStackParamList } from './types';

const Stack = createNativeStackNavigator<HomeStackParamList>();

/** Home / Body Map -> System -> Lesson, the Phase 6 core-flow stack nested under the Home tab. */
export function HomeStackNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fontFamily.displaySemiBold },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'PharmDPrepped' }} />
      <Stack.Screen name="System" component={SystemScreen} options={{ title: 'System' }} />
      <Stack.Screen name="Lesson" component={LessonScreen} options={{ title: 'Lesson' }} />
    </Stack.Navigator>
  );
}
