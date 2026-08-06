import type { PropsWithChildren } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typeScale } from '../theme';

type ScreenTitleProps = PropsWithChildren<{
  eyebrow?: string;
}>;

/** Consistent screen header: optional small mono eyebrow label + h1 title. */
export function ScreenTitle({ eyebrow, children }: ScreenTitleProps) {
  return (
    <View style={styles.container}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  eyebrow: {
    ...typeScale.monoLabel,
    color: colors.teal,
    letterSpacing: 0.5,
  },
  title: {
    ...typeScale.h1,
    color: colors.ink,
  },
});
