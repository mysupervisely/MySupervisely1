import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { SingleAnswerOptions } from '../../components/question/SingleAnswerOptions';
import { SataOptions } from '../../components/question/SataOptions';
import { NumericAnswerInput } from '../../components/question/NumericAnswerInput';
import { RationaleCard } from '../../components/question/RationaleCard';
import { QuestionPalette } from '../../components/exam/QuestionPalette';
import { useExamResult } from '../../hooks/useExamResult';
import { getReviewPaletteEntries } from '../../services/examResultService';
import { contentRepository } from '../../services/contentRepository';
import { domainLabel } from '../../constants/domains';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { ExamStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ExamStackParamList, 'ExamQuestionReview'>;

/**
 * M7.3 — post-exam question review. Entirely read-only against the
 * permanent ExamResult record, never the live ExamSessionState: "Exam
 * behavior changes after completion only... Maintain immutability of
 * completed exams." There is no answer-mutation path anywhere in this
 * screen — every option component below is rendered with `isLocked` and
 * no `onSelect`/`onToggle`/`onChangeText` side effect beyond the no-op
 * required by their shared prop shape.
 */
export function ExamQuestionReviewScreen({ route, navigation }: Props) {
  const { examNumber, resultId, questionIndex } = route.params;
  const { isLoading, result } = useExamResult(resultId);
  const [selectedIndex, setSelectedIndex] = useState(questionIndex ?? 0);
  const [isPaletteVisible, setPaletteVisible] = useState(false);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator color={colors.teal} accessibilityLabel="Loading question review" />
      </SafeAreaView>
    );
  }

  if (!result || result.questionAnswers.length === 0) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={typeScale.body}>This exam result could not be found.</Text>
      </SafeAreaView>
    );
  }

  const total = result.questionAnswers.length;
  const clampedIndex = Math.min(Math.max(selectedIndex, 0), total - 1);
  const qa = result.questionAnswers[clampedIndex];
  const question = contentRepository.getQuestionById(qa.questionId);

  if (!question) {
    // Content is validated at import time (M2) — this shouldn't happen, but review must never crash on a stale/missing question.
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <Text style={typeScale.body}>This question is no longer available.</Text>
      </SafeAreaView>
    );
  }

  const system = contentRepository.getSystem(question.systemKey);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.progressText}>
            Question {clampedIndex + 1} of {total}
          </Text>
          <Text style={styles.tagText}>
            {system?.label ?? question.topicLabel} · {domainLabel(question.domain)}
            {qa.isFlagged ? ' · Flagged' : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open question palette"
          style={styles.paletteButton}
          onPress={() => setPaletteVisible(true)}
        >
          <Text style={styles.paletteButtonText}>Palette</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.stem}>{question.stem}</Text>

        {question.type === 'single' ? (
          <SingleAnswerOptions
            options={question.options}
            selectedLabel={qa.answer?.type === 'single' ? qa.answer.label : ''}
            correctLabel={question.correctLabel}
            isLocked
            onSelect={() => {}}
          />
        ) : null}
        {question.type === 'sata' ? (
          <SataOptions
            options={question.options}
            selectedLabels={qa.answer?.type === 'sata' ? qa.answer.labels : []}
            correctLabels={question.correctLabels}
            isLocked
            onToggle={() => {}}
          />
        ) : null}
        {question.type === 'numeric' ? (
          <NumericAnswerInput
            value={qa.answer?.type === 'numeric' ? qa.answer.text : ''}
            unit={question.unit}
            isLocked
            isCorrect={qa.isAnswered ? qa.isCorrect : undefined}
            onChangeText={() => {}}
          />
        ) : null}

        <RationaleCard question={question} isCorrect={qa.isCorrect} isAnswered={qa.isAnswered} />
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous question"
          disabled={clampedIndex === 0}
          style={[styles.navButton, clampedIndex === 0 && styles.navButtonDisabled]}
          onPress={() => setSelectedIndex(clampedIndex - 1)}
        >
          <Text style={styles.navButtonText}>Previous</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next question"
          disabled={clampedIndex === total - 1}
          style={[styles.navButton, clampedIndex === total - 1 && styles.navButtonDisabled]}
          onPress={() => setSelectedIndex(clampedIndex + 1)}
        >
          <Text style={styles.navButtonText}>Next</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to results"
          style={styles.resultsButton}
          onPress={() => navigation.navigate('ExamResults', { examNumber, resultId })}
        >
          <Text style={styles.resultsButtonText}>Results</Text>
        </Pressable>
      </View>

      <QuestionPalette
        visible={isPaletteVisible}
        entries={getReviewPaletteEntries(result, clampedIndex)}
        onSelect={(index) => {
          setSelectedIndex(index);
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
    flexDirection: 'row',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.paperRaised,
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
  resultsButton: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  resultsButtonText: {
    ...typeScale.h3,
    color: colors.paperRaised,
  },
});
