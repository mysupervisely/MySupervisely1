"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { CheckInSummaryDTO, ClinicianPatientDetailDTO } from "@noor/types";
import { apiFetch, ApiError } from "../../../lib/api";
import { ClinicianNav } from "../../../components/ClinicianNav";

interface Me {
  roles: string[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

// The patient care view (M4 brief §9): identity, the care relationship
// itself, and check-in history with review status. Deliberately NOT a
// full medical chart — no diagnosis, medication, treatment-plan, billing,
// or insurance field exists here or anywhere else in Noor. If this
// clinician's CareRelationship with the patient isn't ACTIVE, the API
// returns 403/404 and this page shows that — there is no client-side
// fallback that renders patient data first and hides it (M1 requirement
// #3: the server is the enforcement point, not this component).
export default function ClinicianPatientCareViewPage() {
  const router = useRouter();
  const params = useParams<{ patientId: string }>();
  const [patient, setPatient] = useState<ClinicianPatientDetailDTO | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInSummaryDTO[] | null>(null);
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
        const [patientResult, checkInsResult] = await Promise.all([
          apiFetch<ClinicianPatientDetailDTO>(`/clinicians/me/patients/${params.patientId}`),
          apiFetch<CheckInSummaryDTO[]>(`/clinicians/me/patients/${params.patientId}/check-ins`),
        ]);
        if (cancelled) return;
        setPatient(patientResult);
        setCheckIns(checkInsResult);
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
        <p className="noor-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (!patient || !checkIns) {
    return (
      <div className="noor-page">
        <ClinicianNav active="patients" />
        <main className="noor-shell">
          <p className="noor-muted">Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="noor-page">
      <ClinicianNav active="patients" />
      <main className="noor-shell noor-shell--narrow">
        <Link href="/patients" className="noor-muted">
          ← Back to Patients
        </Link>
        <h1 className="noor-section">
          {patient.firstName} {patient.lastName}
        </h1>
        <div className="noor-card">
          <p style={{ marginBottom: "0.4rem" }}>
            <strong>Location:</strong> {patient.city ?? "—"}, {patient.state ?? "—"}
          </p>
          <p style={{ marginBottom: 0 }}>
            <strong>Care relationship:</strong> {patient.careRelationship.status.toLowerCase()}
            {patient.careRelationship.relationshipType ? ` · ${patient.careRelationship.relationshipType.toLowerCase()}` : ""}
            {patient.careRelationship.startedAt ? ` since ${formatDate(patient.careRelationship.startedAt)}` : ""}
          </p>
        </div>

        <div className="noor-section">
          <h2>Check-In history</h2>
          {checkIns.length === 0 ? (
            <p className="noor-muted">No submitted check-ins yet.</p>
          ) : (
            <div className="noor-row-list">
              {checkIns.map((checkIn) => (
                <Link
                  href={`/check-ins/${params.patientId}/${checkIn.id}`}
                  className="noor-row"
                  key={checkIn.id}
                  style={{ color: "inherit", textDecoration: "none" }}
                >
                  <div className="noor-row-main">
                    <div className="noor-row-title">{formatDate(checkIn.submittedAt)}</div>
                    <div className="noor-row-meta">
                      Wellbeing {checkIn.scores.overallWellbeing ?? "—"}/10 · Mood {checkIn.scores.mood ?? "—"}/10 ·
                      Stress {checkIn.scores.stress ?? "—"}/10 · Sleep {checkIn.scores.sleep ?? "—"}/10
                    </div>
                  </div>
                  <div className="noor-row-actions">
                    <span className={`noor-badge ${checkIn.status === "REVIEWED" ? "" : "noor-badge--muted"}`}>
                      {checkIn.status === "REVIEWED" ? "Reviewed" : "Awaiting review"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
