import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/question-labels";
import type { Question } from "@/lib/questions";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function QuestionCard({ question }: { question: Question }) {
  return (
    <Link href={`/questions/${question.id}`} className="block">
      <Card className="flex flex-col gap-1 transition-colors hover:border-primary/40">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="font-semibold text-ink">{question.medicationSnapshot.name}</h3>
          <span className="text-xs text-ink-muted">{formatDate(question.createdAt)}</span>
        </div>
        <p className="text-sm text-ink-muted">{CATEGORY_LABELS[question.category]}</p>
        <Badge tone="info" className="w-fit">
          {STATUS_LABELS[question.status]}
        </Badge>
      </Card>
    </Link>
  );
}
