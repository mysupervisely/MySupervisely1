import { Badge } from "@/components/ui/Badge";

interface PlaceholderNoticeProps {
  children: React.ReactNode;
}

/**
 * Marks a screen or section as a structural placeholder for M0. Renders
 * visibly (not hidden in a comment) so it's obvious in every environment,
 * including the pilot demo, that no real functionality sits behind it yet.
 */
export function PlaceholderNotice({ children }: PlaceholderNoticeProps) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-accent-light/60 p-4 text-sm text-ink-muted">
      <Badge tone="info">Placeholder</Badge>
      <p>{children}</p>
    </div>
  );
}
