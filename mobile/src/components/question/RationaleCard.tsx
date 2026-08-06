import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';
import type { Question } from '../../models';

type RationaleCardProps = {
  question: Question;
  isCorrect: boolean;
  /**
   * M7.3 addition — when explicitly false, renders a neutral "Not
   * Answered" banner instead of Correct/Incorrect (post-exam review of a
   * question the student skipped, where `isCorrect` would otherwise
   * misleadingly read as "you got this wrong"). Defaults to true, so
   * every pre-M7 call site (QBank, live exam question feedback) is
   * unaffected without passing anything new.
   */
  isAnswered?: boolean;
};

/** Shown after submission: correct/incorrect (or not-answered) banner, restated correct answer(s), and the real rationale text. */
export function RationaleCard({ question, isCorrect, isAnswered = true }: RationaleCardProps) {
  const bannerText = !isAnswered ? 'Not Answered' : isCorrect ? 'Correct' : 'Incorrect';
  const containerStyle = !isAnswered
    ? styles.containerNeutral
    : isCorrect
      ? styles.containerCorrect
      : styles.containerIncorrect;
  const bannerStyle = !isAnswered ? styles.bannerNeutral : isCorrect ? styles.bannerCorrect : styles.bannerIncorrect;

  return (
    <View
      style={[styles.container, containerStyle]}
      accessible
      accessibilityLabel={`${bannerText}. ${correctAnswerSummary(question)} ${question.rationale}`}
    >
      <Text style={[styles.banner, bannerStyle]}>{bannerText}</Text>
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
  containerNeutral: {
    backgroundColor: colors.paperRaised,
    borderColor: colors.line,
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
  bannerNeutral: {
    color: colors.inkSoft,
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
