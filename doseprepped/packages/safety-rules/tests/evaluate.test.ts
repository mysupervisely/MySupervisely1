import { describe, expect, it } from "vitest";
import { evaluateDisposition } from "../src/evaluate.js";
import { SAFETY_RULE_SET_VERSION } from "../src/rules.js";

describe("evaluateDisposition — category baseline", () => {
  it("routes a normal general-information question to GENERAL_EDUCATION", () => {
    const result = evaluateDisposition("What is this medication generally used for?", "GENERAL_INFO");
    expect(result.disposition).toBe("GENERAL_EDUCATION");
    expect(result.matchedRuleIds).toEqual([]);
  });

  it("routes administration and storage questions to GENERAL_EDUCATION", () => {
    expect(evaluateDisposition("Should I take this with food?", "ADMINISTRATION").disposition).toBe(
      "GENERAL_EDUCATION",
    );
    expect(evaluateDisposition("Can I keep this in the fridge?", "STORAGE").disposition).toBe(
      "GENERAL_EDUCATION",
    );
  });

  it("routes a question needing individualized guidance to PHARMACIST_REVIEW", () => {
    const result = evaluateDisposition(
      "I've felt a little nauseous since starting this, is that normal?",
      "SIDE_EFFECT",
    );
    expect(result.disposition).toBe("PHARMACIST_REVIEW");
    expect(result.matchedRuleIds).toEqual([]);
  });

  it("routes missed-dose, interaction, adherence, and cost questions to PHARMACIST_REVIEW", () => {
    expect(evaluateDisposition("I forgot my dose this morning.", "MISSED_DOSE").disposition).toBe(
      "PHARMACIST_REVIEW",
    );
    expect(
      evaluateDisposition("Can I take this with my other medication?", "DRUG_INTERACTION").disposition,
    ).toBe("PHARMACIST_REVIEW");
    expect(evaluateDisposition("I keep forgetting to take this.", "ADHERENCE").disposition).toBe(
      "PHARMACIST_REVIEW",
    );
    expect(evaluateDisposition("Is there a cheaper alternative?", "COST_ACCESS").disposition).toBe(
      "PHARMACIST_REVIEW",
    );
  });

  it("defaults an ambiguous / uncategorized question conservatively to PHARMACIST_REVIEW", () => {
    const result = evaluateDisposition("Not sure, just wondering about something.", "OTHER");
    expect(result.disposition).toBe("PHARMACIST_REVIEW");
  });
});

describe("evaluateDisposition — escalation patterns", () => {
  it("escalates a concerning symptom to PROVIDER_EVALUATION even from a generic category", () => {
    const result = evaluateDisposition(
      "My rash is spreading and it's getting worse every day.",
      "GENERAL_INFO",
    );
    expect(result.disposition).toBe("PROVIDER_EVALUATION");
    expect(result.matchedRuleIds).toContain("severe-or-rapidly-worsening-symptom");
  });

  it("escalates a plausible medication error to PROVIDER_EVALUATION", () => {
    const result = evaluateDisposition(
      "I accidentally doubled my dose this morning, should I be worried?",
      "MISSED_DOSE",
    );
    expect(result.disposition).toBe("PROVIDER_EVALUATION");
    expect(result.matchedRuleIds).toContain("medication-error-with-potential-harm");
  });

  it("escalates a possible severe allergic reaction to URGENT_EMERGENCY", () => {
    const result = evaluateDisposition(
      "My throat feels like it's swelling and I'm having trouble breathing.",
      "SIDE_EFFECT",
    );
    expect(result.disposition).toBe("URGENT_EMERGENCY");
    expect(result.matchedRuleIds).toContain("anaphylaxis-or-severe-allergic-reaction");
  });

  it("escalates possible overdose language to URGENT_EMERGENCY", () => {
    const result = evaluateDisposition("I think I took way too many pills by accident.", "OTHER");
    expect(result.disposition).toBe("URGENT_EMERGENCY");
    expect(result.matchedRuleIds).toContain("possible-overdose-or-poisoning");
  });

  it("escalates loss of consciousness to URGENT_EMERGENCY", () => {
    const result = evaluateDisposition("My dad just passed out after taking his medication.", "OTHER");
    expect(result.disposition).toBe("URGENT_EMERGENCY");
    expect(result.matchedRuleIds).toContain("loss-of-consciousness-or-unresponsiveness");
  });

  it("escalates chest pain to URGENT_EMERGENCY", () => {
    const result = evaluateDisposition("I'm having chest pain since I took this.", "SIDE_EFFECT");
    expect(result.disposition).toBe("URGENT_EMERGENCY");
    expect(result.matchedRuleIds).toContain("chest-pain-or-severe-cardiac-symptom");
  });

  it("URGENT_EMERGENCY always outranks a simultaneous PROVIDER_EVALUATION match", () => {
    const result = evaluateDisposition(
      "My symptoms are getting worse and now I'm having trouble breathing.",
      "SIDE_EFFECT",
    );
    expect(result.disposition).toBe("URGENT_EMERGENCY");
  });

  it("never downgrades below the category baseline for an unrelated pattern coincidence", () => {
    // "COST_ACCESS" baseline is PHARMACIST_REVIEW; plain cost language must
    // not accidentally trip the medication-error pattern.
    const result = evaluateDisposition("I'm paying too much for this every month.", "COST_ACCESS");
    expect(result.disposition).toBe("PHARMACIST_REVIEW");
  });
});

describe("evaluateDisposition — determinism, versioning, and AI independence", () => {
  it("produces identical results for identical input every time", () => {
    const first = evaluateDisposition("I feel dizzy after taking this.", "SIDE_EFFECT");
    const second = evaluateDisposition("I feel dizzy after taking this.", "SIDE_EFFECT");
    expect(first).toEqual(second);
  });

  it("stamps every result with the current safety rule set version", () => {
    const results = [
      evaluateDisposition("What does this do?", "GENERAL_INFO"),
      evaluateDisposition("I feel nauseous.", "SIDE_EFFECT"),
      evaluateDisposition("I took too many pills.", "OTHER"),
    ];
    for (const result of results) {
      expect(result.ruleSetVersion).toBe(SAFETY_RULE_SET_VERSION);
    }
  });

  it("is a plain synchronous function — no AI/network call is possible", () => {
    const result = evaluateDisposition("What does this do?", "GENERAL_INFO");
    // If this were async (e.g. awaiting an LLM call), it would return a
    // Promise instead of a plain object.
    expect(result).not.toBeInstanceOf(Promise);
    expect(typeof evaluateDisposition).toBe("function");
    expect(evaluateDisposition.constructor.name).not.toBe("AsyncFunction");
  });
});
