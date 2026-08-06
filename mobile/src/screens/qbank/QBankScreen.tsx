import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { PlaceholderNotice } from '../../components/PlaceholderNotice';

/**
 * M1 stub. No questions are imported yet — the real 2,000-question QBank
 * (single/numeric/SATA) lands in M5, backed by the content layer from M2.
 */
export function QBankScreen() {
  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="Practice">QBank</ScreenTitle>
      <PlaceholderNotice
        milestone="M5"
        description="The real 2,000-question bank (single-answer, numeric, and SATA), filterable by system/domain/topic, scored offline with attempt history tracked locally."
      />
    </ScreenContainer>
  );
}
