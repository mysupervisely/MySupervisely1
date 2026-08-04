import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AI_DISCLOSURE, AI_FALLBACK_MESSAGES, DISPOSITION_MESSAGES } from "@/lib/question-labels";
import type { Question } from "@/lib/questions";

interface AiEducationSectionProps {
  question: Pick<
    Question,
    | "disposition"
    | "status"
    | "aiEducationResponse"
    | "aiResponseStatus"
    | "clarifyingQuestion"
    | "pharmacistResponse"
    | "pharmacistRespondedAt"
    | "escalatedAt"
  >;
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Renders the M3 Phase 3 AI education / routing experience plus, as of
 * M4, the pharmacist review outcome — described in
 * docs/doseprepped/ARCHITECTURE.md. Structured, not a chat transcript:
 * "### DosePrepped" content (only when AI succeeded), the disposition's
 * routing message, and, once a pharmacist has acted, a visually and
 * textually distinct "### Pharmacist Response" section or escalation
 * notice. Never implies the AI content was written or reviewed by a
 * pharmacist, and never merges the two.
 */
export function AiEducationSection({ question }: AiEducationSectionProps) {
  const {
    disposition,
    status,
    aiEducationResponse,
    aiResponseStatus,
    clarifyingQuestion,
    pharmacistResponse,
    pharmacistRespondedAt,
    escalatedAt,
  } = question;

  if (!disposition) return null;

  // URGENT_EMERGENCY: unchanged from Phase 2 — no AI content, ever, and no
  // pharmacist queue involvement (never handled by AI or pharmacist).
  if (disposition === "URGENT_EMERGENCY") {
    return (
      <Card className="bg-danger-light text-sm text-danger">{DISPOSITION_MESSAGES.URGENT_EMERGENCY}</Card>
    );
  }

  const hasAiContent = aiResponseStatus === "SUCCESS" && Boolean(aiEducationResponse);
  const isPrimaryEducation = disposition === "GENERAL_EDUCATION";

  return (
    <div className="flex flex-col gap-4">
      {hasAiContent ? (
        <Card className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-ink-muted">DosePrepped</h2>
          <p className="text-sm text-ink whitespace-pre-wrap">{aiEducationResponse}</p>
          <p className="text-xs text-ink-muted">{AI_DISCLOSURE}</p>
          {!isPrimaryEducation && (
            <p className="text-sm text-ink-muted">{DISPOSITION_MESSAGES[disposition]}</p>
          )}
        </Card>
      ) : (
        <Card className="flex flex-col gap-2 bg-accent-light text-sm text-ink-muted">
          <p>{DISPOSITION_MESSAGES[disposition]}</p>
          {aiResponseStatus === "FAILED" && <p>{AI_FALLBACK_MESSAGES[disposition]}</p>}
        </Card>
      )}

      {clarifyingQuestion && (
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">It may help to also share:</span> {clarifyingQuestion}
        </p>
      )}

      {/* Pharmacist review status/outcome (M4) — always visually and
          textually distinct from the AI content above. */}
      {(status === "PHARMACIST_REQUESTED" || status === "PHARMACIST_IN_PROGRESS") && (
        <Card className="bg-accent-light text-sm text-ink-muted">
          Your question has been sent for pharmacist review.
        </Card>
      )}

      {status === "PHARMACIST_RESOLVED" && pharmacistResponse && (
        <Card className="flex flex-col gap-2 border-primary/30">
          <h2 className="text-sm font-semibold text-ink">Pharmacist Response</h2>
          <p className="text-sm text-ink whitespace-pre-wrap">{pharmacistResponse}</p>
          <p className="text-xs text-ink-muted">
            Response from your pharmacist{pharmacistRespondedAt ? ` — ${formatDate(pharmacistRespondedAt)}` : ""}.
          </p>
        </Card>
      )}

      {status === "ESCALATED" && (
        <Card className="flex flex-col gap-1 bg-danger-light text-sm text-danger">
          <p>Your question has been escalated to your healthcare provider.</p>
          {escalatedAt && <p className="text-xs">{formatDate(escalatedAt)}</p>}
        </Card>
      )}

      {isPrimaryEducation && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold text-ink">Need personalized guidance?</h2>
          <Button href="/ask-a-pharmacist" variant="secondary" className="w-fit">
            Request pharmacist review
          </Button>
        </div>
      )}
    </div>
  );
}
