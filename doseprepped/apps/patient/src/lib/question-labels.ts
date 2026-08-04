import type { QuestionCategory, QuestionDisposition, QuestionStatus } from "./questions";

export const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  GENERAL_INFO: "General medication information",
  ADMINISTRATION: "How to take it",
  MISSED_DOSE: "Missed a dose",
  SIDE_EFFECT: "Side effect or reaction",
  DRUG_INTERACTION: "Interaction with another medication",
  STORAGE: "Storage",
  ADHERENCE: "Trouble taking it consistently",
  COST_ACCESS: "Cost or access",
  OTHER: "Something else",
};

export const CATEGORY_ORDER: QuestionCategory[] = [
  "GENERAL_INFO",
  "ADMINISTRATION",
  "MISSED_DOSE",
  "SIDE_EFFECT",
  "DRUG_INTERACTION",
  "STORAGE",
  "ADHERENCE",
  "COST_ACCESS",
  "OTHER",
];

// Only RECEIVED is reachable in M3 Phase 1 (no AI, no pharmacist yet). The
// rest are defined now so later phases don't need a frontend change to
// show a real label the first time a question reaches that status.
export const STATUS_LABELS: Record<QuestionStatus, string> = {
  RECEIVED: "Received",
  AI_PROCESSING: "Being organized",
  AI_ANSWERED: "General info provided",
  PHARMACIST_REQUESTED: "Pharmacist requested",
  PHARMACIST_IN_PROGRESS: "Pharmacist reviewing",
  WAITING_FOR_PATIENT: "Waiting for your reply",
  PHARMACIST_RESOLVED: "Pharmacist responded",
  ESCALATED: "Escalated for care",
  CLOSED: "Closed",
};

// Patient-facing copy for each deterministic disposition (M3 Phase 2). These
// describe routing only — none of them state that a pharmacist or provider
// has already reviewed the question, and none offer diagnosis or treatment
// advice. See docs/doseprepped/ARCHITECTURE.md "Deterministic Safety &
// Disposition Rule Engine".
export const DISPOSITION_MESSAGES: Record<QuestionDisposition, string> = {
  GENERAL_EDUCATION: "We can provide general information about this medication.",
  PHARMACIST_REVIEW: "This question is better reviewed by a pharmacist.",
  PROVIDER_EVALUATION: "This question may require evaluation by your healthcare provider.",
  URGENT_EMERGENCY:
    "This may be a medical emergency. Please call 911 or go to the nearest emergency room now, or contact Poison Control at 1-800-222-1222 if this involves a possible overdose or poisoning.",
};

// Shown beneath any AI-generated content (M3 Phase 3), kept short and
// non-alarming per the requirement that the disclosure not be visually
// overwhelming. Never omitted when AI content is shown.
export const AI_DISCLOSURE =
  "AI-generated general medication information. This is not a diagnosis or personalized medical advice.";

// Shown instead of AI content when the AI provider failed, timed out, or
// returned output that didn't pass validation (M3 Phase 3 "fail safe" —
// see docs/doseprepped/ARCHITECTURE.md "Output validation"). Never a
// fabricated answer; always routes the patient toward the same
// human-resource path the disposition already implies.
export const AI_FALLBACK_MESSAGES: Record<QuestionDisposition, string> = {
  GENERAL_EDUCATION:
    "General information isn't available right now. You can request pharmacist review below.",
  PHARMACIST_REVIEW:
    "General information isn't available right now. A pharmacist can still review your question below.",
  PROVIDER_EVALUATION:
    "General information isn't available right now. Please contact your healthcare provider.",
  URGENT_EMERGENCY: "",
};
