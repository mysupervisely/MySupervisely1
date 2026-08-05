import { describe, expect, it } from "vitest";
import { createAIProvider } from "../src/factory.js";
import { createMockAIProvider } from "../src/mock.js";

describe("createAIProvider", () => {
  it("returns a mock provider for 'mock'", async () => {
    const provider = createAIProvider("mock");
    const summary = await provider.summarizeCheckInForClinician({
      checkInId: "checkin-1",
      responses: [{ questionKey: "mood", value: "6" }],
    });
    expect(summary.aiGenerated).toBe(true);
    expect(summary.reviewedByClinicianId).toBeNull();
    expect(summary.text).toContain("MOCK AI PROVIDER");
  });

  it("throws on an unsupported provider key rather than silently calling a real vendor", () => {
    expect(() => createAIProvider("anthropic")).toThrow(/Unknown AI_PROVIDER/);
  });
});

describe("DraftSummary guardrail shape", () => {
  it("never exposes a diagnosis, riskLevel, or recommendedAction field", async () => {
    const provider = createMockAIProvider();
    const summary = await provider.summarizeCheckInForClinician({ checkInId: "x", responses: [] });
    // Structural guarantee: the DraftSummary type has no such fields, so
    // there is nowhere for a disallowed clinical output to be attached —
    // this test just makes that guarantee executable/regression-checked.
    expect(summary).not.toHaveProperty("diagnosis");
    expect(summary).not.toHaveProperty("riskLevel");
    expect(summary).not.toHaveProperty("recommendedAction");
  });

  it("always marks output as unreviewed by a clinician until explicitly approved", async () => {
    const provider = createMockAIProvider();
    const summary = await provider.summarizeCheckInForClinician({ checkInId: "x", responses: [] });
    expect(summary.reviewedByClinicianId).toBeNull();
  });
});
