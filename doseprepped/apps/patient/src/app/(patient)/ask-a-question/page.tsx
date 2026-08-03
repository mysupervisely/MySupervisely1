import type { Metadata } from "next";
import { AskQuestionWizard } from "@/components/questions/AskQuestionWizard";
import { getMedications } from "@/lib/medications";

export const metadata: Metadata = {
  title: "Ask a Question — DosePrepped",
};

export default async function AskAQuestionPage({ searchParams }: PageProps<"/ask-a-question">) {
  const params = await searchParams;
  const medicationIdParam = params["medicationId"];
  const initialMedicationId = typeof medicationIdParam === "string" ? medicationIdParam : undefined;

  const medications = await getMedications();

  return <AskQuestionWizard medications={medications} initialMedicationId={initialMedicationId} />;
}
