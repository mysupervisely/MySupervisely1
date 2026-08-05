"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { Question } from "@/lib/questions";
import type { AnalyticsReport } from "@/lib/analytics";

interface JourneyStepperProps {
  organizationName: string;
  nausea: Question | null;
  escalation: Question | null;
  report: AnalyticsReport | null;
}

interface Step {
  title: string;
  whatsHappening: string;
  whyItMatters: string;
  body: React.ReactNode;
}

function formatPercent(value: number | null): string {
  return value === null ? "—" : `${value}%`;
}

/**
 * M6.0 — the "Full Journey" centerpiece: a guided, read-only walkthrough
 * of the two seeded canned scenarios and the demo organization's real
 * analytics. Pure narrative — this component never mutates anything;
 * all data is fetched once, server-side, by `app/demo/journey/page.tsx`.
 * See docs/doseprepped/ARCHITECTURE.md "M6.0 — Demo Mode".
 */
export function JourneyStepper({ organizationName, nausea, escalation, report }: JourneyStepperProps) {
  const [index, setIndex] = useState(0);

  const steps: Step[] = [
    {
      title: "1. Patient has a medication question",
      whatsHappening: "Patient needs help with a medication.",
      whyItMatters:
        "Between telehealth visits, patients often have nowhere immediate to ask a medication question — DosePrepped gives them one, without adding load to your care team.",
      body: nausea ? (
        <Card className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {nausea.medicationSnapshot.name} {nausea.medicationSnapshot.strength}
          </span>
          <p className="text-sm text-ink">&ldquo;{nausea.questionText}&rdquo;</p>
        </Card>
      ) : null,
    },
    {
      title: "2. DosePrepped structures the question",
      whatsHappening: "DosePrepped structures the question.",
      whyItMatters:
        "A deterministic, versioned safety/disposition layer — not an AI guess — decides whether this needs general education, pharmacist review, or urgent care, before anything else happens.",
      body: nausea && (
        <Card className="flex flex-wrap gap-2 text-sm text-ink">
          <Badge tone="info">Category: Side effect or reaction</Badge>
          <Badge tone="info">Disposition: Pharmacist Review</Badge>
        </Card>
      ),
    },
    {
      title: "3. AI provides appropriate medication education",
      whatsHappening: "AI provides appropriate medication education.",
      whyItMatters:
        "Patients get an immediate, clearly-labeled educational response — never a diagnosis, never personalized medical advice — while the question also continues toward pharmacist review.",
      body: nausea?.aiEducationResponse && (
        <Card className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">DosePrepped</h4>
          <p className="text-sm text-ink">{nausea.aiEducationResponse}</p>
        </Card>
      ),
    },
    {
      title: "4. Questions requiring human review enter the pharmacist workflow",
      whatsHappening: "Questions requiring human review enter the pharmacist workflow.",
      whyItMatters:
        "Nothing waits on a physician for issues a pharmacist can safely handle — this is where DosePrepped keeps appropriate questions off your providers' queues.",
      body: (
        <Card className="text-sm text-ink-muted">
          Automatically queued the moment the question was submitted — no separate &ldquo;request a
          pharmacist&rdquo; step.
        </Card>
      ),
    },
    {
      title: "5. Pharmacists can respond or escalate",
      whatsHappening: "Pharmacists can respond or escalate.",
      whyItMatters:
        "A licensed pharmacist reviews and decides — write a response, or escalate back to the provider. DosePrepped never generates the official response automatically.",
      body: nausea?.pharmacistResponse && (
        <Card className="flex flex-col gap-2 border-primary/30">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Pharmacist Response</h4>
          <p className="text-sm text-ink">{nausea.pharmacistResponse}</p>
        </Card>
      ),
    },
    {
      title: "6. Patient receives support",
      whatsHappening: "The patient sees the pharmacist's response, clearly separated from the AI education above.",
      whyItMatters:
        "Patients get a real answer from a licensed professional, between visits, without an appointment — and your organization's provider relationship stays exactly where it was.",
      body: (
        <Card className="bg-accent-light text-sm text-ink">
          Status: Pharmacist responded. Both the AI education and the pharmacist&apos;s own response remain
          visible to the patient, never merged into one message.
        </Card>
      ),
    },
    {
      title: "7. Provider evaluation remains available when appropriate",
      whatsHappening: "A second example demonstrates provider escalation.",
      whyItMatters:
        "DosePrepped does not replace the patient's telehealth provider. When provider evaluation is appropriate, the patient is routed back to the organization's existing care workflow.",
      body: escalation ? (
        <div className="flex flex-col gap-2">
          <Card className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {escalation.medicationSnapshot.name} {escalation.medicationSnapshot.strength}
            </span>
            <p className="text-sm text-ink">&ldquo;{escalation.questionText}&rdquo;</p>
          </Card>
          <Card className="bg-danger-light text-sm text-danger">
            Provider evaluation recommended — escalated by the reviewing pharmacist.
          </Card>
        </div>
      ) : null,
    },
    {
      title: "8. The organization can measure what is happening",
      whatsHappening: "The organization administrator sees the resulting analytics.",
      whyItMatters:
        "Question volume, pharmacist workload, escalation rate, and patient engagement are all measurable — so a pilot can be evaluated on real operational data, not anecdote.",
      body: report ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="flex flex-col items-center gap-1 py-3 text-center">
            <span className="text-xl font-semibold text-ink">{report.questionFunnel.totalQuestions}</span>
            <span className="text-xs text-ink-muted">Questions</span>
          </Card>
          <Card className="flex flex-col items-center gap-1 py-3 text-center">
            <span className="text-xl font-semibold text-ink">
              {formatPercent(report.providerEscalation.resolvedWithoutProviderEscalationRate)}
            </span>
            <span className="text-xs text-ink-muted">Resolved without escalation</span>
          </Card>
          <Card className="flex flex-col items-center gap-1 py-3 text-center">
            <span className="text-xl font-semibold text-ink">{report.providerEscalation.totalEscalatedToProvider}</span>
            <span className="text-xs text-ink-muted">Escalated to provider</span>
          </Card>
          <Card className="flex flex-col items-center gap-1 py-3 text-center">
            <span className="text-xl font-semibold text-ink">{report.patientEngagement.activePatients}</span>
            <span className="text-xs text-ink-muted">Active patients</span>
          </Card>
        </div>
      ) : (
        <Card className="text-sm text-ink-muted">Demo data isn&apos;t seeded yet.</Card>
      ),
    },
    {
      title: "9. The bigger picture",
      whatsHappening: `${organizationName} keeps the patient relationship, the provider relationship, medical evaluation, prescribing, and clinical care.`,
      whyItMatters: "DosePrepped extends your telehealth care model between visits — it does not replace it.",
      body: (
        <Card className="border-primary/30 bg-primary-light text-sm text-primary-dark">
          &ldquo;Give patients immediate medication support between visits while routing appropriate issues to
          pharmacists and providers.&rdquo;
        </Card>
      ),
    },
  ];

  const step = steps[index]!;
  const isFirst = index === 0;
  const isLast = index === steps.length - 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between text-xs text-ink-muted">
        <span>
          Step {index + 1} of {steps.length}
        </span>
        <div className="flex gap-1">
          {steps.map((s, i) => (
            <button
              key={s.title}
              type="button"
              aria-label={`Go to step ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 w-5 rounded-full ${i === index ? "bg-primary" : "bg-border"}`}
            />
          ))}
        </div>
      </div>

      <Card className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold text-ink">{step.title}</h2>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">What&apos;s happening</span>
          <p className="text-sm text-ink">{step.whatsHappening}</p>
        </div>

        {step.body}

        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Why this matters to a telehealth company
          </span>
          <p className="text-sm text-ink-muted">{step.whyItMatters}</p>
        </div>
      </Card>

      <div className="flex justify-between gap-2">
        <Button type="button" variant="secondary" disabled={isFirst} onClick={() => setIndex((i) => i - 1)}>
          Back
        </Button>
        <Button type="button" disabled={isLast} onClick={() => setIndex((i) => i + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
