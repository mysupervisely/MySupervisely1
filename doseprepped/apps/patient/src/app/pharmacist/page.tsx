import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CATEGORY_LABELS } from "@/lib/question-labels";
import { getQueue } from "@/lib/pharmacist";

export const metadata: Metadata = {
  title: "Pharmacist Dashboard — DosePrepped",
};

const DISPOSITION_LABELS: Record<string, string> = {
  PHARMACIST_REVIEW: "Pharmacist Review",
  PROVIDER_EVALUATION: "Provider Evaluation",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function PharmacistHomePage() {
  const { counts, questions } = await getQueue();

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">DosePrepped Pharmacist</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="flex flex-col items-center gap-1 py-4">
          <span className="text-2xl font-semibold text-ink">{counts.new}</span>
          <span className="text-xs text-ink-muted">New Questions</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 py-4">
          <span className="text-2xl font-semibold text-ink">{counts.inReview}</span>
          <span className="text-xs text-ink-muted">In Review</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 py-4">
          <span className="text-2xl font-semibold text-ink">{counts.completed}</span>
          <span className="text-xs text-ink-muted">Completed</span>
        </Card>
        <Card className="flex flex-col items-center gap-1 py-4">
          <span className="text-2xl font-semibold text-ink">{counts.escalated}</span>
          <span className="text-xs text-ink-muted">Escalated</span>
        </Card>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink">Queue</h2>
          <p className="text-xs text-ink-muted">
            Sorted: provider-evaluation questions first, then oldest first
          </p>
        </div>

        {questions.length === 0 ? (
          <Card className="text-sm text-ink-muted">Nothing in your queue right now.</Card>
        ) : (
          <div className="flex flex-col gap-2">
            {questions.map((question) => (
              <Link key={question.id} href={`/pharmacist/queue/${question.id}`}>
                <Card className="flex flex-col gap-2 transition-colors hover:border-primary/40">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-ink">
                      {question.medicationSnapshot.name} {question.medicationSnapshot.strength}
                    </span>
                    <Badge tone={question.disposition === "PROVIDER_EVALUATION" ? "warning" : "info"}>
                      {question.disposition ? DISPOSITION_LABELS[question.disposition] : "—"}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                    <span>{CATEGORY_LABELS[question.category]}</span>
                    <span>Submitted {formatDate(question.submittedAt)}</span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
