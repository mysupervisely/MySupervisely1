import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ApiError } from "../../../../../lib/api";
import type { CheckInDetailDTO, ClinicianPatientDetailDTO } from "@noor/types";

const pushMock = vi.fn();
const routerMock = { push: pushMock };
vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  useParams: () => ({ patientId: "patient-1", checkInId: "checkin-1" }),
}));

const apiFetchMock = vi.fn();
vi.mock("../../../../../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../../../../../lib/api")>("../../../../../lib/api");
  return { ...actual, apiFetch: (...args: unknown[]) => apiFetchMock(...args) };
});

function mockApi(routes: Record<string, unknown>) {
  apiFetchMock.mockImplementation((path: string, init?: RequestInit) => {
    const key = init?.method ? `${init.method} ${path}` : path;
    if (key in routes) {
      const value = routes[key];
      if (value instanceof ApiError) return Promise.reject(value);
      return Promise.resolve(value);
    }
    return Promise.reject(new Error(`Unmocked apiFetch call: ${key}`));
  });
}

const checkInDetail: CheckInDetailDTO = {
  id: "checkin-1",
  status: "SUBMITTED",
  submittedAt: "2026-08-11T00:00:00.000Z",
  createdAt: "2026-08-10T00:00:00.000Z",
  responses: [
    {
      questionKey: "overall_wellbeing",
      questionPrompt: "How are you feeling overall?",
      responseType: "SCALE_1_10",
      valueNumeric: 6,
      valueOptionKey: null,
      valueOptionLabel: null,
      valueText: null,
    },
    {
      questionKey: "main_concern",
      questionPrompt: "What has been most difficult recently?",
      responseType: "SINGLE_SELECT",
      valueNumeric: null,
      valueOptionKey: "WORK_OR_SCHOOL",
      valueOptionLabel: "Work or school",
      valueText: null,
    },
  ],
};

const patientDetail: ClinicianPatientDetailDTO = {
  id: "profile-1",
  firstName: "Sarah",
  lastName: "Mendez",
  state: "CA",
  city: "San Francisco",
  careRelationship: { id: "rel-1", relationshipType: "THERAPY", status: "ACTIVE", startedAt: "2026-01-01T00:00:00.000Z" },
};

describe("ClinicianCheckInDetailPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    mockApi({ "/auth/me": new ApiError(401, "Authentication required.") });
    const { default: ClinicianCheckInDetailPage } = await import("../page");
    render(<ClinicianCheckInDetailPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("renders every answer exactly as reported, with no automated clinical interpretation (#authorized clinician can read)", async () => {
    mockApi({
      "/auth/me": { roles: ["CLINICIAN"], email: "r@example.test" },
      "/clinicians/me/patients/patient-1/check-ins/checkin-1": checkInDetail,
      "/clinicians/me/patients/patient-1": patientDetail,
    });
    const { default: ClinicianCheckInDetailPage } = await import("../page");
    render(<ClinicianCheckInDetailPage />);

    expect(await screen.findByText("Sarah Mendez")).toBeInTheDocument();
    expect(screen.getByText("How are you feeling overall?")).toBeInTheDocument();
    expect(screen.getByText("6 / 10")).toBeInTheDocument();
    expect(screen.getByText("What has been most difficult recently?")).toBeInTheDocument();
    expect(screen.getByText("Work or school")).toBeInTheDocument();

    // No interpretive/diagnostic language anywhere on the page.
    for (const phrase of [/high anxiety/i, /likely depression/i, /is improving/i, /is deteriorating/i, /diagnos/i]) {
      expect(screen.queryByText(phrase)).not.toBeInTheDocument();
    }
  });

  it("marks a submitted check-in reviewed, updating the page in place (#clinician can mark reviewed)", async () => {
    mockApi({
      "/auth/me": { roles: ["CLINICIAN"], email: "r@example.test" },
      "/clinicians/me/patients/patient-1/check-ins/checkin-1": checkInDetail,
      "/clinicians/me/patients/patient-1": patientDetail,
      "POST /clinicians/me/patients/patient-1/check-ins/checkin-1/review": { ...checkInDetail, status: "REVIEWED" },
    });
    const { default: ClinicianCheckInDetailPage } = await import("../page");
    render(<ClinicianCheckInDetailPage />);

    const button = await screen.findByRole("button", { name: /mark reviewed/i });
    fireEvent.click(button);

    expect(await screen.findByText("This check-in has been reviewed.")).toBeInTheDocument();
    expect(screen.getByText("Reviewed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /mark reviewed/i })).not.toBeInTheDocument();
  });

  it("shows a server error inline if the review action fails, without losing the check-in view", async () => {
    mockApi({
      "/auth/me": { roles: ["CLINICIAN"], email: "r@example.test" },
      "/clinicians/me/patients/patient-1/check-ins/checkin-1": checkInDetail,
      "/clinicians/me/patients/patient-1": patientDetail,
      "POST /clinicians/me/patients/patient-1/check-ins/checkin-1/review": new ApiError(
        409,
        "This check-in has already been reviewed.",
      ),
    });
    const { default: ClinicianCheckInDetailPage } = await import("../page");
    render(<ClinicianCheckInDetailPage />);

    const button = await screen.findByRole("button", { name: /mark reviewed/i });
    fireEvent.click(button);

    expect(await screen.findByText("This check-in has already been reviewed.")).toBeInTheDocument();
    expect(screen.getByText("Sarah Mendez")).toBeInTheDocument();
  });
});
