import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@/components/ui/Button";

describe("Button", () => {
  it("renders as a button and handles clicks", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Ask a question</Button>);

    const button = screen.getByRole("button", { name: "Ask a question" });
    await userEvent.click(button);

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("renders as a link when href is provided", () => {
    render(<Button href="/ask-a-pharmacist">Ask a pharmacist</Button>);

    const link = screen.getByRole("link", { name: "Ask a pharmacist" });
    expect(link).toHaveAttribute("href", "/ask-a-pharmacist");
  });

  it("does not fire onClick when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button onClick={onClick} disabled>
        Submit
      </Button>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
