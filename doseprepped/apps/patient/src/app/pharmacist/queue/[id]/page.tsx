import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CATEGORY_LABELS } from "@/lib/question-labels";
import { getPharmacistQuestion } from "@/lib/pharmacist";
import { PharmacistQuestionActions } from "@/components/pharmacist/PharmacistQuestionActions";

export const metadata: Metadata = {
  title: "Review question — DosePrepped Pharmacist",
};

const DISPOSITION_LABELS: Record<string, string> = {
  PHARMACIST_REVIEW: "Pharmacist Review",
  PROVIDER_EVALUATION: "Provider Evaluation",
};

const STATUS_LABELS: Record<string, string> = {
  PHARMACIST_REQUESTED: "New",
  PHARMACIST_IN_PROGRESS: "In Review",
  PHARMACIST_RESOLVED: "Completed",
  ESCALATED: "Escalated",
};

const ESCALATION_REASON_LABELS: Record<string, string> = {
  WORSENING_OR_SEVERE_SYMPTOM: "Worsening or severe symptom",
  POSSIBLE_ADVERSE_REACTION: "Possible adverse reaction",
  MEDICATION_ERROR: "Medication error",
  BEYOND_PHARMACIST_SCOPE: "Beyond pharmacist scope",
  PATIENT_REQUESTED_PROVIDER: "Patient requested provider",
  OTHER: "Other",
};

