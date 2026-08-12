import { render, screen, waitFor, fireEvent } from "@testing-library/react-native";
import { CheckInScreen } from "../CheckInScreen";
import { apiFetch, ApiError } from "../../../lib/api";
import type { CheckInQuestionDTO, CheckInDetailDTO } from "@noor/types";

const mockNavigate = jest.fn();

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  // useFocusEffect just runs its callback on mount, like a plain effect —
  // sufficient for a screen that isn't inside a real NavigationContainer
  // in this unit test.
  useFocusEffect: (cb: () => void) => require("react").useEffect(cb, [cb]),
}));

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/api");
  return { ...actual, apiFetch: jest.fn() };
});

const mockedApiFetch = apiFetch as jest.Mock;

const QUESTIONS: CheckInQuestionDTO[] = [
  { key: "overall_wellbeing", promptText: "How are you feeling overall?", responseType: "SCALE_1_10", options: null, isRequired: true, displayOrder: 1 },
  { key: "mood", promptText: "How has your mood been?", responseType: "SCALE_1_10", options: null, isRequired: true, displayOrder: 2 },
  {
    key: "main_concern",
    promptText: "What has been most difficult recently?",
    responseType: "SINGLE_SELECT",
    options: [
      { key: "WORK_OR_SCHOOL", label: "Work or school" },
      { key: "SLEEP", label: "Sleep" },
    ],
    isRequired: true,
    displayOrder: 3,
  },
  {
    key: "additional_notes",
    promptText: "Is there anything else you'd like your clinician to know?",
    responseType: "FREE_TEXT",
    options: null,
    isRequired: false,
    displayOrder: 4,
  },
];

function emptyDraft(): CheckInDetailDTO {
  return { id: "checkin-1", status: "DRAFT", submittedAt: null, createdAt: "2026-08-05T00:00:00.000Z", responses: [] };
}

describe("CheckInScreen (native, data-driven — M5)", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows the intro screen with the safety disclaimer for a brand-new check-in (#check-in start)", async () => {
    mockedApiFetch.mockResolvedValueOnce(QUESTIONS).mockResolvedValueOnce(emptyDraft());
    await render(<CheckInScreen />);

    expect(await screen.findByText("Noor Check-In")).toBeTruthy();
    expect(
      screen.getByText("This check-in is not monitored continuously and should not be used for emergencies."),
    ).toBeTruthy();
  });

  it("walks through every question type, saving via PATCH, then reaches review (#draft, #answer)", async () => {
    mockedApiFetch
      .mockResolvedValueOnce(QUESTIONS)
      .mockResolvedValueOnce(emptyDraft())
      .mockResolvedValue({}); // every PATCH call
    await render(<CheckInScreen />);

    await fireEvent.press(await screen.findByText("Begin Check-In"));
    expect(await screen.findByText("Question 1 of 4")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("7"));
    await fireEvent.press(screen.getByText("Continue"));
    await waitFor(() =>
      expect(mockedApiFetch).toHaveBeenCalledWith(
        "/check-ins/checkin-1/responses",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ overall_wellbeing: 7 }) }),
      ),
    );
    expect(await screen.findByText("Question 2 of 4")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("6"));
    await fireEvent.press(screen.getByText("Continue"));
    expect(await screen.findByText("Question 3 of 4")).toBeTruthy();

    await fireEvent.press(screen.getByText("Sleep"));
    await fireEvent.press(screen.getByText("Continue"));
    expect(await screen.findByText("Question 4 of 4")).toBeTruthy();

    await fireEvent.press(screen.getByText("Continue")); // optional free-text left blank
    expect(await screen.findByText("Review your check-in")).toBeTruthy();
    expect(screen.getByText("7/10")).toBeTruthy();
    expect(screen.getByText("Not answered")).toBeTruthy();
  });

  it("resumes an in-progress draft at the first unanswered question (#resume)", async () => {
    mockedApiFetch.mockResolvedValueOnce(QUESTIONS).mockResolvedValueOnce({
      ...emptyDraft(),
      responses: [
        {
          questionKey: "overall_wellbeing",
          questionPrompt: "How are you feeling overall?",
          responseType: "SCALE_1_10",
          valueNumeric: 8,
          valueOptionKey: null,
          valueOptionLabel: null,
          valueText: null,
        },
      ],
    });
    await render(<CheckInScreen />);

    expect(await screen.findByText("Question 2 of 4")).toBeTruthy();
    expect(screen.queryByText("Noor Check-In")).toBeNull();
  });

  it("submits from review with the exact required confirmation copy (#submit)", async () => {
    mockedApiFetch
      .mockResolvedValueOnce(QUESTIONS)
      .mockResolvedValueOnce({
        ...emptyDraft(),
        responses: [
          { questionKey: "overall_wellbeing", questionPrompt: "x", responseType: "SCALE_1_10", valueNumeric: 7, valueOptionKey: null, valueOptionLabel: null, valueText: null },
          { questionKey: "mood", questionPrompt: "x", responseType: "SCALE_1_10", valueNumeric: 6, valueOptionKey: null, valueOptionLabel: null, valueText: null },
          { questionKey: "main_concern", questionPrompt: "x", responseType: "SINGLE_SELECT", valueNumeric: null, valueOptionKey: "SLEEP", valueOptionLabel: "Sleep", valueText: null },
        ],
      })
      .mockResolvedValue({ ...emptyDraft(), status: "SUBMITTED" });
    await render(<CheckInScreen />);

    expect(await screen.findByText("Review your check-in")).toBeTruthy();
    await fireEvent.press(screen.getByText("Submit Check-In"));

    expect(await screen.findByText("Your check-in has been submitted.")).toBeTruthy();
    expect(screen.getByText("Your care team can review your responses.")).toBeTruthy();
    expect(mockedApiFetch).toHaveBeenCalledWith("/check-ins/checkin-1/submit", { method: "POST" });
  });

  it("blocks Continue with no answer on a required question", async () => {
    mockedApiFetch.mockResolvedValueOnce(QUESTIONS).mockResolvedValueOnce(emptyDraft());
    await render(<CheckInScreen />);

    await fireEvent.press(await screen.findByText("Begin Check-In"));
    await screen.findByText("Question 1 of 4");
    await fireEvent.press(screen.getByText("Continue"));

    expect(await screen.findByText("Please answer before continuing.")).toBeTruthy();
  });

  it("shows a generic error state on a load failure, never an internal stack trace", async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(500, "Something went wrong. Please try again."));
    await render(<CheckInScreen />);
    expect(await screen.findByText("Something went wrong. Please try again.")).toBeTruthy();
  });
});
