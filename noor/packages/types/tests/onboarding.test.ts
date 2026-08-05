import { describe, expect, it } from "vitest";
import { onboardingSchema, patientProfileUpdateSchema, usStateSchema, reasonForSeekingCareSchema } from "../src/onboarding.js";

describe("onboardingSchema", () => {
  const valid = {
    firstName: "Sam",
    lastName: "Rivera",
    state: "CA",
    reasonForSeekingCare: "Looking for support with work stress.",
    careType: "INDIVIDUAL_THERAPY",
    careFormatPreference: "VIDEO",
  };

  it("accepts a fully valid submission", () => {
    expect(onboardingSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing required field", () => {
    const { firstName: _firstName, ...withoutFirstName } = valid;
    expect(onboardingSchema.safeParse(withoutFirstName).success).toBe(false);
  });

  it("rejects an invalid state code", () => {
    expect(onboardingSchema.safeParse({ ...valid, state: "ZZ" }).success).toBe(false);
    expect(onboardingSchema.safeParse({ ...valid, state: "california" }).success).toBe(false);
  });

  it("rejects an invalid careType value", () => {
    expect(onboardingSchema.safeParse({ ...valid, careType: "GROUP_THERAPY" }).success).toBe(false);
  });

  it("rejects an invalid careFormatPreference value", () => {
    expect(onboardingSchema.safeParse({ ...valid, careFormatPreference: "IN_PERSON" }).success).toBe(false);
  });

  it("accepts 'NOT_SURE' for both care preference fields", () => {
    expect(onboardingSchema.safeParse({ ...valid, careType: "NOT_SURE", careFormatPreference: "NOT_SURE" }).success).toBe(
      true,
    );
  });

  it("rejects a reason that is too short (empty/whitespace)", () => {
    expect(onboardingSchema.safeParse({ ...valid, reasonForSeekingCare: "  " }).success).toBe(false);
  });

  it("rejects an unreasonably long reason", () => {
    expect(onboardingSchema.safeParse({ ...valid, reasonForSeekingCare: "x".repeat(5000) }).success).toBe(false);
  });
});

describe("patientProfileUpdateSchema", () => {
  it("accepts a partial update with a single field", () => {
    expect(patientProfileUpdateSchema.safeParse({ firstName: "Sam" }).success).toBe(true);
  });

  it("accepts an empty object (no-op update)", () => {
    expect(patientProfileUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("still validates the shape of any field that IS present", () => {
    expect(patientProfileUpdateSchema.safeParse({ state: "not-a-state" }).success).toBe(false);
  });
});

describe("usStateSchema / reasonForSeekingCareSchema", () => {
  it("accepts every real two-letter state/DC code", () => {
    expect(usStateSchema.safeParse("NY").success).toBe(true);
    expect(usStateSchema.safeParse("DC").success).toBe(true);
  });

  it("trims whitespace on the free-text reason", () => {
    const result = reasonForSeekingCareSchema.safeParse("  feeling anxious lately  ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toBe("feeling anxious lately");
  });
});
