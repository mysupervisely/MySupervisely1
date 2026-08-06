import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';
import type { ReadinessResult } from '../../services/readinessScoreService';

type ReadinessScoreCardProps = {
  readiness: ReadinessResult;
};

const TREND_TEXT: Record<ReadinessResult['trend'], string> = {
  improving: '↑ Improving',
  declining: '↓ Declining',
  stable: '→ Stable',
  'insufficient-data': 'Take another exam to see a trend',
};

/**
 * M7.6 — always labeled "PharmDPrepped Readiness Score," never framed as
 * a NAPLEX pass/fail prediction (see readinessScoreService.ts's own
 * doc comment and docs/M7_IMPLEMENTATION_NOTES.md).
 */
export function ReadinessScoreCard({ readiness }: ReadinessScoreCardProps) {
  return (
    <View
      style={styles.card}
      accessible
      accessibilityLabel={`PharmDPrepped Readiness Score: ${readiness.score} out of 100. ${TREND_TEXT[readiness.trend]}.`}
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>PharmDPrepped Readiness Score</Text>
          <Text style={styles.subtitle}>Not a NAPLEX pass/fail prediction</Text>
        </View>
        <Text style={styles.score}>{readiness.score}</Text>
      </View>

      <Text style={styles.trend}>{TREND_TEXT[readiness.trend]}</Text>

      <View style={styles.componentGrid}>
        <ComponentRow label="Exam Performance" value={readiness.components.examPerformanceScore} />
        <ComponentRow label="QBank Accuracy" value={readiness.components.qbankAccuracyScore} />
        <ComponentRow label="Question Volume" value={readiness.components.questionVolumeScore} />
        <ComponentRow label="Domain Coverage" value={readiness.components.domainCoverageScore} />
      </View>
    </View>
  );
}

function ComponentRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.componentRow}>
      <Text style={styles.componentLabel}>{label}</Text>
      <View style={styles.componentTrack}>
        <View style={[styles.componentFill, { width: `${value}%` }]} />
      </View>
      <Text style={styles.componentValue}>{value}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    ...typeScale.h3,
    color: colors.ink,
  },
  subtitle: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  score: {
    ...typeScale.display,
    color: colors.teal,
  },
  trend: {
    ...typeScale.bodyMedium,
    color: colors.ink,
  },
  componentGrid: {
    gap: spacing.xs,
  },
  componentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  componentLabel: {
    ...typeScale.caption,
    color: colors.inkSoft,
    width: 110,
  },
  componentTrack: {
    flex: 1,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  componentFill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
  },
  componentValue: {
    ...typeScale.monoLabel,
    color: colors.inkSoft,
    width: 36,
    textAlign: 'right',
  },
});
