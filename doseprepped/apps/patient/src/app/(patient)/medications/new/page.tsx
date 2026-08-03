import type { Metadata } from "next";
import { MedicationForm } from "@/components/medications/MedicationForm";

export const metadata: Metadata = {
  title: "Add Medication — DosePrepped",
};

export default function AddMedicationPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Add medication</h1>
      <MedicationForm mode="create" />
    </>
  );
}
