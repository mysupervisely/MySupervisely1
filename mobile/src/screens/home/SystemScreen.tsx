import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { ProgressStats } from '../../components/ProgressStats';
import { contentRepository } from '../../services/contentRepository';
import { progressRepository } from '../../services/progressRepository';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { HomeStackParamList, MainTabParamList } from '../../navigation/types';

// Composite type: this screen lives inside HomeStack, which itself lives
// inside a tab of MainTabNavigator — "Start Practice" needs to jump to a
// sibling tab (QBankTab), so the navigation prop has to know about both
// navigators, typed, rather than an `any`-typed escape hatch.
type Props = CompositeScreenProps<
  NativeStackScreenProps<HomeStackParamList, 'System'>,
  BottomTabScreenProps<MainTabParamList>
>;

const DOMAIN_LABELS: Record<number, string> = {
  1: 'Domain 1',
  2: 'Domain 2',
  3: 'Domain 3',
  4: 'Domain 4',
  5: 'Domain 5',
};

export function SystemScreen({ route, navigation }: Props) {
  const { systemKey } = route.params;

  const system = useMemo(() => contentRepository.getSystem(systemKey), [systemKey]);
  const lessons = useMemo(() => contentRepository.getLessonsForSystem(systemKey), [systemKey]);
  const questionCount = useMemo(
    () => contentRepository.getQuestions({ systemKey }).length,
    [systemKey]
  );
  const domainDistribution = useMemo(
    () => contentRepository.getDomainDistribution(systemKey),
    [systemKey]
  );
  const progress = useMemo(() => progressRepository.getSystemProgress(systemKey), [systemKey]);

  if (!system) {
    // Defensive only — every systemKey reaching this screen comes from
    // contentRepository itself (body-map hotspots / More Topics cards), so
    // this should be unreachable with real data.
    return (
      <ScreenContainer>
        <ScreenTitle>System not found</ScreenTitle>
      </ScreenContainer>
    );
  }

  const domainEntries = Object.entries(domainDistribution) as [string, number][];
  const domainTotal = domainEntries.reduce((sum, [, count]) => sum + count, 0);

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="System">{system.label}</ScreenTitle>

      {system.description ? <Text style={styles.description}>{system.description}</Text> : null}

      <View style={styles.metaRow}>
        <Text style={styles.metaText}>
          {lessons.length} lesson{lessons.length === 1 ? '' : 's'}
        </Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>
          {questionCount} question{questionCount === 1 ? '' : 's'}
        </Text>
      </View>

      {domainTotal > 0 ? (
        <View style={styles.domainSection}>
          <Text style={styles.domainTitle}>NAPLEX domain distribution</Text>
          {domainEntries
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([domain, count]) => {
              const pct = Math.round((count / domainTotal) * 100);
              return (
                <View key={domain} style={styles.domainRow}>
                  <Text style={styles.domainLabel}>{DOMAIN_LABELS[Number(domain)] ?? `Domain ${domain}`}</Text>
                  <View style={styles.domainTrack}>
                    <View style={[styles.domainFill, { width: `${pct}%` }]} />
                  </View>
                  <Text style={styles.domainPct}>{pct}%</Text>
                </View>
              );
            })}
        </View>
      ) : null}

      <ProgressStats progress={progress} />

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`View lessons for ${system.label}`}
          style={[styles.button, styles.secondaryButton, lessons.length === 0 && styles.buttonDisabled]}
          disabled={lessons.length === 0}
          onPress={() => navigation.navigate('Lesson', { systemKey, lessonIndex: 0 })}
        >
          <Text style={styles.secondaryButtonText}>View Lessons</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Start practice questions for ${system.label}`}
          style={[styles.button, styles.primaryButton, questionCount === 0 && styles.buttonDisabled]}
          disabled={questionCount === 0}
          onPress={() => navigation.navigate('QBankTab')}
        >
          <Text style={styles.primaryButtonText}>Start Practice</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  description: {
    ...typeScale.body,
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  metaText: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  metaDot: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  domainSection: {
    marginBottom: spacing.lg,
    gap: spacing.xs,
  },
  domainTitle: {
    ...typeScale.h3,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  domainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  domainLabel: {
    ...typeScale.caption,
    color: colors.inkSoft,
    width: 72,
  },
  domainTrack: {
    flex: 1,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  domainFill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: radius.pill,
  },
  domainPct: {
    ...typeScale.monoLabel,
    color: colors.inkSoft,
    width: 36,
    textAlign: 'right',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButton: {
    backgroundColor: colors.teal,
  },
  primaryButtonText: {
    ...typeScale.h3,
    color: colors.paperRaised,
  },
  secondaryButton: {
    backgroundColor: colors.paperRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  secondaryButtonText: {
    ...typeScale.h3,
    color: colors.ink,
  },
});
