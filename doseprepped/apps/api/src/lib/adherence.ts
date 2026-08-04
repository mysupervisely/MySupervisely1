import { AdherenceStatus } from "@doseprepped/db";

export interface AdherenceSummary {
  takenCount: number;
  missedCount: number;
  skippedCount: number;
  totalCount: number;
  /**
   * takenCount / totalCount, rounded to the nearest whole percent. `null`
   * when totalCount is 0 — never displayed as "0%" or any other
   * misleading default. See docs/doseprepped/ARCHITECTURE.md "M5.2 —
   * Adherence tracking" for the full rationale. This is the *only* place
   * this number is computed — every caller (the patient-facing adherence
   * endpoint and the pharmacist medication context) goes through this one
   * function, so the figure can never disagree with itself across
   * screens.
   */
  adherencePercentage: number | null;
}

/**
 * Deterministic, non-clinical adherence summary from a set of recorded
 * dose events. Every recorded event (TAKEN, MISSED, or SKIPPED — SKIPPED
 * is not treated specially) counts toward the denominator; only TAKEN
 * counts toward the numerator. No recency weighting, no interpretation —
 * a plain ratio, always presented as a bare percentage
 * ("Adherence: 91%"), never a qualitative label.
 */
export function computeAdherenceSummary(events: { status: AdherenceStatus }[]): AdherenceSummary {
  let takenCount = 0;
  let missedCount = 0;
  let skippedCount = 0;

  for (const event of events) {
    if (event.status === AdherenceStatus.TAKEN) takenCount++;
    else if (event.status === AdherenceStatus.MISSED) missedCount++;
    else if (event.status === AdherenceStatus.SKIPPED) skippedCount++;
  }

  const totalCount = takenCount + missedCount + skippedCount;
  const adherencePercentage = totalCount === 0 ? null : Math.round((takenCount / totalCount) * 100);

  return { takenCount, missedCount, skippedCount, totalCount, adherencePercentage };
}
