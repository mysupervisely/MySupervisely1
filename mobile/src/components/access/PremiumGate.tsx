import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';

type PremiumGateProps = PropsWithChildren<{
  isEntitled: boolean;
  isLoading: boolean;
  title: string;
  description: string;
  onUnlockPress: () => void;
}>;

/**
 * M9 — the one reusable locked-content presentation, used everywhere a
 * screen gates a premium action ("do not scatter entitlement checks
 * throughout screens" — the CHECK itself lives in useAccessState.ts/
 * accessService.ts; this component is only the UI for "not entitled
 * yet," reused rather than re-styled per screen). Purely presentational
 * — the calling screen owns `useAccessState()` and passes the resulting
 * booleans down, same pattern as every other data-vs-presentation split
 * in this codebase (e.g. ReadinessScoreCard).
 */
export function PremiumGate({ isEntitled, isLoading, title, description, onUnlockPress, children }: PremiumGateProps) {
  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.teal} accessibilityLabel="Checking access" />
      </View>
    );
  }

  if (isEntitled) {
    return <>{children}</>;
  }

  return (
    <View style={styles.card} accessible accessibilityLabel={`${title} requires access. ${description}`}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Unlock access" style={styles.button} onPress={onUnlockPress}>
        <Text style={styles.buttonText}>Unlock Access</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  card: {
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.amber,
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  title: {
    ...typeScale.h2,
    color: colors.ink,
  },
  description: {
    ...typeScale.body,
    color: colors.inkSoft,
  },
  button: {
    marginTop: spacing.sm,
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  buttonText: {
    ...typeScale.h3,
    color: colors.paperRaised,
  },
});
