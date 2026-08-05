import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PerspectiveCard } from "@/components/demo/PerspectiveCard";

export const metadata: Metadata = {
  title: "DosePrepped Demo — Medication Support for Modern Telehealth",
};

/**
 * M6.0 — Demo Mode landing/hub screen. See
 * docs/doseprepped/ARCHITECTURE.md "M6.0 — Demo Mode" for the full
 * sales narrative this page and its children are built around.
 */
export default function DemoLandingPage() {
  return (
    <>
      <div className="flex flex-col gap-3 text-center sm:text-left">
        <h1 className="text-3xl font-semibold text-ink">Medication Support for Modern Telehealth</h1>
        <p className="text-base text-ink-muted">
          DosePrepped helps telehealth organizations support patients between visits with AI-powered medication
          education, pharmacist review, adherence tools, and provider escalation.
        </p>
      </div>

      <Card className="flex flex-col gap-2 border-primary/30 bg-primary-light">
        <p className="text-sm font-medium text-primary-dark">
          DosePrepped extends your telehealth care model between visits.
        </p>
        <p className="text-sm text-primary-dark">
          Your organization keeps the patient relationship, the provider relationship, medical evaluation,
          prescribing, and clinical care. DosePrepped provides the medication-support infrastructure around it —
          patient education, structured medication questions, a pharmacist workflow, adherence/check-in tools,
          provider escalation, and operational analytics.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <PerspectiveCard
          eyebrow="Perspective 1"
          title="Patient Experience"
          description="See what a patient experiences when they need medication support."
          href="/demo/patient"
          cta="View patient experience"
        />
        <PerspectiveCard
          eyebrow="Perspective 2"
          title="Pharmacist Experience"
          description="See how pharmacists review, respond to, and escalate medication questions."
          href="/demo/pharmacist"
          cta="View pharmacist experience"
        />
        <PerspectiveCard
          eyebrow="Perspective 3"
          title="Telehealth Admin Experience"
          description="See the organization dashboard, patient engagement, and operational analytics."
          href="/demo/admin"
          cta="View admin experience"
        />
      </div>

      <Card className="flex flex-col items-center gap-3 py-8 text-center">
        <h2 className="text-xl font-semibold text-ink">See the entire workflow, start to finish</h2>
        <p className="max-w-md text-sm text-ink-muted">
          A guided walkthrough from a patient&apos;s medication question through AI education, pharmacist review,
          provider escalation, and the resulting organization analytics.
        </p>
        <Button href="/demo/journey" size="lg">
          Run Full Journey
        </Button>
      </Card>
    </>
  );
}
