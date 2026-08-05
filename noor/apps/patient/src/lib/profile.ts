import type { CareFormatPreference, CareType } from "@noor/types";

export interface PatientProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  state: string | null;
  reasonForSeekingCare: string | null;
  careType: CareType | null;
  careFormatPreference: CareFormatPreference | null;
  onboardingCompletedAt: string | null;
  completionPercent: number;
}

/** Time-of-day greeting, matching the exact tone from the M0 product brief
 * ("Good morning, Sarah."). Purely a client-side nicety — never sent to or
 * computed by the API, since it depends on the browser's local clock, not
 * anything the server needs to know. */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
