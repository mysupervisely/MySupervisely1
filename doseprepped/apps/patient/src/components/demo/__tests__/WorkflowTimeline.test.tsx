import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { WorkflowTimeline } from "@/components/demo/WorkflowTimeline";

afterEach(cleanup);

describe("WorkflowTimeline", () => {
  it("renders every step's label", () => {
    render(
      <WorkflowTimeline
        steps={[
          { label: "Question received", done: true },
          { label: "DosePrepped reviews the question", done: true },
          { label: "Pharmacist review", done: false },
          { label: "Provider escalation if needed", done: false, skipped: true },
        ]}
      />,
    );

    expect(screen.getByText("Question received")).toBeInTheDocument();
    expect(screen.getByText("DosePrepped reviews the question")).toBeInTheDocument();
    expect(screen.getByText("Pharmacist review")).toBeInTheDocument();
    expect(screen.getByText("Provider escalation if needed")).toBeInTheDocument();
  });

  it("marks a skipped step as not needed, never implying every question requires it", () => {
    render(<WorkflowTimeline steps={[{ label: "Provider escalation if needed", done: false, skipped: true }]} />);
    expect(screen.getByText("(not needed this time)")).toBeInTheDocument();
  });
});
