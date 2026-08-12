import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { CheckInStackParamList } from "./types";
import { CheckInScreen } from "../screens/checkin/CheckInScreen";
import { CheckInHistoryScreen } from "../screens/checkin/CheckInHistoryScreen";
import { CheckInDetailScreen } from "../screens/checkin/CheckInDetailScreen";
import { colors } from "../theme";

const Stack = createNativeStackNavigator<CheckInStackParamList>();

export function CheckInStack() {
  return (
    <Stack.Navigator screenOptions={{ contentStyle: { backgroundColor: colors.cream } }}>
      <Stack.Screen name="CheckIn" component={CheckInScreen} options={{ title: "Noor Check-In" }} />
      <Stack.Screen name="CheckInHistory" component={CheckInHistoryScreen} options={{ title: "Check-In History" }} />
      <Stack.Screen name="CheckInDetail" component={CheckInDetailScreen} options={{ title: "Check-In" }} />
    </Stack.Navigator>
  );
}
