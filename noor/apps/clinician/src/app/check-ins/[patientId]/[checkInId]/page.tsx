"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { CheckInDetailDTO, CheckInResponseDTO, ClinicianPatientDetailDTO } from "@noor/types";
import { apiFetch, ApiError } from "../../../../lib/api";
import { ClinicianNav } from "../../../../components/ClinicianNav";

interface Me {
  roles: string[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Renders exactly what the patient reported — a number, a chosen
 * option's label, or free text as written. Never a clinical read of what
 * it means (M4 brief §4: "Do not interpret the responses... Do not
 * generate statements such as 'High anxiety,' 'Likely depression,'
 * 'Patient is improving.'"). */
function renderAnswer(response: CheckInResponseDTO): string {
  if (response.responseType === "SCALE_1_10") {
    return response.valueNumeric !== null ? `${response.valueNumeric} / 10` : "Not answered";
  }
  if (response.responseType === "SINGLE_SELECT") {
    return response.valueOptionLabel ?? "Not answered";
  }
  return response.valueText && response.valueText.length > 0 ? response.valueText : "Not answered";
}

// The full submitted check-in (M4 brief §4-§5): every answer exactly as
// the patient reported it, no automated interpretation, plus a Mark
// Reviewed action. Reviewing only ever changes this check-in's own
// status/reviewedAt/reviewedBy — the API route this calls never touches a
// CheckInResponse row (brief §15: "Clinicians review patient-reported
// data; they do not rewrite it").
export default function ClinicianCheckInDetailPage() {
  const router = useRouter();
  const params = useParams<{ patientId: string; checkInId: string }>();
  const [checkIn, setCheckIn] = useState<CheckInDetailDTO | null>(null);
  const [patient, setPatient] = useState<ClinicianPatientDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  async function load() {
    try {
      const me = await apiFetch<Me>("/auth/me");
      if (!me.roles.includes("CLINICIAN")) {
        setError("This account is not a clinician account.");
        return;
      }
      const [checkInResult, patientResult] = await Promise.all([
        apiFetch<CheckInDetailDTO>(`/clinicians/me/patients/${params.patientId}/check-ins/${params.checkInId}`),
        apiFetch<ClinicianPatientDetailDTO>(`/clinicians/me/patients/${params.patientId}`),
      ]);
      setCheckIn(checkInResult);
      setPatient(patientResult);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push("/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.patientId, params.checkInId]);

  async function onMarkReviewed() {
    setReviewError(null);
    setReviewing(true);
    try {
      const updated = await apiFetch<CheckInDetailDTO>(
        `/clinicians/me/patients/${params.patientId}/check-ins/${params.checkInId}/review`,
        { method: "POST" },
      );
      setCheckIn(updated);
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setReviewing(false);
    }
  }

  if (error) {
    return (
      <main className="noor-shell">
        <p className="noor-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (!checkIn || !patient) {
    return (
      <div className="noor-page">
        <ClinicianNav active="check-ins" />
        <main className="noor-shell">
          <p className="noor-muted">Loading...</p>
        </main>
      </div>
    );
  }

  const displayName = `${patient.firstName ?? "Patient"} ${patient.lastName ?? ""}`.trim();

  return (
    <div className="noor-page">
      <ClinicianNav active="check-ins" />
      <main className="noor-shell noor-shell--narrow">
        <Link href="/check-ins" className="noor-muted">
          ← Back to Check-Ins
        </Link>
        <h1 className="noor-section">{displayName}</h1>
        <p className="noor-muted" style={{ marginTop: "-0.5rem" }}>
          Submitted {formatDate(checkIn.submittedAt)}
          {checkIn.status === "REVIEWED" && (
            <span className="noor-badge" style={{ marginLeft: "0.6rem" }}>
              Reviewed
            </span>
          )}
        </p>

        {reviewError && (
          <p className="noor-error" role="alert">
            {reviewError}
          </p>
        )}

        <div className="noor-answer-list noor-section">
          {checkIn.responses.map((response) => (
            <div className="noor-answer-row" key={response.questionKey}>
              <div className="noor-answer-label">{response.questionPrompt}</div>
              <div className="noor-answer-value">{renderAnswer(response)}</div>
            </div>
          ))}
        </div>

        <div className="noor-section">
          {checkIn.status === "REVIEWED" ? (
            <p className="noor-muted">This check-in has been reviewed.</p>
          ) : (
            <button type="button" className="noor-button" onClick={onMarkReviewed} disabled={reviewing}>
              {reviewing ? "Marking Reviewed..." : "Mark Reviewed"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
