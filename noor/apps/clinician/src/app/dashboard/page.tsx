"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiError } from "../../lib/api";

interface Me {
  email: string;
  roles: string[];
}

interface AssignedPatient {
  careRelationshipId: string;
  patientId: string;
  relationshipType: string;
  relationshipStatus: string;
  firstName: string | null;
  lastName: string | null;
}

// Ownership-scoped by construction: this page renders exactly what
// GET /clinicians/me/patients returns, which the API derives entirely from
// the authenticated clinician's ACTIVE CareRelationship rows (M1
// requirement #5). There is no "view all patients" affordance anywhere in
// this app.
export default function ClinicianDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [patients, setPatients] = useState<AssignedPatient[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meResult = await apiFetch<Me>("/auth/me");
        if (cancelled) return;
        if (!meResult.roles.includes("CLINICIAN")) {
          setError("This account is not a clinician account.");
          return;
        }
        setMe(meResult);
        const list = await apiFetch<AssignedPatient[]>("/clinicians/me/patients");
        if (!cancelled) setPatients(list);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Something went wrong.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <main className="noor-shell">
        <p className="noor-error">{error}</p>
      </main>
    );
  }

  if (!me || !patients) {
    return (
      <main className="noor-shell">
        <p className="noor-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="noor-shell">
      <h1>Assigned patients</h1>
      <p className="noor-muted">Signed in as {me.email}</p>
      {patients.length === 0 ? (
        <p className="noor-muted">
          No patients are currently assigned to you. Assignment is admin-managed in M1 — see the
          admin dashboard.
        </p>
      ) : (
        <ul>
          {patients.map((p) => (
            <li key={p.careRelationshipId}>
              <Link href={`/dashboard/patients/${p.patientId}`}>
                {p.firstName ?? "(no name on file)"} {p.lastName ?? ""} — {p.relationshipType} · {p.relationshipStatus}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="noor-muted">
        The check-in review queue (docs/noor/ARCHITECTURE.md §10) is M4 — not built yet.
      </p>
    </main>
  );
}
