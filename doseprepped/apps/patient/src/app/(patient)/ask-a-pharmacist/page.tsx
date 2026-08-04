import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { QuestionCard } from "@/components/questions/QuestionCard";
import { getQuestions } from "@/lib/questions";

export const metadata: Metadata = {
  title: "Ask a Pharmacist — DosePrepped",
};

// Statuses that mean a pharmacist is (or was) involved with the question —
// see docs/doseprepped/ARCHITECTURE.md "Pharmacist review & concierge
// workflow architecture". GENERAL_EDUCATION questions never reach any of
// these; URGENT_EMERGENCY questions never reach any of these either.
const PHARMACIST_ROUTED_STATUSES = new Set([
  "PHARMACIST_REQUESTED",
  "PHARMACIST_IN_PROGRESS",
  "PHARMACIST_RESOLVED",
  "ESCALATED",
]);

export default async function AskAPharmacistPage() {
  const questions = await getQuestions();
  const pharmacistRouted = questions.filter((q) => PHARMACIST_ROUTED_STATUSES.has(q.status));

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Ask a pharmacist</h1>

      <Card className="flex flex-col gap-3">
        <p className="text-sm text-ink">
          DosePrepped doesn&apos;t have a separate &quot;request a
          pharmacist&quot; button — a licensed pharmacist automatically
          reviews your question whenever it needs judgment specific to your
          situation, based on how you describe it when you ask.
        </p>
        <p className="text-sm text-ink-muted">
          Pharmacist review is not a substitute for emergency or physician
          care.
        </p>
        <Button href="/ask-a-question" fullWidth>
          Ask a question
        </Button>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">Your pharmacist-routed questions</h2>
        {pharmacistRouted.length === 0 ? (
          <Card className="text-sm text-ink-muted">
            You don&apos;t have any questions currently routed to a
            pharmacist.
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {pharmacistRouted.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
