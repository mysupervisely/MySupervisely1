import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing, typeScale } from '../theme';

type SelectChipProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * A single selectable pill. Originally built for AIQuestionSetupScreen's
 * Domain/Difficulty pickers (M8); reused as-is by M9's paywall duration
 * picker — generic enough that no per-screen variant was needed.
 */
export function SelectChip({ label, selected, onPress }: SelectChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.paperRaised,
  },
  chipSelected: {
    borderColor: colors.teal,
    backgroundColor: colors.teal,
  },
  chipText: {
    ...typeScale.bodyMedium,
    color: colors.ink,
  },
  chipTextSelected: {
    color: colors.paperRaised,
  },
});
