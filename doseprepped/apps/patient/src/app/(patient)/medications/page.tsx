import type { Metadata } from "next";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";

export const metadata: Metadata = {
  title: "Medications — DosePrepped",
};

const demoMedications = [
  {
    name: "Lisinopril",
    strength: "10 mg",
    form: "Tablet",
    directions: "Take one tablet by mouth once daily.",
  },
  {
    name: "Metformin",
    strength: "500 mg",
    form: "Tablet",
    directions: "Take one tablet by mouth twice daily with food.",
  },
];

export default function MedicationsPage() {
  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">My Medications</h1>
        <Badge tone="neutral">Synthetic data</Badge>
      </div>

      <Button variant="primary" size="md" disabled>
        Add medication
      </Button>

      <div className="flex flex-col gap-3">
        {demoMedications.map((med) => (
          <Card key={med.name} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-ink">{med.name}</h2>
              <span className="text-sm text-ink-muted">{med.strength}</span>
            </div>
            <p className="text-sm text-ink-muted">{med.form}</p>
            <p className="text-sm text-ink">{med.directions}</p>
          </Card>
        ))}
      </div>

      <PlaceholderNotice>
        Adding, editing, and photo-based medication entry are not
        implemented yet. This screen displays synthetic demo medications
        only.
      </PlaceholderNotice>
    </>
  );
}
