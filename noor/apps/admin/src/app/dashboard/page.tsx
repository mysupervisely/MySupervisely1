"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "../../lib/api";

interface Me {
  email: string;
  roles: string[];
}

interface AdminUser {
  id: string;
  email: string;
  roles: string[];
  status: string;
}

interface AdminCareRelationship {
  id: string;
  status: string;
  relationshipType: string;
  patient: { id: string; firstName: string | null; lastName: string | null };
  clinician: { id: string; displayName: string | null };
}

interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUserId: string | null;
  occurredAt: string;
}

// Every list below is exactly what its API route returns — this page adds
// no additional data and applies no client-side filtering to "hide"
// anything from itself. The API's permission checks (Permission.VIEW_USERS
// / MANAGE_CARE_RELATIONSHIPS / VIEW_AUDIT_LOG — see
// packages/types/src/permissions.ts) are what actually decide what an
// admin can see; none of them include clinical content (M1 requirement
// #6).
export default function AdminDashboardPage() {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [relationships, setRelationships] = useState<AdminCareRelationship[] | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [patientId, setPatientId] = useState("");
  const [clinicianId, setClinicianId] = useState("");
  const [assignError, setAssignError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  async function loadAll() {
    const [usersResult, relResult, auditResult] = await Promise.all([
      apiFetch<AdminUser[]>("/admin/users"),
      apiFetch<AdminCareRelationship[]>("/admin/care-relationships"),
      apiFetch<AuditEvent[]>("/admin/audit-events?limit=25"),
    ]);
    setUsers(usersResult);
    setRelationships(relResult);
    setAuditEvents(auditResult);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const meResult = await apiFetch<Me>("/auth/me");
        if (cancelled) return;
        if (!meResult.roles.some((r) => r === "ADMIN" || r === "SUPER_ADMIN")) {
          setError("This account does not have admin access.");
          return;
        }
        setMe(meResult);
        await loadAll();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function assignCareRelationship(e: React.FormEvent) {
    e.preventDefault();
    setAssignError(null);
    setAssigning(true);
    try {
      await apiFetch("/admin/care-relationships", {
        method: "POST",
        body: JSON.stringify({ patientId, clinicianId }),
      });
      setPatientId("");
      setClinicianId("");
      await loadAll();
    } catch (err) {
      setAssignError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setAssigning(false);
    }
  }

  if (error) {
    return (
      <main className="noor-shell">
        <p className="noor-error">{error}</p>
      </main>
    );
  }

  if (!me || !users || !relationships || !auditEvents) {
    return (
      <main className="noor-shell">
        <p className="noor-muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="noor-shell">
      <h1>Admin dashboard</h1>
      <p className="noor-muted">Signed in as {me.email}</p>

      <h2>Users ({users.length})</h2>
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            {u.email} — {u.roles.join(", ")} — {u.status}
          </li>
        ))}
      </ul>

      <h2>Care relationships ({relationships.length})</h2>
      <ul>
        {relationships.map((r) => (
          <li key={r.id}>
            {r.patient.firstName ?? "(unnamed)"} {r.patient.lastName ?? ""} ↔ {r.clinician.displayName ?? "(unnamed)"} —{" "}
            {r.relationshipType} · {r.status}
          </li>
        ))}
      </ul>

      <div className="noor-card">
        <h3>Assign a clinician to a patient</h3>
        <p className="noor-muted">
          No self-serve matching or patient-initiated requests yet (that&apos;s M5) — this is the
          only way a care relationship is created in M1.
        </p>
        <form onSubmit={assignCareRelationship}>
          {assignError && <p className="noor-error">{assignError}</p>}
          <div className="noor-field">
            <label htmlFor="patientId">Patient ID</label>
            <input id="patientId" required value={patientId} onChange={(e) => setPatientId(e.target.value)} />
          </div>
          <div className="noor-field">
            <label htmlFor="clinicianId">Clinician ID</label>
            <input id="clinicianId" required value={clinicianId} onChange={(e) => setClinicianId(e.target.value)} />
          </div>
          <button type="submit" className="noor-button" disabled={assigning}>
            {assigning ? "Assigning..." : "Assign"}
          </button>
        </form>
      </div>

      <h2>Recent audit events ({auditEvents.length})</h2>
      <ul>
        {auditEvents.map((e) => (
          <li key={e.id}>
            <span className="noor-muted">{new Date(e.occurredAt).toLocaleString()}</span> — {e.action} —{" "}
            {e.entityType}:{e.entityId}
          </li>
        ))}
      </ul>
    </main>
  );
}
