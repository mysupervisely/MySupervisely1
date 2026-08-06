import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { SingleAnswerOptions } from '../../components/question/SingleAnswerOptions';
import { SataOptions } from '../../components/question/SataOptions';
import { NumericAnswerInput } from '../../components/question/NumericAnswerInput';
import { QuestionPalette } from '../../components/exam/QuestionPalette';
import { useExamSession } from '../../hooks/useExamSession';
import { useExamTimer } from '../../hooks/useExamTimer';
import { getCurrentQuestion, getDraftFor, getPaletteEntries, isQuestionFlagged } from '../../services/examSession';
import { contentRepository } from '../../services/contentRepository';
import { domainLabel } from '../../constants/domains';
import { formatDuration } from '../../utils/formatDuration';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { ExamStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ExamStackParamList, 'ExamTaking'>;

const LOW_TIME_WARNING_SECONDS = 15 * 60; // last 15 minutes — matches a common real-exam UX convention

export function ExamTakingScreen({ route, navigation }: Props) {
  const { examNumber } = route.params;
  const session = useExamSession(examNumber);
  const [isPaletteVisible, setPaletteVisible] = useState(false);

  const handleExpire = useCallback(async () => {
    const result = await session.submitExam();
    if (result) {
      navigation.replace('ExamResults', { examNumber, resultId: result.id });
    }
  }, [session, navigation, examNumber]);

  const remainingSeconds = useExamTimer(session.state.startedAt, session.state.durationSeconds, handleExpire);

  if (session.isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={colors.teal} accessibilityLabel={`Loading Practice Exam ${examNumber}`} />
      </SafeAreaView>
    );
  }

  const question = getCurrentQuestion(session.state);
  if (!question) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={typeScale.body}>This exam has no questions.</Text>
      </SafeAreaView>
    );
  }

  const draft = getDraftFor(session.state, question);
  const isFlagged = isQuestionFlagged(session.state, question);
  const system = contentRepository.getSystem(question.systemKey);
  const isLowTime = remainingSeconds <= LOW_TIME_WARNING_SECONDS;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.progressText}>
            Question {session.state.currentIndex + 1} of {session.state.questions.length}
          </Text>
          <Text style={styles.tagText}>
            {system?.label ?? question.topicLabel} · {domainLabel(question.domain)}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Text
            style={[styles.timer, isLowTime && styles.timerLow]}
            accessibilityLabel={`${formatDuration(remainingSeconds)} remaining`}
          >
            {formatDuration(remainingSeconds)}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open question palette"
            style={styles.paletteButton}
            onPress={() => setPaletteVisible(true)}
          >
            <Text style={styles.paletteButtonText}>Palette</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.stem}>{question.stem}</Text>

        {question.type === 'single' && draft.type === 'single' ? (
          <SingleAnswerOptions
            options={question.options}
            selectedLabel={draft.label}
            isLocked={false}
            onSelect={session.selectSingle}
          />
        ) : null}
        {question.type === 'sata' && draft.type === 'sata' ? (
          <SataOptions
            options={question.options}
            selectedLabels={draft.labels}
            isLocked={false}
            onToggle={session.toggleSata}
          />
        ) : null}
        {question.type === 'numeric' && draft.type === 'numeric' ? (
          <NumericAnswerInput
            value={draft.text}
            unit={question.unit}
            isLocked={false}
            onChangeText={session.setNumeric}
          />
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isFlagged ? 'Remove flag for review' : 'Flag this question for review'}
          accessibilityState={{ selected: isFlagged }}
          style={[styles.flagButton, isFlagged && styles.flagButtonActive]}
          onPress={session.toggleFlag}
        >
          <Text style={[styles.flagButtonText, isFlagged && styles.flagButtonTextActive]}>
            {isFlagged ? 'Flagged' : 'Flag'}
          </Text>
        </Pressable>

        <View style={styles.navButtons}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Previous question"
            disabled={session.state.currentIndex === 0}
            style={[styles.navButton, session.state.currentIndex === 0 && styles.navButtonDisabled]}
            onPress={session.previous}
          >
            <Text style={styles.navButtonText}>Previous</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next question"
            disabled={session.state.currentIndex === session.state.questions.length - 1}
            style={[
              styles.navButton,
              session.state.currentIndex === session.state.questions.length - 1 && styles.navButtonDisabled,
            ]}
            onPress={session.next}
          >
            <Text style={styles.navButtonText}>Next</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Review and submit exam"
          style={styles.reviewButton}
          onPress={() => navigation.navigate('ExamReview', { examNumber })}
        >
          <Text style={styles.reviewButtonText}>Review & Submit</Text>
        </Pressable>
      </View>

      <QuestionPalette
        visible={isPaletteVisible}
        entries={getPaletteEntries(session.state)}
        onSelect={(index) => {
          session.jumpTo(index);
          setPaletteVisible(false);
        }}
        onClose={() => setPaletteVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  progressText: {
    ...typeScale.monoLabel,
    color: colors.teal,
  },
  tagText: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timer: {
    ...typeScale.h3,
    color: colors.ink,
  },
  timerLow: {
    color: colors.flag,
  },
  paletteButton: {
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  paletteButtonText: {
    ...typeScale.caption,
    color: colors.ink,
  },
  body: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  stem: {
    ...typeScale.body,
    color: colors.ink,
  },
  footer: {
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.paperRaised,
  },
  flagButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.amber,
  },
  flagButtonActive: {
    backgroundColor: colors.amber,
  },
  flagButtonText: {
    ...typeScale.bodyMedium,
    color: colors.amber,
  },
  flagButtonTextActive: {
    color: colors.paperRaised,
  },
  navButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  navButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.paper,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  navButtonText: {
    ...typeScale.h3,
    color: colors.ink,
  },
  reviewButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  reviewButtonText: {
    ...typeScale.h3,
    color: colors.paperRaised,
  },
});
