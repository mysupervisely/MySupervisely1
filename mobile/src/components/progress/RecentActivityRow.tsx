import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';
import { formatRelativeDate } from '../../utils/formatDate';
import type { RecentActivityItem } from '../../services/progressAnalyticsService';

type RecentActivityRowProps = {
  item: RecentActivityItem;
  now: Date;
};

export const RecentActivityRow = memo(function RecentActivityRow({ item, now }: RecentActivityRowProps) {
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${item.questionLabel}, ${item.systemLabel}, ${
        item.isCorrect ? 'correct' : 'incorrect'
      }, ${formatRelativeDate(item.attemptedAt, now)}`}
    >
      <View
        style={[styles.resultDot, item.isCorrect ? styles.resultCorrect : styles.resultIncorrect]}
      />
      <View style={styles.textColumn}>
        <Text style={styles.questionLabel}>{item.questionLabel}</Text>
        <Text style={styles.systemLabel}>{item.systemLabel}</Text>
      </View>
      <Text style={styles.timestamp}>{formatRelativeDate(item.attemptedAt, now)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  resultDot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  resultCorrect: {
    backgroundColor: colors.teal,
  },
  resultIncorrect: {
    backgroundColor: colors.flag,
  },
  textColumn: {
    flex: 1,
  },
  questionLabel: {
    ...typeScale.bodyMedium,
    color: colors.ink,
  },
  systemLabel: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  timestamp: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
});
