// The canonical Noor Check-In question set — docs/noor/M3-IMPLEMENTATION.md
// §2. This is the ONE place these 7 questions are defined as code; from
// here they're seeded into `check_in_questions` (see
// lib/bootstrap.ts `ensureCheckInQuestionsSeeded`) and everything else —
// validation, the frontend wizard — reads them back out of the database
// via GET /check-ins/questions, never from this file directly. Adding an
// 8th question later means adding a row here (or, eventually, an admin
// UI) and re-running the seed — no route handler or frontend component
// needs to change.
//
// Stable `key` values are also used directly in packages/safety-policy's
// input mapping (see routes/checkins.ts `toSafetyInput`) for the four
// scale questions — do not rename an existing key without updating that
// mapping and considering the effect on historical CheckInResponse rows
// (which snapshot the key at answer time, so old rows are unaffected
// either way — see schema.prisma CheckInResponse comment).

export const QUESTION_KEYS = {
  OVERALL_WELLBEING: "overall_wellbeing",
  MOOD: "mood",
  STRESS: "stress",
  SLEEP: "sleep",
  MAIN_CONCERN: "main_concern",
  DESIRED_SUPPORT: "desired_support",
  ADDITIONAL_NOTES: "additional_notes",
} as const;

export interface QuestionOptionSeed {
  key: string;
  label: string;
}

export interface QuestionSeed {
  key: string;
  promptText: string;
  responseType: "SCALE_1_10" | "SINGLE_SELECT" | "FREE_TEXT";
  options: QuestionOptionSeed[] | null;
  isRequired: boolean;
  displayOrder: number;
}

export const MAIN_CONCERN_OPTIONS: QuestionOptionSeed[] = [
  { key: "WORK_OR_SCHOOL", label: "Work or school" },
  { key: "RELATIONSHIPS", label: "Relationships" },
  { key: "FAMILY", label: "Family" },
  { key: "STRESS_OVERWHELMED", label: "Stress or feeling overwhelmed" },
  { key: "MOOD", label: "Mood" },
  { key: "SLEEP", label: "Sleep" },
  { key: "MOTIVATION", label: "Motivation" },
  { key: "MAJOR_LIFE_CHANGE", label: "Major life change" },
  { key: "SOMETHING_ELSE", label: "Something else" },
  { key: "NOTHING_IN_PARTICULAR", label: "Nothing in particular" },
];

export const DESIRED_SUPPORT_OPTIONS: QuestionOptionSeed[] = [
  { key: "PROCESSING", label: "Processing something" },
  { key: "COPING_WITH_STRESS", label: "Coping with stress" },
  { key: "WORKING_TOWARD_GOAL", label: "Working toward a goal" },
  { key: "PREPARING_FOR_SESSION", label: "Preparing for my next session" },
  { key: "BUILDING_HABITS", label: "Building healthier habits" },
  { key: "NOT_SURE", label: "I'm not sure" },
  { key: "SOMETHING_ELSE", label: "Something else" },
];

export const CHECK_IN_QUESTION_SEEDS: QuestionSeed[] = [
  {
    key: QUESTION_KEYS.OVERALL_WELLBEING,
    promptText: "How are you feeling overall?",
    responseType: "SCALE_1_10",
    options: null,
    isRequired: true,
    displayOrder: 1,
  },
  {
    key: QUESTION_KEYS.MOOD,
    promptText: "How has your mood been?",
    responseType: "SCALE_1_10",
    options: null,
    isRequired: true,
    displayOrder: 2,
  },
  {
    key: QUESTION_KEYS.STRESS,
    promptText: "How has your stress level been?",
    responseType: "SCALE_1_10",
    options: null,
    isRequired: true,
    displayOrder: 3,
  },
  {
    key: QUESTION_KEYS.SLEEP,
    promptText: "How has your sleep been?",
    responseType: "SCALE_1_10",
    options: null,
    isRequired: true,
    displayOrder: 4,
  },
  {
    key: QUESTION_KEYS.MAIN_CONCERN,
    promptText: "What has been most difficult recently?",
    responseType: "SINGLE_SELECT",
    options: MAIN_CONCERN_OPTIONS,
    isRequired: true,
    displayOrder: 5,
  },
  {
    key: QUESTION_KEYS.DESIRED_SUPPORT,
    promptText: "What would you like support with?",
    responseType: "SINGLE_SELECT",
    options: DESIRED_SUPPORT_OPTIONS,
    isRequired: true,
    displayOrder: 6,
  },
  {
    key: QUESTION_KEYS.ADDITIONAL_NOTES,
    promptText: "Is there anything else you'd like your clinician to know?",
    responseType: "FREE_TEXT",
    options: null,
    isRequired: false,
    displayOrder: 7,
  },
];
