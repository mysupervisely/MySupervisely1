import { Card } from "@/components/ui/Card";

const VALUE_CARDS = [
  {
    title: "Patient Experience",
    body: "Medication support between appointments, faster access to medication information, and improved engagement.",
  },
  {
    title: "Provider Capacity",
    body: "Appropriate medication questions can be handled outside the physician workflow — patients can still be routed back to providers when necessary.",
  },
  {
    title: "Pharmacist Utilization",
    body: "A structured pharmacist workflow with queue management and measurable response times.",
  },
  {
    title: "Operations",
    body: "Question volume, pharmacist workload, escalation volume, resolution without provider escalation, and adherence/check-in engagement — all measurable.",
  },
] as const;

/**
 * The M6.0 "Where DosePrepped Can Create Value" section. Deliberately no
 * dollar figures — "pilot and measure" language only, matching M5.3's
 * existing roiOperationalMetrics disclaimer verbatim in spirit. See
 * docs/doseprepped/ARCHITECTURE.md "M6.0 — Demo Mode".
 */
export function ROICards() {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-ink">Where DosePrepped Can Create Value</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {VALUE_CARDS.map((card) => (
          <Card key={card.title} className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-ink">{card.title}</h3>
            <p className="text-sm text-ink-muted">{card.body}</p>
          </Card>
        ))}
      </div>
      <Card className="text-xs text-ink-muted">
        Pilot and measure: the metrics below are computed from this organization&apos;s real, already-measured
        activity. Pilot metrics should be measured against the organization&apos;s existing workflow before
        financial or clinical ROI claims are made — no dollar savings figure is calculated or implied here.
      </Card>
    </div>
  );
}
