import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';
import type { QuestionOption } from '../../models';

type SataOptionsProps = {
  options: QuestionOption[];
  selectedLabels: string[];
  correctLabels?: string[];
  isLocked: boolean;
  onToggle: (label: string) => void;
};

/**
 * SATA options render 3 post-submit states per option: correctly chosen,
 * incorrectly chosen, and correct-but-missed (in `correctLabels` but never
 * selected) — the third state is what makes exact-set grading legible:
 * without it, a student who chose only 2 of 3 correct labels would just
 * see "wrong" with no indication of what they missed.
 */
export function SataOptions({ options, selectedLabels, correctLabels, isLocked, onToggle }: SataOptionsProps) {
  return (
    <View style={styles.container}>
      {options.map((option) => {
        const isSelected = selectedLabels.includes(option.label);
        const isCorrectLabel = !!correctLabels?.includes(option.label);
        const chosenCorrect = isLocked && isSelected && isCorrectLabel;
        const chosenWrong = isLocked && isSelected && !isCorrectLabel;
        const missedCorrect = isLocked && !isSelected && isCorrectLabel;

        let a11yState = '';
        if (chosenCorrect) a11yState = ' — selected, correct';
        else if (chosenWrong) a11yState = ' — selected, incorrect';
        else if (missedCorrect) a11yState = ' — correct answer, not selected';

        return (
          <Pressable
            key={option.label}
            disabled={isLocked}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isSelected, disabled: isLocked }}
            accessibilityLabel={`Option ${option.label}: ${option.text}${a11yState}`}
            onPress={() => onToggle(option.label)}
            style={[
              styles.option,
              isSelected && !isLocked && styles.optionSelected,
              chosenCorrect && styles.optionCorrect,
              chosenWrong && styles.optionIncorrect,
              missedCorrect && styles.optionMissed,
            ]}
          >
            <View
              style={[
                styles.checkbox,
                isSelected && !isLocked && styles.checkboxSelected,
                chosenCorrect && styles.checkboxCorrect,
                chosenWrong && styles.checkboxIncorrect,
                missedCorrect && styles.checkboxMissed,
              ]}
            >
              {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.optionText}>{option.text}</Text>
            {missedCorrect ? <Text style={styles.missedTag}>Missed</Text> : null}
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
  optionMissed: {
    borderColor: colors.amber,
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  checkboxSelected: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  checkboxCorrect: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  checkboxIncorrect: {
    backgroundColor: colors.flag,
    borderColor: colors.flag,
  },
  checkboxMissed: {
    backgroundColor: colors.paper,
    borderColor: colors.amber,
  },
  checkmark: {
    color: colors.paperRaised,
    fontSize: 14,
    fontWeight: 'bold',
  },
  optionText: {
    ...typeScale.body,
    color: colors.ink,
    flex: 1,
  },
  missedTag: {
    ...typeScale.monoLabel,
    color: colors.amber,
  },
});
