import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";

describe("PlaceholderNotice", () => {
  it("renders a visible Placeholder badge and message", () => {
    render(<PlaceholderNotice>Not implemented yet.</PlaceholderNotice>);

    expect(screen.getByText("Placeholder")).toBeInTheDocument();
    expect(screen.getByText("Not implemented yet.")).toBeInTheDocument();
  });
});
