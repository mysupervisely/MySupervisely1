"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch, ApiError } from "../../../../lib/api";

interface PatientProfile {
  firstName: string | null;
  lastName: string | null;
  state: string | null;
  city: string | null;
}

// If this clinician has no ACTIVE CareRelationship with :patientId, the API
// returns 403 and this page shows the denial — there is no fallback path
// that renders patient data first and hides it client-side. The server is
// the enforcement point (M1 requirement #3), not this component.
export default function ClinicianPatientDetailPage() {
  const params = useParams<{ patientId: string }>();
  const router = useRouter();
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const result = await apiFetch<PatientProfile>(`/clinicians/me/patients/${params.patientId}`);
        if (!cancelled) setProfile(result);
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
  }, [params.patientId, router]);

  if (error) {
    return (
      <main className="noor-shell">
        <p className="noor-error">{error}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="noor-shell">
        <p className="noor-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="noor-shell">
      <h1>
        {profile.firstName} {profile.lastName}
      </h1>
      <div className="noor-card">
        <p>
          <strong>Location:</strong> {profile.city ?? "—"}, {profile.state ?? "—"}
        </p>
        <p className="noor-muted">
          No check-in history, care goals, or clinical content yet — those arrive in M3/M4.
        </p>
      </div>
    </main>
  );
}
