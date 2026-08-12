"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { CheckInDetailDTO, CheckInResponseDTO } from "@noor/types";
import { apiFetch, ApiError } from "../../../../lib/api";
import { NoorLogo } from "../../../../components/NoorLogo";

interface Me {
  roles: string[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/** Renders one answer descriptively — a number, a chosen option's label,
 * or free text as written — never a clinical read of what it means (M3
 * brief §8/§9). An unanswered optional question (the free-text one) shows
 * a plain "Not answered", not an empty gap. */
function renderAnswer(response: CheckInResponseDTO): string {
  if (response.responseType === "SCALE_1_10") {
    return response.valueNumeric !== null ? `${response.valueNumeric}/10` : "Not answered";
  }
  if (response.responseType === "SINGLE_SELECT") {
    return response.valueOptionLabel ?? "Not answered";
  }
  return response.valueText && response.valueText.length > 0 ? response.valueText : "Not answered";
}

// Read-only by design: a submitted check-in is immutable (M3 brief §7),
// so this view has no edit controls anywhere on it — only the wizard at
// /check-in can create or modify a DRAFT, and the API itself refuses any
// write to a non-draft check-in regardless of what this page renders.
//
// The "Reviewed by your Noor care team" badge (M4 brief §6) is derived
// entirely from the server-authoritative `status` field — never a
// promised response, never a clinician's internal note (no such note is
// ever returned to a patient-facing route at all), never clinician-only
// metadata like who reviewed it or when.
export default function CheckInDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState<CheckInDetailDTO | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const me = await apiFetch<Me>("/auth/me");
        if (cancelled) return;
        if (!me.roles.includes("PATIENT")) {
          setError("This account is not a patient account.");
          return;
        }
        const result = await apiFetch<CheckInDetailDTO>(`/check-ins/${params.id}`);
        if (cancelled) return;
        setCheckIn(result);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setError("That check-in couldn't be found.");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Something went wrong.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router, params.id]);

  if (error) {
    return (
      <main className="noor-shell noor-center">
        <p className="noor-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (loading || !checkIn) {
    return (
      <main className="noor-shell noor-center">
        <p className="noor-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="noor-shell">
      <NoorLogo />
      <div className="noor-section">
        <Link href="/check-in/history" className="noor-muted">
          ← Back to check-in history
        </Link>
        <h1 className="noor-section">{formatDate(checkIn.submittedAt)}</h1>
        {checkIn.status === "REVIEWED" && (
          <p className="noor-badge" style={{ marginTop: "-0.5rem", marginBottom: "1.5rem" }}>
            Reviewed by your Noor care team
          </p>
        )}

        <div className="noor-stack">
          {checkIn.responses.map((response) => (
            <div className="noor-card noor-card--muted" key={response.questionKey}>
              <p style={{ margin: 0, fontWeight: 500 }}>{response.questionPrompt}</p>
              <p className="noor-muted" style={{ margin: 0 }}>
                {renderAnswer(response)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
