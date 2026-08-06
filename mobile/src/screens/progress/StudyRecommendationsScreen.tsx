import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { useStudyRecommendations } from '../../hooks/useStudyRecommendations';
import { analyticsConfig } from '../../constants/analyticsConfig';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { ProgressStackParamList } from '../../navigation/types';
import type { StudyRecommendation } from '../../services/recommendationService';

type Props = NativeStackScreenProps<ProgressStackParamList, 'StudyRecommendations'>;

/**
 * M7.5 — "Recommended Next Study." Built entirely on real local data
 * (attemptsStorage + examResultsStorage via weaknessDetectionService /
 * recommendationService) — no recommendation here is ever hardcoded or
 * shown without a real, currently-true reason attached (`reasonLabel`).
 */
export function StudyRecommendationsScreen({ navigation }: Props) {
  const { isLoading, recommendations } = useStudyRecommendations();

  const openSession = (recommendation: StudyRecommendation) => {
    navigation.navigate('StudySession', { title: recommendation.title, questionIds: recommendation.questionIds });
  };

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="Study Plan">Recommended Next Study</ScreenTitle>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.teal} accessibilityLabel="Loading recommendations" />
        </View>
      ) : !recommendations || recommendations.length === 0 ? (
        <Text style={styles.emptyText}>
          Not enough practice yet to build a recommendation. Answer at least {analyticsConfig.MIN_QUESTIONS_FOR_SIGNAL}{' '}
          questions in a domain to see targeted study sessions here.
        </Text>
      ) : (
        <View style={styles.list}>
          {recommendations.map((recommendation) => (
            <Pressable
              key={recommendation.id}
              accessibilityRole="button"
              accessibilityLabel={`${recommendation.title}, ${recommendation.questionCount} questions, ${recommendation.reasonLabel}`}
              style={styles.card}
              onPress={() => openSession(recommendation)}
            >
              <Text style={styles.cardTitle}>{recommendation.title}</Text>
              <Text style={styles.cardMeta}>
                {recommendation.questionCount} question{recommendation.questionCount === 1 ? '' : 's'}
              </Text>
              <Text style={styles.cardReason}>{recommendation.reasonLabel}</Text>
            </Pressable>
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
  emptyText: {
    ...typeScale.body,
    color: colors.inkSoft,
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.xs / 2,
  },
  cardTitle: {
    ...typeScale.h3,
    color: colors.ink,
  },
  cardMeta: {
    ...typeScale.monoLabel,
    color: colors.teal,
  },
  cardReason: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
});
