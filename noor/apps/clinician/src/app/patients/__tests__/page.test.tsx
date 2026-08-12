import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../../../lib/api";
import type { ClinicianPatientListItemDTO } from "@noor/types";

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

const patient: ClinicianPatientListItemDTO = {
  careRelationshipId: "rel-1",
  patientId: "patient-1",
  relationshipType: "THERAPY",
  relationshipStatus: "ACTIVE",
  startedAt: "2026-01-01T00:00:00.000Z",
  firstName: "Sarah",
  lastName: "Mendez",
};

describe("ClinicianPatientsPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    mockApi({ "/auth/me": new ApiError(401, "Authentication required.") });
    const { default: ClinicianPatientsPage } = await import("../page");
    render(<ClinicianPatientsPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("shows only patients from an active care relationship, never a global patient search (#clinician can see active assigned patient)", async () => {
    mockApi({
      "/auth/me": { roles: ["CLINICIAN"], email: "r@example.test" },
      "/clinicians/me/patients": [patient],
    });
    const { default: ClinicianPatientsPage } = await import("../page");
    render(<ClinicianPatientsPage />);

    expect(await screen.findByText("Sarah Mendez")).toBeInTheDocument();
    expect(screen.getByText(/active care relationship/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view/i })).toHaveAttribute("href", "/patients/patient-1");

    // No search box / filter-the-whole-database affordance anywhere.
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows an honest empty state when no patients are assigned", async () => {
    mockApi({ "/auth/me": { roles: ["CLINICIAN"], email: "r@example.test" }, "/clinicians/me/patients": [] });
    const { default: ClinicianPatientsPage } = await import("../page");
    render(<ClinicianPatientsPage />);
    expect(await screen.findByText(/no patients are currently assigned/i)).toBeInTheDocument();
  });
});
