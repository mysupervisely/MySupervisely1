import type { PropsWithChildren } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, spacing } from '../theme';

type ScreenContainerProps = PropsWithChildren<{
  /** Set false for screens that manage their own scrolling (e.g. a future map/canvas). */
  scrollable?: boolean;
}>;

/**
 * Shared screen shell: safe-area handling + brand paper background + consistent
 * padding. Every screen stub in M1 renders inside this rather than duplicating
 * SafeAreaView/background boilerplate per screen.
 */
export function ScreenContainer({ children, scrollable = true }: ScreenContainerProps) {
  const Wrapper = scrollable ? ScrollView : View;
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <Wrapper
        style={styles.flex}
        contentContainerStyle={scrollable ? styles.scrollContent : undefined}
      >
        {children}
      </Wrapper>
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
