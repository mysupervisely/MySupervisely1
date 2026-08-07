import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { QuestionEngineView } from '../../components/question/QuestionEngineView';
import { useQBankSession } from '../../hooks/useQBankSession';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { QBankStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<QBankStackParamList, 'QBank'>;

/**
 * M4: the real 2,000-question QBank, sequential mode only (no
 * filters/randomization/bookmarks yet — explicitly out of scope). This
 * screen is thin on purpose: `useQBankSession` owns all QBank-specific
 * wiring (resume, attempt persistence), and `QuestionEngineView` is the
 * source-agnostic renderer Exams/AI-questions reuse (M8) — this file's
 * only job is to compose the two.
 *
 * M8 adds the AI-generated-practice entry point here rather than a
 * separate tab, per the audit: "AI-generated practice doesn't get its
 * own tab... it's an entry point reached from within QBank/Home."
 */
export function QBankScreen({ navigation }: Props) {
  const { isHydrating, engine } = useQBankSession();

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="Practice">QBank</ScreenTitle>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Generate an AI practice question"
        style={styles.aiButton}
        onPress={() => navigation.navigate('AIQuestionSetup')}
      >
        <Text style={styles.aiButtonText}>✨ Generate AI Practice Question</Text>
      </Pressable>

      {isHydrating ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.teal} accessibilityLabel="Loading your QBank session" />
        </View>
      ) : (
        <QuestionEngineView engine={engine} />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  aiButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.teal,
    marginBottom: spacing.lg,
  },
  aiButtonText: {
    ...typeScale.bodyMedium,
    color: colors.teal,
  },
});
