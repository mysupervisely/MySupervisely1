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

// Home dashboard access (#home dashboard access): every case below is a
// client-side UX convenience — the API is what actually enforces
// authorization (see docs/noor/M1-IMPLEMENTATION.md "Known limitations").
// These tests confirm the page behaves correctly, not that it's the
// security boundary.
describe("HomePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(401, "Authentication required."));
    const { default: HomePage } = await import("../page");
    render(<HomePage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("redirects to /onboarding when onboarding is incomplete", async () => {
    apiFetchMock.mockResolvedValueOnce({ email: "sam@example.test", roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce({
      id: "profile-1",
      firstName: null,
      lastName: null,
      state: null,
      reasonForSeekingCare: null,
      careType: null,
      careFormatPreference: null,
      onboardingCompletedAt: null,
      completionPercent: 0,
    } satisfies PatientProfile);
    const { default: HomePage } = await import("../page");
    render(<HomePage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/onboarding"));
  });

  it("renders the greeting, profile status, and honest future-state placeholders once onboarding is complete", async () => {
    apiFetchMock.mockResolvedValueOnce({ email: "sam@example.test", roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce({
      id: "profile-1",
      firstName: "Sam",
      lastName: "Rivera",
      state: "CA",
      reasonForSeekingCare: "work stress",
      careType: "INDIVIDUAL_THERAPY",
      careFormatPreference: "VIDEO",
      onboardingCompletedAt: "2026-08-05T00:00:00.000Z",
      completionPercent: 100,
    } satisfies PatientProfile);
    const { default: HomePage } = await import("../page");
    render(<HomePage />);

    expect(await screen.findByText(/Sam\./)).toBeInTheDocument();
    expect(screen.getByText("Complete")).toBeInTheDocument();
    expect(screen.getByText("Find a therapist")).toBeInTheDocument();
    expect(screen.getByText("Noor Async")).toBeInTheDocument();
    expect(screen.getByText(/No upcoming appointments yet/)).toBeInTheDocument();
    expect(screen.getByText(/Your first check-in will appear here/)).toBeInTheDocument();
    expect(screen.getByText("No active subscription.")).toBeInTheDocument();
    // Never a fake appointment time, mood score, or similar fabricated
    // clinical/scheduling data (M2 brief: "Do not create fake clinical
    // data").
    expect(screen.queryByText(/\d{1,2}:\d{2}\s?(AM|PM)/i)).not.toBeInTheDocument();
  });

  it("shows a partial-completion badge instead of 'Complete' when the profile isn't fully filled in", async () => {
    apiFetchMock.mockResolvedValueOnce({ email: "sam@example.test", roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce({
      id: "profile-1",
      firstName: "Sam",
      lastName: null,
      state: null,
      reasonForSeekingCare: null,
      careType: null,
      careFormatPreference: null,
      // Onboarding "complete" per the flag, but completionPercent can
      // still be represented honestly if it were ever < 100 for another
      // reason — this test just checks the badge renders the number
      // rather than always claiming "Complete".
      onboardingCompletedAt: "2026-08-05T00:00:00.000Z",
      completionPercent: 40,
    } satisfies PatientProfile);
    const { default: HomePage } = await import("../page");
    render(<HomePage />);
    expect(await screen.findByText("40%")).toBeInTheDocument();
  });
});
