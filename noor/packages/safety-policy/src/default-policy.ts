import type { CheckInSafetyInput, SafetyEvaluationResult, SafetyPolicyProvider, SafetySignal } from "./types.js";

// ============================================================================
// [NEEDS CLINICAL/LEGAL REVIEW]
//
// This is the ONLY safety-policy implementation in M3, and it is a
// deliberately minimal PLACEHOLDER, not a clinical protocol. It exists so
// the architecture (isolated policy layer -> deterministic evaluation ->
// CheckIn.safetyStatus -> audited "safety_workflow.triggered" event) can be
// built, tested, and reasoned about end to end BEFORE a real protocol
// exists — exactly what the brief asks for ("create a clearly isolated
// safety policy layer that can later be populated/reviewed by qualified
// clinical leadership and legal/compliance advisors... Do not invent the
// final clinical escalation protocol").
//
// What this rule is NOT allowed to be mistaken for:
//   - It does not diagnose anything.
//   - It does not assign a clinical risk score (flagged is a boolean, not
//     a score, and carries no severity gradient).
//   - It is not AI — no model call happens anywhere in this package.
//   - It does not determine whether a patient is "safe" or "suicidal" —
//     it only asks "is the overall-wellbeing answer at the lowest end of
//     the scale," nothing more, and even that threshold is an unvalidated
//     placeholder (see THRESHOLDS below).
//
// Why free text is never evaluated here: brief §10 explicitly says "do
// NOT build AI risk assessment," and keyword-matching a patient's free-text
// answer for crisis language is itself an unvalidated clinical-judgment
// tool, not a neutral engineering default — deciding whether/how to screen
// free text for safety signals is exactly the kind of decision that needs
// qualified clinical/legal review, not an engineering shortcut. So
// CheckInSafetyInput (types.ts) structurally has no free-text field at
// all — there is nowhere for this code to even read it from.
// ============================================================================

const THRESHOLDS = {
  /** PLACEHOLDER — not clinically validated. Flags when the patient's
   * self-reported overall wellbeing is at the bottom of the 1-10 scale.
   * The exact threshold, and whether this is even the right structured
   * signal to key off of, is [NEEDS CLINICAL/LEGAL REVIEW]. */
  OVERALL_WELLBEING_LOW_OR_BELOW: 2,
} as const;

export function createDefaultSafetyPolicy(): SafetyPolicyProvider {
  return {
    evaluate(input: CheckInSafetyInput): SafetyEvaluationResult {
      const signals: SafetySignal[] = [];

      if (input.overallWellbeing !== null && input.overallWellbeing <= THRESHOLDS.OVERALL_WELLBEING_LOW_OR_BELOW) {
        signals.push({
          id: "OVERALL_WELLBEING_VERY_LOW",
          description:
            "Overall wellbeing was reported at the low end of the scale (placeholder threshold, not clinically validated).",
        });
      }

      return { flagged: signals.length > 0, signals };
    },
  };
}
