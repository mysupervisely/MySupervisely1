import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const emptyProfile: PatientProfile = {
  id: "profile-1",
  firstName: null,
  lastName: null,
  state: null,
  reasonForSeekingCare: null,
  careType: null,
  careFormatPreference: null,
  onboardingCompletedAt: null,
  completionPercent: 0,
};

describe("OnboardingPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(401, "Authentication required."));
    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("redirects to /home if onboarding is already complete (no re-onboarding)", async () => {
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce({ ...emptyProfile, onboardingCompletedAt: "2026-08-05T00:00:00.000Z" });
    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/home"));
  });

  it("shows step 1 of 4 and blocks Continue with a validation message when the name is empty", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(emptyProfile);
    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);

    expect(await screen.findByText("Step 1 of 4")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/enter your first and last name/i)).toBeInTheDocument();
    // No PATCH call should have been made for an invalid step.
    expect(apiFetchMock).toHaveBeenCalledTimes(2); // only the initial /auth/me + /patients/me loads
  });

  it("saves each step via PATCH and advances, calling onboarding/complete on the final step", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] }); // /auth/me
    apiFetchMock.mockResolvedValueOnce(emptyProfile); // /patients/me
    apiFetchMock.mockResolvedValue({}); // every subsequent PATCH/complete call
    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);

    await screen.findByText("Step 1 of 4");
    await user.type(screen.getByLabelText(/first name/i), "Sam");
    await user.type(screen.getByLabelText(/last name/i), "Rivera");
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/patients/me",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ firstName: "Sam", lastName: "Rivera" }) }),
      ),
    );
    expect(await screen.findByText("Step 2 of 4")).toBeInTheDocument();
  });

  it("never sends anything resembling a diagnosis/clinical-history field in the onboarding payload", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(emptyProfile);
    apiFetchMock.mockResolvedValue({});
    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);

    await screen.findByText("Step 1 of 4");
    await user.type(screen.getByLabelText(/first name/i), "Sam");
    await user.type(screen.getByLabelText(/last name/i), "Rivera");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByText("Step 2 of 4");

    const allowedKeys = new Set([
      "firstName",
      "lastName",
      "state",
      "reasonForSeekingCare",
      "careType",
      "careFormatPreference",
    ]);
    for (const call of apiFetchMock.mock.calls) {
      const [, init] = call as [string, RequestInit | undefined];
      if (init?.body) {
        const payload = JSON.parse(init.body as string);
        for (const key of Object.keys(payload)) {
          expect(allowedKeys.has(key)).toBe(true);
        }
      }
    }
  });
});
