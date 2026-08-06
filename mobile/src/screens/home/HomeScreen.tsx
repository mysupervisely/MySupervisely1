import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '../../components/ScreenContainer';
import { BodyMapView } from '../../components/bodyMap/BodyMapView';
import { TopicCard } from '../../components/TopicCard';
import { useFirstName } from '../../hooks/useFirstName';
import { buildGreeting } from '../../utils/greeting';
import { contentRepository } from '../../services/contentRepository';
import { colors, spacing, typeScale } from '../../theme';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Home'>;

/**
 * The app's primary navigation surface (Phase 6): greeting -> real body map
 * with real hotspots -> More Topics for the non-anatomical systems.
 * Content comes exclusively from contentRepository — no raw JSON here.
 */
export function HomeScreen({ navigation }: Props) {
  const { firstName } = useFirstName();
  const greeting = useMemo(() => buildGreeting(new Date(), firstName), [firstName]);

  // contentRepository already indexes internally; these calls are cheap
  // (array filters over 27 systems, not the 2,000-question bank), but
  // still memoized so Home's re-renders (e.g. the greeting refreshing)
  // don't re-filter on every render.
  const anatomicalSystems = useMemo(() => contentRepository.getAnatomicalSystems(), []);
  const nonAnatomicalSystems = useMemo(() => contentRepository.getNonAnatomicalSystems(), []);

  const openSystem = (systemKey: string) => {
    navigation.navigate('System', { systemKey });
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Image
          source={require('../../../assets/brand/logo_mark.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="PharmDPrepped"
        />
        <Text style={styles.greeting} accessibilityRole="header">
          {greeting}
        </Text>
      </View>

      <Text style={styles.sectionTitle} accessibilityRole="header">
        Body Map
      </Text>
      <Text style={styles.sectionSubtitle}>Tap a system to open its lessons and practice questions.</Text>
      <BodyMapView systems={anatomicalSystems} onSelectSystem={openSystem} />

      <Text style={[styles.sectionTitle, styles.moreTopicsTitle]} accessibilityRole="header">
        More Topics
      </Text>
      <View style={styles.topicGrid}>
        {nonAnatomicalSystems.map((system) => (
          <TopicCard
            key={system.key}
            title={system.label}
            lessonCount={contentRepository.getLessonsForSystem(system.key).length}
            questionCount={contentRepository.getQuestions({ systemKey: system.key }).length}
            onPress={() => openSystem(system.key)}
          />
        ))}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  logo: {
    width: 36,
    height: 36,
  },
  greeting: {
    ...typeScale.h1,
    color: colors.ink,
    flexShrink: 1,
  },
  sectionTitle: {
    ...typeScale.h2,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  sectionSubtitle: {
    ...typeScale.caption,
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  moreTopicsTitle: {
    marginTop: spacing.xl,
  },
  topicGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
