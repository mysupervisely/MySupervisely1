"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { CheckInSummaryDTO } from "@noor/types";
import { apiFetch, ApiError } from "../../../lib/api";
import { NoorLogo } from "../../../components/NoorLogo";

interface Me {
  roles: string[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// History is purely descriptive (M3 brief §8/§9): a date and the four
// 1-10 scores the patient reported, nothing more. There is no clinical
// interpretation, trend commentary, diagnosis, or treatment
// recommendation anywhere on this page or its detail view — e.g. this
// never says "Your depression improved." What, if anything, changed is
// left for the patient and their clinician to discuss in session.
export default function CheckInHistoryPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInSummaryDTO[]>([]);

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
        const result = await apiFetch<CheckInSummaryDTO[]>("/check-ins");
        if (cancelled) return;
        setCheckIns(result);
        setLoading(false);
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
      <main className="noor-shell noor-center">
        <p className="noor-error" role="alert">
          {error}
        </p>
      </main>
    );
  }

  if (loading) {
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
        <Link href="/home" className="noor-muted">
          ← Back to Home
        </Link>
        <h1 className="noor-section">Your check-in history</h1>

        {checkIns.length === 0 ? (
          <div className="noor-card noor-card--muted">
            <p className="noor-muted" style={{ margin: 0 }}>
              You haven&apos;t submitted a check-in yet.
            </p>
            <Link href="/check-in" className="noor-button" style={{ marginTop: "1rem" }}>
              Begin Check-In
            </Link>
          </div>
        ) : (
          <div className="noor-stack">
            {checkIns.map((checkIn) => (
              <Link href={`/check-in/history/${checkIn.id}`} className="noor-entry-card" key={checkIn.id}>
                <div className="noor-entry-card-head">
                  <h3>{formatDate(checkIn.submittedAt)}</h3>
                </div>
                <p>
                  Overall wellbeing {checkIn.scores.overallWellbeing ?? "—"}/10 · Mood {checkIn.scores.mood ?? "—"}/10
                  · Stress {checkIn.scores.stress ?? "—"}/10 · Sleep {checkIn.scores.sleep ?? "—"}/10
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
