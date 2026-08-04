import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { getMedication } from "@/lib/medications";
import { getTimeline } from "@/lib/timeline";

export const metadata: Metadata = {
  title: "Medication timeline — DosePrepped",
};

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function MedicationTimelinePage({ params }: PageProps<"/medications/[id]/timeline">) {
  const { id } = await params;
  const medication = await getMedication(id);

  if (!medication) {
    notFound();
  }

  const timeline = await getTimeline(id);

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">{medication.name} timeline</h1>

      {timeline.length === 0 ? (
        <Card className="text-sm text-ink-muted">Nothing to show yet.</Card>
      ) : (
        <Card className="flex flex-col divide-y divide-border p-0">
          {timeline.map((entry, index) => {
            const content = (
              <div className="flex items-center justify-between gap-4 px-5 py-3">
                <span className="text-sm text-ink">{entry.label}</span>
                <span className="text-xs text-ink-muted">{formatDateTime(entry.occurredAt)}</span>
              </div>
            );
            return entry.questionId ? (
              <Link
                key={`${entry.type}-${entry.occurredAt}-${index}`}
                href={`/questions/${entry.questionId}`}
                className="transition-colors hover:bg-accent-light"
              >
                {content}
              </Link>
            ) : (
              <div key={`${entry.type}-${entry.occurredAt}-${index}`}>{content}</div>
            );
          })}
        </Card>
      )}
    </>
  );
}
