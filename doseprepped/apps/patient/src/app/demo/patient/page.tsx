import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AiEducationSection } from "@/components/questions/AiEducationSection";
import { WorkflowTimeline, type TimelineStep } from "@/components/demo/WorkflowTimeline";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/question-labels";
import { getDemoCannedQuestions, getDemoLiveQuestions } from "@/lib/demo";
import { submitDemoQuestion } from "../actions";
import type { Question } from "@/lib/questions";

export const metadata: Metadata = {
  title: "Patient Experience — DosePrepped Demo",
};

function buildTimelineSteps(question: Question): TimelineStep[] {
  const submitted = true;
  const structured = Boolean(question.disposition);
  const pharmacistInvolved = question.status !== "AI_ANSWERED" && question.disposition !== "GENERAL_EDUCATION";
  const pharmacistDone =
    question.status === "PHARMACIST_RESOLVED" || question.status === "ESCALATED";
  const escalated = question.status === "ESCALATED";

  return [
    { label: "Question received", done: submitted },
    { label: "DosePrepped reviews the question", done: structured },
    {
      label: "Pharmacist review",
      done: pharmacistDone,
      skipped: structured && !pharmacistInvolved,
    },
    {
      label: "Provider escalation if needed",
      done: escalated,
      skipped: structured && pharmacistDone && !escalated,
    },
  ];
}

function QuestionWalkthrough({ heading, question }: { heading: string; question: Question }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{heading}</h2>
        <Badge tone="info">{STATUS_LABELS[question.status]}</Badge>
      </div>

      <Card className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
          {CATEGORY_LABELS[question.category]} · {question.medicationSnapshot.name}
        </span>
        <p className="text-sm text-ink whitespace-pre-wrap">&ldquo;{question.questionText}&rdquo;</p>
      </Card>

      <Card className="flex flex-col gap-2">
        <span className="text-sm font-semibold text-ink-muted">What happens next?</span>
        <WorkflowTimeline steps={buildTimelineSteps(question)} />
      </Card>

      <AiEducationSection question={question} />
    </div>
  );
}

export default async function DemoPatientPage({ searchParams }: PageProps<"/demo/patient">) {
  const params = await searchParams;
  const submittedId = typeof params["submittedId"] === "string" ? params["submittedId"] : undefined;
  const errorParam = typeof params["error"] === "string" ? params["error"] : undefined;

  const [{ nausea }, liveQuestions] = await Promise.all([getDemoCannedQuestions(), getDemoLiveQuestions()]);
  const submitted = submittedId ? liveQuestions.find((q) => q.id === submittedId) : undefined;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Patient Experience</h1>
        <p className="text-sm text-ink-muted">
          DosePrepped does not replace your telehealth provider — it gives patients somewhere to go with
          medication questions between visits, and routes appropriate issues to a pharmacist or back to the
          provider.
        </p>
      </div>

      {nausea ? (
        <QuestionWalkthrough heading="Example: a resolved medication question" question={nausea} />
      ) : (
        <Card className="text-sm text-ink-muted">
          Demo data isn&apos;t seeded yet — run <code>pnpm db:seed</code>.
        </Card>
      )}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">Try it yourself</h2>
        <p className="text-sm text-ink-muted">
          Ask a real medication question as our demo patient (Semaglutide) and watch DosePrepped structure it and
          generate education in real time — no AI vendor key required, this runs on the same deterministic mock
          provider used throughout this demo.
        </p>
        <form action={submitDemoQuestion} className="flex flex-col gap-3">
          <textarea
            name="questionText"
            required
            rows={3}
            maxLength={2000}
            placeholder="e.g. I've been feeling nauseous since starting my medication. Is this normal?"
            className="resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <Button type="submit" className="w-fit">
            Ask DosePrepped
          </Button>
        </form>
        {errorParam && (
          <p role="alert" className="text-sm text-danger">
            Something went wrong submitting that question. Please try again.
          </p>
        )}
      </Card>

      {submitted && <QuestionWalkthrough heading="Your live submission" question={submitted} />}
    </>
  );
}
