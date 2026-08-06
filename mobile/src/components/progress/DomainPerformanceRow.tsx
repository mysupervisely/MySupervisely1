import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';
import { domainLabel } from '../../constants/domains';
import type { DomainStat } from '../../services/progressAnalyticsService';

type DomainPerformanceRowProps = {
  stat: DomainStat;
};

/** One NAPLEX domain's performance row — accuracy-based bar (distinct from SystemScreen's question-count-distribution bar). */
export function DomainPerformanceRow({ stat }: DomainPerformanceRowProps) {
  const pct = stat.accuracyPct ?? 0;
  const label = domainLabel(stat.domain);

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${label}: ${stat.questionsAnswered} questions answered, ${
        stat.accuracyPct === null ? 'no attempts yet' : `${stat.accuracyPct}% accuracy`
      }`}
    >
      <Text style={styles.label}>{label}</Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.count}>{stat.questionsAnswered}</Text>
      <Text style={styles.pct}>{stat.accuracyPct === null ? '—' : `${stat.accuracyPct}%`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  label: {
    ...typeScale.caption,
    color: colors.inkSoft,
    width: 72,
  },
  track: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
  },
  count: {
    ...typeScale.monoLabel,
    color: colors.inkSoft,
    width: 28,
    textAlign: 'right',
  },
  pct: {
    ...typeScale.monoLabel,
    color: colors.inkSoft,
    width: 36,
    textAlign: 'right',
  },
});
