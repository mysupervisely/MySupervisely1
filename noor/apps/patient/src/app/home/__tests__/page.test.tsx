import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ApiError } from "../../../lib/api";
import type { PatientProfile } from "../../../lib/profile";

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

const completedProfile: PatientProfile = {
  id: "profile-1",
  firstName: "Sam",
  lastName: "Rivera",
  state: "CA",
  whatBringsYouToNoor: "LOOKING_FOR_THERAPIST",
  careType: "INDIVIDUAL_THERAPY",
  careFormatPreference: "VIDEO",
  onboardingCompletedAt: "2026-08-05T00:00:00.000Z",
  completionPercent: 100,
};

// Home dashboard access (#home dashboard access): every case below is a
// client-side UX convenience — the API is what actually enforces
// authorization (see docs/noor/M1-IMPLEMENTATION.md "Known limitations").
// These tests confirm the page behaves correctly, not that it's the
// security boundary.
describe("HomePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated (#unauthenticated user cannot access Home)", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(401, "Authentication required."));
    const { default: HomePage } = await import("../page");
    render(<HomePage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("redirects to /onboarding when onboarding is incomplete", async () => {
    apiFetchMock.mockResolvedValueOnce({ email: "sam@example.test", roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce({
      ...completedProfile,
      whatBringsYouToNoor: null,
      careType: null,
      careFormatPreference: null,
      onboardingCompletedAt: null,
      completionPercent: 0,
    } satisfies PatientProfile);
    const { default: HomePage } = await import("../page");
    render(<HomePage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/onboarding"));
  });

  it("authenticated patient with completed onboarding can access Home (#authenticated patient can access Home)", async () => {
    apiFetchMock.mockResolvedValueOnce({ email: "sam@example.test", roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(completedProfile);
    const { default: HomePage } = await import("../page");
    render(<HomePage />);
    expect(await screen.findByText(/Sam\./)).toBeInTheDocument();
  });

  it("renders the greeting, tagline, and honest future-state sections — no Async product branding, no fabricated data", async () => {
    apiFetchMock.mockResolvedValueOnce({ email: "sam@example.test", roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(completedProfile);
    const { default: HomePage } = await import("../page");
    render(<HomePage />);

    expect(await screen.findByText(/Sam\./)).toBeInTheDocument();
    expect(screen.getByText("A brighter path forward.")).toBeInTheDocument();
    expect(screen.getByText("No provider yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Find a Therapist" })).toBeInTheDocument();
    expect(screen.getByText(/No upcoming appointments yet/)).toBeInTheDocument();
    expect(screen.getByText("Your care continues between sessions.")).toBeInTheDocument();
    expect(screen.getByText("Therapy")).toBeInTheDocument();
    expect(screen.getByText("Psychiatry")).toBeInTheDocument();
    expect(screen.getByText("Resources")).toBeInTheDocument();

    // Product direction: no standalone Async product is named/priced here
    // (docs/noor/M2-IMPLEMENTATION.md "Product direction: Async").
    expect(screen.queryByText(/Noor Async/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\$\d/)).not.toBeInTheDocument();

    // Never a fake appointment time, mood score, or similar fabricated
    // clinical/scheduling data.
    expect(screen.queryByText(/\d{1,2}:\d{2}\s?(AM|PM)/i)).not.toBeInTheDocument();
  });

  it("shows a partial-completion prompt when the profile isn't fully filled in", async () => {
    apiFetchMock.mockResolvedValueOnce({ email: "sam@example.test", roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce({ ...completedProfile, completionPercent: 40 });
    const { default: HomePage } = await import("../page");
    render(<HomePage />);
    expect(await screen.findByText(/A few profile details are still missing/)).toBeInTheDocument();
  });
});
