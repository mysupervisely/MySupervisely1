import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { OrgSettingsForm } from "@/components/org-admin/OrgSettingsForm";
import { requireOrganizationAdmin } from "@/lib/require-org-admin";
import { getOrganization } from "@/lib/organizations";

export const metadata: Metadata = {
  title: "Organization Settings — DosePrepped",
};

/**
 * Minimal organization settings (M5.5) — name only. No custom domains,
 * no white labeling, no logos, no colors, no SSO, no API keys, no
 * billing settings — none of those exist in the schema. `slug` is shown
 * read-only: reserved for a future routing/branding layer (M5.4), never
 * writable through this or any other route. See
 * docs/doseprepped/ARCHITECTURE.md "M5.5 — UI screens".
 */
export default async function OrgAdminSettingsPage() {
  const { organizationId } = await requireOrganizationAdmin();
  const organization = await getOrganization(organizationId);

  if (!organization) {
    return <p className="text-sm text-ink-muted">Organization unavailable right now.</p>;
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Settings</h1>
        <p className="text-sm text-ink-muted">Basic organization details.</p>
      </div>

      <Card className="flex flex-col gap-4">
        <OrgSettingsForm organizationId={organizationId} initialName={organization.name} />
        <div className="flex flex-col gap-1 border-t border-border pt-4">
          <span className="text-sm font-medium text-ink">Slug</span>
          <span className="text-sm text-ink-muted">{organization.slug}</span>
          <span className="text-xs text-ink-muted">
            Reserved for future routing/branding — not editable and not used for anything today.
          </span>
        </div>
      </Card>
    </>
  );
}
