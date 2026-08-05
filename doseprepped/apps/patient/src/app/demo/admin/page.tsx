import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { ROICards } from "@/components/demo/ROICards";
import { getDemoOrganization, getDemoOrganizationAnalytics, getDemoOrganizationMembers } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Telehealth Admin Experience — DosePrepped Demo",
};

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="flex flex-col items-center gap-1 py-4 text-center">
      <span className="text-2xl font-semibold text-ink">{value}</span>
      <span className="text-xs text-ink-muted">{label}</span>
    </Card>
  );
}

/**
 * M6.0 — Telehealth Admin perspective. Uses the exact M5.5
 * organization-admin analytics report (GET
 * /organizations/:id/analytics/report), scoped to Demo Mode's own
 * dedicated, isolated organization — never Meridian, never Northstar.
 * See docs/doseprepped/ARCHITECTURE.md "M6.0 — Demo Mode".
 */
export default async function DemoAdminPage() {
  const [organization, members, report] = await Promise.all([
    getDemoOrganization(),
    getDemoOrganizationMembers(),
    getDemoOrganizationAnalytics(),
  ]);

  const patientCount = members.filter((m) => m.role === "ORG_PATIENT").length;
  const pharmacistCount = members.filter((m) => m.role === "ORG_PHARMACIST").length;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">{organization?.name ?? "DosePrepped Demo Mode"}</h1>
        <p className="text-sm text-ink-muted">Telehealth admin dashboard — synthetic demonstration data.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Active patients" value={patientCount} />
        <Stat label="Pharmacists" value={pharmacistCount} />
        <Stat label="Organization members" value={members.length} />
        <Stat label="Medication questions" value={report ? report.questionFunnel.totalQuestions : "—"} />
        <Stat label="Pharmacist reviews" value={report ? report.pharmacist.claimed : "—"} />
        <Stat
          label="Provider escalations"
          value={report ? report.providerEscalation.totalEscalatedToProvider : "—"}
        />
      </div>

      <ROICards />

      {report && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-ink">Pilot Metrics — synthetic demonstration data</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Questions submitted" value={report.questionFunnel.totalQuestions} />
            <Stat
              label="% resolved without provider escalation"
              value={formatPercent(report.providerEscalation.resolvedWithoutProviderEscalationRate)}
            />
            <Stat
              label="% requiring pharmacist review"
              value={formatPercent(
                report.questionFunnel.totalQuestions > 0
                  ? Math.round(
                      ((report.questionFunnel.byDisposition.PHARMACIST_REVIEW ?? 0) /
                        report.questionFunnel.totalQuestions) *
                        100,
                    )
                  : null,
              )}
            />
            <Stat label="% escalated to provider" value={formatPercent(report.providerEscalation.escalationRate)} />
            <Stat label="Pharmacist response time" value={formatDuration(report.pharmacist.averageResponseTimeMs)} />
            <Stat label="Active patients" value={report.patientEngagement.activePatients} />
            <Stat label="Adherence events recorded" value={report.patientEngagement.adherenceEventsRecorded} />
            <Stat label="Check-ins completed" value={report.patientEngagement.checkInsCompleted} />
          </div>
        </div>
      )}
    </>
  );
}
