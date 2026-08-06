import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { PlaceholderNotice } from '../../components/PlaceholderNotice';

/**
 * M1 stub. Exam engine (timed, resumable state machine over the 3 real
 * 225-question exams) lands in M7.
 */
export function ExamScreen() {
  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="Practice">Full-Length Exams</ScreenTitle>
      <PlaceholderNotice
        milestone="M7"
        description="The 3 real 225-question practice exams, with a resumable timed state machine, review screen, and NAPLEX-domain score breakdown."
      />
    </ScreenContainer>
  );
}
