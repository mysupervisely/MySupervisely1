import { render, screen, fireEvent } from "@testing-library/react-native";
import { HomeScreen } from "../HomeScreen";
import { apiFetch } from "../../../lib/api";
import type { PatientProfileDTO } from "@noor/types";

const mockNavigate = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (cb: () => void) => require("react").useEffect(cb, [cb]),
}));

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/api");
  return { ...actual, apiFetch: jest.fn() };
});

jest.mock("../../../lib/AuthContext", () => ({
  useAuth: () => ({ me: { id: "u1", email: "sam@example.test", roles: ["PATIENT"], patientId: "p1", clinicianId: null, displayName: null } }),
}));

const mockedApiFetch = apiFetch as jest.Mock;

const completedProfile: PatientProfileDTO = {
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

describe("HomeScreen (#authenticated access, #appropriate state rendering)", () => {
  afterEach(() => jest.clearAllMocks());

  it("renders the personalized greeting and honest empty/future states, no fake data", async () => {
    mockedApiFetch.mockResolvedValue(completedProfile);
    await render(<HomeScreen />);

    expect(await screen.findByText(/Sam\./)).toBeTruthy();
    expect(screen.getByText("No provider yet")).toBeTruthy();
    expect(screen.getByText("How are things going?")).toBeTruthy();
    expect(screen.getByText("Coming soon")).toBeTruthy();

    // Never a fabricated appointment time.
    expect(screen.queryByText(/\d{1,2}:\d{2}\s?(AM|PM)/i)).toBeNull();
  });

  it("Begin Check-In navigates into the Check-In tab's wizard screen", async () => {
    mockedApiFetch.mockResolvedValue(completedProfile);
    await render(<HomeScreen />);
    await fireEvent.press(await screen.findByText("Begin Check-In"));
    expect(mockNavigate).toHaveBeenCalledWith("CheckInTab", { screen: "CheckIn" });
  });
});
