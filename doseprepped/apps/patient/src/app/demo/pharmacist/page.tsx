import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PharmacistQuestionDetail } from "@/components/demo/PharmacistQuestionDetail";
import { getDemoCannedPharmacistQuestions, getDemoLivePharmacistQuestions } from "@/lib/demo";
import { claimDemoQuestion, respondToDemoQuestion } from "../actions";

export const metadata: Metadata = {
  title: "Pharmacist Experience — DosePrepped Demo",
};

export default async function DemoPharmacistPage() {
  const [{ nausea, escalation }, live] = await Promise.all([
    getDemoCannedPharmacistQuestions(),
    getDemoLivePharmacistQuestions(),
  ]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Pharmacist Experience</h1>
        <p className="text-sm text-ink-muted">
          AI assists with structuring and summarizing. Pharmacists review, respond, and decide when a question
          needs to go back to the patient&apos;s telehealth provider.
        </p>
      </div>

      {live.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-ink">Live queue</h2>
          <p className="text-sm text-ink-muted">
            Questions submitted just now through the Patient Experience&apos;s &ldquo;Try it yourself&rdquo; form —
            these are real, disposable demo records you can claim and respond to.
          </p>
          {live.map((question) => (
            <Card key={question.id} className="flex flex-col gap-4">
              <PharmacistQuestionDetail question={question} />
              {question.status === "PHARMACIST_REQUESTED" && (
                <form action={claimDemoQuestion}>
                  <input type="hidden" name="questionId" value={question.id} />
                  <Button type="submit">Claim this question</Button>
                </form>
              )}
              {question.status === "PHARMACIST_IN_PROGRESS" && (
                <form action={respondToDemoQuestion} className="flex flex-col gap-3">
                  <input type="hidden" name="questionId" value={question.id} />
                  <textarea
                    name="responseText"
                    required
                    rows={4}
                    placeholder="Write your response to the patient."
                    className="resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <Button type="submit" className="w-fit">
                    Submit response
                  </Button>
                </form>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">Example: a completed review</h2>
        {nausea ? (
          <Card>
            <PharmacistQuestionDetail question={nausea} />
          </Card>
        ) : (
          <Card className="text-sm text-ink-muted">
            Demo data isn&apos;t seeded yet — run <code>pnpm db:seed</code>.
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">Example: an escalation to provider evaluation</h2>
        {escalation ? (
          <Card>
            <PharmacistQuestionDetail question={escalation} />
          </Card>
        ) : (
          <Card className="text-sm text-ink-muted">
            Demo data isn&apos;t seeded yet — run <code>pnpm db:seed</code>.
          </Card>
        )}
        <Card className="bg-accent-light text-sm text-ink">
          DosePrepped does not replace the patient&apos;s telehealth provider. When provider evaluation is
          appropriate, the patient is routed back to the organization&apos;s existing care workflow.
        </Card>
      </div>
    </>
  );
}
