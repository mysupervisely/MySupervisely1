import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { useExamResult } from '../../hooks/useExamResult';
import { contentRepository } from '../../services/contentRepository';
import { domainLabel } from '../../constants/domains';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { DomainBreakdown, SystemBreakdown } from '../../models/examResult';
import type { ExamStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ExamStackParamList, 'ExamResults'>;

/** Real question numbers (exam slot, 1-based) for a flagged/incorrect-question summary — never fabricated. */
function questionNumbers(questionIds: string[]): number[] {
  return questionIds
    .map((id) => contentRepository.getQuestionById(id))
    .filter((q): q is NonNullable<typeof q> => q !== undefined && q.source.kind === 'exam')
    .map((q) => (q.source as { kind: 'exam'; slot: number }).slot + 1)
    .sort((a, b) => a - b);
}

export function ExamResultsScreen({ route, navigation }: Props) {
  const { examNumber, resultId } = route.params;
  const { isLoading, result } = useExamResult(resultId);

  if (isLoading) {
    return (
      <ScreenContainer>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.teal} accessibilityLabel="Loading exam results" />
        </View>
      </ScreenContainer>
    );
  }

  if (!result) {
    return (
      <ScreenContainer>
        <ScreenTitle eyebrow="Results">Not found</ScreenTitle>
        <Text style={typeScale.body}>This exam result could not be found.</Text>
      </ScreenContainer>
    );
  }

  const flagged = questionNumbers(result.flaggedQuestionIds);
  const incorrect = questionNumbers(result.incorrectQuestionIds);

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow={`Exam ${examNumber} · Results`}>
        {new Date(result.submittedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
      </ScreenTitle>

      <View style={styles.scoreRow}>
        <ScoreTile label="Score" value={`${result.scorePct}%`} sub={`${result.correctCount}/${result.totalQuestions} correct`} />
        <ScoreTile label="Accuracy" value={`${result.accuracyPct}%`} sub={`of ${result.answeredCount} answered`} />
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">
        Domain Breakdown
      </Text>
      <View style={styles.breakdownCard}>
        {result.domainBreakdown.map((d) => (
          <BreakdownRow key={d.domain} label={domainLabel(d.domain)} breakdown={d} />
        ))}
      </View>

      <Text style={[styles.sectionTitle, styles.laterSection]} accessibilityRole="header">
        System Breakdown
      </Text>
      <View style={styles.breakdownCard}>
        {result.systemBreakdown
          .filter((s) => s.total > 0)
          .map((s) => (
            <BreakdownRow
              key={s.systemKey}
              label={contentRepository.getSystem(s.systemKey)?.label ?? s.systemKey}
              breakdown={s}
            />
          ))}
      </View>

      <Text style={[styles.sectionTitle, styles.laterSection]} accessibilityRole="header">
        Flagged Questions
      </Text>
      <Text style={styles.summaryText}>
        {flagged.length === 0 ? 'None flagged.' : `${flagged.length} flagged: Q${flagged.join(', Q')}`}
      </Text>

      <Text style={[styles.sectionTitle, styles.laterSection]} accessibilityRole="header">
        Incorrect Questions
      </Text>
      <Text style={styles.summaryText}>
        {incorrect.length === 0
          ? 'None — every answered question was correct.'
          : `${incorrect.length} incorrect: Q${incorrect.join(', Q')}`}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back to exams"
        style={styles.backButton}
        onPress={() => navigation.navigate('ExamList')}
      >
        <Text style={styles.backButtonText}>Back to Exams</Text>
      </Pressable>
    </ScreenContainer>
  );
}

function ScoreTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.scoreTile}>
      <Text style={styles.scoreValue}>{value}</Text>
      <Text style={styles.scoreLabel}>{label}</Text>
      <Text style={styles.scoreSub}>{sub}</Text>
    </View>
  );
}

function BreakdownRow({ label, breakdown }: { label: string; breakdown: DomainBreakdown | SystemBreakdown }) {
  const pct = breakdown.accuracyPct ?? 0;
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.breakdownTrack}>
        <View style={[styles.breakdownFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.breakdownCount}>
        {breakdown.correct}/{breakdown.total}
      </Text>
      <Text style={styles.breakdownPct}>{breakdown.accuracyPct === null ? '—' : `${breakdown.accuracyPct}%`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  scoreRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  scoreTile: {
    flex: 1,
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.xs / 2,
  },
  scoreValue: {
    ...typeScale.display,
    color: colors.ink,
  },
  scoreLabel: {
    ...typeScale.bodyMedium,
    color: colors.ink,
  },
  scoreSub: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  sectionTitle: {
    ...typeScale.h2,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  laterSection: {
    marginTop: spacing.xl,
  },
  breakdownCard: {
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  breakdownLabel: {
    ...typeScale.caption,
    color: colors.inkSoft,
    width: 96,
  },
  breakdownTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  breakdownFill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
  },
  breakdownCount: {
    ...typeScale.monoLabel,
    color: colors.inkSoft,
    width: 40,
    textAlign: 'right',
  },
  breakdownPct: {
    ...typeScale.monoLabel,
    color: colors.inkSoft,
    width: 36,
    textAlign: 'right',
  },
  summaryText: {
    ...typeScale.body,
    color: colors.inkSoft,
  },
  backButton: {
    marginTop: spacing.xl,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  backButtonText: {
    ...typeScale.h3,
    color: colors.paperRaised,
  },
});
