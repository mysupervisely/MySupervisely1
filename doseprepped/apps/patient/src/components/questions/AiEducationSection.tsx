import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { AI_DISCLOSURE, AI_FALLBACK_MESSAGES, DISPOSITION_MESSAGES } from "@/lib/question-labels";
import type { Question } from "@/lib/questions";

interface AiEducationSectionProps {
  question: Pick<
    Question,
    "disposition" | "aiEducationResponse" | "aiResponseStatus" | "clarifyingQuestion"
  >;
}

/**
 * Renders the M3 Phase 3 AI education / routing experience described in
 * docs/doseprepped/ARCHITECTURE.md. Structured, not a chat transcript:
 * "### DosePrepped" content (only when AI succeeded), the disposition's
 * routing message (always), and a single "Need personalized guidance?"
 * CTA — never a conversation thread, never more than one AI-generated
 * block per question.
 */
export function AiEducationSection({ question }: AiEducationSectionProps) {
  const { disposition, aiEducationResponse, aiResponseStatus, clarifyingQuestion } = question;

  if (!disposition) return null;

  // URGENT_EMERGENCY: unchanged from Phase 2 — no AI content, ever, and no
  // "need personalized guidance" CTA that could read as non-urgent.
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

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-ink">Need personalized guidance?</h2>
        {disposition === "PROVIDER_EVALUATION" ? (
          <p className="text-sm text-ink-muted">
            Please contact your healthcare provider to discuss your specific situation.
          </p>
        ) : (
          <Button href="/ask-a-pharmacist" variant="secondary" className="w-fit">
            Request pharmacist review
          </Button>
        )}
      </div>
    </div>
  );
}
