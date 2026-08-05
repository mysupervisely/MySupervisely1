import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DemoBanner } from "@/components/demo/DemoBanner";

afterEach(cleanup);

describe("DemoBanner", () => {
  it("clearly labels the experience as a demo with synthetic data", () => {
    render(<DemoBanner />);

    expect(screen.getByText("DEMO MODE")).toBeInTheDocument();
    expect(screen.getByText(/Synthetic data — not a real patient\./)).toBeInTheDocument();
  });

  it("renders an optional note when provided", () => {
    render(<DemoBanner note="Scoped to the DosePrepped Demo Mode organization only." />);
    expect(screen.getByText("Scoped to the DosePrepped Demo Mode organization only.")).toBeInTheDocument();
  });
});
