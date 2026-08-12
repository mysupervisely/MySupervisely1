import { useCallback, useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import { useFonts, CormorantGaramond_600SemiBold, CormorantGaramond_700Bold } from "@expo-google-fonts/cormorant-garamond";
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold } from "@expo-google-fonts/dm-sans";
import { AuthProvider } from "./lib/AuthContext";
import { RootNavigator } from "./navigation/RootNavigator";
import { colors } from "./theme";

// Keep the native splash screen up until fonts are ready — avoids a
// flash of system-font text before the Noor brand fonts load (M5 brief
// §9: "avoid unnecessary splash-screen delay," which this respects by
// only holding for font load, not an arbitrary timer).
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    CormorantGaramond_600SemiBold,
    CormorantGaramond_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  if (!fontsLoaded && !fontError) {
    return null; // native splash screen is still visible
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.cream }}>
        <StatusBar style="dark" />
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </View>
    </SafeAreaProvider>
  );
}
