import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';
import type { QuestionOption } from '../../models';

type SingleAnswerOptionsProps = {
  options: QuestionOption[];
  selectedLabel: string;
  correctLabel?: string;
  /** Present iff the question has been submitted — options render locked/reviewable. */
  isLocked: boolean;
  onSelect: (label: string) => void;
};

export function SingleAnswerOptions({
  options,
  selectedLabel,
  correctLabel,
  isLocked,
  onSelect,
}: SingleAnswerOptionsProps) {
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = option.label === selectedLabel;
        const isCorrectOption = isLocked && option.label === correctLabel;
        const isWrongSelection = isLocked && isSelected && option.label !== correctLabel;

        return (
          <Pressable
            key={option.label}
            disabled={isLocked}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected, disabled: isLocked }}
            accessibilityLabel={`Option ${option.label}: ${option.text}${
              isLocked ? (isCorrectOption ? ' — correct answer' : isWrongSelection ? ' — your answer, incorrect' : '') : ''
            }`}
            onPress={() => onSelect(option.label)}
            style={[
              styles.option,
              isSelected && !isLocked && styles.optionSelected,
              isCorrectOption && styles.optionCorrect,
              isWrongSelection && styles.optionIncorrect,
            ]}
          >
            <View
              style={[
                styles.labelBadge,
                isSelected && !isLocked && styles.labelBadgeSelected,
                isCorrectOption && styles.labelBadgeCorrect,
                isWrongSelection && styles.labelBadgeIncorrect,
              ]}
            >
              <Text
                style={[
                  styles.labelBadgeText,
                  (isSelected && !isLocked) || isCorrectOption || isWrongSelection
                    ? styles.labelBadgeTextActive
                    : null,
                ]}
              >
                {option.label}
              </Text>
            </View>
            <Text style={styles.optionText}>{option.text}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.paperRaised,
  },
  optionSelected: {
    borderColor: colors.teal,
    borderWidth: 2,
  },
  optionCorrect: {
    borderColor: colors.teal,
    borderWidth: 2,
    backgroundColor: 'rgba(15, 125, 128, 0.08)',
  },
  optionIncorrect: {
    borderColor: colors.flag,
    borderWidth: 2,
    backgroundColor: 'rgba(174, 59, 69, 0.08)',
  },
  labelBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  labelBadgeSelected: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  labelBadgeCorrect: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  labelBadgeIncorrect: {
    backgroundColor: colors.flag,
    borderColor: colors.flag,
  },
  labelBadgeText: {
    ...typeScale.monoLabel,
    color: colors.ink,
  },
  labelBadgeTextActive: {
    color: colors.paperRaised,
  },
  optionText: {
    ...typeScale.body,
    color: colors.ink,
    flex: 1,
  },
});
