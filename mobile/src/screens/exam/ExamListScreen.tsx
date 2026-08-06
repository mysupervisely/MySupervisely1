import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { useExamListStatuses } from '../../hooks/useExamListStatuses';
import { examSessionStorage } from '../../storage/examSessionStorage';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { ExamStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ExamStackParamList, 'ExamList'>;

const STATUS_LABEL: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  completed: 'Completed',
};

/** The exam hub — the 3 real fixed exams, each showing real status from local storage. */
export function ExamListScreen({ navigation }: Props) {
  const items = useExamListStatuses();

  const startOrResume = (examNumber: 1 | 2 | 3) => {
    navigation.navigate('ExamTaking', { examNumber });
  };

  const retake = async (examNumber: 1 | 2 | 3) => {
    await examSessionStorage.clear(examNumber);
    navigation.navigate('ExamTaking', { examNumber });
  };

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="Practice">Full-Length Exams</ScreenTitle>
      <Text style={styles.subtitle}>
        3 fixed 225-question exams, matched to the official 25/25/40/5/5 NAPLEX domain weighting,
        with a real 6-hour timer. Progress saves automatically.
      </Text>

      {items === null ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.teal} accessibilityLabel="Loading exam status" />
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <View key={item.examNumber} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Practice Exam {item.examNumber}</Text>
                <Text style={styles.statusBadge}>{STATUS_LABEL[item.status]}</Text>
              </View>
              <Text style={styles.cardMeta}>
                {item.status === 'in_progress'
                  ? `Question ${item.currentIndex + 1} of ${item.totalQuestions}`
                  : item.status === 'completed' && item.latestResult
                    ? `Last score: ${item.latestResult.scorePct}% (${item.latestResult.correctCount}/${item.latestResult.totalQuestions} correct)`
                    : `${item.totalQuestions} questions · 6 hours`}
              </Text>

              <View style={styles.actions}>
                {item.status === 'not_started' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Start Practice Exam ${item.examNumber}`}
                    style={[styles.button, styles.primaryButton]}
                    onPress={() => startOrResume(item.examNumber)}
                  >
                    <Text style={styles.primaryButtonText}>Start Exam</Text>
                  </Pressable>
                )}
                {item.status === 'in_progress' && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Resume Practice Exam ${item.examNumber}`}
                    style={[styles.button, styles.primaryButton]}
                    onPress={() => startOrResume(item.examNumber)}
                  >
                    <Text style={styles.primaryButtonText}>Resume</Text>
                  </Pressable>
                )}
                {item.status === 'completed' && item.latestResult && (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`View results for Practice Exam ${item.examNumber}`}
                      style={[styles.button, styles.secondaryButton]}
                      onPress={() =>
                        navigation.navigate('ExamResults', {
                          examNumber: item.examNumber,
                          resultId: item.latestResult!.id,
                        })
                      }
                    >
                      <Text style={styles.secondaryButtonText}>View Results</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Retake Practice Exam ${item.examNumber}`}
                      style={[styles.button, styles.primaryButton]}
                      onPress={() => retake(item.examNumber)}
                    >
                      <Text style={styles.primaryButtonText}>Retake</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    ...typeScale.caption,
    color: colors.inkSoft,
    marginBottom: spacing.lg,
  },
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  list: {
    gap: spacing.md,
  },
  card: {
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardTitle: {
    ...typeScale.h3,
    color: colors.ink,
  },
  statusBadge: {
    ...typeScale.monoLabel,
    color: colors.teal,
  },
  cardMeta: {
    ...typeScale.caption,
    color: colors.inkSoft,
    marginBottom: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.teal,
  },
  primaryButtonText: {
    ...typeScale.h3,
    color: colors.paperRaised,
  },
  secondaryButton: {
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  secondaryButtonText: {
    ...typeScale.h3,
    color: colors.ink,
  },
});
