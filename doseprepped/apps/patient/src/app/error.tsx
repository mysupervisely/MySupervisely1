"use client";

import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";

// Root-level error boundary (M5.1). Deliberately never renders `error`'s
// message or stack — see docs/doseprepped/ARCHITECTURE.md "M5.1 — Error
// handling". `error` is still reported to server-side logs (not the
// browser console) so it stays debuggable without exposing detail to the
// patient.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Client-side only, and intentionally minimal: the digest (if present)
    // is Next.js's own opaque reference to the server-side log entry, not
    // the error detail itself.
    if (error.digest) {
      // Diagnostic reference id only — no message/stack — dev-visible only.
      console.error("Client error boundary triggered, digest:", error.digest);
    }
  }, [error]);

  return (
    <PageContainer className="flex flex-1 flex-col items-center justify-center gap-6 py-24 text-center">
      <Logo />
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-ink">Something went wrong.</h1>
        <p className="text-sm text-ink-muted">
          Please try again. If this keeps happening, come back a little
          later.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-3">
        <Button type="button" onClick={reset} fullWidth>
          Try again
        </Button>
        <Button href="/home" variant="secondary" fullWidth>
          Back to home
        </Button>
      </div>
    </PageContainer>
  );
}
