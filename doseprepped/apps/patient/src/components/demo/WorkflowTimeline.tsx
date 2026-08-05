import { cn } from "@/lib/cn";

export interface TimelineStep {
  label: string;
  done: boolean;
  skipped?: boolean;
}

/**
 * The "What happens next?" visual required by the M6.0 brief — a small,
 * static step list, not a new workflow engine. `done`/`skipped` are
 * supplied by the calling page from real data it already fetched (e.g. a
 * question's actual status/disposition) — this component only renders,
 * it never decides routing.
 */
export function WorkflowTimeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step, i) => (
        <li key={step.label} className="flex items-center gap-3 text-sm">
          <span
            className={cn(
              "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
              step.skipped
                ? "bg-accent-light text-ink-muted"
                : step.done
                  ? "bg-primary text-white"
                  : "border border-border text-ink-muted",
            )}
          >
            {i + 1}
          </span>
          <span className={cn(step.skipped ? "text-ink-muted line-through" : "text-ink")}>
            {step.label}
            {step.skipped && <span className="ml-1 text-xs text-ink-muted">(not needed this time)</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}
