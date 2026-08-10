import type { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

type ScreenContainerProps = PropsWithChildren<{
  /** Set false for screens that manage their own scrolling (e.g. a future map/canvas). */
  scrollable?: boolean;
}>;

/**
 * Shared screen shell: safe-area handling + brand paper background +
 * consistent padding. Every screen stub in M1 renders inside this rather
 * than duplicating SafeAreaView/background boilerplate per screen.
 *
 * M10 polish: two keyboard-behavior fixes applied here once, benefiting
 * every screen that uses `ScreenContainer` rather than fixing them
 * per-screen — `keyboardShouldPersistTaps="handled"` so a button placed
 * right next to a focused TextInput (e.g. PricingScreen's "Verify"
 * buttons) registers on the first tap instead of just dismissing the
 * keyboard, and a `KeyboardAvoidingView` so a TextInput near the bottom
 * of a screen isn't left covered by the keyboard on iOS.
 */
export function ScreenContainer({ children, scrollable = true }: ScreenContainerProps) {
  const Wrapper = scrollable ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Wrapper
          style={styles.flex}
          contentContainerStyle={scrollable ? styles.scrollContent : undefined}
          keyboardShouldPersistTaps={scrollable ? 'handled' : undefined}
        >
          {children}
        </Wrapper>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
});
