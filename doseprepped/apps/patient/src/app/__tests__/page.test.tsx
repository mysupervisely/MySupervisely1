import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import LandingPage from "@/app/page";

describe("LandingPage", () => {
  it("renders the tagline and primary calls to action", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: /Pharmacist answers\./ }),
    ).toBeInTheDocument();

    const signupLinks = screen.getAllByRole("link", { name: "Sign up" });
    expect(signupLinks.length).toBeGreaterThan(0);
    for (const link of signupLinks) {
      expect(link).toHaveAttribute("href", "/signup");
    }

    const loginLinks = screen.getAllByRole("link", { name: "Log in" });
    expect(loginLinks.length).toBeGreaterThan(0);
    for (const link of loginLinks) {
      expect(link).toHaveAttribute("href", "/login");
    }
  });
});
