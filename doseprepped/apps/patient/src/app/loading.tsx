import { PageContainer } from "@/components/layout/PageContainer";

// Root-level loading UI (M5.1) — shown automatically by Next.js while a
// route segment's data is being fetched. Deliberately minimal: a single
// on-brand spinner, no route-specific content, so it never goes stale as
// new routes are added.
export default function Loading() {
  return (
    <PageContainer className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary"
        role="status"
        aria-label="Loading"
      />
      <p className="text-sm text-ink-muted">Loading…</p>
    </PageContainer>
  );
}
