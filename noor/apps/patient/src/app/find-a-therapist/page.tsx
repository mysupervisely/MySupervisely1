import Link from "next/link";
import { NoorLogo } from "../../components/NoorLogo";

// Honest future/empty state (M2 brief: "If a feature is not implemented
// yet, clearly design it as a future/empty state rather than pretending
// the functionality exists"). The provider directory is M5 — nothing here
// is faked.
export default function FindATherapistPage() {
  return (
    <main className="noor-shell noor-center">
      <NoorLogo />
      <div className="noor-card noor-section">
        <span className="noor-badge">Coming soon</span>
        <h1 className="noor-section">Finding your therapist</h1>
        <p className="noor-muted">
          Provider search and matching aren&apos;t built yet — this is where you&apos;ll browse
          therapists, see their specialties and availability, and request care.
        </p>
        <Link href="/home" className="noor-button noor-section">
          Back to Home
        </Link>
      </div>
    </main>
  );
}
