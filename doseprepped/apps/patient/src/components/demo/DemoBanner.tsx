import { Badge } from "@/components/ui/Badge";

/**
 * M6.0 — shown on every /demo/* page, in addition to (never replacing)
 * the existing global DevBanner. Explicit, unmissable labeling per
 * docs/doseprepped/ARCHITECTURE.md "M6.0 — Demo Mode": this is
 * synthetic data, never a real patient, and the numbers shown are not a
 * customer's real results.
 */
export function DemoBanner({ note }: { note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-primary/30 bg-primary-light px-4 py-3 text-primary-dark sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2">
        <Badge tone="warning">DEMO MODE</Badge>
        <span className="text-sm font-medium">Synthetic data — not a real patient.</span>
      </div>
      {note && <span className="text-xs">{note}</span>}
    </div>
  );
}
