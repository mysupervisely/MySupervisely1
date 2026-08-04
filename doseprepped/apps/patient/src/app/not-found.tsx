import { Logo } from "@/components/Logo";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";

// Root-level 404 UI (M5.1) — replaces Next.js's unstyled default for any
// unmatched route or an explicit notFound() call (e.g. a medication or
// question ID that doesn't exist / isn't the caller's).
export default function NotFound() {
  return (
    <PageContainer className="flex flex-1 flex-col items-center justify-center gap-6 py-24 text-center">
      <Logo />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-ink">Page not found.</h1>
        <p className="text-sm text-ink-muted">
          This page doesn&apos;t exist, or you don&apos;t have access to it.
        </p>
      </div>
      <Button href="/home" className="w-full max-w-xs">
        Back to home
      </Button>
    </PageContainer>
  );
}
