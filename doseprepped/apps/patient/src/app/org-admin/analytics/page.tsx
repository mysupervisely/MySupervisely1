import type { Metadata } from "next";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { requireOrganizationAdmin } from "@/lib/require-org-admin";
import { getOrganizationAnalyticsReport } from "@/lib/organizations";

export const metadata: Metadata = {
  title: "Organization Analytics — DosePrepped",
};

const DAY_MS = 24 * 60 * 60 * 1000;
const RANGE_PRESETS = [
  { days: 7, label: "Last 7 days" },
  { days: 30, label: "Last 30 days" },
  { days: 90, label: "Last 90 days" },
] as const;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function toDateInputValue(value: string): string {
  return value.slice(0, 10);
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

/**
 * Organization-scoped analytics (M5.5). Fetches
 * GET /organizations/:id/analytics/report — the exact same M5.3/M5.4
 * report shape and reporting service the global /admin page renders, just
 * scoped to this organization. Date range reuses the from/to query
 * parameters that route has accepted since M5.3 — no new date-range
 * capability was built, only a UI for the one that already existed. See
 * docs/doseprepped/ARCHITECTURE.md "M5.5 — Analytics".
 */
export default async function OrgAdminAnalyticsPage({ searchParams }: PageProps<"/org-admin/analytics">) {
  const { organizationId } = await requireOrganizationAdmin();
  const params = await searchParams;

  const daysParam = params["days"];
  const fromParam = typeof params["from"] === "string" ? params["from"] : undefined;
  const toParam = typeof params["to"] === "string" ? params["to"] : undefined;

  let from = fromParam;
  let to = toParam;
  if (!from && !to && typeof daysParam === "string") {
    const days = Number(daysParam);
    if (Number.isFinite(days) && days > 0) {
      const now = new Date();
      to = now.toISOString();
      from = new Date(now.getTime() - days * DAY_MS).toISOString();
    }
  }

  const report = await getOrganizationAnalyticsReport(organizationId, { from, to });

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Organization Analytics</h1>
        {report ? (
          <p className="text-sm text-ink-muted">
            {formatDate(report.range.from)} – {formatDate(report.range.to)}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Report unavailable right now.</p>
        )}
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {RANGE_PRESETS.map((preset) => (
            <a key={preset.days} href={`/org-admin/analytics?days=${preset.days}`}>
              <Badge tone="info">{preset.label}</Badge>
            </a>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-3" action="/org-admin/analytics">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">From</span>
            <input
              type="date"
              name="from"
              defaultValue={report ? toDateInputValue(report.range.from) : undefined}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium text-ink">To</span>
            <input
              type="date"
              name="to"
              defaultValue={report ? toDateInputValue(report.range.to) : undefined}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary-dark"
          >
            Apply custom range
          </button>
        </form>
      </Card>

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
            <Stat label="General education" value={report.questionFunnel.byDisposition.GENERAL_EDUCATION ?? 0} />
            <Stat label="Pharmacist review" value={report.questionFunnel.byDisposition.PHARMACIST_REVIEW ?? 0} />
            <Stat
              label="Provider evaluation"
              value={report.questionFunnel.byDisposition.PROVIDER_EVALUATION ?? 0}
            />
            <Stat label="Urgent emergency" value={report.questionFunnel.byDisposition.URGENT_EMERGENCY ?? 0} />
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
            <Stat
              label="Urgent emergency (tracked separately)"
              value={report.providerEscalation.urgentEmergencyCount}
            />
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
    </>
  );
}
