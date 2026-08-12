"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { ClinicianCheckInQueueItemDTO } from "@noor/types";
import { apiFetch, ApiError } from "../../lib/api";
import { ClinicianNav } from "../../components/ClinicianNav";

interface Me {
  roles: string[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function patientDisplayName(item: ClinicianCheckInQueueItemDTO): string {
  const first = item.patientFirstName ?? "Patient";
  const lastInitial = item.patientLastName ? `${item.patientLastName[0]}.` : "";
  return `${first} ${lastInitial}`.trim();
}

// The check-in review queue (M4 brief §3): every SUBMITTED check-in for
// this clinician's own ACTIVE-care-relationship patients — the API query
// itself is the authorization boundary (GET /clinicians/me/check-ins), so
// this page can render exactly what it gets back with no further
// filtering. Only queue-appropriate fields are shown: patient display
// name, submitted date, status — never a free-text answer.
export default function CheckInQueuePage() {
  const router = useRouter();
  const [queue, setQueue] = useState<ClinicianCheckInQueueItemDTO[] | null>(null);
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
        const result = await apiFetch<ClinicianCheckInQueueItemDTO[]>("/clinicians/me/check-ins");
        if (cancelled) return;
        setQueue(result);
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
      <ClinicianNav active="check-ins" />
      <main className="noor-shell noor-shell--narrow">
        <h1>Check-Ins to Review</h1>

        {!queue ? (
          <p className="noor-muted">Loading...</p>
        ) : queue.length === 0 ? (
          <div className="noor-card noor-card--muted">
            <p className="noor-muted" style={{ margin: 0 }}>
              Nothing waiting on you right now — every submitted check-in from your patients has been reviewed.
            </p>
          </div>
        ) : (
          <div className="noor-row-list">
            {queue.map((item) => (
              <div className="noor-row" key={item.id}>
                <div className="noor-row-main">
                  <div className="noor-row-title">
                    {patientDisplayName(item)}
                    {item.safetyFlagged && (
                      <span className="noor-badge noor-badge--flag" style={{ marginLeft: "0.5rem" }}>
                        Flagged
                      </span>
                    )}
                  </div>
                  <div className="noor-row-meta">
                    Submitted {formatDate(item.submittedAt)} · Awaiting review
                  </div>
                </div>
                <div className="noor-row-actions">
                  <Link href={`/check-ins/${item.patientId}/${item.id}`} className="noor-button noor-button--small">
                    Review
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
