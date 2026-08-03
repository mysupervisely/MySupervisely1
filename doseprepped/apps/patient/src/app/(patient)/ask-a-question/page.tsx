import type { Metadata } from "next";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";

export const metadata: Metadata = {
  title: "Ask a Question — DosePrepped",
};

const demoMedications = ["Lisinopril 10 mg", "Metformin 500 mg"];

export default function AskAQuestionPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold text-ink">Ask a question</h1>

      <Card className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-left">
          <span className="text-sm font-medium text-ink">
            What medication is your question about?
          </span>
          <select
            disabled
            className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink"
            defaultValue=""
          >
            <option value="" disabled>
              Select a medication
            </option>
            {demoMedications.map((med) => (
              <option key={med} value={med}>
                {med}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-left">
          <span className="text-sm font-medium text-ink">
            What would you like to know?
          </span>
          <textarea
            disabled
            rows={4}
            placeholder="e.g. Can I take this with Tylenol?"
            className="resize-none rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted"
          />
        </label>

        <Button type="button" disabled>
          Submit
        </Button>
      </Card>

      <PlaceholderNotice>
        The AI medication assistant is not implemented yet — this is a
        structural placeholder reserved for milestone M3. No question
        submitted here is processed.
      </PlaceholderNotice>
    </>
  );
}
