import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";

export const metadata: Metadata = {
  title: "Ask a Pharmacist — DosePrepped",
};

export default function AskAPharmacistPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Ask a pharmacist</h1>

      <Card className="flex flex-col gap-3">
        <p className="text-sm text-ink">
          A licensed pharmacist will review your question and relevant
          medication information, then respond securely.
        </p>
        <p className="text-sm text-ink-muted">
          Pharmacist review is not a substitute for emergency or physician
          care.
        </p>
        <Button type="button" disabled>
          Request pharmacist review
        </Button>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-ink">Your requests</h2>
        <Card className="text-sm text-ink-muted">
          You have no pharmacist requests yet.
        </Card>
      </div>

      <PlaceholderNotice>
        Pharmacist request creation, the pharmacist dashboard, and secure
        messaging are not implemented yet — reserved for milestone M4.
      </PlaceholderNotice>
    </>
  );
}
