"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { API_URL } from "@/lib/api";
import type { PharmacistQuestion } from "@/lib/pharmacist";

const ESCALATION_REASON_LABELS: Record<string, string> = {
  WORSENING_OR_SEVERE_SYMPTOM: "Worsening or severe symptom",
  POSSIBLE_ADVERSE_REACTION: "Possible adverse reaction",
  MEDICATION_ERROR: "Medication error",
  BEYOND_PHARMACIST_SCOPE: "Beyond pharmacist scope",
  PATIENT_REQUESTED_PROVIDER: "Patient requested provider",
  OTHER: "Other",
};

export function PharmacistQuestionActions({ question }: { question: PharmacistQuestion }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "escalating">("idle");
  const [responseText, setResponseText] = useState("");
  const [escalationReasonCategory, setEscalationReasonCategory] = useState("");
  const [escalationReason, setEscalationReason] = useState("");

  async function post(path: string, payload?: unknown) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}${path}`, {
        method: "POST",
        headers: payload ? { "Content-Type": "application/json" } : undefined,
        credentials: "include",
        body: payload ? JSON.stringify(payload) : undefined,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (question.status === "PHARMACIST_REQUESTED") {
    return (
      <div className="flex flex-col gap-2">
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="button" onClick={() => post(`/pharmacist/questions/${question.id}/claim`)} disabled={loading}>
          {loading ? "Claiming…" : "Claim this question"}
        </Button>
      </div>
    );
  }

  if (question.status === "PHARMACIST_IN_PROGRESS") {
    if (mode === "escalating") {
      return (
        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink">Escalate to provider evaluation</h2>
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-ink">Reason category</span>
            <select
              value={escalationReasonCategory}
              onChange={(e) => setEscalationReasonCategory(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Select a reason…</option>
              {Object.entries(ESCALATION_REASON_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-left text-sm">
            <span className="font-medium text-ink">Explanation</span>
            <textarea
              value={escalationReason}
              onChange={(e) => setEscalationReason(e.target.value)}
              rows={4}
              placeholder="Explain why this needs provider evaluation."
              className="resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={() =>
                post(`/pharmacist/questions/${question.id}/escalate`, {
                  escalationReasonCategory,
                  escalationReason,
                })
              }
              disabled={loading || !escalationReasonCategory || escalationReason.trim().length === 0}
            >
              {loading ? "Escalating…" : "Confirm escalation"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setMode("idle")} disabled={loading}>
              Cancel
            </Button>
          </div>
        </Card>
      );
    }

    return (
      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-ink">Your response</h2>
        <textarea
          value={responseText}
          onChange={(e) => setResponseText(e.target.value)}
          rows={6}
          placeholder="Write your response to the patient."
          className="resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => post(`/pharmacist/questions/${question.id}/respond`, { responseText })}
            disabled={loading || responseText.trim().length === 0}
          >
            {loading ? "Submitting…" : "Submit response"}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setMode("escalating")} disabled={loading}>
            Escalate to provider
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => post(`/pharmacist/questions/${question.id}/release`)}
            disabled={loading}
          >
            Release back to queue
          </Button>
        </div>
      </Card>
    );
  }

  return null;
}
