import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../../../lib/api";
import type { ClinicianDashboardSummaryDTO } from "@noor/types";

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

const summary: ClinicianDashboardSummaryDTO = {
  displayName: "Rana",
  checkInsToReviewCount: 3,
  activePatientCount: 12,
};

/** The page's own auth check AND the always-rendered ClinicianNav each
 * make their own independent GET /auth/me call, with no guaranteed
 * ordering between them — routing the mock by URL path (rather than
 * chained mockResolvedValueOnce calls) keeps every test correct
 * regardless of which fires first. */
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

describe("ClinicianDashboardPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    mockApi({ "/auth/me": new ApiError(401, "Authentication required.") });
    const { default: ClinicianDashboardPage } = await import("../page");
    render(<ClinicianDashboardPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("shows a greeting and authorization-scoped counts, with an honest empty 'Today' state and no fake appointments (#clinician sees work requiring attention)", async () => {
    mockApi({
      "/auth/me": { roles: ["CLINICIAN"], email: "rana@example.test" },
      "/clinicians/me/dashboard": summary,
    });
    const { default: ClinicianDashboardPage } = await import("../page");
    render(<ClinicianDashboardPage />);

    expect(await screen.findByText(/Rana\./)).toBeInTheDocument();
    expect(screen.getByText("3 check-ins need your attention.")).toBeInTheDocument();
    expect(screen.getByText("12 active patients.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /review check-ins/i })).toHaveAttribute("href", "/check-ins");
    expect(screen.getByRole("link", { name: /view patients/i })).toHaveAttribute("href", "/patients");

    // Honest "Today" empty state — no fabricated appointment time.
    expect(screen.getByText(/no appointments scheduled here yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/\d{1,2}:\d{2}\s?(AM|PM)/i)).not.toBeInTheDocument();
  });

  it("shows singular phrasing for a count of exactly one", async () => {
    mockApi({
      "/auth/me": { roles: ["CLINICIAN"], email: "rana@example.test" },
      "/clinicians/me/dashboard": { displayName: "Rana", checkInsToReviewCount: 1, activePatientCount: 1 },
    });
    const { default: ClinicianDashboardPage } = await import("../page");
    render(<ClinicianDashboardPage />);

    expect(await screen.findByText("1 check-in needs your attention.")).toBeInTheDocument();
    expect(screen.getByText("1 active patient.")).toBeInTheDocument();
  });
});
