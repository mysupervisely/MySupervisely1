import { render, screen, waitFor } from "@testing-library/react-native";
import { CheckInHistoryScreen } from "../CheckInHistoryScreen";
import { apiFetch } from "../../../lib/api";
import type { CheckInSummaryDTO } from "@noor/types";

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useFocusEffect: (cb: () => void) => require("react").useEffect(cb, [cb]),
}));

jest.mock("../../../lib/api", () => {
  const actual = jest.requireActual("../../../lib/api");
  return { ...actual, apiFetch: jest.fn() };
});

const mockedApiFetch = apiFetch as jest.Mock;

describe("CheckInHistoryScreen (#history, #reviewed state)", () => {
  afterEach(() => jest.clearAllMocks());

  it("shows an honest empty state with no history", async () => {
    mockedApiFetch.mockResolvedValueOnce([]);
    await render(<CheckInHistoryScreen />);
    expect(await screen.findByText("You haven't submitted a check-in yet.")).toBeTruthy();
  });

  it("shows a Reviewed badge only on a REVIEWED check-in, not a merely SUBMITTED one (#reviewed state)", async () => {
    const items: CheckInSummaryDTO[] = [
      { id: "c1", status: "SUBMITTED", submittedAt: "2026-08-11T00:00:00.000Z", scores: { overallWellbeing: 6, mood: 5, stress: 7, sleep: 4 } },
      { id: "c2", status: "REVIEWED", submittedAt: "2026-08-01T00:00:00.000Z", scores: { overallWellbeing: 8, mood: 7, stress: 3, sleep: 8 } },
    ];
    mockedApiFetch.mockResolvedValueOnce(items);
    await render(<CheckInHistoryScreen />);

    await waitFor(() => expect(screen.getByText("Reviewed")).toBeTruthy());
    // Only one Reviewed badge for two rows.
    expect(screen.getAllByText("Reviewed")).toHaveLength(1);

    // No clinical interpretation anywhere.
    expect(screen.queryByText(/improved/i)).toBeNull();
    expect(screen.queryByText(/diagnos/i)).toBeNull();
  });
});
