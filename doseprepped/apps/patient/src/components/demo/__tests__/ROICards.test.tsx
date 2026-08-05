import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ROICards } from "@/components/demo/ROICards";

afterEach(cleanup);

describe("ROICards", () => {
  it("presents the four value categories from the M6.0 brief", () => {
    render(<ROICards />);

    expect(screen.getByText("Patient Experience")).toBeInTheDocument();
    expect(screen.getByText("Provider Capacity")).toBeInTheDocument();
    expect(screen.getByText("Pharmacist Utilization")).toBeInTheDocument();
    expect(screen.getByText("Operations")).toBeInTheDocument();
  });

  it("never claims a specific dollar savings figure", () => {
    render(<ROICards />);
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\$\d/);
    expect(text).toMatch(/[Pp]ilot and measure/);
  });
});
