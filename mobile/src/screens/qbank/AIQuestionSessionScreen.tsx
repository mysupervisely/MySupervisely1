import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { QuestionEngineView } from '../../components/question/QuestionEngineView';
import { useCachedAIQuestions, useAIQuestionEngineSession } from '../../hooks/useAIQuestionSession';
import { colors, spacing, typeScale } from '../../theme';
import type { QBankStackParamList } from '../../navigation/types';
import type { SingleAnswerQuestion } from '../../models';

type Props = NativeStackScreenProps<QBankStackParamList, 'AIQuestionSession'>;

/**
 * M8 — the just-generated (and any previously cached) AI questions,
 * shown through the exact same reusable Question Engine QBank/Exams/M7.5
 * already use. "No duplicate UI": this screen has no answer-rendering
 * logic of its own at all — `QuestionEngineView` is the same component
 * QBankScreen.tsx renders.
 */
export function AIQuestionSessionScreen(_props: Props) {
  const { isLoading, questions } = useCachedAIQuestions();

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="AI Practice">Generated Questions</ScreenTitle>

      {isLoading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.teal} accessibilityLabel="Loading generated questions" />
        </View>
      ) : questions.length === 0 ? (
        <Text style={styles.emptyText}>No AI-generated questions yet.</Text>
      ) : (
        // Only mounted once real questions are known — see
        // useAIQuestionSession.ts for why useQuestionEngine can't be fed
        // a still-loading list.
        <AIQuestionEngineSession questions={questions} />
      )}
    </ScreenContainer>
  );
}

function AIQuestionEngineSession({ questions }: { questions: SingleAnswerQuestion[] }) {
  const { engine } = useAIQuestionEngineSession(questions);
  return <QuestionEngineView engine={engine} />;
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
});
