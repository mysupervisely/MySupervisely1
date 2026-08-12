import type { CareFormatPreference, CareType, NoorInterest } from "./onboarding";

/** The wire shape of GET/PATCH /patients/me — shared by every client
 * (web, native) so onboarding/profile screens across apps/patient and
 * apps/mobile consume one definition, never two independently-typed
 * copies that could quietly drift (M5 brief: "do not duplicate business
 * rules in the mobile client"). */
export interface PatientProfileDTO {
  id: string;
  firstName: string | null;
  lastName: string | null;
  state: string | null;
  whatBringsYouToNoor: NoorInterest | null;
  careType: CareType | null;
  careFormatPreference: CareFormatPreference | null;
  onboardingCompletedAt: string | null;
  completionPercent: number;
}

/** Time-of-day greeting ("Good morning, Sarah."), matching the exact
 * tone from the M0 product brief. Purely a client-side nicety — never
 * sent to or computed by the API, since it depends on the device's local
 * clock. Identical on web and native (`Date` behaves the same on both). */
export function timeOfDayGreeting(now: Date = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
