// AI provider abstraction — docs/noor/ARCHITECTURE.md §I.
//
// M1 ships ONLY a MockProvider (mock.ts) that returns clearly-labeled
// placeholder output, and no M1 route calls it — there is no check-in or
// clinician-review feature yet (M3/M4). This package exists in M1 purely
// to preserve the abstraction boundary and, just as importantly, its
// guardrails: the prohibitions in the product brief (no diagnose, no
// prescribe, no determine level of care, no determine suicide risk, no
// final clinical decisions, no replacing a clinician) are enforced here at
// the TYPE level, not only by prompt instructions — DraftSummary below has
// no field a diagnosis, risk score, or recommended clinical action could be
// written into. There is nowhere for a disallowed output to go, by
// construction.

/**
 * The only output shape an AIProvider may ever produce in this system.
 * Deliberately has NO `diagnosis`, `riskLevel`, or `recommendedAction`
 * field. `aiGenerated` is fixed `true` (not settable by a provider
 * implementation) and `reviewedByClinicianId` starts `null` and is only
 * ever set by application code after a licensed clinician explicitly
 * approves the draft — never by the AI provider itself.
 */
export interface DraftSummary {
  readonly aiGenerated: true;
  reviewedByClinicianId: string | null;
  text: string;
}

export interface CheckInSummaryInput {
  /** Non-identifying-where-possible; callers are responsible for only
   * passing fields that have been approved to reach an AI provider — see
   * docs/noor/ARCHITECTURE.md §F/§I. Not used by any M1 route. */
  checkInId: string;
  responses: Array<{ questionKey: string; value: string }>;
}

export interface AIProvider {
  summarizeCheckInForClinician(input: CheckInSummaryInput): Promise<DraftSummary>;
}
