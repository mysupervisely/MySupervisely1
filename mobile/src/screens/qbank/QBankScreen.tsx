import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { QuestionEngineView } from '../../components/question/QuestionEngineView';
import { PremiumGate } from '../../components/access/PremiumGate';
import { useQBankSession } from '../../hooks/useQBankSession';
import { useAccessState } from '../../hooks/useAccessState';
import { colors, radius, spacing, typeScale } from '../../theme';
import type { MainTabParamList, QBankStackParamList } from '../../navigation/types';

// Composite type: QBank lives inside its own nested stack, but the
// PremiumGate's "Unlock Access" action needs to jump to a sibling tab
// (PricingTab) — same pattern SystemScreen.tsx/ExamHistoryScreen.tsx
// already use for cross-tab navigation.
type Props = CompositeScreenProps<NativeStackScreenProps<QBankStackParamList, 'QBank'>, BottomTabScreenProps<MainTabParamList>>;

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
 *
 * M9: the whole screen body (QBank session + the AI-practice entry
 * point) is gated behind `'qbank'` entitlement via one `PremiumGate` —
 * this is the single check point for that whole stack (AI practice is
 * only reachable by navigating through here first), per
 * docs/MOBILE_PAYMENT_ARCHITECTURE.md §9 ("do not scatter entitlement
 * checks"). The tab itself still opens and shows real messaging — that's
 * the "browse" allowance; answering a question is the gated action.
 */
export function QBankScreen({ navigation }: Props) {
  const { isHydrating, engine } = useQBankSession();
  const access = useAccessState();

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="Practice">QBank</ScreenTitle>

      <PremiumGate
        isEntitled={access.hasAccess('qbank')}
        isLoading={access.isLoading}
        title="QBank Access Required"
        description="Unlock QBank access to practice all 2,000 questions and generate AI practice questions."
        onUnlockPress={() => navigation.navigate('PricingTab')}
      >
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
      </PremiumGate>
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
