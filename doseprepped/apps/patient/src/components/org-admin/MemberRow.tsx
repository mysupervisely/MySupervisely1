"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { API_URL } from "@/lib/api";
import type { OrganizationMember, OrganizationRole } from "@/lib/organizations";

const ROLE_OPTIONS: { value: OrganizationRole; label: string }[] = [
  { value: "ORG_PATIENT", label: "Patient" },
  { value: "ORG_PHARMACIST", label: "Pharmacist" },
  { value: "ORG_ADMIN", label: "Organization admin" },
];

const ROLE_LABELS: Record<OrganizationRole, string> = {
  ORG_PATIENT: "Patient",
  ORG_PHARMACIST: "Pharmacist",
  ORG_ADMIN: "Organization admin",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/**
 * One row in the Members table: shows name/email/role/joined date, and
 * (client-side) a role-change select + a remove button. Both mutations
 * follow the codebase's existing pattern — direct fetch + credentials:
 * "include" + router.refresh(), matching ArchiveMedicationButton/
 * CheckInForm. Role is restricted to OrganizationRole by the <select>'s
 * own option list — there is no way to submit a platform-admin value
 * from this UI, matching the server-side structural restriction. See
 * docs/doseprepped/ARCHITECTURE.md "M5.5 — Member management design".
 */
export function MemberRow({ organizationId, member }: { organizationId: string; member: OrganizationMember }) {
  const router = useRouter();
  const [role, setRole] = useState<OrganizationRole>(member.role);
  const [savingRole, setSavingRole] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveRole() {
    setSavingRole(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/organizations/${organizationId}/memberships/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not update this member's role.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSavingRole(false);
    }
  }

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/organizations/${organizationId}/memberships/${member.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not remove this member.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setRemoving(false);
    }
  }

  const name = member.user ? `${member.user.firstName} ${member.user.lastName}` : "—";
  const email = member.user?.email ?? "—";
  const roleChanged = role !== member.role;

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="py-3 pr-3 text-sm text-ink">{name}</td>
        <td className="py-3 pr-3 text-sm text-ink-muted">{email}</td>
        <td className="py-3 pr-3">
          <div className="flex items-center gap-2">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as OrganizationRole)}
              className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-ink"
            >
              {ROLE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {roleChanged && (
              <Button type="button" size="md" variant="secondary" onClick={saveRole} disabled={savingRole}>
                {savingRole ? "Saving…" : "Save"}
              </Button>
            )}
            {!roleChanged && <Badge tone="neutral">{ROLE_LABELS[member.role]}</Badge>}
          </div>
        </td>
        <td className="py-3 pr-3 text-xs text-ink-muted">{formatDate(member.createdAt)}</td>
        <td className="py-3">
          <Button type="button" size="md" variant="ghost" onClick={remove} disabled={removing}>
            {removing ? "Removing…" : "Remove"}
          </Button>
        </td>
      </tr>
      {error && (
        <tr className="border-b border-border last:border-0">
          <td colSpan={5} className="pb-2">
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
