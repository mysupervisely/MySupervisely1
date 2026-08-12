import type { CheckIn, CheckInQuestion, CheckInResponse } from "@noor/db";
import type {
  CheckInDetailDTO,
  CheckInQuestionDTO,
  CheckInQuestionOption,
  CheckInResponseDTO,
  CheckInSummaryDTO,
} from "@noor/types";
import { QUESTION_KEYS } from "./question-definitions.js";

export function serializeQuestion(question: CheckInQuestion): CheckInQuestionDTO {
  return {
    key: question.key,
    promptText: question.promptText,
    responseType: question.responseType,
    options: (question.options as CheckInQuestionOption[] | null) ?? null,
    isRequired: question.isRequired,
    displayOrder: question.displayOrder,
  };
}

export function serializeResponse(response: CheckInResponse): CheckInResponseDTO {
  return {
    questionKey: response.questionKeySnapshot,
    questionPrompt: response.questionPromptSnapshot,
    responseType: response.responseTypeSnapshot,
    valueNumeric: response.valueNumeric,
    valueOptionKey: response.valueOptionKey,
    valueOptionLabel: response.valueOptionLabelSnapshot,
    valueText: response.valueText,
  };
}

export function serializeDetail(checkIn: CheckIn, responses: CheckInResponse[]): CheckInDetailDTO {
  return {
    id: checkIn.id,
    status: checkIn.status,
    submittedAt: checkIn.submittedAt ? checkIn.submittedAt.toISOString() : null,
    createdAt: checkIn.createdAt.toISOString(),
    responses: responses.map(serializeResponse),
  };
}

function scaleValue(responses: CheckInResponse[], key: string): number | null {
  return responses.find((r) => r.questionKeySnapshot === key)?.valueNumeric ?? null;
}

/** The brief's history-list shape (§8): just the four scale scores, per
 * submitted check-in — never the free-text or select answers, and never a
 * clinical interpretation of them (§8: "Do not create clinical
 * interpretations... Do not say 'Your depression improved.'"). */
export function serializeSummary(checkIn: CheckIn, responses: CheckInResponse[]): CheckInSummaryDTO {
  return {
    id: checkIn.id,
    status: checkIn.status,
    submittedAt: checkIn.submittedAt ? checkIn.submittedAt.toISOString() : null,
    scores: {
      overallWellbeing: scaleValue(responses, QUESTION_KEYS.OVERALL_WELLBEING),
      mood: scaleValue(responses, QUESTION_KEYS.MOOD),
      stress: scaleValue(responses, QUESTION_KEYS.STRESS),
      sleep: scaleValue(responses, QUESTION_KEYS.SLEEP),
    },
  };
}

/** Maps a check-in's saved responses to the narrow structured input the
 * deterministic safety policy is allowed to see — see
 * packages/safety-policy. Deliberately reads only the four scale
 * questions; there is no code path here that touches free text. */
export function toSafetyInput(responses: CheckInResponse[]) {
  return {
    overallWellbeing: scaleValue(responses, QUESTION_KEYS.OVERALL_WELLBEING),
    mood: scaleValue(responses, QUESTION_KEYS.MOOD),
    stress: scaleValue(responses, QUESTION_KEYS.STRESS),
    sleep: scaleValue(responses, QUESTION_KEYS.SLEEP),
  };
}
