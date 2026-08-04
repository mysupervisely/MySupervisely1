import { describe, expect, it } from "vitest";
import { validateEducationOutput } from "../src/validate.js";

describe("validateEducationOutput", () => {
  it("accepts a well-formed output", () => {
    const result = validateEducationOutput({
      responseText: "This medication is generally taken once daily with food.",
      suggestedCategory: "GENERAL_INFO",
      clarifyingQuestion: null,
      pharmacistSummary: null,
    });
    expect(result.valid).toBe(true);
  });

  it("rejects output missing responseText", () => {
    const result = validateEducationOutput({
      suggestedCategory: "GENERAL_INFO",
      clarifyingQuestion: null,
      pharmacistSummary: null,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects output with an empty responseText", () => {
    const result = validateEducationOutput({
      responseText: "",
      suggestedCategory: null,
      clarifyingQuestion: null,
      pharmacistSummary: null,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects a wrong-typed suggestedCategory", () => {
    const result = validateEducationOutput({
      responseText: "Fine.",
      suggestedCategory: 123,
      clarifyingQuestion: null,
      pharmacistSummary: null,
    });
    expect(result.valid).toBe(false);
  });

  it("strips unknown fields rather than trusting them (e.g. an injected disposition)", () => {
    const result = validateEducationOutput({
      responseText: "General information about this medication.",
      suggestedCategory: null,
      clarifyingQuestion: null,
      pharmacistSummary: null,
      disposition: "GENERAL_EDUCATION",
    });
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.output).not.toHaveProperty("disposition");
    }
  });

  it("rejects a dose-change directive in responseText", () => {
    const result = validateEducationOutput({
      responseText: "You should increase your dose to feel better.",
      suggestedCategory: null,
      clarifyingQuestion: null,
      pharmacistSummary: null,
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.reason).toContain("guardrail_pattern");
    }
  });

  it("rejects a stop-taking instruction", () => {
    const result = validateEducationOutput({
      responseText: "You should stop taking this medication immediately.",
      suggestedCategory: null,
      clarifyingQuestion: null,
      pharmacistSummary: null,
    });
    expect(result.valid).toBe(false);
  });

  it("rejects diagnostic language", () => {
    const result = validateEducationOutput({
      responseText: "I diagnose this as a mild reaction.",
      suggestedCategory: null,
      clarifyingQuestion: null,
      pharmacistSummary: null,
    });
    expect(result.valid).toBe(false);
  });

  it("scans clarifyingQuestion and pharmacistSummary for guardrail patterns too", () => {
    const result = validateEducationOutput({
      responseText: "General information.",
      suggestedCategory: null,
      clarifyingQuestion: null,
      pharmacistSummary: "You should stop taking this right away.",
    });
    expect(result.valid).toBe(false);
  });

  it("does not flag ordinary medication-education language containing 'dose' or 'take'", () => {
    const result = validateEducationOutput({
      responseText: "Take this medication with food, and your prescribed dose should be taken once daily.",
      suggestedCategory: null,
      clarifyingQuestion: null,
      pharmacistSummary: null,
    });
    expect(result.valid).toBe(true);
  });
});
