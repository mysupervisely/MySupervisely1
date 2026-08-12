// Deterministic safety-routing abstraction — docs/noor/M3-IMPLEMENTATION.md
// "Safety policy architecture" and docs/noor/ARCHITECTURE.md §9/§I.
//
// This is NOT a clinical risk-assessment engine, NOT AI, and NOT a
// diagnosis. It is a narrow, isolated, fully deterministic classifier over
// a fixed set of STRUCTURED numeric check-in fields, whose sole job is to
// flag a submission for human (clinician) attention using rules that are
// explicitly placeholders pending qualified clinical/legal review — see
// DEFAULT_SAFETY_SIGNALS in default-policy.ts. No LLM, no free-text
// scanning, no keyword matching is used or permitted here (see the "why no
// free-text screening" note in default-policy.ts) — an AIProvider must
// never be reachable from this module.

/** The only inputs this layer is allowed to reason about: the four
 * structured 1-10 scale answers. Free text is deliberately excluded — see
 * default-policy.ts. */
export interface CheckInSafetyInput {
  overallWellbeing: number | null;
  mood: number | null;
  stress: number | null;
  sleep: number | null;
}

/** A single fired rule. `id` is a stable internal code (safe to audit —
 * it is a category label, never patient-authored content) — see
 * packages/api's audit call site for `safety_workflow.triggered`. */
export interface SafetySignal {
  id: string;
  description: string;
}

export interface SafetyEvaluationResult {
  flagged: boolean;
  signals: SafetySignal[];
}

/**
 * A SafetyPolicyProvider evaluates a check-in's structured responses and
 * decides whether to flag it. Swappable exactly like EhrProvider /
 * PaymentProvider / AIProvider (packages/ehr-adapter,
 * payments-adapter, ai-service) — a factory selects the concrete
 * implementation from configuration, and only one implementation exists
 * today (see factory.ts). Populating this with a clinically-reviewed rule
 * set later is a matter of implementing a new provider here, not
 * rewriting any caller.
 */
export interface SafetyPolicyProvider {
  evaluate(input: CheckInSafetyInput): SafetyEvaluationResult;
}
