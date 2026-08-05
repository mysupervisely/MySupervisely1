import Link from "next/link";
import { NoorLogo } from "../../components/NoorLogo";

// Honest future/empty state (M2 brief §8: "provider discovery
// placeholder" — "create the appropriate route/page shell and empty
// state," "do not create fake providers, fake availability, or fake
// appointments"). The real provider directory is a later milestone.
export default function FindATherapistPage() {
  return (
    <main className="noor-shell noor-center">
      <NoorLogo />
      <div className="noor-card noor-section">
        <span className="noor-badge">Coming soon</span>
        <h1 className="noor-section">Find a Therapist</h1>
        <p className="noor-muted">Find a provider who fits your needs.</p>
        <p className="noor-muted" style={{ fontSize: "0.9rem" }}>
          Provider search and matching aren&apos;t built yet — this is where you&apos;ll browse
          therapists, see their specialties and availability, and request care.
        </p>
        <div className="noor-button-row" style={{ justifyContent: "center" }}>
          <button type="button" className="noor-button" disabled aria-disabled="true">
            Explore Providers
          </button>
        </div>
        <p className="noor-section">
          <Link href="/home" className="noor-muted">
            ← Back to Home
          </Link>
        </p>
      </div>
    </main>
  );
}
