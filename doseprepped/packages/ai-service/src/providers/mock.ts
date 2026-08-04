import { PROMPT_VERSION } from "../prompt.js";
import type {
  MedicationEducationInput,
  MedicationEducationProvider,
  MedicationEducationResult,
} from "../types.js";

export type MockProviderMode = "success" | "fail" | "invalid" | "slow";

export interface MockProviderOptions {
  mode?: MockProviderMode;
  /** Only used in "slow" mode — how long to delay before resolving. */
  delayMs?: number;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Deterministic, dependency-free provider. This is:
 *   (a) the default provider for this environment (AI_PROVIDER=mock, no
 *       API key configured anywhere), clearly labeled as synthetic in the
 *       README and never presented to the patient as real AI content
 *       beyond the standard AI-disclosure copy, and
 *   (b) the test double every Phase 3 test injects via
 *       buildApp({ aiProvider }) — see docs/doseprepped/ARCHITECTURE.md
 *       "Testing". No test makes a real network call.
 *
 * "invalid" mode deliberately returns a raw, unvalidated shape (cast
 * through `unknown`) so callers exercise validateEducationOutput's
 * rejection path — MedicationEducationResult itself can't express an
 * invalid output, since validation happens after the provider returns.
 */
export class MockMedicationEducationProvider implements MedicationEducationProvider {
  readonly providerName = "mock";
  private readonly mode: MockProviderMode;
  private readonly delayMs: number;

  constructor(options: MockProviderOptions = {}) {
    this.mode = options.mode ?? "success";
    this.delayMs = options.delayMs ?? 250;
  }

  async generateEducation(input: MedicationEducationInput): Promise<MedicationEducationResult> {
    if (this.mode === "fail") {
      throw new Error("mock provider: simulated failure");
    }

    if (this.mode === "slow") {
      await wait(this.delayMs);
    }

    if (this.mode === "invalid") {
      return {
        // Missing responseText, wrong type for suggestedCategory — must be
        // rejected by validateEducationOutput's structural pass.
        output: { responseText: "", suggestedCategory: 123, clarifyingQuestion: null, pharmacistSummary: null } as never,
        provider: this.providerName,
        model: "mock-v1",
        promptVersion: PROMPT_VERSION,
        usage: { inputTokens: 0, outputTokens: 0 },
      };
    }

    const medName = input.medicationSnapshot.name;
    const isEducation = input.disposition === "GENERAL_EDUCATION";

    const responseText = isEducation
      ? `${medName} is generally used as directed by the prescription: ${input.medicationSnapshot.directions}. This is general information about the medication itself, not personalized medical advice — it isn't based on your complete medical history.`
      : `Thanks for sharing this about ${medName}. Because this involves your specific situation, general information alone isn't enough to fully address it — see the guidance below for next steps.`;

    const clarifyingQuestion =
      input.questionText.trim().length < 40
        ? `Could you share a bit more detail about when this started or how often it happens?`
        : null;

    const pharmacistSummary =
      input.disposition === "PHARMACIST_REVIEW" || input.disposition === "PROVIDER_EVALUATION"
        ? `Patient question about ${medName} (${input.category}): "${input.questionText}"`
        : null;

    return {
      output: {
        responseText,
        suggestedCategory: input.category,
        clarifyingQuestion,
        pharmacistSummary,
      },
      provider: this.providerName,
      model: "mock-v1",
      promptVersion: PROMPT_VERSION,
      usage: {
        inputTokens: Math.ceil((input.questionText.length + input.medicationSnapshot.directions.length) / 4),
        outputTokens: Math.ceil(responseText.length / 4),
      },
    };
  }
}
