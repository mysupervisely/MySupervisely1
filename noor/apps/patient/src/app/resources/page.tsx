import Link from "next/link";
import { NoorLogo } from "../../components/NoorLogo";

// Honest future/empty state, linked from Home's "Resources" section (M2
// brief §6). No articles/content exist yet — nothing here pretends
// otherwise.
export default function ResourcesPage() {
  return (
    <main className="noor-shell noor-center">
      <NoorLogo />
      <div className="noor-card noor-section">
        <span className="noor-badge">Coming soon</span>
        <h1 className="noor-section">Resources</h1>
        <p className="noor-muted">Tools and information to support your mental health.</p>
        <p className="noor-muted" style={{ fontSize: "0.9rem" }}>
          Articles, guides, and self-help tools aren&apos;t built yet — they&apos;ll live here once
          they&apos;re ready.
        </p>
        <p className="noor-section">
          <Link href="/home" className="noor-muted">
            ← Back to Home
          </Link>
        </p>
      </div>
    </main>
  );
}
