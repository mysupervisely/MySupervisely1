"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClinicianPatientListItemDTO } from "@noor/types";
import { apiFetch, ApiError } from "../../lib/api";
import { ClinicianNav } from "../../components/ClinicianNav";

interface Me {
  roles: string[];
}

// The clinician's patient list (M4 brief §8): derived entirely from this
// clinician's own ACTIVE CareRelationship rows (GET /clinicians/me/patients,
// unchanged from M1) — there is no "search all patients" affordance
// anywhere in this app, and never will be from this endpoint.
export default function ClinicianPatientsPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<ClinicianPatientListItemDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const me = await apiFetch<Me>("/auth/me");
        if (cancelled) return;
        if (!me.roles.includes("CLINICIAN")) {
          setError("This account is not a clinician account.");
          return;
        }
        const result = await apiFetch<ClinicianPatientListItemDTO[]>("/clinicians/me/patients");
        if (cancelled) return;
        setPatients(result);
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
        <p className="noor-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  return (
    <div className="noor-page">
      <ClinicianNav active="patients" />
      <main className="noor-shell noor-shell--narrow">
        <h1>My Patients</h1>

        {!patients ? (
          <p className="noor-muted">Loading...</p>
        ) : patients.length === 0 ? (
          <div className="noor-card noor-card--muted">
            <p className="noor-muted" style={{ margin: 0 }}>
              No patients are currently assigned to you. Assignment is admin-managed — see docs/noor/M1-IMPLEMENTATION.md.
            </p>
          </div>
        ) : (
          <div className="noor-row-list">
            {patients.map((patient) => (
              <div className="noor-row" key={patient.careRelationshipId}>
                <div className="noor-row-main">
                  <div className="noor-row-title">
                    {patient.firstName ?? "(no name on file)"} {patient.lastName ?? ""}
                  </div>
                  <div className="noor-row-meta">
                    Active care relationship
                    {patient.relationshipType ? ` · ${patient.relationshipType.toLowerCase()}` : ""}
                  </div>
                </div>
                <div className="noor-row-actions">
                  <Link href={`/patients/${patient.patientId}`} className="noor-button noor-button--small">
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
