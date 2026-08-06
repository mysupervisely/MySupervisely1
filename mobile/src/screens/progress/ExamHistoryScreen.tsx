import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { useExamHistory } from '../../hooks/useExamHistory';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { ExamHistoryEntry } from '../../services/examResultService';
import type { MainTabParamList, ProgressStackParamList } from '../../navigation/types';

// Composite type: ExamHistory lives inside the Progress stack, but tapping
// a past attempt opens its results screen, which lives inside the Exam
// tab's own stack — same cross-tab pattern SystemScreen.tsx uses for
// "Start Practice".
type Props = CompositeScreenProps<
  NativeStackScreenProps<ProgressStackParamList, 'ExamHistory'>,
  BottomTabScreenProps<MainTabParamList>
>;

/** M7.7 — every completed exam attempt, most recent first, with each attempt's improvement over its own previous attempt. */
export function ExamHistoryScreen({ navigation }: Props) {
  const { isLoading, history } = useExamHistory();

  const openResult = (entry: ExamHistoryEntry) => {
    navigation.navigate('ExamTab', {
      screen: 'ExamResults',
      params: { examNumber: entry.result.examNumber, resultId: entry.result.id },
    });
  };

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="History">Exam History</ScreenTitle>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.teal} accessibilityLabel="Loading exam history" />
        </View>
      ) : !history || history.length === 0 ? (
        <Text style={styles.emptyText}>No exams completed yet — finish a practice exam to see it here.</Text>
      ) : (
        <View style={styles.list}>
          {history.map((entry) => (
            <HistoryRow key={entry.result.id} entry={entry} onPress={() => openResult(entry)} />
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

function HistoryRow({ entry, onPress }: { entry: ExamHistoryEntry; onPress: () => void }) {
  const { result, improvementDeltaPct } = entry;
  const date = new Date(result.submittedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const trendText =
    improvementDeltaPct === null
      ? 'First attempt'
      : improvementDeltaPct > 0
        ? `↑ +${improvementDeltaPct}% vs last attempt`
        : improvementDeltaPct < 0
          ? `↓ ${improvementDeltaPct}% vs last attempt`
          : 'No change vs last attempt';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Exam ${result.examNumber}, ${date}, score ${result.scorePct}%, ${trendText}`}
      style={styles.row}
      onPress={onPress}
    >
      <View style={styles.rowMain}>
        <Text style={styles.examName}>Exam {result.examNumber}</Text>
        <Text style={styles.date}>{date}</Text>
      </View>
      <View style={styles.rowStats}>
        <Text style={styles.score}>{result.scorePct}%</Text>
        <Text style={styles.trend}>{trendText}</Text>
      </View>
    </Pressable>
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    minHeight: 44,
  },
  rowMain: {
    gap: spacing.xs / 2,
  },
  examName: {
    ...typeScale.h3,
    color: colors.ink,
  },
  date: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  rowStats: {
    alignItems: 'flex-end',
    gap: spacing.xs / 2,
  },
  score: {
    ...typeScale.h3,
    color: colors.teal,
  },
  trend: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
});
