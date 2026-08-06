import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';

type StatTileProps = {
  label: string;
  value: string;
  accessibilityLabel?: string;
};

/** One dashboard stat tile (Total Answered, Accuracy, Today, This Week, Streak, Last Session). */
export function StatTile({ label, value, accessibilityLabel }: StatTileProps) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: '48%',
    minHeight: 44,
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.xs / 2,
  },
  value: {
    ...typeScale.h1,
    color: colors.ink,
  },
  label: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
});
