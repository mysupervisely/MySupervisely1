import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CATEGORY_LABELS } from "@/lib/question-labels";
import type { PharmacistQuestion } from "@/lib/pharmacist";

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

const CHECK_IN_LABELS: Record<string, string> = {
  DOING_WELL: "Doing well",
  HAVING_SOME_ISSUES: "Having some issues",
  HAVING_SIGNIFICANT_ISSUES: "Having significant issues",
  HAS_A_QUESTION: "Had a question",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Read-only pharmacist-perspective detail card — the same fields the
 * real `/pharmacist/queue/[id]` page shows (medication journey context,
 * AI-generated summary, patient question, disposition, response/
 * escalation outcome), reused for both Demo Mode's canned scenarios and
 * its live queue items. Never itself performs a mutation — see
 * `app/demo/pharmacist/page.tsx` for the claim/respond forms.
 */
export function PharmacistQuestionDetail({ question }: { question: PharmacistQuestion }) {
  const { medicationSnapshot, medicationContext } = question;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold text-ink">
          {medicationSnapshot.name} {medicationSnapshot.strength}
        </h3>
        <Badge tone={question.status === "ESCALATED" ? "warning" : "info"}>
          {STATUS_LABELS[question.status] ?? question.status}
        </Badge>
      </div>

      {medicationContext && (
        <Card className="flex flex-col gap-1 divide-y divide-border p-0">
          <h4 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Medication journey context
          </h4>
          <div className="flex items-start justify-between gap-4 px-4 py-2.5">
            <span className="text-sm text-ink-muted">Adherence</span>
            <span className="text-sm font-medium text-ink">
              {medicationContext.adherence?.adherencePercentage != null
                ? `${medicationContext.adherence.adherencePercentage}%`
                : "No adherence history yet"}
            </span>
          </div>
          {medicationContext.recentCheckIn && (
            <div className="flex items-start justify-between gap-4 px-4 py-2.5">
              <span className="text-sm text-ink-muted">Recent check-in</span>
              <span className="max-w-[60%] text-right text-sm font-medium text-ink">
                &ldquo;
                {CHECK_IN_LABELS[medicationContext.recentCheckIn.response] ??
                  medicationContext.recentCheckIn.response}
                &rdquo;
                {medicationContext.recentCheckIn.notes && (
                  <span className="block font-normal text-ink-muted">{medicationContext.recentCheckIn.notes}</span>
                )}
              </span>
            </div>
          )}
        </Card>
      )}

      <Card className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {CATEGORY_LABELS[question.category]}
        </span>
        <p className="text-sm text-ink whitespace-pre-wrap">&ldquo;{question.questionText}&rdquo;</p>
        <div className="flex flex-wrap gap-2 text-xs text-ink-muted">
          <span>Disposition: {question.disposition ? DISPOSITION_LABELS[question.disposition] : "—"}</span>
          <span>· Submitted {formatDate(question.submittedAt)}</span>
        </div>
      </Card>

      {question.aiPharmacistSummary && (
        <Card className="flex flex-col gap-2 bg-accent-light">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            AI Education (assistive summary for the pharmacist)
          </h4>
          <p className="text-sm text-ink">{question.aiPharmacistSummary}</p>
        </Card>
      )}

      {question.pharmacistResponse && (
        <Card className="flex flex-col gap-2 border-primary/30">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Pharmacist Response</h4>
          <p className="text-sm text-ink whitespace-pre-wrap">{question.pharmacistResponse}</p>
          {question.respondedAt && <p className="text-xs text-ink-muted">Responded {formatDate(question.respondedAt)}</p>}
        </Card>
      )}

      {question.status === "ESCALATED" && (
        <Card className="flex flex-col gap-1 bg-danger-light text-danger">
          <h4 className="text-xs font-semibold uppercase tracking-wide">Escalated to provider evaluation</h4>
          <p className="text-sm">
            {question.escalationReasonCategory ? ESCALATION_REASON_LABELS[question.escalationReasonCategory] : "—"}
          </p>
          <p className="text-sm">{question.escalationReason}</p>
          {question.escalatedAt && <p className="text-xs">{formatDate(question.escalatedAt)}</p>}
        </Card>
      )}
    </div>
  );
}
