import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { requireRole } from "@/lib/require-role";
import { getAnalyticsReport } from "@/lib/analytics";

export const metadata: Metadata = {
  title: "Admin Analytics — DosePrepped",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours}h ${remMinutes}m`;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="flex flex-col items-center gap-1 py-4 text-center">
      <span className="text-2xl font-semibold text-ink">{value}</span>
      <span className="text-xs text-ink-muted">{label}</span>
      {sub && <span className="text-[11px] text-ink-muted">{sub}</span>}
    </Card>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {note && <p className="text-xs text-ink-muted">{note}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
    </div>
  );
}

export default async function AdminHomePage() {
  const user = await requireRole("ADMIN");
  const report = await getAnalyticsReport();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface">
        <PageContainer className="flex h-14 items-center justify-between">
          <Logo />
          <Badge tone="neutral">
            {user.firstName} {user.lastName}
          </Badge>
        </PageContainer>
      </header>
      <main className="flex-1 py-8">
        <PageContainer className="flex flex-col gap-8">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold text-ink">DosePrepped Admin — Analytics</h1>
            {report ? (
              <p className="text-sm text-ink-muted">
                {formatDate(report.range.from)} – {formatDate(report.range.to)}
              </p>
            ) : (
              <p className="text-sm text-ink-muted">Report unavailable right now.</p>
            )}
          </div>

          {report && (
            <>
              <Section title="Patient engagement">
                <Stat label="Patients activated" value={report.patientEngagement.patientsActivated} />
                <Stat label="Active patients" value={report.patientEngagement.activePatients} />
                <Stat label="Total patients" value={report.patientEngagement.totalPatients} sub="as of now" />
                <Stat label="Repeat patients" value={report.patientEngagement.repeatPatients} />
                <Stat label="Medication records added" value={report.patientEngagement.medicationRecordsAdded} />
                <Stat label="Medication views" value={report.patientEngagement.medicationViews} />
                <Stat label="Adherence events recorded" value={report.patientEngagement.adherenceEventsRecorded} />
                <Stat label="Check-ins completed" value={report.patientEngagement.checkInsCompleted} />
              </Section>

              <Section title="Question funnel">
                <Stat label="Questions submitted" value={report.questionFunnel.totalQuestions} />
                <Stat
                  label="General education"
                  value={report.questionFunnel.byDisposition.GENERAL_EDUCATION ?? 0}
                />
                <Stat
                  label="Pharmacist review"
                  value={report.questionFunnel.byDisposition.PHARMACIST_REVIEW ?? 0}
                />
                <Stat
                  label="Provider evaluation"
                  value={report.questionFunnel.byDisposition.PROVIDER_EVALUATION ?? 0}
                />
                <Stat
                  label="Urgent emergency"
                  value={report.questionFunnel.byDisposition.URGENT_EMERGENCY ?? 0}
                />
              </Section>

              <Section title="AI education">
                <Stat label="AI invoked" value={report.ai.invoked} />
                <Stat label="Succeeded" value={report.ai.succeeded} />
                <Stat label="Failed" value={report.ai.failed} />
                <Stat label="Skipped (emergency)" value={report.ai.skipped} />
                <Stat label="Clarifying questions issued" value={report.ai.clarifyingQuestionsIssued} />
                <Stat label="Resolved by AI, no pharmacist" value={report.ai.resolvedByAiWithoutPharmacist} />
                <Stat label="Routed to pharmacist instead" value={report.ai.routedToPharmacistInstead} />
                <Stat
                  label="Token usage"
                  value={`${report.ai.tokenUsage.inputTokens} in / ${report.ai.tokenUsage.outputTokens} out`}
                />
              </Section>

              <Section title="Pharmacist workflow">
                <Stat label="Entered queue" value={report.pharmacist.enteredQueue} />
                <Stat label="Claimed" value={report.pharmacist.claimed} />
                <Stat label="Responded" value={report.pharmacist.responded} />
                <Stat label="Escalated" value={report.pharmacist.escalated} />
                <Stat label="Unclaimed queue (now)" value={report.pharmacist.unclaimedQueueVolume} />
                <Stat label="Avg. wait to claim" value={formatDuration(report.pharmacist.averageWaitToClaimMs)} />
                <Stat label="Avg. response time" value={formatDuration(report.pharmacist.averageResponseTimeMs)} />
                <Stat label="Avg. queue aging (now)" value={formatDuration(report.pharmacist.averageQueueAgingMs)} />
              </Section>

              <Section
                title="Provider escalation"
                note='"Escalated to provider" means routed toward provider-level care — DosePrepped never messages a provider directly.'
              >
                <Stat label="Reached pharmacist" value={report.providerEscalation.reachedPharmacist} />
                <Stat label="Escalated to provider" value={report.providerEscalation.totalEscalatedToProvider} />
                <Stat label="Escalation rate" value={formatPercent(report.providerEscalation.escalationRate)} />
                <Stat
                  label="Resolved without provider escalation"
                  value={report.providerEscalation.resolvedWithoutProviderEscalation}
                  sub={formatPercent(report.providerEscalation.resolvedWithoutProviderEscalationRate)}
                />
                <Stat label="Urgent emergency (tracked separately)" value={report.providerEscalation.urgentEmergencyCount} />
              </Section>

              <Section title="Adherence &amp; check-ins">
                <Stat label="Adherence events" value={report.adherenceCheckIn.adherenceEventsRecorded} />
                <Stat label="Taken" value={report.adherenceCheckIn.takenCount} />
                <Stat label="Missed" value={report.adherenceCheckIn.missedCount} />
                <Stat label="Skipped" value={report.adherenceCheckIn.skippedCount} />
                <Stat label="Adherence rate" value={formatPercent(report.adherenceCheckIn.adherenceRatePercent)} />
                <Stat label="Check-ins completed" value={report.adherenceCheckIn.checkInsCompleted} />
              </Section>

              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-ink">Operational metrics (not a savings estimate)</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat
                    label="Questions / 1,000 patients"
                    value={report.roiOperationalMetrics.questionsPerThousandPatients ?? "—"}
                  />
                  <Stat
                    label="Pharmacist cases / 1,000 patients"
                    value={report.roiOperationalMetrics.pharmacistCasesPerThousandPatients ?? "—"}
                  />
                  <Stat
                    label="Provider escalations / 1,000 patients"
                    value={report.roiOperationalMetrics.providerEscalationsPerThousandPatients ?? "—"}
                  />
                  <Stat
                    label="% resolved without provider escalation"
                    value={formatPercent(report.roiOperationalMetrics.percentResolvedWithoutProviderEscalation)}
                  />
                </div>
                <Card className="text-xs text-ink-muted">{report.roiOperationalMetrics.note}</Card>
              </div>
            </>
          )}

          <LogoutButton />
        </PageContainer>
      </main>
    </div>
  );
}
