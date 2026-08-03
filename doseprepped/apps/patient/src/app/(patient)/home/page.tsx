import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";
import { MedicationCard } from "@/components/medications/MedicationCard";
import { requireRole } from "@/lib/require-role";
import { getMedications } from "@/lib/medications";

export const metadata: Metadata = {
  title: "Home — DosePrepped",
};

const HOME_MEDICATION_PREVIEW_COUNT = 3;

// Synthetic/demo data only — see docs/doseprepped/ARCHITECTURE.md
// §"Prototype Data". Real pharmacist conversations arrive in a later
// milestone (Ask a Question / Ask a Pharmacist are still placeholders).
const demoQuestions = [
  {
    text: "Can I take Tylenol with my medication?",
    status: "Pharmacist answered",
  },
];

export default async function PatientHomePage() {
  const user = await requireRole("PATIENT");
  const medications = await getMedications();
  const active = medications.filter((m) => m.status === "ACTIVE");
  const preview = active.slice(0, HOME_MEDICATION_PREVIEW_COUNT);

  return (
    <>
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">
          Welcome, {user.firstName}
        </h1>
        <p className="text-ink-muted">Have a medication question?</p>
      </section>

      <section className="flex flex-col gap-3">
        <Button href="/ask-a-question" variant="primary" size="lg" fullWidth>
          Ask a question
        </Button>
        <Button href="/ask-a-pharmacist" variant="secondary" size="lg" fullWidth>
          Ask a pharmacist
        </Button>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">My Medications</h2>
          <Button href="/medications/new" variant="ghost" size="md">
            + Add Medication
          </Button>
        </div>

        {preview.length === 0 ? (
          <Card className="text-sm text-ink-muted">
            You haven&apos;t added any medications yet.
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {preview.map((medication) => (
              <MedicationCard key={medication.id} medication={medication} />
            ))}
          </div>
        )}

        {active.length > HOME_MEDICATION_PREVIEW_COUNT && (
          <Link href="/medications" className="text-sm font-medium text-primary hover:underline">
            View all medications
          </Link>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">Recent Questions</h2>
        <Card className="flex flex-col divide-y divide-border p-0">
          {demoQuestions.map((q) => (
            <div key={q.text} className="flex flex-col gap-1 px-5 py-3">
              <span className="text-sm text-ink">&ldquo;{q.text}&rdquo;</span>
              <Badge tone="info" className="w-fit">
                {q.status}
              </Badge>
            </div>
          ))}
        </Card>
      </section>

      <PlaceholderNotice>
        Recent Questions above is synthetic demo data — Ask a Question and
        Ask a Pharmacist are not implemented yet.
      </PlaceholderNotice>
    </>
  );
}
