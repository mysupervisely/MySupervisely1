import { describe, expect, it } from "vitest";
import { onboardingSchema, patientProfileUpdateSchema, usStateSchema, noorInterestSchema } from "../src/onboarding.js";

describe("onboardingSchema", () => {
  const valid = {
    firstName: "Sam",
    lastName: "Rivera",
    state: "CA",
    whatBringsYouToNoor: "LOOKING_FOR_THERAPIST",
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

  it("rejects an invalid whatBringsYouToNoor value", () => {
    expect(onboardingSchema.safeParse({ ...valid, whatBringsYouToNoor: "SOMETHING_ELSE" }).success).toBe(false);
  });

  it("rejects an invalid careType value", () => {
    expect(onboardingSchema.safeParse({ ...valid, careType: "GROUP_THERAPY" }).success).toBe(false);
  });

  it("accepts the new PSYCHIATRY and ASYNC_SUPPORT careType values", () => {
    expect(onboardingSchema.safeParse({ ...valid, careType: "PSYCHIATRY" }).success).toBe(true);
    expect(onboardingSchema.safeParse({ ...valid, careType: "ASYNC_SUPPORT" }).success).toBe(true);
  });

  it("rejects an invalid careFormatPreference value", () => {
    expect(onboardingSchema.safeParse({ ...valid, careFormatPreference: "IN_PERSON" }).success).toBe(false);
  });

  it("accepts the new BOTH careFormatPreference value", () => {
    expect(onboardingSchema.safeParse({ ...valid, careFormatPreference: "BOTH" }).success).toBe(true);
  });

  it("accepts 'NOT_SURE' for all three preference fields", () => {
    expect(
      onboardingSchema.safeParse({
        ...valid,
        whatBringsYouToNoor: "NOT_SURE",
        careType: "NOT_SURE",
        careFormatPreference: "NOT_SURE",
      }).success,
    ).toBe(true);
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
    expect(patientProfileUpdateSchema.safeParse({ whatBringsYouToNoor: "not-a-real-value" }).success).toBe(false);
  });
});

describe("usStateSchema / noorInterestSchema", () => {
  it("accepts every real two-letter state/DC code", () => {
    expect(usStateSchema.safeParse("NY").success).toBe(true);
    expect(usStateSchema.safeParse("DC").success).toBe(true);
  });

  it("is a fixed-choice enum, not free text — there is no way to submit arbitrary text here", () => {
    expect(noorInterestSchema.safeParse("I feel anxious all the time").success).toBe(false);
    expect(noorInterestSchema.safeParse("LOOKING_FOR_THERAPIST").success).toBe(true);
  });
});
