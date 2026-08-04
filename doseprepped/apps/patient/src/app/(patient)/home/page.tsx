import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { MedicationCard } from "@/components/medications/MedicationCard";
import { QuestionCard } from "@/components/questions/QuestionCard";
import { requireRole } from "@/lib/require-role";
import { getMedications } from "@/lib/medications";
import { getQuestions } from "@/lib/questions";

export const metadata: Metadata = {
  title: "Home — DosePrepped",
};

const HOME_MEDICATION_PREVIEW_COUNT = 3;
const HOME_QUESTION_PREVIEW_COUNT = 3;

export default async function PatientHomePage() {
  const user = await requireRole("PATIENT");
  const medications = await getMedications();
  const active = medications.filter((m) => m.status === "ACTIVE");
  const medicationPreview = active.slice(0, HOME_MEDICATION_PREVIEW_COUNT);

  const questions = await getQuestions();
  const questionPreview = questions.slice(0, HOME_QUESTION_PREVIEW_COUNT);

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

        {medicationPreview.length === 0 ? (
          <Card className="text-sm text-ink-muted">
            You haven&apos;t added any medications yet.
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {medicationPreview.map((medication) => (
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

        {questionPreview.length === 0 ? (
          <Card className="text-sm text-ink-muted">
            You haven&apos;t asked a medication question yet.
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {questionPreview.map((question) => (
              <QuestionCard key={question.id} question={question} />
            ))}
          </div>
        )}

        {questions.length > HOME_QUESTION_PREVIEW_COUNT && (
          <Link href="/questions" className="text-sm font-medium text-primary hover:underline">
            View all questions
          </Link>
        )}
      </section>
    </>
  );
}
