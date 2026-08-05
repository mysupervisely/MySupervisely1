import Link from "next/link";

export default function ClinicianLandingPage() {
  return (
    <main className="noor-shell">
      <h1>Noor — Clinician</h1>
      <p className="noor-muted">
        Separate app/origin from the patient app and admin dashboard. MFA is required for
        clinician accounts before general availability (docs/noor/ARCHITECTURE.md §D) but is not
        yet enforced in this M1 build — see docs/noor/M1-IMPLEMENTATION.md &quot;Known
        limitations.&quot;
      </p>
      <p>
        <Link href="/login" className="noor-button">
          Log in
        </Link>
      </p>
    </main>
  );
}
