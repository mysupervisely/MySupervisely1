import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CATEGORY_LABELS, DISPOSITION_MESSAGES, STATUS_LABELS } from "@/lib/question-labels";
import { getQuestion } from "@/lib/questions";
import { cn } from "@/lib/cn";

export const metadata: Metadata = {
  title: "Question details — DosePrepped",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function QuestionDetailPage({ params }: PageProps<"/questions/[id]">) {
  const { id } = await params;
  const question = await getQuestion(id);

  if (!question) {
    notFound();
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">{question.medicationSnapshot.name}</h1>
        <Badge tone="info">{STATUS_LABELS[question.status]}</Badge>
      </div>

      <Card className="flex flex-col divide-y divide-border p-0">
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Medication</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-ink">
            {question.medicationSnapshot.name} {question.medicationSnapshot.strength}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Category</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-ink">
            {CATEGORY_LABELS[question.category]}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Question</span>
          <span className="max-w-[60%] whitespace-pre-wrap text-right text-sm font-medium text-ink">
            {question.questionText}
          </span>
        </div>
        <div className="flex items-start justify-between gap-4 px-5 py-3">
          <span className="text-sm text-ink-muted">Submitted</span>
          <span className="max-w-[60%] text-right text-sm font-medium text-ink">
            {formatDate(question.createdAt)}
          </span>
        </div>
      </Card>

      {question.disposition && (
        <Card
          className={cn(
            "text-sm",
            question.disposition === "URGENT_EMERGENCY"
              ? "bg-danger-light text-danger"
              : "bg-accent-light text-ink-muted",
          )}
        >
          {DISPOSITION_MESSAGES[question.disposition]}
        </Card>
      )}
    </>
  );
}
