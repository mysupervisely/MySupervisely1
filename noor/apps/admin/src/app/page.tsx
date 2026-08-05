import Link from "next/link";

export default function AdminLandingPage() {
  return (
    <main className="noor-shell">
      <h1>Noor — Admin</h1>
      <p className="noor-muted">
        Admin access never automatically includes clinical/PHI content — see
        docs/noor/ARCHITECTURE.md §E.
      </p>
      <p>
        <Link href="/login" className="noor-button">
          Log in
        </Link>
      </p>
    </main>
  );
}
