// Deliberately not imported from @doseprepped/db: this package has zero
// runtime dependencies (no Prisma, no DB, no HTTP framework) so it can be
// unit-tested and clinically reviewed in complete isolation. These string
// unions are structurally identical to the Prisma-generated enums of the
// same name, so a caller can pass a Prisma `QuestionCategory` value
// directly without any conversion.

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

/**
 * A single, named, independently reviewable escalation rule. Each rule
 * targets one specific clinical concern (see docs/doseprepped/
 * ARCHITECTURE.md "Deterministic Safety & Disposition Rule Engine" for the
 * rationale behind each one) and maps to exactly one disposition.
 */
export interface SafetyRule {
  id: string;
  description: string;
  disposition: Extract<QuestionDisposition, "URGENT_EMERGENCY" | "PROVIDER_EVALUATION">;
  patterns: RegExp[];
}

export interface DispositionResult {
  disposition: QuestionDisposition;
  /** Rule id(s) that matched; empty if only the category baseline applied. */
  matchedRuleIds: string[];
  ruleSetVersion: string;
}
