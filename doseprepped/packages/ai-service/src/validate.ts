import { z } from "zod";
import type { MedicationEducationOutput, QuestionCategory } from "./types.js";

const QUESTION_CATEGORIES = [
  "GENERAL_INFO",
  "ADMINISTRATION",
  "MISSED_DOSE",
  "SIDE_EFFECT",
  "DRUG_INTERACTION",
  "STORAGE",
  "ADHERENCE",
  "COST_ACCESS",
  "OTHER",
] as const satisfies readonly QuestionCategory[];

/**
 * Structural shape only. Zod strips unknown keys by default, so an extra
 * field a provider might return (e.g. an attempted "disposition" override)
 * is silently dropped before it ever reaches application code — see
 * docs/doseprepped/ARCHITECTURE.md "Disposition is read-only input, never
 * AI-writable output".
 */
const outputSchema = z.object({
  responseText: z.string().trim().min(1).max(4000),
  suggestedCategory: z.enum(QUESTION_CATEGORIES).nullable(),
  clarifyingQuestion: z.string().trim().min(1).max(300).nullable(),
  pharmacistSummary: z.string().trim().min(1).max(2000).nullable(),
});

/**
 * Named, reviewable, non-exhaustive guardrail patterns — defense-in-depth
 * behind the disposition gate and the system prompt's MUST NOT list, not
 * the primary safety mechanism. Mirrors the style of
 * packages/safety-rules/src/rules.ts. See docs/doseprepped/ARCHITECTURE.md
 * "Output validation" for the three-layer rationale.
 */
export const GUARDRAIL_PATTERNS: { id: string; pattern: RegExp }[] = [
  {
    id: "directive-dose-change",
    pattern: /\byou should\b.{0,20}\b(start|stop|increase|decrease|double|change)\b.{0,15}\b(dose|dosage|medication)\b/i,
  },
  {
    id: "stop-taking-instruction",
    pattern: /\bstop taking (this|your|it)\b/i,
  },
  {
    id: "start-taking-instruction",
    pattern: /\byou (should |can )?start taking\b/i,
  },
  {
    id: "explicit-diagnosis",
    pattern: /\bi (diagnose|am diagnosing)\b/i,
  },
  {
    id: "you-have-condition",
    pattern: /\byou (have|are having)\b.{0,20}\b(anaphylaxis|an overdose|a heart attack|a stroke)\b/i,
  },
  {
    id: "treatment-recommendation",
    pattern: /\bi recommend\b.{0,20}\b(taking|treatment|dose)\b/i,
  },
];

export type ValidationResult =
  | { valid: true; output: MedicationEducationOutput }
  | { valid: false; reason: string };

function findGuardrailHit(text: string | null): string | null {
  if (!text) return null;
  for (const { id, pattern } of GUARDRAIL_PATTERNS) {
    if (pattern.test(text)) return id;
  }
  return null;
}

/**
 * Validates raw provider output before any of it is trusted. Two passes:
 * (1) structural — must match the exact expected shape, extra/malformed
 * fields are rejected or stripped; (2) guardrail — responseText,
 * clarifyingQuestion, and pharmacistSummary are scanned for prohibited
 * directive-clinical-language patterns. Either failure returns
 * `{ valid: false }` and the caller must fail safe (see
 * apps/api/src/lib/ai-education.ts).
 */
export function validateEducationOutput(raw: unknown): ValidationResult {
  const parsed = outputSchema.safeParse(raw);
  if (!parsed.success) {
    return { valid: false, reason: "invalid_output_shape" };
  }

  const output = parsed.data;
  const hit =
    findGuardrailHit(output.responseText) ??
    findGuardrailHit(output.clarifyingQuestion) ??
    findGuardrailHit(output.pharmacistSummary);
  if (hit) {
    return { valid: false, reason: `guardrail_pattern:${hit}` };
  }

  return { valid: true, output };
}
