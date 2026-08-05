import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DemoLandingPage from "@/app/demo/page";

afterEach(cleanup);

describe("DemoLandingPage", () => {
  it("renders the headline, subheadline, and all four demo entry points", () => {
    render(<DemoLandingPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Medication Support for Modern Telehealth" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/DosePrepped helps telehealth organizations support patients/)).toBeInTheDocument();

    expect(screen.getByRole("link", { name: "View patient experience" })).toHaveAttribute("href", "/demo/patient");
    expect(screen.getByRole("link", { name: "View pharmacist experience" })).toHaveAttribute(
      "href",
      "/demo/pharmacist",
    );
    expect(screen.getByRole("link", { name: "View admin experience" })).toHaveAttribute("href", "/demo/admin");
    expect(screen.getByRole("link", { name: "Run Full Journey" })).toHaveAttribute("href", "/demo/journey");
  });

  it("communicates that DosePrepped extends, not replaces, the telehealth care model", () => {
    render(<DemoLandingPage />);
    expect(screen.getByText(/DosePrepped extends your telehealth care model between visits\./)).toBeInTheDocument();
  });
});
