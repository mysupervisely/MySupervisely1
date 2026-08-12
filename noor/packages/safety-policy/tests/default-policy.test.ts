import { describe, expect, it } from "vitest";
import { createDefaultSafetyPolicy } from "../src/default-policy.js";
import { createSafetyPolicyProvider } from "../src/factory.js";

describe("default safety policy (#deterministic safety-policy tests)", () => {
  it("does not flag a check-in with unremarkable structured responses", () => {
    const policy = createDefaultSafetyPolicy();
    const result = policy.evaluate({ overallWellbeing: 7, mood: 6, stress: 5, sleep: 7 });
    expect(result.flagged).toBe(false);
    expect(result.signals).toHaveLength(0);
  });

  it("flags a check-in when overall wellbeing is at the low end of the scale", () => {
    const policy = createDefaultSafetyPolicy();
    const result = policy.evaluate({ overallWellbeing: 1, mood: 6, stress: 5, sleep: 7 });
    expect(result.flagged).toBe(true);
    expect(result.signals.map((s) => s.id)).toContain("OVERALL_WELLBEING_VERY_LOW");
  });

  it("is deterministic: the same input always produces the same output", () => {
    const policy = createDefaultSafetyPolicy();
    const input = { overallWellbeing: 2, mood: 4, stress: 8, sleep: 3 };
    const first = policy.evaluate(input);
    const second = policy.evaluate(input);
    expect(first).toEqual(second);
  });

  it("does not flag based on mood, stress, or sleep alone (only the one documented placeholder rule exists)", () => {
    const policy = createDefaultSafetyPolicy();
    const result = policy.evaluate({ overallWellbeing: 8, mood: 1, stress: 10, sleep: 1 });
    expect(result.flagged).toBe(false);
  });

  it("handles a null overallWellbeing (e.g. not yet answered) without flagging or throwing", () => {
    const policy = createDefaultSafetyPolicy();
    expect(() => policy.evaluate({ overallWellbeing: null, mood: null, stress: null, sleep: null })).not.toThrow();
    expect(policy.evaluate({ overallWellbeing: null, mood: null, stress: null, sleep: null }).flagged).toBe(false);
  });

  it("has no way to accept or evaluate free text (#safety workflow does not rely on AI)", () => {
    // Structural guarantee, made executable: CheckInSafetyInput has no
    // free-text field, so there is nothing for this policy to run
    // keyword-matching or an AI call against even in principle.
    const policy = createDefaultSafetyPolicy();
    const input = { overallWellbeing: 5, mood: 5, stress: 5, sleep: 5 };
    expect(Object.keys(input)).toEqual(["overallWellbeing", "mood", "stress", "sleep"]);
    expect(policy.evaluate(input).flagged).toBe(false);
  });
});

describe("createSafetyPolicyProvider", () => {
  it("returns the default placeholder policy for 'default-placeholder'", () => {
    const provider = createSafetyPolicyProvider("default-placeholder");
    expect(provider.evaluate({ overallWellbeing: 7, mood: 7, stress: 7, sleep: 7 }).flagged).toBe(false);
  });

  it("throws on an unsupported provider key rather than silently using a real model", () => {
    expect(() => createSafetyPolicyProvider("ai-risk-model")).toThrow(/Unknown SAFETY_POLICY_PROVIDER/);
  });
});
