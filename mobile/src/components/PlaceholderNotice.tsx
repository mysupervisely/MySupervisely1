import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../theme';

type PlaceholderNoticeProps = {
  /** e.g. "M5" — which milestone in docs/MOBILE_IMPLEMENTATION_PLAN.md builds this out. */
  milestone: string;
  /** One line describing what will live here. */
  description: string;
};

/**
 * Reusable "this screen is a stub" banner, used across every M1 screen route
 * instead of each screen hand-rolling its own placeholder copy. Once a
 * milestone implements the real screen, its usage of this component is
 * simply deleted.
 */
export function PlaceholderNotice({ milestone, description }: PlaceholderNoticeProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.milestone}>COMING IN {milestone.toUpperCase()}</Text>
      <Text style={styles.description}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.paperRaised,
    borderColor: colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  milestone: {
    ...typeScale.monoLabel,
    color: colors.tealDeep,
    letterSpacing: 0.5,
  },
  description: {
    ...typeScale.body,
    color: colors.inkSoft,
  },
});
