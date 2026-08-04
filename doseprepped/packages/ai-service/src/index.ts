import { AnthropicMedicationEducationProvider } from "./providers/anthropic.js";
import { MockMedicationEducationProvider } from "./providers/mock.js";
import type { MedicationEducationProvider } from "./types.js";

export { PROMPT_VERSION, buildPrompt } from "./prompt.js";
export { validateEducationOutput, GUARDRAIL_PATTERNS } from "./validate.js";
export { MockMedicationEducationProvider } from "./providers/mock.js";
export type { MockProviderMode, MockProviderOptions } from "./providers/mock.js";
export { AnthropicMedicationEducationProvider } from "./providers/anthropic.js";
export type {
  QuestionCategory,
  QuestionDisposition,
  MedicationSnapshot,
  OtherMedicationSnapshot,
  MedicationEducationInput,
  MedicationEducationOutput,
  MedicationEducationResult,
  MedicationEducationProvider,
  AiUsage,
} from "./types.js";

export interface AiServiceEnv {
  AI_PROVIDER?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}

/**
 * Picks the provider implementation from environment configuration.
 * Defaults to the mock provider — the only provider this environment
 * actually runs with, since no ANTHROPIC_API_KEY is configured anywhere
 * here. Fails fast (same pattern as apps/api's SESSION_SECRET check) if
 * AI_PROVIDER=anthropic is requested without a key, rather than silently
 * falling back to the mock and misrepresenting what's running.
 */
export function createMedicationEducationProvider(env: AiServiceEnv): MedicationEducationProvider {
  const providerName = env.AI_PROVIDER ?? "mock";

  if (providerName === "anthropic") {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error(
        "AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set. Copy .env.example and configure it, or set AI_PROVIDER=mock for local development.",
      );
    }
    return new AnthropicMedicationEducationProvider({
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
    });
  }

  if (providerName !== "mock") {
    throw new Error(`Unknown AI_PROVIDER "${providerName}". Expected "mock" or "anthropic".`);
  }

  return new MockMedicationEducationProvider();
}
