import Link from "next/link";
import { NoorLogo } from "../../components/NoorLogo";

// Honest future/empty state — Noor Async's structured check-in, clinician
// review, and subscription (M3/M4/M7) don't exist yet. No pricing or SLA
// is stated here; those are still open product decisions
// (docs/noor/ARCHITECTURE.md §N).
export default function AsyncCarePage() {
  return (
    <main className="noor-shell noor-center">
      <NoorLogo />
      <div className="noor-card noor-section">
        <span className="noor-badge">Coming soon</span>
        <h1 className="noor-section">Noor Async</h1>
        <p className="noor-muted">
          Ongoing, asynchronous support between sessions — a weekly check-in reviewed by a
          clinician, without needing to book a live appointment every time. Not available yet.
        </p>
        <Link href="/home" className="noor-button noor-section">
          Back to Home
        </Link>
      </div>
    </main>
  );
}
