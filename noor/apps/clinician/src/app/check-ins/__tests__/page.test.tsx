import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../../../lib/api";
import type { ClinicianCheckInQueueItemDTO } from "@noor/types";

const pushMock = vi.fn();
const routerMock = { push: pushMock };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

const apiFetchMock = vi.fn();
vi.mock("../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../lib/api")>("../../../lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

function mockApi(routes: Record<string, unknown>) {
  apiFetchMock.mockImplementation((path: string) => {
    if (path in routes) {
      const value = routes[path];
      if (value instanceof ApiError) return Promise.reject(value);
      return Promise.resolve(value);
    }
    return Promise.reject(new Error(`Unmocked apiFetch call: ${path}`));
  });
}

const queueItem: ClinicianCheckInQueueItemDTO = {
  id: "checkin-1",
  patientId: "patient-1",
  patientFirstName: "Sarah",
  patientLastName: "Mendez",
  submittedAt: "2026-08-11T00:00:00.000Z",
  status: "SUBMITTED",
  safetyFlagged: false,
};

describe("CheckInQueuePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    mockApi({ "/auth/me": new ApiError(401, "Authentication required.") });
    const { default: CheckInQueuePage } = await import("../page");
    render(<CheckInQueuePage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("shows an honest empty state when nothing is awaiting review", async () => {
    mockApi({ "/auth/me": { roles: ["CLINICIAN"], email: "r@example.test" }, "/clinicians/me/check-ins": [] });
    const { default: CheckInQueuePage } = await import("../page");
    render(<CheckInQueuePage />);
    expect(await screen.findByText(/nothing waiting on you right now/i)).toBeInTheDocument();
  });

  it("lists the patient's first name + last initial, submitted date, and status — never a free-text answer (#queue shows minimal info)", async () => {
    mockApi({
      "/auth/me": { roles: ["CLINICIAN"], email: "r@example.test" },
      "/clinicians/me/check-ins": [queueItem],
    });
    const { default: CheckInQueuePage } = await import("../page");
    render(<CheckInQueuePage />);

    expect(await screen.findByText("Sarah M.")).toBeInTheDocument();
    expect(screen.getByText(/submitted aug 11/i)).toBeInTheDocument();
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /review/i })).toHaveAttribute("href", "/check-ins/patient-1/checkin-1");

    // Never a full last name or any free-text/select answer content.
    expect(screen.queryByText("Mendez")).not.toBeInTheDocument();
  });

  it("visually distinguishes a safety-flagged item using the existing deterministic state, not a new classification", async () => {
    mockApi({
      "/auth/me": { roles: ["CLINICIAN"], email: "r@example.test" },
      "/clinicians/me/check-ins": [{ ...queueItem, safetyFlagged: true }],
    });
    const { default: CheckInQueuePage } = await import("../page");
    render(<CheckInQueuePage />);
    expect(await screen.findByText("Flagged")).toBeInTheDocument();
  });
});
