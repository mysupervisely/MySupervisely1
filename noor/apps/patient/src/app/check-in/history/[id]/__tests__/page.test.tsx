import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../../../../../lib/api";
import type { CheckInDetailDTO } from "@noor/types";

const pushMock = vi.fn();
const routerMock = { push: pushMock };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useParams: () => ({ id: "checkin-1" }),
}));

const apiFetchMock = vi.fn();
vi.mock("../../../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../../../lib/api")>("../../../../../lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const detail: CheckInDetailDTO = {
  id: "checkin-1",
  status: "SUBMITTED",
  submittedAt: "2026-08-12T00:00:00.000Z",
  createdAt: "2026-08-11T00:00:00.000Z",
  responses: [
    {
      questionKey: "overall_wellbeing",
      questionPrompt: "How are you feeling overall?",
      responseType: "SCALE_1_10",
      valueNumeric: 7,
      valueOptionKey: null,
      valueOptionLabel: null,
      valueText: null,
    },
    {
      questionKey: "main_concern",
      questionPrompt: "What has been most difficult recently?",
      responseType: "SINGLE_SELECT",
      valueNumeric: null,
      valueOptionKey: "SLEEP",
      valueOptionLabel: "Sleep",
      valueText: null,
    },
    {
      questionKey: "additional_notes",
      questionPrompt: "Is there anything else you'd like your clinician to know?",
      responseType: "FREE_TEXT",
      valueNumeric: null,
      valueOptionKey: null,
      valueOptionLabel: null,
      valueText: null,
    },
  ],
};

describe("CheckInDetailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(401, "Authentication required."));
    const { default: CheckInDetailPage } = await import("../page");
    render(<CheckInDetailPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("shows a friendly not-found message instead of leaking whether another patient's check-in exists (#cross-patient access shows generic not-found)", async () => {
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockRejectedValueOnce(new ApiError(404, "Check-in not found."));
    const { default: CheckInDetailPage } = await import("../page");
    render(<CheckInDetailPage />);
    expect(await screen.findByText(/couldn't be found/i)).toBeInTheDocument();
  });

  it("renders every answer descriptively with no clinical interpretation, and has no edit controls (#read-only submitted detail, #no edit controls on submitted check-in)", async () => {
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(detail);
    const { default: CheckInDetailPage } = await import("../page");
    render(<CheckInDetailPage />);

    expect(await screen.findByText("August 12, 2026")).toBeInTheDocument();
    expect(screen.getByText("How are you feeling overall?")).toBeInTheDocument();
    expect(screen.getByText("7/10")).toBeInTheDocument();
    expect(screen.getByText("What has been most difficult recently?")).toBeInTheDocument();
    expect(screen.getByText("Sleep")).toBeInTheDocument();
    expect(screen.getByText("Is there anything else you'd like your clinician to know?")).toBeInTheDocument();
    expect(screen.getByText("Not answered")).toBeInTheDocument();

    // Read-only: no input, textarea, select, or save/submit button anywhere.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    expect(screen.queryByText(/improved/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/diagnos/i)).not.toBeInTheDocument();
  });
});
