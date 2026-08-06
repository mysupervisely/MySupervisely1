import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { PlaceholderNotice } from '../../components/PlaceholderNotice';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'Lesson'>;

/**
 * M1 stub. Note from docs/MOBILE_MIGRATION_AUDIT.md §C: the content export
 * only has a {title, note} pair per lesson, not full lesson body prose. M4
 * should ship a faithful lesson list/detail from that, not fabricated body
 * copy — see the audit for the open question to raise with the user if a
 * true long-form reader is wanted later.
 */
export function LessonScreen({ route }: Props) {
  const { systemKey, lessonIndex } = route.params;

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow={`Lesson ${lessonIndex + 1} · ${systemKey}`}>Lesson</ScreenTitle>
      <PlaceholderNotice
        milestone="M4"
        description="Lesson title/note from the real content export, completion tracking, and a link into topic-filtered practice questions. Full lesson-body prose is a content gap flagged in the audit — this milestone ships the real lesson list, not invented copy."
      />
    </ScreenContainer>
  );
}
