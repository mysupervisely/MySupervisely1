"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CATEGORY_LABELS, CATEGORY_ORDER, DISPOSITION_MESSAGES } from "@/lib/question-labels";
import type { QuestionCategory, Question } from "@/lib/questions";
import type { Medication } from "@/lib/medications";
import { API_URL } from "@/lib/api";
import { cn } from "@/lib/cn";

type Step = "medication" | "category" | "question" | "review" | "confirmation";

interface AskQuestionWizardProps {
  medications: Medication[];
  initialMedicationId?: string;
}

const optionButtonClasses =
  "w-full rounded-lg border border-border bg-surface px-4 py-3 text-left text-sm transition-colors hover:border-primary/40 hover:bg-accent-light";

export function AskQuestionWizard({ medications, initialMedicationId }: AskQuestionWizardProps) {
  const router = useRouter();
  const cameFromMedicationContext = Boolean(initialMedicationId);

  const [step, setStep] = useState<Step>(cameFromMedicationContext ? "category" : "medication");
  const [medicationId, setMedicationId] = useState<string | null>(initialMedicationId ?? null);
  const [category, setCategory] = useState<QuestionCategory | null>(null);
  const [questionText, setQuestionText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submittedQuestion, setSubmittedQuestion] = useState<Question | null>(null);

  const selectedMedication = medications.find((m) => m.id === medicationId) ?? null;

  if (medications.length === 0) {
    return (
      <Card className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          Add a medication first so you have something to ask about.
        </p>
        <Button href="/medications/new" variant="primary" className="w-fit">
          Add a medication
        </Button>
      </Card>
    );
  }

  async function handleSubmit() {
    if (!medicationId || !category) return;
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ medicationId, category, questionText }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? "Something went wrong. Please try again.");
        return;
      }

      const data = await response.json();
      setSubmittedQuestion(data.question as Question);
      setStep("confirmation");
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "medication") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-ink">Which medication is this about?</h1>
        <div className="flex flex-col gap-2">
          {medications.map((medication) => (
            <button
              key={medication.id}
              type="button"
              className={optionButtonClasses}
              onClick={() => {
                setMedicationId(medication.id);
                setStep("category");
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-ink">
                  {medication.name} {medication.strength}
                </span>
                {medication.status === "INACTIVE" && <Badge tone="neutral">Inactive</Badge>}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === "category") {
    return (
      <div className="flex flex-col gap-4">
        {!cameFromMedicationContext && (
          <button type="button" onClick={() => setStep("medication")} className="text-sm text-ink-muted hover:underline">
            ← Back
          </button>
        )}
        {cameFromMedicationContext && selectedMedication ? (
          <>
            <h1 className="text-2xl font-semibold text-ink">
              What&apos;s your question about {selectedMedication.name}?
            </h1>
            <p className="text-sm text-ink-muted">What would you like help with?</p>
          </>
        ) : (
          <h1 className="text-2xl font-semibold text-ink">What would you like help with?</h1>
        )}
        <div className="flex flex-col gap-2">
          {CATEGORY_ORDER.map((cat) => (
            <button
              key={cat}
              type="button"
              className={optionButtonClasses}
              onClick={() => {
                setCategory(cat);
                setStep("question");
              }}
            >
              <span className="font-medium text-ink">{CATEGORY_LABELS[cat]}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (step === "question") {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setStep("category")}
          className="text-sm text-ink-muted hover:underline"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-semibold text-ink">Tell us what&apos;s going on.</h1>
        <textarea
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          rows={6}
          placeholder="Describe your question or concern in your own words."
          className="resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
        <Button
          type="button"
          onClick={() => setStep("review")}
          disabled={questionText.trim().length === 0}
        >
          Continue
        </Button>
      </div>
    );
  }

  if (step === "review" && selectedMedication && category) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setStep("question")}
          className="text-sm text-ink-muted hover:underline"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-semibold text-ink">Review your question</h1>
        <Card className="flex flex-col divide-y divide-border p-0">
          <div className="flex flex-col gap-1 px-5 py-3">
            <span className="text-sm text-ink-muted">Medication</span>
            <span className="text-sm font-medium text-ink">
              {selectedMedication.name} {selectedMedication.strength}
            </span>
          </div>
          <div className="flex flex-col gap-1 px-5 py-3">
            <span className="text-sm text-ink-muted">Category</span>
            <span className="text-sm font-medium text-ink">{CATEGORY_LABELS[category]}</span>
          </div>
          <div className="flex flex-col gap-1 px-5 py-3">
            <span className="text-sm text-ink-muted">Question</span>
            <span className="text-sm font-medium text-ink whitespace-pre-wrap">{questionText}</span>
          </div>
        </Card>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="button" onClick={handleSubmit} disabled={submitting} fullWidth>
          {submitting ? "Submitting…" : "Submit Question"}
        </Button>
      </div>
    );
  }

  if (step === "confirmation" && submittedQuestion) {
    const disposition = submittedQuestion.disposition;
    return (
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-2xl font-semibold text-ink">Your question has been received.</h1>
        {disposition && (
          <Card
            className={cn(
              "text-sm",
              disposition === "URGENT_EMERGENCY"
                ? "bg-danger-light text-danger"
                : "bg-accent-light text-ink-muted",
            )}
          >
            {DISPOSITION_MESSAGES[disposition]}
          </Card>
        )}
        <div className="flex w-full flex-col gap-3">
          <Button href={`/questions/${submittedQuestion.id}`} variant="primary" fullWidth>
            View question
          </Button>
          <Button
            type="button"
            variant="secondary"
            fullWidth
            onClick={() => router.push("/home")}
          >
            Back to home
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
