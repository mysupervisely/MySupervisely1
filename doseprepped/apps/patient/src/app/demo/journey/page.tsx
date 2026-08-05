import type { Metadata } from "next";
import { JourneyStepper } from "@/components/demo/JourneyStepper";
import { getDemoCannedQuestions, getDemoOrganization, getDemoOrganizationAnalytics } from "@/lib/demo";

export const metadata: Metadata = {
  title: "Full Journey — DosePrepped Demo",
};

export default async function DemoJourneyPage() {
  const [{ nausea, escalation }, organization, report] = await Promise.all([
    getDemoCannedQuestions(),
    getDemoOrganization(),
    getDemoOrganizationAnalytics(),
  ]);

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-ink">Full Journey</h1>
        <p className="text-sm text-ink-muted">
          Patient → DosePrepped → AI education → pharmacist review → provider escalation when appropriate →
          organization analytics.
        </p>
      </div>

      <JourneyStepper
        organizationName={organization?.name ?? "Your organization"}
        nausea={nausea}
        escalation={escalation}
        report={report}
      />
    </>
  );
}
