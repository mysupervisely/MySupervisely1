import { Pressable, StyleSheet, Text, View } from 'react-native';

import { QuestionMeta } from './QuestionMeta';
import { SingleAnswerOptions } from './SingleAnswerOptions';
import { SataOptions } from './SataOptions';
import { NumericAnswerInput } from './NumericAnswerInput';
import { RationaleCard } from './RationaleCard';
import { contentRepository } from '../../services/contentRepository';
import { isAnswerable } from '../../services/scoringService';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { useQuestionEngine } from '../../hooks/useQuestionEngine';

type QuestionEngineViewProps = {
  engine: ReturnType<typeof useQuestionEngine>;
};

/**
 * The reusable Question Engine's renderer (Phase: M4 objective — one
 * engine, rendered the same way regardless of source). Takes whatever
 * `useQuestionEngine()` returns and renders it; it has no idea whether the
 * questions came from the local QBank, a fixed exam, or an AI-generated
 * set — it only knows about `Question` and the engine's own state shape.
 * QBank's screen (src/screens/qbank/QBankScreen.tsx) is the only
 * QBank-specific file in this flow; everything rendered here is meant to
 * be reused as-is by the Exam (M7) and AI-question (M9) screens.
 */
export function QuestionEngineView({ engine }: QuestionEngineViewProps) {
  const { currentQuestion, currentAttempt, currentDraft, index, total, canGoNext, canGoPrevious } = engine;

  if (!currentQuestion || !currentDraft) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No questions available.</Text>
      </View>
    );
  }

  const system = contentRepository.getSystem(currentQuestion.systemKey);
  const isLocked = currentAttempt?.status === 'submitted';
  const canSubmit = !isLocked && isAnswerable(currentQuestion, currentDraft);

  return (
    <View style={styles.container}>
      <QuestionMeta
        index={index}
        total={total}
        systemLabel={system?.label ?? currentQuestion.topicLabel}
        domain={currentQuestion.domain}
      />

      <Text style={styles.stem}>{currentQuestion.stem}</Text>

      <View style={styles.answerArea}>
        {currentQuestion.type === 'single' && currentDraft.type === 'single' ? (
          <SingleAnswerOptions
            options={currentQuestion.options}
            selectedLabel={currentDraft.label}
            correctLabel={isLocked ? currentQuestion.correctLabel : undefined}
            isLocked={isLocked}
            onSelect={engine.selectSingle}
          />
        ) : null}

        {currentQuestion.type === 'sata' && currentDraft.type === 'sata' ? (
          <SataOptions
            options={currentQuestion.options}
            selectedLabels={currentDraft.labels}
            correctLabels={isLocked ? currentQuestion.correctLabels : undefined}
            isLocked={isLocked}
            onToggle={engine.toggleSata}
          />
        ) : null}

        {currentQuestion.type === 'numeric' && currentDraft.type === 'numeric' ? (
          <NumericAnswerInput
            value={currentDraft.text}
            unit={currentQuestion.unit}
            isLocked={isLocked}
            isCorrect={currentAttempt?.isCorrect}
            onChangeText={engine.setNumeric}
          />
        ) : null}
      </View>

      {isLocked && currentAttempt ? (
        <RationaleCard question={currentQuestion} isCorrect={!!currentAttempt.isCorrect} />
      ) : null}

      <View style={styles.controls}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous question"
          disabled={!canGoPrevious}
          onPress={engine.previous}
          style={[styles.button, styles.secondaryButton, !canGoPrevious && styles.buttonDisabled]}
        >
          <Text style={styles.secondaryButtonText}>Previous</Text>
        </Pressable>

        {isLocked ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Next question"
            disabled={!canGoNext}
            onPress={engine.next}
            style={[styles.button, styles.primaryButton, !canGoNext && styles.buttonDisabled]}
          >
            <Text style={styles.primaryButtonText}>{canGoNext ? 'Next Question' : 'End of QBank'}</Text>
          </Pressable>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Submit answer"
            disabled={!canSubmit}
            onPress={engine.submit}
            style={[styles.button, styles.primaryButton, !canSubmit && styles.buttonDisabled]}
          >
            <Text style={styles.primaryButtonText}>Submit</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  stem: {
    ...typeScale.body,
    color: colors.ink,
  },
  answerArea: {
    marginTop: spacing.xs,
  },
  controls: {
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
  empty: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  emptyText: {
    ...typeScale.body,
    color: colors.inkSoft,
  },
});
