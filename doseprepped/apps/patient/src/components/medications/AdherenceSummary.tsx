import { Card } from "@/components/ui/Card";
import type { AdherenceEvent, AdherenceSummary as AdherenceSummaryData } from "@/lib/adherence";

const STATUS_LABELS: Record<AdherenceEvent["status"], string> = {
  TAKEN: "Taken",
  MISSED: "Missed",
  SKIPPED: "Skipped",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// System-calculated adherence — see apps/api/src/lib/adherence.ts for the
// exact formula and docs/doseprepped/ARCHITECTURE.md "M5.2 — Adherence
// tracking". Always a bare percentage, never a qualitative label.
export function AdherenceSummary({
  summary,
  events,
}: {
  summary: AdherenceSummaryData;
  events: AdherenceEvent[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-ink-muted">Adherence</h2>
        {summary.adherencePercentage === null ? (
          <p className="text-sm text-ink-muted">No adherence history yet.</p>
        ) : (
          <>
            <p className="text-2xl font-semibold text-ink">Adherence: {summary.adherencePercentage}%</p>
            <p className="text-xs text-ink-muted">
              Based on {summary.totalCount} recorded {summary.totalCount === 1 ? "dose" : "doses"}
              {summary.missedCount > 0 || summary.skippedCount > 0
                ? ` (${summary.takenCount} taken, ${summary.missedCount} missed, ${summary.skippedCount} skipped)`
                : ""}
              .
            </p>
          </>
        )}
      </Card>

      {events.length > 0 && (
        <Card className="flex flex-col divide-y divide-border p-0">
          <h2 className="px-5 py-3 text-sm font-semibold text-ink-muted">Recent activity</h2>
          {events.slice(0, 5).map((event) => (
            <div key={event.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <span className="text-sm text-ink">{STATUS_LABELS[event.status]}</span>
              <span className="text-xs text-ink-muted">{formatDateTime(event.scheduledAt)}</span>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
