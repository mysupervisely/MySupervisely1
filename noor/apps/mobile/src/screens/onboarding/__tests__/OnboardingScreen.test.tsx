import { render, screen, fireEvent, waitFor } from "@testing-library/react-native";
import { OnboardingScreen } from "../OnboardingScreen";
import { apiFetch } from "../../../lib/api";
import type { PatientProfileDTO } from "@noor/types";

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/api");
  return { ...actual, apiFetch: jest.fn() };
});

jest.mock("../../../lib/AuthContext", () => ({
  useAuth: () => ({ refreshMe: jest.fn().mockResolvedValue(undefined) }),
}));

const mockedApiFetch = apiFetch as jest.Mock;

const emptyProfile: PatientProfileDTO = {
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

describe("OnboardingScreen (native — #new patient, #resume, #completion)", () => {
  afterEach(() => jest.clearAllMocks());

  it("a brand-new patient begins at the welcome screen (#new patient)", async () => {
    mockedApiFetch.mockResolvedValueOnce(emptyProfile);
    await render(<OnboardingScreen />);
    expect(await screen.findByText("Welcome to Noor.")).toBeTruthy();
  });

  it("resumes exactly where a patient left off, on any client, since the backend is the source of truth (#resume)", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      ...emptyProfile,
      firstName: "Sam",
      lastName: "Rivera",
      state: "CA",
      completionPercent: 50,
    });
    await render(<OnboardingScreen />);

    expect(await screen.findByText("Step 2 of 4")).toBeTruthy();
    expect(screen.queryByText("Welcome to Noor.")).toBeNull();
  });

  it("saves step 1 via PATCH and advances to step 2", async () => {
    mockedApiFetch.mockResolvedValueOnce(emptyProfile).mockResolvedValue({});
    await render(<OnboardingScreen />);

    await fireEvent.press(await screen.findByText("Continue")); // welcome -> step 1
    await screen.findByText("Step 1 of 4");
    await fireEvent.changeText(screen.getByLabelText("First name"), "Sam");
    await fireEvent.changeText(screen.getByLabelText("Last name"), "Rivera");
    await fireEvent(screen.getByLabelText("State"), "valueChange", "CA");
    await fireEvent.press(screen.getByText("Continue"));

    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/patients/me",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ firstName: "Sam", lastName: "Rivera", state: "CA" }) }),
      ),
    );
  });

  it("reaches the completion screen after the last step (#completion)", async () => {
    mockedApiFetch
      .mockResolvedValueOnce({
        ...emptyProfile,
        firstName: "Sam",
        lastName: "Rivera",
        state: "CA",
        whatBringsYouToNoor: "LOOKING_FOR_THERAPIST",
        careType: "INDIVIDUAL_THERAPY",
        completionPercent: 80,
      })
      .mockResolvedValue({});
    await render(<OnboardingScreen />);

    expect(await screen.findByText("Step 4 of 4")).toBeTruthy();
    await fireEvent.press(screen.getByText("Video appointments"));
    await fireEvent.press(screen.getByText("Finish"));

    expect(await screen.findByText("You're all set.")).toBeTruthy();
    expect(mockedApiFetch).toHaveBeenCalledWith("/patients/me/onboarding/complete", { method: "POST" });
  });
});
