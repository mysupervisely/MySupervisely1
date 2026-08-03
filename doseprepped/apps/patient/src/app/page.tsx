import { MarketingHeader } from "@/components/layout/MarketingHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const steps = [
  {
    title: "Ask a question",
    body: "Tell us what's going on with a medication, in plain language.",
  },
  {
    title: "Get general education",
    body: "DosePrepped helps organize the question and shares general medication information where appropriate.",
  },
  {
    title: "Ask a pharmacist",
    body: "Request a review from a licensed pharmacist for anything specific to you.",
  },
];

export default function LandingPage() {
  return (
    <>
      <MarketingHeader />
      <main className="flex-1">
        <PageContainer className="flex flex-col items-center gap-6 py-16 text-center sm:max-w-3xl sm:py-24">
          <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            Medication questions.
            <br />
            <span className="text-primary">Pharmacist answers.</span>
          </h1>
          <p className="max-w-xl text-lg text-ink-muted">
            DosePrepped helps you understand your medications and connects
            you with a licensed pharmacist when you have a question about
            them.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button href="/signup" variant="primary" size="lg">
              Sign up
            </Button>
            <Button href="/login" variant="secondary" size="lg">
              Log in
            </Button>
          </div>
        </PageContainer>

        <PageContainer className="grid gap-4 pb-20 sm:max-w-4xl sm:grid-cols-3">
          {steps.map((step, i) => (
            <Card key={step.title} className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <h3 className="text-base font-semibold text-ink">
                {step.title}
              </h3>
              <p className="text-sm text-ink-muted">{step.body}</p>
            </Card>
          ))}
        </PageContainer>

        <PageContainer className="pb-24 sm:max-w-3xl">
          <Card className="bg-accent-light text-sm text-ink-muted">
            DosePrepped is not a diagnostic tool, a prescribing platform, or a
            replacement for emergency or physician care. It is designed to
            help you get clear medication information and, when needed,
            reach a licensed pharmacist.
          </Card>
        </PageContainer>
      </main>
    </>
  );
}
