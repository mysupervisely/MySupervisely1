import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../theme';
import type { SystemProgress } from '../services/progressRepository';

type ProgressStatsProps = {
  progress: SystemProgress;
};

/**
 * Lessons completed / questions answered / accuracy — sourced from
 * src/services/progressRepository.ts. Real totals, honest zeros for
 * tracked progress until M6/M8 land (see that file's doc comment).
 */
export function ProgressStats({ progress }: ProgressStatsProps) {
  const accuracyLabel = progress.accuracyPct === null ? '—' : `${progress.accuracyPct}%`;

  return (
    <View style={styles.row} accessibilityRole="summary">
      <Stat
        label="Lessons"
        value={`${progress.lessonsCompleted}/${progress.lessonsTotal}`}
        accessibilityLabel={`${progress.lessonsCompleted} of ${progress.lessonsTotal} lessons completed`}
      />
      <Stat
        label="Questions"
        value={`${progress.questionsAnswered}/${progress.questionsTotal}`}
        accessibilityLabel={`${progress.questionsAnswered} of ${progress.questionsTotal} questions answered`}
      />
      <Stat
        label="Accuracy"
        value={accuracyLabel}
        accessibilityLabel={
          progress.accuracyPct === null ? 'No attempts yet' : `${progress.accuracyPct}% accuracy`
        }
      />
    </View>
  );
}

function Stat({
  label,
  value,
  accessibilityLabel,
}: {
  label: string;
  value: string;
  accessibilityLabel: string;
}) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={accessibilityLabel}>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.xs / 2,
  },
  value: {
    ...typeScale.h2,
    color: colors.ink,
  },
  label: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
});
