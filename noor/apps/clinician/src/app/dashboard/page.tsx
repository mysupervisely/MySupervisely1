"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClinicianDashboardSummaryDTO } from "@noor/types";
import { apiFetch, ApiError } from "../../lib/api";
import { ClinicianNav } from "../../components/ClinicianNav";

interface Me {
  roles: string[];
}

function timeOfDayGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// The clinician Home dashboard (M4 brief §2): a greeting, then two real
// operational cards derived from authorization-scoped counts (never an
// organization-wide number — see GET /clinicians/me/dashboard), plus a
// "Today" section that is an honest, static empty state until real
// scheduling exists. No fake appointment data is ever rendered here.
export default function ClinicianDashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<ClinicianDashboardSummaryDTO | null>(null);
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
        const result = await apiFetch<ClinicianDashboardSummaryDTO>("/clinicians/me/dashboard");
        if (cancelled) return;
        setSummary(result);
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

  if (!summary) {
    return (
      <div className="noor-page">
        <ClinicianNav active="home" />
        <main className="noor-shell">
          <p className="noor-muted">Loading...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="noor-page">
      <ClinicianNav active="home" />
      <main className="noor-shell">
        <h1>
          {timeOfDayGreeting()}, {summary.displayName}.
        </h1>

        <div className="noor-card-grid noor-card-grid--three noor-section">
          <div className="noor-card">
            <h2>Check-Ins to Review</h2>
            <p className="noor-muted" style={{ marginBottom: 0 }}>
              {summary.checkInsToReviewCount} check-in{summary.checkInsToReviewCount === 1 ? "" : "s"} need
              {summary.checkInsToReviewCount === 1 ? "s" : ""} your attention.
            </p>
            <div className="noor-stat">{summary.checkInsToReviewCount}</div>
            <Link href="/check-ins" className="noor-button">
              Review Check-Ins
            </Link>
          </div>

          <div className="noor-card">
            <h2>My Patients</h2>
            <p className="noor-muted" style={{ marginBottom: 0 }}>
              {summary.activePatientCount} active patient{summary.activePatientCount === 1 ? "" : "s"}.
            </p>
            <div className="noor-stat">{summary.activePatientCount}</div>
            <Link href="/patients" className="noor-button noor-button--secondary">
              View Patients
            </Link>
          </div>

          <div className="noor-card noor-card--muted">
            <h2>Today</h2>
            <p className="noor-muted" style={{ marginBottom: 0 }}>
              No appointments scheduled here yet. Scheduling is coming to Noor in a future release.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
