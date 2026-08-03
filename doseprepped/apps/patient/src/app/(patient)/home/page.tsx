import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";

export const metadata: Metadata = {
  title: "Home — DosePrepped",
};

// Synthetic/demo data only — see docs/doseprepped/ARCHITECTURE.md §"Prototype
// Data". Real medication data will come from packages/db in a later
// milestone once accounts exist.
const demoMedications = [
  { name: "Lisinopril", strength: "10 mg" },
  { name: "Metformin", strength: "500 mg" },
];

const demoQuestions = [
  {
    text: "Can I take Tylenol with my medication?",
    status: "Pharmacist answered",
  },
];

export default function PatientHomePage() {
  return (
    <>
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Good morning.</h1>
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
          <Badge tone="neutral">Synthetic data</Badge>
        </div>
        <Card className="flex flex-col divide-y divide-border p-0">
          {demoMedications.map((med) => (
            <div key={med.name} className="flex items-center justify-between px-5 py-3">
              <span className="font-medium text-ink">{med.name}</span>
              <span className="text-sm text-ink-muted">{med.strength}</span>
            </div>
          ))}
        </Card>
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
        This home screen shows synthetic demo data. Accounts, real
        medications, and conversation history will be wired up starting in
        M1.
      </PlaceholderNotice>
    </>
  );
}
