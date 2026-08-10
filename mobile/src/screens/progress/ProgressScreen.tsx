import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { StatTile } from '../../components/progress/StatTile';
import { SystemPerformanceRow } from '../../components/progress/SystemPerformanceRow';
import { DomainPerformanceRow } from '../../components/progress/DomainPerformanceRow';
import { RecentActivityRow } from '../../components/progress/RecentActivityRow';
import { ReadinessScoreCard } from '../../components/progress/ReadinessScoreCard';
import { useProgressDashboard } from '../../hooks/useProgressDashboard';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { MainTabParamList, ProgressStackParamList } from '../../navigation/types';

// Composite type: Progress lives inside its own nested stack (M7 —
// StudyRecommendations/StudySession/ExamHistory), but "Start Practice"-
// style rows still need to jump to a sibling tab (HomeTab), the same
// pattern SystemScreen.tsx already uses.
type Props = CompositeScreenProps<
  NativeStackScreenProps<ProgressStackParamList, 'Progress'>,
  BottomTabScreenProps<MainTabParamList>
>;

/**
 * M5: the real Progress & Analytics dashboard, built entirely on
 * attemptsStorage (M4) via progressAnalyticsService's pure aggregation
 * functions (src/hooks/useProgressDashboard.ts). Local-only — no network
 * call anywhere in this screen or its data path. M7 adds the Readiness
 * Score card and links into Recommended Study and Exam History.
 */
export function ProgressScreen({ navigation }: Props) {
  const { isLoading, overallStats, systemStats, domainStats, recentActivity, readiness, hasActivity } =
    useProgressDashboard();
  const now = useMemo(() => new Date(), []);

  const openSystem = (systemKey: string) => {
    navigation.navigate('HomeTab', { screen: 'System', params: { systemKey } });
  };

  if (isLoading || !overallStats || !systemStats || !domainStats || !recentActivity || !readiness) {
    return (
      <ScreenContainer>
        <ScreenTitle eyebrow="You">Progress</ScreenTitle>
        <View style={styles.loading}>
          <ActivityIndicator color={colors.teal} accessibilityLabel="Loading your progress" />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="You">Progress</ScreenTitle>

      <View style={styles.statGrid}>
        <StatTile label="Total Answered" value={String(overallStats.totalQuestionsAnswered)} />
        <StatTile
          label="Overall Accuracy"
          value={overallStats.overallAccuracyPct === null ? '—' : `${overallStats.overallAccuracyPct}%`}
        />
        <StatTile label="Answered Today" value={String(overallStats.answeredToday)} />
        <StatTile label="Answered This Week" value={String(overallStats.answeredThisWeek)} />
        <StatTile
          label="Study Streak"
          value={`${overallStats.currentStreakDays} day${overallStats.currentStreakDays === 1 ? '' : 's'}`}
        />
        <StatTile
          label="Last Session"
          value={
            overallStats.lastStudySessionAt === null
              ? 'Never'
              : new Date(overallStats.lastStudySessionAt).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })
          }
        />
      </View>

      <View style={styles.readinessSection}>
        <ReadinessScoreCard readiness={readiness} hasActivity={hasActivity} />
      </View>

      <View style={styles.linkRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View recommended study sessions"
          style={styles.linkButton}
          onPress={() => navigation.navigate('StudyRecommendations')}
        >
          <Text style={styles.linkButtonText}>Recommended Study</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View exam history"
          style={styles.linkButton}
          onPress={() => navigation.navigate('ExamHistory')}
        >
          <Text style={styles.linkButtonText}>Exam History</Text>
        </Pressable>
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">
        System Performance
      </Text>
      <View style={styles.systemList}>
        {systemStats.map((stat) => (
          <SystemPerformanceRow
            key={stat.systemKey}
            stat={stat}
            now={now}
            onPress={() => openSystem(stat.systemKey)}
          />
        ))}
      </View>

      <Text style={[styles.sectionTitle, styles.laterSection]} accessibilityRole="header">
        NAPLEX Domains
      </Text>
      <View style={styles.domainList}>
        {domainStats.map((stat) => (
          <DomainPerformanceRow key={stat.domain} stat={stat} />
        ))}
      </View>

      <Text style={[styles.sectionTitle, styles.laterSection]} accessibilityRole="header">
        Recent Activity
      </Text>
      {recentActivity.length === 0 ? (
        <Text style={styles.emptyText}>No attempts yet — answer a QBank question to see it here.</Text>
      ) : (
        <View>
          {recentActivity.map((item) => (
            <RecentActivityRow key={item.attemptId} item={item} now={now} />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  readinessSection: {
    marginBottom: spacing.lg,
  },
  linkRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  linkButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.teal,
  },
  linkButtonText: {
    ...typeScale.bodyMedium,
    color: colors.teal,
  },
  sectionTitle: {
    ...typeScale.h2,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  laterSection: {
    marginTop: spacing.xl,
  },
  systemList: {
    gap: spacing.sm,
  },
  domainList: {
    gap: spacing.sm,
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
  },
  emptyText: {
    ...typeScale.body,
    color: colors.inkSoft,
  },
});
