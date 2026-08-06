import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { PaletteGrid } from '../../components/exam/PaletteGrid';
import { useExamSession } from '../../hooks/useExamSession';
import { answeredCount, getPaletteEntries } from '../../services/examSession';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { ExamStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ExamStackParamList, 'ExamReview'>;

/**
 * Review before final submission — the dedicated step the task asks for,
 * distinct from both in-exam navigation (ExamTakingScreen) and grading
 * (ExamResultsScreen). Reuses the same PaletteGrid ExamTakingScreen's
 * modal palette uses, embedded directly here (this screen IS the
 * dedicated palette view, no modal needed) via its `headerContent` slot
 * for the summary stats + Submit button, so nothing double-wraps
 * PaletteGrid's own FlatList in a second scroll container.
 */
export function ExamReviewScreen({ route, navigation }: Props) {
  const { examNumber } = route.params;
  const session = useExamSession(examNumber);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (session.isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={colors.teal} accessibilityLabel="Loading exam review" />
      </SafeAreaView>
    );
  }

  const total = session.state.questions.length;
  const answered = answeredCount(session.state);
  const unanswered = total - answered;
  const flaggedCount = session.state.flaggedQuestionIds.length;

  const confirmSubmit = () => {
    Alert.alert(
      'Submit exam?',
      unanswered > 0
        ? `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Once submitted, you cannot change any answers. Submit anyway?`
        : 'Once submitted, you cannot change any answers. Submit now?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Submit', style: 'destructive', onPress: doSubmit },
      ]
    );
  };

  const doSubmit = async () => {
    setIsSubmitting(true);
    const result = await session.submitExam();
    setIsSubmitting(false);
    if (result) {
      navigation.replace('ExamResults', { examNumber, resultId: result.id });
    }
  };

  const jumpToQuestion = (index: number) => {
    session.jumpTo(index);
    navigation.navigate('ExamTaking', { examNumber });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <PaletteGrid
        entries={getPaletteEntries(session.state)}
        onSelect={jumpToQuestion}
        headerContent={
          <View style={styles.headerBlock}>
            <Text style={styles.title} accessibilityRole="header">
              Review Exam {examNumber}
            </Text>
            <View style={styles.statsRow}>
              <Stat label="Answered" value={`${answered}/${total}`} />
              <Stat label="Unanswered" value={String(unanswered)} />
              <Stat label="Flagged" value={String(flaggedCount)} />
            </View>
            <Text style={styles.hint}>Tap any question to jump back and change your answer.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Submit exam"
              disabled={isSubmitting}
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={confirmSubmit}
            >
              {isSubmitting ? (
                <ActivityIndicator color={colors.paperRaised} />
              ) : (
                <Text style={styles.submitButtonText}>Submit Exam</Text>
              )}
            </Pressable>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  headerBlock: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  title: {
    ...typeScale.h1,
    color: colors.ink,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  statValue: {
    ...typeScale.h2,
    color: colors.ink,
  },
  statLabel: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  hint: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  submitButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    ...typeScale.h3,
    color: colors.paperRaised,
  },
});
