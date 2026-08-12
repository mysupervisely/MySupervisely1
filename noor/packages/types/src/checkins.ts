import { z } from "zod";

/**
 * Shared check-in types — docs/noor/M3-IMPLEMENTATION.md. Unlike
 * onboarding's fixed CARE_TYPES/CARE_FORMATS constants, check-in question
 * *content* is intentionally NOT hardcoded here: questions live in
 * `CheckInQuestion` rows (packages/db) and are fetched at runtime via
 * `GET /check-ins/questions`, so a new/reworded/retired question is a data
 * change, never a frontend or shared-types code change (brief §3:
 * "Questions should be data-driven rather than hard-coded into frontend
 * components"). What IS shared here is just the wire-format shape: how an
 * answer is submitted, and how a question/response comes back over the
 * API — plus the one loose validation rule (a scale answer is an integer
 * 1-10) that's true regardless of which specific questions exist.
 */

export type CheckInResponseType = "SCALE_1_10" | "SINGLE_SELECT" | "FREE_TEXT";
export type CheckInStatus = "DRAFT" | "SUBMITTED" | "REVIEWED" | "ARCHIVED";

export interface CheckInQuestionOption {
  key: string;
  label: string;
}

/** What GET /check-ins/questions returns — the live, active question set,
 * ordered for display. This is the entire contract the onboarding wizard
 * needs to render every question generically. */
export interface CheckInQuestionDTO {
  key: string;
  promptText: string;
  responseType: CheckInResponseType;
  options: CheckInQuestionOption[] | null;
  isRequired: boolean;
  displayOrder: number;
}

/** One answer as returned in a check-in detail response — always the
 * *snapshot* fields (see packages/db schema.prisma CheckInResponse), never
 * a live join back to the current question wording. */
export interface CheckInResponseDTO {
  questionKey: string;
  questionPrompt: string;
  responseType: CheckInResponseType;
  valueNumeric: number | null;
  valueOptionKey: string | null;
  valueOptionLabel: string | null;
  valueText: string | null;
}

/** The lightweight shape used in history lists (brief §8's "August 12:
 * Wellbeing 7/10, Mood 6/10..." example) — just the four scale scores,
 * not the full response set. */
export interface CheckInSummaryDTO {
  id: string;
  status: CheckInStatus;
  submittedAt: string | null;
  scores: {
    overallWellbeing: number | null;
    mood: number | null;
    stress: number | null;
    sleep: number | null;
  };
}

export interface CheckInDetailDTO {
  id: string;
  status: CheckInStatus;
  submittedAt: string | null;
  createdAt: string;
  responses: CheckInResponseDTO[];
}

/** A single answer value: an integer 1-10 for scale questions, or a
 * string for select/free-text questions (an option key, or free text).
 * Server-side, packages/api validates the specific value against the
 * *live* CheckInQuestion definition (correct responseType, option key
 * actually exists, etc.) — this schema only enforces the wire shape. */
export const checkInAnswerValueSchema = z.union([z.number().int().min(1).max(10), z.string().max(2000)]);

/** PATCH /check-ins/:id/responses body: a map of question key -> answer.
 * Every key is optional (a patient may save one question at a time or
 * several at once, same incremental-save pattern as onboarding). */
export const checkInAnswersSchema = z.record(z.string().min(1), checkInAnswerValueSchema);

export type CheckInAnswers = z.infer<typeof checkInAnswersSchema>;
