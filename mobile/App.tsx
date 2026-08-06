import { useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import { RootNavigator } from './src/navigation/RootNavigator';
import { fontsToLoad } from './src/theme';

// Keep the native splash screen visible until fonts are loaded, per the
// standard expo-font + expo-splash-screen pattern.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Safe to ignore — happens if this is called more than once (fast refresh).
});

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontsToLoad);

  useEffect(() => {
    if (fontError) {
      console.error('Font load error', fontError);
    }
  }, [fontError]);

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider onLayout={onLayoutRootView}>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
