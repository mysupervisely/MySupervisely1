import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { QuestionEngineView } from '../../components/question/QuestionEngineView';
import { useQBankSession } from '../../hooks/useQBankSession';
import { colors, spacing } from '../../theme';

/**
 * M4: the real 2,000-question QBank, sequential mode only (no
 * filters/randomization/bookmarks yet — explicitly out of scope). This
 * screen is thin on purpose: `useQBankSession` owns all QBank-specific
 * wiring (resume, attempt persistence), and `QuestionEngineView` is the
 * source-agnostic renderer Exams/AI-questions will reuse — this file's
 * only job is to compose the two.
 */
export function QBankScreen() {
  const { isHydrating, engine } = useQBankSession();

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="Practice">QBank</ScreenTitle>
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
});
