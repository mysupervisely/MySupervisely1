import Link from "next/link";
import { NoorSunMark } from "../components/NoorSunMark";

export default function LandingPage() {
  return (
    <main className="noor-page">
      <div className="noor-hero">
        <NoorSunMark size={44} className="noor-hero-mark" />
        <h1>A brighter path forward.</h1>
        <p className="noor-muted" style={{ maxWidth: 440, margin: "0 auto 1.75rem" }}>
          Noor is a calmer way into mental health care — a place to check in, find a therapist, and
          feel supported between sessions.
        </p>
        <div className="noor-button-row" style={{ justifyContent: "center" }}>
          <Link href="/signup" className="noor-button">
            Get started
          </Link>
          <Link href="/login" className="noor-button noor-button--secondary">
            Log in
          </Link>
        </div>
      </div>

      <div className="noor-shell noor-shell--wide">
        <div className="noor-card-grid">
          <div className="noor-card noor-card--muted">
            <h3 className="noor-display" style={{ fontSize: "1.15rem" }}>
              1. Create your account
            </h3>
            <p className="noor-muted">A couple of minutes — just what we need to get you started.</p>
          </div>
          <div className="noor-card noor-card--muted">
            <h3 className="noor-display" style={{ fontSize: "1.15rem" }}>
              2. Tell us what brings you here
            </h3>
            <p className="noor-muted">No forms full of clinical questions — just the basics.</p>
          </div>
          <div className="noor-card noor-card--muted">
            <h3 className="noor-display" style={{ fontSize: "1.15rem" }}>
              3. Find your way
            </h3>
            <p className="noor-muted">Explore care options at your own pace, whenever you&apos;re ready.</p>
          </div>
        </div>
      </div>
    </main>
  );
}
