import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ArchiveMedicationButton } from "@/components/medications/ArchiveMedicationButton";
import { getMedication } from "@/lib/medications";

export const metadata: Metadata = {
  title: "Medication details — DosePrepped",
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default async function MedicationDetailPage({ params }: PageProps<"/medications/[id]">) {
  const { id } = await params;
  const medication = await getMedication(id);

  if (!medication) {
    notFound();
  }

  const isActive = medication.status === "ACTIVE";

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">{medication.name}</h1>
        <Badge tone={isActive ? "info" : "neutral"}>
          {isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      <Card className="flex flex-col divide-y divide-border p-0">
        {[
          ["Strength", medication.strength],
          ["Dosage form", medication.dosageForm],
          ["Directions", medication.directions],
          ["Frequency", medication.frequency],
          ["Route", medication.route],
          ["Start date", formatDate(medication.startDate)],
          ["End date", formatDate(medication.endDate)],
          ["Notes", medication.notes ?? "—"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-start justify-between gap-4 px-5 py-3">
            <span className="text-sm text-ink-muted">{label}</span>
            <span className="max-w-[60%] text-right text-sm font-medium text-ink">{value}</span>
          </div>
        ))}
      </Card>

      <Button href={`/ask-a-question?medicationId=${medication.id}`} variant="primary" fullWidth>
        Ask about this medication
      </Button>

      <div className="flex gap-3">
        <Button href={`/medications/${medication.id}/edit`} variant="secondary">
          Edit
        </Button>
        {isActive && <ArchiveMedicationButton medicationId={medication.id} />}
      </div>
    </>
  );
}
