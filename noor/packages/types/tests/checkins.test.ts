import { describe, expect, it } from "vitest";
import { checkInAnswersSchema, checkInAnswerValueSchema } from "../src/checkins.js";

describe("checkInAnswerValueSchema", () => {
  it("accepts an integer scale value 1-10", () => {
    expect(checkInAnswerValueSchema.safeParse(7).success).toBe(true);
    expect(checkInAnswerValueSchema.safeParse(1).success).toBe(true);
    expect(checkInAnswerValueSchema.safeParse(10).success).toBe(true);
  });

  it("rejects a scale value outside 1-10", () => {
    expect(checkInAnswerValueSchema.safeParse(0).success).toBe(false);
    expect(checkInAnswerValueSchema.safeParse(11).success).toBe(false);
  });

  it("rejects a non-integer numeric value", () => {
    expect(checkInAnswerValueSchema.safeParse(5.5).success).toBe(false);
  });

  it("accepts a string value (option key or free text)", () => {
    expect(checkInAnswerValueSchema.safeParse("WORK_OR_SCHOOL").success).toBe(true);
    expect(checkInAnswerValueSchema.safeParse("Some free text about my week.").success).toBe(true);
  });

  it("rejects an unreasonably long string", () => {
    expect(checkInAnswerValueSchema.safeParse("x".repeat(5000)).success).toBe(false);
  });
});

describe("checkInAnswersSchema", () => {
  it("accepts a map of question keys to answers", () => {
    const result = checkInAnswersSchema.safeParse({
      overall_wellbeing: 7,
      main_concern: "WORK_OR_SCHOOL",
      additional_notes: "Feeling okay this week.",
    });
    expect(result.success).toBe(true);
  });

  it("accepts an empty object", () => {
    expect(checkInAnswersSchema.safeParse({}).success).toBe(true);
  });

  it("rejects a malformed answer value under any key", () => {
    expect(checkInAnswersSchema.safeParse({ overall_wellbeing: 99 }).success).toBe(false);
  });
});
