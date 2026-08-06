import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { PlaceholderNotice } from '../../components/PlaceholderNotice';

/**
 * M1 stub. Real progress aggregation (accuracy by system/domain, exam
 * history) lands in M8, built on the offline storage layer from M6.
 */
export function ProgressScreen() {
  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="You">Progress</ScreenTitle>
      <PlaceholderNotice
        milestone="M8"
        description="Per-system/domain accuracy, QBank stats, and exam history, computed from locally persisted attempt data."
      />
    </ScreenContainer>
  );
}
