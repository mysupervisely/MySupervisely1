import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';
import type { Question } from '../../models';

type RationaleCardProps = {
  question: Question;
  isCorrect: boolean;
};

/** Shown after submission: correct/incorrect banner, restated correct answer(s), and the real rationale text. */
export function RationaleCard({ question, isCorrect }: RationaleCardProps) {
  return (
    <View
      style={[styles.container, isCorrect ? styles.containerCorrect : styles.containerIncorrect]}
      accessible
      accessibilityLabel={`${isCorrect ? 'Correct.' : 'Incorrect.'} ${correctAnswerSummary(question)} ${question.rationale}`}
    >
      <Text style={[styles.banner, isCorrect ? styles.bannerCorrect : styles.bannerIncorrect]}>
        {isCorrect ? 'Correct' : 'Incorrect'}
      </Text>
      <Text style={styles.answerLine}>{correctAnswerSummary(question)}</Text>
      <Text style={styles.rationale}>{question.rationale}</Text>
    </View>
  );
}

function correctAnswerSummary(question: Question): string {
  if (question.type === 'single') {
    const option = question.options.find((o) => o.label === question.correctLabel);
    return `Correct answer: ${question.correctLabel}${option ? ` — ${option.text}` : ''}`;
  }
  if (question.type === 'sata') {
    const labels = question.correctLabels.join(', ');
    return `Correct answer${question.correctLabels.length > 1 ? 's' : ''}: ${labels}`;
  }
  // numeric
  const unit = question.unit ? ` ${question.unit}` : '';
  return `Correct answer: ${question.correctValue}${unit} (± ${question.tolerance}${unit})`;
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    gap: spacing.xs,
  },
  containerCorrect: {
    backgroundColor: 'rgba(15, 125, 128, 0.08)',
    borderColor: colors.teal,
  },
  containerIncorrect: {
    backgroundColor: 'rgba(174, 59, 69, 0.08)',
    borderColor: colors.flag,
  },
  banner: {
    ...typeScale.h3,
  },
  bannerCorrect: {
    color: colors.tealDeep,
  },
  bannerIncorrect: {
    color: colors.flag,
  },
  answerLine: {
    ...typeScale.bodyMedium,
    color: colors.ink,
  },
  rationale: {
    ...typeScale.body,
    color: colors.inkSoft,
  },
});
