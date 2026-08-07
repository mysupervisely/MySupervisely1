import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';
import type { AIQuestionServiceError } from '../../api/aiQuestionService';

type AIGenerationErrorNoticeProps = {
  error: AIQuestionServiceError;
  onRetry: () => void;
};

const KIND_TITLE: Record<AIQuestionServiceError['kind'], string> = {
  network: "Can't reach the AI service",
  timeout: 'The request took too long',
  unauthorized: 'Access required',
  backend: 'Generation failed',
  malformed: 'Something went wrong',
};

/**
 * M8 — "Handle: network unavailable / timeout / invalid response / backend
 * errors. Provide clear retry messaging." One component, driven entirely
 * by the typed error `kind` the service already produced — never a raw
 * exception/stack trace shown to a student.
 */
export function AIGenerationErrorNotice({ error, onRetry }: AIGenerationErrorNoticeProps) {
  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={`${KIND_TITLE[error.kind]}. ${error.message}`}
    >
      <Text style={styles.title}>{KIND_TITLE[error.kind]}</Text>
      <Text style={styles.message}>{error.message}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Try again" style={styles.retryButton} onPress={onRetry}>
        <Text style={styles.retryButtonText}>Try Again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(174, 59, 69, 0.08)',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.flag,
    padding: spacing.md,
    gap: spacing.xs,
  },
  title: {
    ...typeScale.h3,
    color: colors.flag,
  },
  message: {
    ...typeScale.body,
    color: colors.ink,
  },
  retryButton: {
    marginTop: spacing.xs,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.flag,
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  retryButtonText: {
    ...typeScale.bodyMedium,
    color: colors.paperRaised,
  },
});
