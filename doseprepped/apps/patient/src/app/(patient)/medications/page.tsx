import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MedicationCard } from "@/components/medications/MedicationCard";
import { getMedications } from "@/lib/medications";

export const metadata: Metadata = {
  title: "Medications — DosePrepped",
};

export default async function MedicationsPage() {
  const medications = await getMedications();
  const active = medications.filter((m) => m.status === "ACTIVE");
  const inactive = medications.filter((m) => m.status === "INACTIVE");

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">My Medications</h1>
        <Button href="/medications/new" variant="primary" size="md">
          + Add Medication
        </Button>
      </div>

      {medications.length === 0 ? (
        <Card className="text-sm text-ink-muted">
          You haven&apos;t added any medications yet. Add one to keep track
          of what you&apos;re taking.
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {active.map((medication) => (
              <MedicationCard key={medication.id} medication={medication} />
            ))}
          </div>

          {inactive.length > 0 && (
            <div className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-ink-muted">Inactive</h2>
              <div className="flex flex-col gap-3">
                {inactive.map((medication) => (
                  <MedicationCard key={medication.id} medication={medication} />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
