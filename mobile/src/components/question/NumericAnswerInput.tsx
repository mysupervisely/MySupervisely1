import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';

type NumericAnswerInputProps = {
  value: string;
  unit?: string;
  isLocked: boolean;
  isCorrect?: boolean;
  onChangeText: (text: string) => void;
};

/**
 * Numeric/calculation answer entry. `keyboardType="decimal-pad"` gives a
 * numeric keypad (Phase requirement) while still allowing a decimal point
 * and a leading minus sign (typed via the input's own text, since
 * decimal-pad doesn't include one — negative correctValues do exist in
 * the content, e.g. base deficit/excess calculations, so this can't use a
 * stricter numeric-only keyboard that omits "-").
 */
export function NumericAnswerInput({ value, unit, isLocked, isCorrect, onChangeText }: NumericAnswerInputProps) {
  return (
    <View style={styles.container}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        editable={!isLocked}
        keyboardType="decimal-pad"
        placeholder="Enter your answer"
        placeholderTextColor={colors.inkSoft}
        accessibilityLabel={`Numeric answer${unit ? `, in ${unit}` : ''}`}
        style={[
          styles.input,
          isLocked && (isCorrect ? styles.inputCorrect : styles.inputIncorrect),
        ]}
      />
      {unit ? <Text style={styles.unit}>{unit}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  input: {
    ...typeScale.h3,
    color: colors.ink,
    minWidth: 140,
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.paperRaised,
  },
  inputCorrect: {
    borderColor: colors.teal,
    borderWidth: 2,
    backgroundColor: 'rgba(15, 125, 128, 0.08)',
  },
  inputIncorrect: {
    borderColor: colors.flag,
    borderWidth: 2,
    backgroundColor: 'rgba(174, 59, 69, 0.08)',
  },
  unit: {
    ...typeScale.bodyMedium,
    color: colors.inkSoft,
  },
});
