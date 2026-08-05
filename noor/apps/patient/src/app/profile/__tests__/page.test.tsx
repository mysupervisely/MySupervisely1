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

const completedProfile: PatientProfile = {
  id: "profile-1",
  firstName: "Sam",
  lastName: "Rivera",
  state: "CA",
  reasonForSeekingCare: "work stress",
  careType: "INDIVIDUAL_THERAPY",
  careFormatPreference: "VIDEO",
  onboardingCompletedAt: "2026-08-05T00:00:00.000Z",
  completionPercent: 100,
};

describe("ProfilePage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(401, "Authentication required."));
    const { default: ProfilePage } = await import("../page");
    render(<ProfilePage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("redirects to /onboarding if onboarding has not been completed yet", async () => {
    apiFetchMock.mockResolvedValueOnce({ ...completedProfile, onboardingCompletedAt: null });
    const { default: ProfilePage } = await import("../page");
    render(<ProfilePage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/onboarding"));
  });

  it("pre-fills the form from the existing profile and saves an edit via PATCH", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce(completedProfile);
    apiFetchMock.mockResolvedValueOnce({ ...completedProfile, firstName: "Samuel" });

    const { default: ProfilePage } = await import("../page");
    render(<ProfilePage />);

    const firstNameInput = (await screen.findByLabelText(/first name/i)) as HTMLInputElement;
    expect(firstNameInput.value).toBe("Sam");

    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Samuel");
    await user.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenLastCalledWith(
        "/patients/me",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });
});
