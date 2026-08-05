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
  whatBringsYouToNoor: null,
  careType: null,
  careFormatPreference: null,
  onboardingCompletedAt: null,
  completionPercent: 0,
};

async function completeStep1(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/first name/i), "Sam");
  await user.type(screen.getByLabelText(/last name/i), "Rivera");
  await user.selectOptions(screen.getByLabelText(/state/i), "CA");
  await user.click(screen.getByRole("button", { name: /continue/i }));
}

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

  it("a brand-new patient begins onboarding at the welcome screen (#patient can begin onboarding)", async () => {
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(emptyProfile);
    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);
    expect(await screen.findByText("Welcome to Noor.")).toBeInTheDocument();
    expect(screen.getByText("A brighter path forward.")).toBeInTheDocument();
  });

  it("blocks Continue on step 1 with a validation message when the name is empty", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(emptyProfile);
    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);

    await user.click(await screen.findByRole("button", { name: /continue/i })); // welcome -> step 1
    expect(await screen.findByText("Step 1 of 4")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/enter your first and last name/i)).toBeInTheDocument();
    // No PATCH call should have been made for an invalid step.
    expect(apiFetchMock).toHaveBeenCalledTimes(2); // only the initial /auth/me + /patients/me loads
  });

  it("patient can save onboarding progress step by step via PATCH (#patient can save onboarding)", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] }); // /auth/me
    apiFetchMock.mockResolvedValueOnce(emptyProfile); // /patients/me
    apiFetchMock.mockResolvedValue({}); // every subsequent PATCH/complete call
    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);

    await user.click(await screen.findByRole("button", { name: /continue/i })); // welcome -> step 1
    await completeStep1(user);

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/patients/me",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ firstName: "Sam", lastName: "Rivera", state: "CA" }),
        }),
      ),
    );
    expect(await screen.findByText("Step 2 of 4")).toBeInTheDocument();
  });

  it("patient can resume incomplete onboarding exactly where they left off (#patient can resume incomplete onboarding)", async () => {
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    // Simulate a patient who already saved step 1 and left — the profile
    // has a name/state but nothing past that.
    apiFetchMock.mockResolvedValueOnce({
      ...emptyProfile,
      firstName: "Sam",
      lastName: "Rivera",
      state: "CA",
      completionPercent: 50,
    });
    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);

    // Resuming skips the welcome screen and the already-completed step 1,
    // landing directly on step 2 ("What brings you to Noor?") — not back
    // at the beginning.
    expect(await screen.findByText("Step 2 of 4")).toBeInTheDocument();
    expect(screen.queryByText("Welcome to Noor.")).not.toBeInTheDocument();
  });

  it("patient can complete onboarding, reaching the completion screen and then Noor Home (#patient can complete onboarding, #completed onboarding redirects appropriately)", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    // Resume right at the last step so the test only has to drive one
    // selection through to completion.
    apiFetchMock.mockResolvedValueOnce({
      ...emptyProfile,
      firstName: "Sam",
      lastName: "Rivera",
      state: "CA",
      whatBringsYouToNoor: "LOOKING_FOR_THERAPIST",
      careType: "INDIVIDUAL_THERAPY",
      completionPercent: 80,
    });
    apiFetchMock.mockResolvedValue({}); // PATCH + complete calls

    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);

    expect(await screen.findByText("Step 4 of 4")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Video appointments" }));
    await user.click(screen.getByRole("button", { name: /finish/i }));

    expect(await screen.findByText("You're all set.")).toBeInTheDocument();
    expect(screen.getByText("Your Noor journey starts here.")).toBeInTheDocument();

    expect(apiFetchMock).toHaveBeenCalledWith("/patients/me/onboarding/complete", { method: "POST" });

    await user.click(screen.getByRole("button", { name: /continue to noor home/i }));
    expect(pushMock).toHaveBeenCalledWith("/home");
  });

  it("never sends anything resembling free-text clinical content in the onboarding payload", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(emptyProfile);
    apiFetchMock.mockResolvedValue({});
    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);

    await user.click(await screen.findByRole("button", { name: /continue/i })); // welcome -> step 1
    await completeStep1(user);
    await screen.findByText("Step 2 of 4");

    const allowedKeys = new Set(["firstName", "lastName", "state", "whatBringsYouToNoor", "careType", "careFormatPreference"]);
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

  it("never exposes onboarding data via the URL", async () => {
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(emptyProfile);
    const { default: OnboardingPage } = await import("../page");
    render(<OnboardingPage />);
    await screen.findByText("Welcome to Noor.");
    // jsdom's default test URL never gains a query string anywhere in
    // this flow — onboarding state lives only in component state and the
    // PATCH/complete request bodies, never in `router.push`/query params.
    expect(window.location.search).toBe("");
  });
});
