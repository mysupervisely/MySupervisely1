import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../../../../lib/api";
import type { CheckInSummaryDTO } from "@noor/types";

const pushMock = vi.fn();
const routerMock = { push: pushMock };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

const apiFetchMock = vi.fn();
vi.mock("../../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/api")>("../../../../lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

const summary: CheckInSummaryDTO = {
  id: "checkin-1",
  status: "SUBMITTED",
  submittedAt: "2026-08-12T00:00:00.000Z",
  scores: { overallWellbeing: 7, mood: 6, stress: 4, sleep: 5 },
};

describe("CheckInHistoryPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(401, "Authentication required."));
    const { default: CheckInHistoryPage } = await import("../page");
    render(<CheckInHistoryPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("shows an honest empty state with no history yet (#patient with no check-ins sees empty state)", async () => {
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce([]);
    const { default: CheckInHistoryPage } = await import("../page");
    render(<CheckInHistoryPage />);
    expect(await screen.findByText(/haven't submitted a check-in yet/i)).toBeInTheDocument();
  });

  it("lists only descriptive scores — date and the four 1-10 numbers, no clinical interpretation (#history shows scores only, not interpretation)", async () => {
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce([summary]);
    const { default: CheckInHistoryPage } = await import("../page");
    render(<CheckInHistoryPage />);

    expect(await screen.findByText("August 12, 2026")).toBeInTheDocument();
    expect(
      screen.getByText("Overall wellbeing 7/10 · Mood 6/10 · Stress 4/10 · Sleep 5/10"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /august 12, 2026/i })).toHaveAttribute(
      "href",
      "/check-in/history/checkin-1",
    );

    // No clinical interpretation, diagnosis, or trend language anywhere.
    expect(screen.queryByText(/improved/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/depression/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/diagnos/i)).not.toBeInTheDocument();
  });

  it("shows 'Reviewed by your Noor care team' for a REVIEWED check-in, and nothing extra for a merely SUBMITTED one (#reviewed status, #no promised response for unreviewed)", async () => {
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce([
      summary, // SUBMITTED — no badge
      { ...summary, id: "checkin-2", status: "REVIEWED", submittedAt: "2026-08-05T00:00:00.000Z" },
    ]);
    const { default: CheckInHistoryPage } = await import("../page");
    render(<CheckInHistoryPage />);

    expect(await screen.findByText("Reviewed by your Noor care team")).toBeInTheDocument();
    // Only one of the two rows is reviewed.
    expect(screen.getAllByText("Reviewed by your Noor care team")).toHaveLength(1);
    // Never a promised response time or clinician-authored text anywhere.
    expect(screen.queryByText(/will respond/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/within \d+ (hour|day)/i)).not.toBeInTheDocument();
  });
});
