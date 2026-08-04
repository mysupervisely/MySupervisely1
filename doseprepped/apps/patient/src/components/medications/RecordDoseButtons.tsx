"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { API_URL } from "@/lib/api";
import type { AdherenceStatus } from "@/lib/adherence";

const OPTIONS: { status: AdherenceStatus; label: string }[] = [
  { status: "TAKEN", label: "Taken" },
  { status: "MISSED", label: "Missed" },
  { status: "SKIPPED", label: "Skipped" },
];

export function RecordDoseButtons({ medicationId }: { medicationId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<AdherenceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function record(status: AdherenceStatus) {
    setLoading(status);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/medications/${medicationId}/adherence-events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Could not record this dose. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {OPTIONS.map((option) => (
          <Button
            key={option.status}
            type="button"
            variant="secondary"
            size="md"
            onClick={() => record(option.status)}
            disabled={loading !== null}
          >
            {loading === option.status ? "Recording…" : option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
