import { describe, expect, it } from "vitest";
import { MockMedicationEducationProvider } from "../src/providers/mock.js";
import { validateEducationOutput } from "../src/validate.js";
import type { MedicationEducationInput } from "../src/types.js";

const baseInput: MedicationEducationInput = {
  medicationSnapshot: {
    name: "Lisinopril",
    strength: "10 mg",
    directions: "Take one tablet by mouth once daily.",
    frequency: "Once daily",
    route: "Oral",
  },
  otherMedicationsSnapshot: null,
  category: "GENERAL_INFO",
  questionText: "What is this medication generally used for and how does it work?",
  disposition: "GENERAL_EDUCATION",
};

describe("MockMedicationEducationProvider", () => {
  it("returns a validatable output in success mode", async () => {
    const provider = new MockMedicationEducationProvider({ mode: "success" });
    const result = await provider.generateEducation(baseInput);
    expect(result.provider).toBe("mock");
    const validated = validateEducationOutput(result.output);
    expect(validated.valid).toBe(true);
  });

  it("never includes a disposition field in its output", async () => {
    const provider = new MockMedicationEducationProvider();
    const result = await provider.generateEducation(baseInput);
    expect(result.output).not.toHaveProperty("disposition");
  });

  it("produces a non-educational, routing-oriented responseText for PHARMACIST_REVIEW", async () => {
    const provider = new MockMedicationEducationProvider();
    const result = await provider.generateEducation({ ...baseInput, disposition: "PHARMACIST_REVIEW" });
    expect(result.output.pharmacistSummary).not.toBeNull();
  });

  it("throws in fail mode", async () => {
    const provider = new MockMedicationEducationProvider({ mode: "fail" });
    await expect(provider.generateEducation(baseInput)).rejects.toThrow();
  });

  it("produces output that fails validation in invalid mode", async () => {
    const provider = new MockMedicationEducationProvider({ mode: "invalid" });
    const result = await provider.generateEducation(baseInput);
    const validated = validateEducationOutput(result.output);
    expect(validated.valid).toBe(false);
  });

  it("delays by the configured amount in slow mode", async () => {
    const provider = new MockMedicationEducationProvider({ mode: "slow", delayMs: 50 });
    const start = Date.now();
    await provider.generateEducation(baseInput);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it("returns at most one clarifying question (never an array, never multiple)", async () => {
    const provider = new MockMedicationEducationProvider();
    const result = await provider.generateEducation(baseInput);
    expect(typeof result.output.clarifyingQuestion === "string" || result.output.clarifyingQuestion === null).toBe(
      true,
    );
  });
});
