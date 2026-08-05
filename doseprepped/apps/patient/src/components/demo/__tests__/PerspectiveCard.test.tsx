import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PerspectiveCard } from "@/components/demo/PerspectiveCard";

describe("PerspectiveCard", () => {
  it("renders the title, description, and a link to the given perspective", () => {
    render(
      <PerspectiveCard
        eyebrow="Perspective 1"
        title="Patient Experience"
        description="See what a patient experiences when they need medication support."
        href="/demo/patient"
        cta="View patient experience"
      />,
    );

    expect(screen.getByRole("heading", { name: "Patient Experience" })).toBeInTheDocument();
    expect(
      screen.getByText("See what a patient experiences when they need medication support."),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "View patient experience" });
    expect(link).toHaveAttribute("href", "/demo/patient");
  });
});
