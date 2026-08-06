import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { PlaceholderNotice } from '../../components/PlaceholderNotice';

/**
 * M1 stub. No payment logic here yet. M10 ships the pricing/access SERVICE
 * ABSTRACTION plus documented App Store/Play Store IAP architecture
 * (docs/MOBILE_MIGRATION_AUDIT.md §P) — not a working purchase button, since
 * the existing backend (create-checkout.mts) has no plan/day-count
 * parameters yet on either platform (audit §H).
 */
export function PricingScreen() {
  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="Access">Pricing</ScreenTitle>
      <PlaceholderNotice
        milestone="M10"
        description="Course / QBank / Bundle pricing (Price(days) = base x days^0.425) and access-management, backed by platform in-app purchases per store policy — see the audit for the backend gap this depends on."
      />
    </ScreenContainer>
  );
}
