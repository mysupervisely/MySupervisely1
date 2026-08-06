import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { QuestionEngineView } from '../../components/question/QuestionEngineView';
import { useStudySession } from '../../hooks/useStudySession';
import { colors, typeScale } from '../../theme';
import type { ProgressStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<ProgressStackParamList, 'StudySession'>;

/**
 * M7.5 — a recommendation turned into a live session. This screen is
 * intentionally as thin as QBankScreen.tsx: useStudySession composes the
 * same reusable useQuestionEngine + QuestionEngineView every other
 * question source (QBank, and M6's exams) already uses, fed with the
 * recommendation's specific question id list instead of the full bank or
 * a fixed exam — "recommendations must link back into existing
 * QBank/question engine" in concrete, literal terms.
 */
export function StudySessionScreen({ route }: Props) {
  const { title, questionIds } = route.params;
  const { engine, questions } = useStudySession(questionIds);

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="Study Session">{title}</ScreenTitle>
      {questions.length === 0 ? (
        <View>
          <Text style={styles.emptyText}>These questions are no longer available.</Text>
        </View>
      ) : (
        <QuestionEngineView engine={engine} />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  emptyText: {
    ...typeScale.body,
    color: colors.inkSoft,
  },
});
