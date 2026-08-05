"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { API_URL } from "@/lib/api";

/**
 * The organization settings screen's one mutation: rename. Slug is never
 * editable here — see docs/doseprepped/ARCHITECTURE.md "M5.5 — UI
 * screens".
 */
export function OrgSettingsForm({ organizationId, initialName }: { organizationId: string; initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`${API_URL}/organizations/${organizationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? "Could not save. Please try again.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <TextField
        label="Organization name"
        required
        maxLength={200}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setSaved(false);
        }}
      />
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {saved && !error && <p className="text-sm text-primary-dark">Saved.</p>}
      <div>
        <Button type="submit" disabled={loading || !name.trim()}>
          {loading ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
