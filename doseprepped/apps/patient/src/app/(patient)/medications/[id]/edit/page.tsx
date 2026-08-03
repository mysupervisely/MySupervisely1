import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MedicationForm } from "@/components/medications/MedicationForm";
import { getMedication } from "@/lib/medications";

export const metadata: Metadata = {
  title: "Edit medication — DosePrepped",
};

export default async function EditMedicationPage({ params }: PageProps<"/medications/[id]/edit">) {
  const { id } = await params;
  const medication = await getMedication(id);

  if (!medication) {
    notFound();
  }

  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Edit {medication.name}</h1>
      <MedicationForm
        mode="edit"
        medicationId={medication.id}
        initialValues={{
          name: medication.name,
          strength: medication.strength,
          dosageForm: medication.dosageForm,
          directions: medication.directions,
          frequency: medication.frequency,
          route: medication.route,
          startDate: medication.startDate.slice(0, 10),
          endDate: medication.endDate ? medication.endDate.slice(0, 10) : "",
          notes: medication.notes ?? "",
        }}
      />
    </>
  );
}
