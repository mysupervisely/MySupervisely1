import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../../../../lib/api";
import type { CheckInSummaryDTO, ClinicianPatientDetailDTO } from "@noor/types";

const pushMock = vi.fn();
const routerMock = { push: pushMock };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useParams: () => ({ patientId: "patient-1" }),
}));

const apiFetchMock = vi.fn();
vi.mock("../../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/api")>("../../../../lib/api");
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

const patientDetail: ClinicianPatientDetailDTO = {
  id: "profile-1",
  firstName: "Sarah",
  lastName: "Mendez",
  state: "CA",
  city: "San Francisco",
  careRelationship: { id: "rel-1", relationshipType: "THERAPY", status: "ACTIVE", startedAt: "2026-01-01T00:00:00.000Z" },
};

const history: CheckInSummaryDTO[] = [
  {
    id: "checkin-1",
    status: "SUBMITTED",
    submittedAt: "2026-08-11T00:00:00.000Z",
    scores: { overallWellbeing: 6, mood: 5, stress: 7, sleep: 4 },
  },
  {
    id: "checkin-2",
    status: "REVIEWED",
    submittedAt: "2026-08-01T00:00:00.000Z",
    scores: { overallWellbeing: 8, mood: 7, stress: 3, sleep: 8 },
  },
];

describe("ClinicianPatientCareViewPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    mockApi({ "/auth/me": new ApiError(401, "Authentication required.") });
    const { default: ClinicianPatientCareViewPage } = await import("../page");
    render(<ClinicianPatientCareViewPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("shows identity, the care relationship, and check-in history with review status — not a full medical chart (#patient care view)", async () => {
    mockApi({
      "/auth/me": { roles: ["CLINICIAN"], email: "r@example.test" },
      "/clinicians/me/patients/patient-1": patientDetail,
      "/clinicians/me/patients/patient-1/check-ins": history,
    });
    const { default: ClinicianPatientCareViewPage } = await import("../page");
    render(<ClinicianPatientCareViewPage />);

    expect(await screen.findByText("Sarah Mendez")).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
    expect(screen.getByText(/awaiting review/i)).toBeInTheDocument();
    expect(screen.getByText(/^Reviewed$/)).toBeInTheDocument();
    expect(screen.getAllByRole("link").some((el) => el.getAttribute("href") === "/check-ins/patient-1/checkin-1")).toBe(true);

    // No diagnosis, medication, treatment-plan, or billing content anywhere.
    for (const phrase of [/diagnos/i, /medication/i, /treatment plan/i, /billing/i, /insurance/i]) {
      expect(screen.queryByText(phrase)).not.toBeInTheDocument();
    }
  });

  it("shows an honest empty state when there's no check-in history yet", async () => {
    mockApi({
      "/auth/me": { roles: ["CLINICIAN"], email: "r@example.test" },
      "/clinicians/me/patients/patient-1": patientDetail,
      "/clinicians/me/patients/patient-1/check-ins": [],
    });
    const { default: ClinicianPatientCareViewPage } = await import("../page");
    render(<ClinicianPatientCareViewPage />);
    expect(await screen.findByText(/no submitted check-ins yet/i)).toBeInTheDocument();
  });
});
