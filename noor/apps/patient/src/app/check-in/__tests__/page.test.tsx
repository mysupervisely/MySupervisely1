import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ApiError } from "../../../lib/api";
import type { CheckInDetailDTO, CheckInQuestionDTO } from "@noor/types";

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

// A trimmed-down question set (2 scale + 1 select + 1 optional free-text)
// so tests exercise every response type without hardcoding all 7 real
// questions — the page itself is fully data-driven, so this stand-in set
// alone proves it renders whatever GET /check-ins/questions returns.
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

describe("CheckInPage", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /login when unauthenticated", async () => {
    apiFetchMock.mockRejectedValueOnce(new ApiError(401, "Authentication required."));
    const { default: CheckInPage } = await import("../page");
    render(<CheckInPage />);
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });

  it("a brand-new patient sees the calm intro screen with the safety disclaimer (#patient can begin a check-in)", async () => {
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] }); // /auth/me
    apiFetchMock.mockResolvedValueOnce(QUESTIONS); // GET /check-ins/questions
    apiFetchMock.mockResolvedValueOnce(emptyDraft()); // POST /check-ins
    const { default: CheckInPage } = await import("../page");
    render(<CheckInPage />);

    expect(await screen.findByText("Noor Check-In")).toBeInTheDocument();
    expect(
      screen.getByText("This check-in is not monitored continuously and should not be used for emergencies."),
    ).toBeInTheDocument();
  });

  it("walks through every question type, saving each answer via PATCH, then reaches review (#patient can answer questions, #check-in progress indicator)", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(QUESTIONS);
    apiFetchMock.mockResolvedValueOnce(emptyDraft());
    apiFetchMock.mockResolvedValue({}); // every PATCH call
    const { default: CheckInPage } = await import("../page");
    render(<CheckInPage />);

    await user.click(await screen.findByRole("button", { name: /begin check-in/i }));
    expect(await screen.findByText("Question 1 of 4")).toBeInTheDocument();

    // Scale question: pick "7".
    await user.click(screen.getByRole("radio", { name: "7" }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith(
        "/check-ins/checkin-1/responses",
        expect.objectContaining({ method: "PATCH", body: JSON.stringify({ overall_wellbeing: 7 }) }),
      ),
    );
    expect(await screen.findByText("Question 2 of 4")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "6" }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText("Question 3 of 4")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Sleep" }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText("Question 4 of 4")).toBeInTheDocument();

    // Optional free-text question: leave blank and continue anyway.
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText("Review your check-in")).toBeInTheDocument();
    expect(screen.getByText("7/10")).toBeInTheDocument();
    expect(screen.getByText("Sleep")).toBeInTheDocument();
    expect(screen.getByText("Not answered")).toBeInTheDocument();
  });

  it("blocks Continue on a required question with no answer (#required question validation)", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(QUESTIONS);
    apiFetchMock.mockResolvedValueOnce(emptyDraft());
    const { default: CheckInPage } = await import("../page");
    render(<CheckInPage />);

    await user.click(await screen.findByRole("button", { name: /begin check-in/i }));
    await screen.findByText("Question 1 of 4");
    await user.click(screen.getByRole("button", { name: /continue/i }));
    expect(await screen.findByText(/please answer before continuing/i)).toBeInTheDocument();
    // Only the initial 3 loads happened — no PATCH for an unanswered required question.
    expect(apiFetchMock).toHaveBeenCalledTimes(3);
  });

  it("Back navigates to the previous question without losing forward progress", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(QUESTIONS);
    apiFetchMock.mockResolvedValueOnce(emptyDraft());
    apiFetchMock.mockResolvedValue({});
    const { default: CheckInPage } = await import("../page");
    render(<CheckInPage />);

    await user.click(await screen.findByRole("button", { name: /begin check-in/i }));
    await screen.findByText("Question 1 of 4");
    await user.click(screen.getByRole("radio", { name: "7" }));
    await user.click(screen.getByRole("button", { name: /continue/i }));
    await screen.findByText("Question 2 of 4");

    await user.click(screen.getByRole("button", { name: /back/i }));
    expect(await screen.findByText("Question 1 of 4")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "7" })).toBeChecked();
  });

  it("resumes an in-progress draft at the first unanswered question (#resume draft)", async () => {
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(QUESTIONS);
    apiFetchMock.mockResolvedValueOnce({
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
    const { default: CheckInPage } = await import("../page");
    render(<CheckInPage />);

    // Skips both the intro screen and question 1 (already answered),
    // landing on question 2.
    expect(await screen.findByText("Question 2 of 4")).toBeInTheDocument();
    expect(screen.queryByText("Noor Check-In")).not.toBeInTheDocument();
  });

  it("submits from the review screen with the exact required confirmation copy, and no promised response time (#submit check-in)", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(QUESTIONS);
    apiFetchMock.mockResolvedValueOnce({
      ...emptyDraft(),
      responses: [
        { questionKey: "overall_wellbeing", questionPrompt: "x", responseType: "SCALE_1_10", valueNumeric: 7, valueOptionKey: null, valueOptionLabel: null, valueText: null },
        { questionKey: "mood", questionPrompt: "x", responseType: "SCALE_1_10", valueNumeric: 6, valueOptionKey: null, valueOptionLabel: null, valueText: null },
        { questionKey: "main_concern", questionPrompt: "x", responseType: "SINGLE_SELECT", valueNumeric: null, valueOptionKey: "SLEEP", valueOptionLabel: "Sleep", valueText: null },
      ],
    });
    apiFetchMock.mockResolvedValue({ ...emptyDraft(), status: "SUBMITTED", submittedAt: "2026-08-05T12:00:00.000Z" });
    const { default: CheckInPage } = await import("../page");
    render(<CheckInPage />);

    expect(await screen.findByText("Review your check-in")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /submit check-in/i }));

    expect(await screen.findByText("Your check-in has been submitted.")).toBeInTheDocument();
    expect(screen.getByText("Your care team can review your responses.")).toBeInTheDocument();
    expect(
      screen.getByText("This check-in is not monitored continuously and should not be used for emergencies."),
    ).toBeInTheDocument();

    // No promised response time, no "your clinician will respond", no
    // emergency-monitoring implication anywhere on the confirmation screen.
    expect(screen.queryByText(/within \d+ (hour|day)/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/will respond/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/monitored 24/i)).not.toBeInTheDocument();

    expect(apiFetchMock).toHaveBeenCalledWith("/check-ins/checkin-1/submit", { method: "POST" });
  });

  it("shows a server validation error on the review screen without leaving review (#incomplete submission rejected)", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(QUESTIONS);
    apiFetchMock.mockResolvedValueOnce({
      ...emptyDraft(),
      responses: [
        { questionKey: "overall_wellbeing", questionPrompt: "x", responseType: "SCALE_1_10", valueNumeric: 7, valueOptionKey: null, valueOptionLabel: null, valueText: null },
        { questionKey: "mood", questionPrompt: "x", responseType: "SCALE_1_10", valueNumeric: 6, valueOptionKey: null, valueOptionLabel: null, valueText: null },
        { questionKey: "main_concern", questionPrompt: "x", responseType: "SINGLE_SELECT", valueNumeric: null, valueOptionKey: "SLEEP", valueOptionLabel: "Sleep", valueText: null },
      ],
    });
    apiFetchMock.mockRejectedValueOnce(new ApiError(400, "This check-in is incomplete. Missing: main_concern."));
    const { default: CheckInPage } = await import("../page");
    render(<CheckInPage />);

    await screen.findByText("Review your check-in");
    await user.click(screen.getByRole("button", { name: /submit check-in/i }));
    expect(await screen.findByText(/this check-in is incomplete/i)).toBeInTheDocument();
    expect(screen.getByText("Review your check-in")).toBeInTheDocument();
  });

  it("never sends anything other than the question's own key in a PATCH payload (no client-controlled extra fields)", async () => {
    const user = userEvent.setup();
    apiFetchMock.mockResolvedValueOnce({ roles: ["PATIENT"] });
    apiFetchMock.mockResolvedValueOnce(QUESTIONS);
    apiFetchMock.mockResolvedValueOnce(emptyDraft());
    apiFetchMock.mockResolvedValue({});
    const { default: CheckInPage } = await import("../page");
    render(<CheckInPage />);

    await user.click(await screen.findByRole("button", { name: /begin check-in/i }));
    await screen.findByText("Question 1 of 4");
    await user.click(screen.getByRole("radio", { name: "7" }));
    await user.click(screen.getByRole("button", { name: /continue/i }));

    const allowedKeys = new Set(QUESTIONS.map((q) => q.key));
    for (const call of apiFetchMock.mock.calls) {
      const [, init] = call as [string, RequestInit | undefined];
      if (init?.body) {
        const payload = JSON.parse(init.body as string) as Record<string, unknown>;
        for (const key of Object.keys(payload)) {
          expect(allowedKeys.has(key)).toBe(true);
        }
      }
    }
  });
});
