import type { AIProvider, CheckInSummaryInput, DraftSummary } from "./types.js";

/**
 * MockProvider — the only AIProvider implementation in M1. Does not call
 * any real model or network endpoint. Returns an obviously-placeholder
 * summary so nothing downstream could mistake it for real clinical
 * assistance. Not called by any M1 route.
 */
export function createMockAIProvider(): AIProvider {
  return {
    async summarizeCheckInForClinician(input: CheckInSummaryInput): Promise<DraftSummary> {
      return {
        aiGenerated: true,
        reviewedByClinicianId: null,
        text: `[MOCK AI PROVIDER — not a real summary] ${input.responses.length} response(s) recorded for check-in ${input.checkInId}. AI summarization is disabled/mocked in M1 per docs/noor/ARCHITECTURE.md §I.`,
      };
    },
  };
}
