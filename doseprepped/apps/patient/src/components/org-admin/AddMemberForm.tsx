"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { API_URL } from "@/lib/api";
import type { OrganizationRole } from "@/lib/organizations";

const ROLE_OPTIONS: { value: OrganizationRole; label: string }[] = [
  { value: "ORG_PATIENT", label: "Patient" },
  { value: "ORG_PHARMACIST", label: "Pharmacist" },
  { value: "ORG_ADMIN", label: "Organization admin" },
];

/**
 * Adds an existing DosePrepped account to this organization by email —
 * never an invitation, never an account creation. See
 * docs/doseprepped/ARCHITECTURE.md "M5.5 — Member management design".
 */
export function AddMemberForm({ organizationId }: { organizationId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<OrganizationRole>("ORG_PATIENT");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/organizations/${organizationId}/memberships`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim(), role }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not add this member. Please try again.");
        return;
      }
      setEmail("");
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-ink-muted">Add member</h2>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <TextField
            label="Email"
            type="email"
            required
            placeholder="colleague@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <label className="flex flex-col gap-1.5 text-left text-sm">
          <span className="font-medium text-ink">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as OrganizationRole)}
            className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink"
          >
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={loading || !email.trim()}>
          {loading ? "Adding…" : "Add member"}
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-xs text-ink-muted">
        The email must belong to an existing DosePrepped account — no invitation is sent.
      </p>
    </Card>
  );
}
