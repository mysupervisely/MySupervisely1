import { z } from "zod";

/**
 * Shared onboarding field definitions — the single source of truth for
 * both client-side form validation (apps/patient) and server-side
 * authoritative validation (packages/api), so the two can never silently
 * drift. Mirrors the `NoorInterest` / `CareType` / `CareFormatPreference`
 * enums in packages/db/prisma/schema.prisma. See docs/noor/ARCHITECTURE.md
 * §6 and the M2 product brief: onboarding collects only non-clinical
 * preferences necessary for the initial patient experience — every field
 * here is a fixed-choice enum, never free text, so there is no way for a
 * patient to type clinical history into onboarding even by accident.
 */

export const NOOR_INTERESTS = [
  "LOOKING_FOR_THERAPIST",
  "ONGOING_SUPPORT",
  "ASYNC_SUPPORT_INTEREST",
  "EXPLORING_OPTIONS",
  "NOT_SURE",
] as const;
export const noorInterestSchema = z.enum(NOOR_INTERESTS);
export type NoorInterest = z.infer<typeof noorInterestSchema>;

export const NOOR_INTEREST_LABELS: Record<NoorInterest, string> = {
  LOOKING_FOR_THERAPIST: "I'm looking for a therapist",
  ONGOING_SUPPORT: "I'm looking for ongoing mental-health support",
  ASYNC_SUPPORT_INTEREST: "I'm interested in asynchronous support",
  EXPLORING_OPTIONS: "I'm exploring my options",
  NOT_SURE: "I'm not sure yet",
};

export const CARE_TYPES = [
  "INDIVIDUAL_THERAPY",
  "COUPLES_THERAPY",
  "FAMILY_THERAPY",
  "PSYCHIATRY",
  "ASYNC_SUPPORT",
  "NOT_SURE",
] as const;
export const careTypeSchema = z.enum(CARE_TYPES);
export type CareType = z.infer<typeof careTypeSchema>;

// Label text below deliberately avoids branding "Async"/"Noor Async" as a
// named, committed product — Noor's primary product is live therapy, and
// whether structured between-session care ships as a bundled feature, a
// separately priced product, or both is an open product decision (see
// docs/noor/M2-IMPLEMENTATION.md §"Product direction: Async"). The
// underlying enum VALUES (ASYNC_SUPPORT / ASYNC) are stable identifiers
// and don't need to change if the labels do again later.
export const CARE_TYPE_LABELS: Record<CareType, string> = {
  INDIVIDUAL_THERAPY: "Individual therapy",
  COUPLES_THERAPY: "Couples therapy",
  FAMILY_THERAPY: "Family therapy",
  PSYCHIATRY: "Psychiatry",
  ASYNC_SUPPORT: "Ongoing support",
  NOT_SURE: "I'm not sure yet",
};

export const CARE_FORMATS = ["VIDEO", "ASYNC", "BOTH", "NOT_SURE"] as const;
export const careFormatSchema = z.enum(CARE_FORMATS);
export type CareFormatPreference = z.infer<typeof careFormatSchema>;

export const CARE_FORMAT_LABELS: Record<CareFormatPreference, string> = {
  VIDEO: "Video appointments",
  ASYNC: "Support between appointments",
  BOTH: "Both",
  NOT_SURE: "I'm not sure yet",
};

/** The 50 states + DC, as (code, name) pairs. US-only for M1/M2 — Noor's
 * telehealth eligibility is state-scoped (docs/noor/ARCHITECTURE.md §13),
 * and this list is the shared source for the onboarding state picker and
 * server-side validation of the `state` field. */
export const US_STATES = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
] as const satisfies readonly (readonly [string, string])[];

export const US_STATE_CODES = US_STATES.map(([code]) => code) as string[];
export const usStateSchema = z.enum(US_STATE_CODES as [string, ...string[]]);

export const nameSchema = z.string().trim().min(1).max(100);

export const onboardingSchema = z.object({
  firstName: nameSchema,
  lastName: nameSchema,
  state: usStateSchema,
  whatBringsYouToNoor: noorInterestSchema,
  careType: careTypeSchema,
  careFormatPreference: careFormatSchema,
});

/** Every field in onboardingSchema is independently optional here — used
 * for the incremental per-step PATCH save, where only a subset of fields
 * is submitted at a time. */
export const patientProfileUpdateSchema = z.object({
  firstName: nameSchema.optional(),
  lastName: nameSchema.optional(),
  state: usStateSchema.optional(),
  whatBringsYouToNoor: noorInterestSchema.optional(),
  careType: careTypeSchema.optional(),
  careFormatPreference: careFormatSchema.optional(),
});

export type PatientProfileUpdateInput = z.infer<typeof patientProfileUpdateSchema>;

/** The fields required before onboarding can be marked complete. Kept as
 * an explicit list (rather than "all of onboardingSchema") so the
 * required set can be reviewed/changed independently of the validation
 * rules for each field. */
export const REQUIRED_ONBOARDING_FIELDS = [
  "firstName",
  "lastName",
  "state",
  "whatBringsYouToNoor",
  "careType",
  "careFormatPreference",
] as const;