// M5.2 — see docs/doseprepped/ARCHITECTURE.md "M5.2 — Pharmacist context".
const CHECK_IN_LABELS: Record<string, string> = {
  DOING_WELL: "Doing well",
  HAVING_SOME_ISSUES: "Having some issues",
  HAVING_SIGNIFICANT_ISSUES: "Having significant issues",
  HAS_A_QUESTION: "Had a question",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatStartedAgo(value: string): string {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "—";
  if (days < 1) return "today";
  if (days < 14) return `${days} day${days === 1 ? "" : "s"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 10) return `${weeks} weeks ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

export default async function PharmacistQuestionPage({ params }: PageProps<"/pharmacist/queue/[id]">) {
  const { id } = await params;
  const question = await getPharmacistQuestion(id);

  if (!question) {
    notFound();
  }

  const { medicationSnapshot } = question;

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">
          {medicationSnapshot.name} {medicationSnapshot.strength}
        </h1>
        <Badge tone={question.status === "ESCALATED" ? "warning" : "info"}>
          {STATUS_LABELS[question.status] ?? question.status}
        </Badge>
      </div>

      {question.medicationContext && (
        <Card className="flex flex-col gap-1 divide-y divide-border p-0">
          <h2 className="px-5 pt-3 text-sm font-semibold text-ink-muted">
            Medication context
          </h2>
          <p className="px-5 pb-1 text-xs text-ink-muted">
            Patient-reported and system-calculated — not a recommendation.
          </p>
          {question.medicationContext.startedAt && (
            <div className="flex items-start justify-between gap-4 px-5 py-3">
              <span className="text-sm text-ink-muted">Started</span>
              <span className="max-w-[60%] text-right text-sm font-medium text-ink">
                {formatStartedAgo(question.medicationContext.startedAt)}
              </span>
            </div>
          )}
          <div className="flex items-start justify-between gap-4 px-5 py-3">
            <span className="text-sm text-ink-muted">Adherence (system-calculated)</span>
            <span className="max-w-[60%] text-right text-sm font-medium text-ink">
              {question.medicationContext.adherence?.adherencePercentage != null
                ? `${question.medicationContext.adherence.adherencePercentage}%`
                : "No adherence history yet"}
            </span>
          </div>
          {question.medicationContext.recentCheckIn && (
            <div className="flex items-start justify-between gap-4 px-5 py-3">
              <span className="text-sm text-ink-muted">Recent check-in (patient-reported)</span>
              <span className="max-w-[60%] text-right text-sm font-medium text-ink">
                &quot;{CHECK_IN_LABELS[question.medicationContext.recentCheckIn.response] ??
                  question.medicationContext.recentCheckIn.response}
                &quot;
                {question.medicationContext.recentCheckIn.notes && (
                  <span className="block font-normal text-ink-muted">
                    {question.medicationContext.recentCheckIn.notes}
                  </span>
                )}
              </span>
            </div>
          )}
          {question.medicationContext.recentQuestion && (
            <div className="flex items-start justify-between gap-4 px-5 py-3">
              <span className="text-sm text-ink-muted">Recent medication question (patient-reported)</span>
              <span className="max-w-[60%] text-right text-sm font-medium text-ink">
                &quot;{question.medicationContext.recentQuestion.questionText}&quot;
              </span>
            </div>
          )}
        </Card>
      )}

      <Card className="flex flex-col divide-y divide-border p-0">
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Patient question</span>
          <span className="max-w-[60%] whitespace-pre-wrap text-right text-sm font-medium text-ink">
            {question.questionText}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Category (patient-selected)</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-ink">
            {CATEGORY_LABELS[question.category]}
          </span>
        </div>
        {question.aiSuggestedCategory && (
          <div className="flex items-start justify-between gap-4 px-5 py-3">
            <span className="text-sm text-ink-muted">AI-suggested category</span>
            <span className="max-w-[60%] text-right text-sm font-medium text-ink">
              {CATEGORY_LABELS[question.aiSuggestedCategory]}
            </span>
          </div>
        )}
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Dosage form</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-ink">
            {medicationSnapshot.dosageForm ?? "—"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Directions</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-ink">
            {medicationSnapshot.directions}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Frequency</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-ink">
            {medicationSnapshot.frequency}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Route</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-ink">{medicationSnapshot.route}</span>
        </div>
        {question.otherMedicationsSnapshot && question.otherMedicationsSnapshot.length > 0 && (
          <div className="flex items-start justify-between gap-4 px-5 py-3">
            <span className="text-sm text-ink-muted">Other active medications</span>
            <span className="max-w-[60%] text-right text-sm font-medium text-ink">
              {question.otherMedicationsSnapshot.map((m) => `${m.name} ${m.strength}`).join(", ")}
            </span>
          </div>
        )}
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Disposition</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-ink">
            {question.disposition ? DISPOSITION_LABELS[question.disposition] : "—"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Safety rule version</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-ink">
            {question.safetyRuleSetVersion ?? "—"}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Submitted</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-ink">
            {formatDate(question.submittedAt)}
          </span>
        </div>
        {question.claimedAt && (
          <div className="flex items-start justify-between gap-4 px-5 py-3">
            <span className="text-sm text-ink-muted">Claimed</span>
            <span className="max-w-[60%] text-right text-sm font-medium text-ink">
              {formatDate(question.claimedAt)}
            </span>
          </div>
        )}
      </Card>

      {question.aiPharmacistSummary && (
        <Card className="flex flex-col gap-2 bg-accent-light">
          <h2 className="text-sm font-semibold text-ink-muted">AI-generated summary (assistive only)</h2>
          <p className="text-sm text-ink">{question.aiPharmacistSummary}</p>
          <p className="text-xs text-ink-muted">
            Generated by DosePrepped&apos;s AI education layer as a starting point — not a substitute for your
            own professional judgment.
          </p>
        </Card>
      )}

      {question.pharmacistResponse && (
        <Card className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-ink-muted">Your response</h2>
          <p className="whitespace-pre-wrap text-sm text-ink">{question.pharmacistResponse}</p>
          {question.respondedAt && (
            <p className="text-xs text-ink-muted">Responded {formatDate(question.respondedAt)}</p>
          )}
        </Card>
      )}

      {question.status === "ESCALATED" && (
        <Card className="flex flex-col gap-2 bg-danger-light text-danger">
          <h2 className="text-sm font-semibold">Escalated</h2>
          <p className="text-sm">
            {question.escalationReasonCategory
              ? ESCALATION_REASON_LABELS[question.escalationReasonCategory]
              : "—"}
          </p>
          <p className="text-sm">{question.escalationReason}</p>
          {question.escalatedAt && <p className="text-xs">Escalated {formatDate(question.escalatedAt)}</p>}
        </Card>
      )}

      <PharmacistQuestionActions question={question} />
    </>
  );
}
