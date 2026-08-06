import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';
import { formatRelativeDate } from '../../utils/formatDate';
import type { SystemStat } from '../../services/progressAnalyticsService';

type SystemPerformanceRowProps = {
  stat: SystemStat;
  now: Date;
  onPress: () => void;
};

/** One row in the Progress dashboard's System Performance list — tappable back into that system's study flow. */
export const SystemPerformanceRow = memo(function SystemPerformanceRow({
  stat,
  now,
  onPress,
}: SystemPerformanceRowProps) {
  const coveragePct = stat.questionsTotal > 0 ? Math.round((stat.questionsAnswered / stat.questionsTotal) * 100) : 0;
  const accuracyLabel = stat.accuracyPct === null ? '—' : `${stat.accuracyPct}%`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${stat.label} — ${stat.questionsAnswered} of ${stat.questionsTotal} questions answered, ${
        stat.accuracyPct === null ? 'no attempts yet' : `${stat.accuracyPct}% accuracy`
      }, last attempted ${formatRelativeDate(stat.lastAttemptedAt, now)}`}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
    >
      <View style={styles.headerLine}>
        <Text style={styles.title}>{stat.label}</Text>
        <Text style={styles.accuracy}>{accuracyLabel}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${coveragePct}%` }]} />
      </View>
      <View style={styles.footerLine}>
        <Text style={styles.meta}>
          {stat.questionsAnswered}/{stat.questionsTotal} answered
        </Text>
        <Text style={styles.meta}>{formatRelativeDate(stat.lastAttemptedAt, now)}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.xs,
  },
  rowPressed: {
    opacity: 0.7,
  },
  headerLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    ...typeScale.h3,
    color: colors.ink,
  },
  accuracy: {
    ...typeScale.monoLabel,
    color: colors.teal,
  },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
  },
  footerLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  meta: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
});
