import type { MedicationEducationInput, MedicationEducationProvider } from "@doseprepped/ai-service";
import { validateEducationOutput } from "@doseprepped/ai-service";

export type EducationOutcome =
  | {
      status: "SUCCESS";
      responseText: string;
      suggestedCategory: string | null;
      clarifyingQuestion: string | null;
      pharmacistSummary: string | null;
      provider: string;
      model: string;
      promptVersion: string;
      usage: { inputTokens: number; outputTokens: number };
    }
  | { status: "FAILED"; reason: string }
  | { status: "SKIPPED"; reason: string };

class TimeoutError extends Error {}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError("ai provider timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Runs the Phase 3 AI education call for a single question and returns a
 * discriminated outcome the caller (POST /questions) maps to DB fields.
 * Never throws — every failure mode (provider error, timeout, invalid
 * output) is converted to a FAILED outcome so the route can fail safe.
 *
 * URGENT_EMERGENCY is the caller's responsibility to skip before calling
 * this function at all (see routes/questions.ts) — this function assumes
 * it's only invoked for a disposition where AI involvement is appropriate.
 */
export async function runEducationPipeline(
  provider: MedicationEducationProvider,
  timeoutMs: number,
  input: MedicationEducationInput,
): Promise<EducationOutcome> {
  let result;
  try {
    result = await withTimeout(provider.generateEducation(input), timeoutMs);
  } catch (err) {
    const reason = err instanceof TimeoutError ? "timeout" : "provider_error";
    return { status: "FAILED", reason };
  }

  const validated = validateEducationOutput(result.output);
  if (!validated.valid) {
    return { status: "FAILED", reason: validated.reason };
  }

  return {
    status: "SUCCESS",
    responseText: validated.output.responseText,
    suggestedCategory: validated.output.suggestedCategory,
    clarifyingQuestion: validated.output.clarifyingQuestion,
    pharmacistSummary: validated.output.pharmacistSummary,
    provider: result.provider,
    model: result.model,
    promptVersion: result.promptVersion,
    usage: result.usage,
  };
}
