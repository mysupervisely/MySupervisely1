// Local, framework-agnostic unions — deliberately not imported from
// @doseprepped/db, mirroring packages/safety-rules's zero-dependency
// pattern. Structurally compatible with the Prisma-generated enums.

export type QuestionCategory =
  | "GENERAL_INFO"
  | "ADMINISTRATION"
  | "MISSED_DOSE"
  | "SIDE_EFFECT"
  | "DRUG_INTERACTION"
  | "STORAGE"
  | "ADHERENCE"
  | "COST_ACCESS"
  | "OTHER";

export type QuestionDisposition =
  | "GENERAL_EDUCATION"
  | "PHARMACIST_REVIEW"
  | "PROVIDER_EVALUATION"
  | "URGENT_EMERGENCY";

export interface MedicationSnapshot {
  name: string;
  strength: string;
  directions: string;
  frequency: string;
  route: string;
}

export interface OtherMedicationSnapshot {
  name: string;
  strength: string;
}

/**
 * What the provider is given. Deliberately minimal — no patient identity,
 * no full medication list, no other questions. `disposition` is read-only
 * context: the provider's output has no field that could change it (see
 * MedicationEducationOutput below and docs/doseprepped/ARCHITECTURE.md
 * "Disposition is read-only input, never AI-writable output").
 */
export interface MedicationEducationInput {
  medicationSnapshot: MedicationSnapshot;
  otherMedicationsSnapshot: OtherMedicationSnapshot[] | null;
  category: QuestionCategory;
  questionText: string;
  disposition: QuestionDisposition;
}

/**
 * What the provider returns. Every field here is independently validated
 * by validateEducationOutput before any of it is trusted — see validate.ts.
 * There is intentionally no `disposition` field: the AI cannot report a
 * disposition because there is nowhere for one to go.
 */
export interface MedicationEducationOutput {
  responseText: string;
  suggestedCategory: QuestionCategory | null;
  clarifyingQuestion: string | null;
  pharmacistSummary: string | null;
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface MedicationEducationResult {
  output: MedicationEducationOutput;
  provider: string;
  model: string;
  promptVersion: string;
  usage: AiUsage;
}

/**
 * The provider abstraction. The application depends on this interface,
 * never on a specific vendor SDK — see providers/mock.ts and
 * providers/anthropic.ts for the two implementations.
 */
export interface MedicationEducationProvider {
  readonly providerName: string;
  generateEducation(input: MedicationEducationInput): Promise<MedicationEducationResult>;
}
