import { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { StatTile } from '../../components/progress/StatTile';
import { SystemPerformanceRow } from '../../components/progress/SystemPerformanceRow';
import { DomainPerformanceRow } from '../../components/progress/DomainPerformanceRow';
import { RecentActivityRow } from '../../components/progress/RecentActivityRow';
import { useProgressDashboard } from '../../hooks/useProgressDashboard';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { MainTabParamList } from '../../navigation/types';

type Props = BottomTabScreenProps<MainTabParamList, 'ProgressTab'>;

/**
 * M5: the real Progress & Analytics dashboard, built entirely on
 * attemptsStorage (M4) via progressAnalyticsService's pure aggregation
 * functions (src/hooks/useProgressDashboard.ts). Local-only — no network
 * call anywhere in this screen or its data path.
 */
export function ProgressScreen({ navigation }: Props) {
  const { isLoading, overallStats, systemStats, domainStats, recentActivity } = useProgressDashboard();
  const now = useMemo(() => new Date(), []);

  const openSystem = (systemKey: string) => {
    navigation.navigate('HomeTab', { screen: 'System', params: { systemKey } });
  };

  if (isLoading || !overallStats || !systemStats || !domainStats || !recentActivity) {
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
