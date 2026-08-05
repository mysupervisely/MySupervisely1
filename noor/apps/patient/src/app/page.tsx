import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="noor-shell">
      <h1>Noor</h1>
      <p className="noor-muted">A brighter path forward.</p>
      <p>
        This is the M1 foundations build of the Noor patient app: accounts, sessions, and a
        placeholder home shell. The weekly check-in, onboarding, and provider directory are not
        built yet — see docs/noor/ARCHITECTURE.md for the milestone roadmap.
      </p>
      <p>
        <Link href="/signup" className="noor-button">
          Create an account
        </Link>{" "}
        <Link href="/login">Log in</Link>
      </p>
    </main>
  );
}
