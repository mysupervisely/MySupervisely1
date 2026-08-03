import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { QuestionCard } from "@/components/questions/QuestionCard";
import { getQuestions } from "@/lib/questions";

export const metadata: Metadata = {
  title: "My Questions — DosePrepped",
};

export default async function QuestionsPage() {
  const questions = await getQuestions();

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">My Questions</h1>
        <Button href="/ask-a-question" variant="primary" size="md">
          Ask a question
        </Button>
      </div>

      {questions.length === 0 ? (
        <Card className="text-sm text-ink-muted">
          You haven&apos;t asked a medication question yet.
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {questions.map((question) => (
            <QuestionCard key={question.id} question={question} />
          ))}
        </div>
      )}
    </>
  );
}
