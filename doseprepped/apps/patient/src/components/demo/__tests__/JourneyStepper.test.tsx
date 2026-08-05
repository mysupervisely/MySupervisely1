import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JourneyStepper } from "@/components/demo/JourneyStepper";

afterEach(cleanup);

describe("JourneyStepper", () => {
  it("starts on step 1 and advances through Next/Back without mutating anything", async () => {
    render(<JourneyStepper organizationName="DosePrepped Demo Mode" nausea={null} escalation={null} report={null} />);

    expect(screen.getByText("Step 1 of 9")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1. Patient has a medication question" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 2 of 9")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2. DosePrepped structures the question" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 9")).toBeInTheDocument();
  });

  it("always shows what's happening and why it matters to a telehealth company", () => {
    render(<JourneyStepper organizationName="DosePrepped Demo Mode" nausea={null} escalation={null} report={null} />);

    expect(screen.getByText("What's happening")).toBeInTheDocument();
    expect(screen.getByText("Why this matters to a telehealth company")).toBeInTheDocument();
  });
});
