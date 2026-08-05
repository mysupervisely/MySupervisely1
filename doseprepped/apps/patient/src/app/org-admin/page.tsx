import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { requireOrganizationAdmin } from "@/lib/require-org-admin";
import { getOrganizationAnalyticsReport, getOrganizationMembers } from "@/lib/organizations";

export const metadata: Metadata = {
  title: "Organization Dashboard — DosePrepped",
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="flex flex-col items-center gap-1 py-4 text-center">
      <span className="text-2xl font-semibold text-ink">{value}</span>
      <span className="text-xs text-ink-muted">{label}</span>
    </Card>
  );
}

/**
 * Organization Overview (M5.5). Every number here is read directly off
 * an existing API response — memberships (M5.4) and the organization
 * analytics report (M5.3/M5.4) — no new "overview" endpoint was added.
 * See docs/doseprepped/ARCHITECTURE.md "M5.5 — UI screens".
 */
export default async function OrgAdminOverviewPage() {
  const { organizationId, organizationName } = await requireOrganizationAdmin();
  const [members, report] = await Promise.all([
    getOrganizationMembers(organizationId),
    getOrganizationAnalyticsReport(organizationId),
  ]);

  const patientCount = members.filter((m) => m.role === "ORG_PATIENT").length;
  const pharmacistCount = members.filter((m) => m.role === "ORG_PHARMACIST").length;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">{organizationName}</h1>
        <p className="text-sm text-ink-muted">Organization dashboard</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Patients" value={patientCount} />
        <Stat label="Pharmacists" value={pharmacistCount} />
        <Stat label="Organization members" value={members.length} />
        <Stat label="Medication questions" value={report ? report.questionFunnel.totalQuestions : "—"} />
        <Stat label="Pharmacist reviews" value={report ? report.pharmacist.claimed : "—"} />
        <Stat
          label="Provider escalations"
          value={report ? report.providerEscalation.totalEscalatedToProvider : "—"}
        />
      </div>

      {report && (
        <p className="text-xs text-ink-muted">
          Question/pharmacist/escalation counts reflect the last 30 days — see the Analytics tab for other date
          ranges.
        </p>
      )}
    </>
  );
}
