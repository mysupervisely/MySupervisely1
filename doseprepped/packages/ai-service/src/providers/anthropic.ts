import { buildPrompt, PROMPT_VERSION } from "../prompt.js";
import type {
  MedicationEducationInput,
  MedicationEducationProvider,
  MedicationEducationResult,
} from "../types.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_API_VERSION = "2023-06-01";

export interface AnthropicProviderOptions {
  apiKey: string;
  model?: string;
}

/**
 * Minimal fetch-based client for Anthropic's Messages API — no SDK
 * dependency, matching packages/safety-rules's zero-extra-dependency
 * style as closely as an HTTP-calling provider can. Never called by any
 * automated test (see docs/doseprepped/ARCHITECTURE.md "Testing"); only
 * constructed at runtime when AI_PROVIDER=anthropic and
 * ANTHROPIC_API_KEY is present.
 *
 * Returns raw, unvalidated JSON — the caller (apps/api) always runs the
 * result through validateEducationOutput before trusting it, exactly like
 * the mock provider's output.
 */
export class AnthropicMedicationEducationProvider implements MedicationEducationProvider {
  readonly providerName = "anthropic";
  private readonly apiKey: string;
  private readonly model: string;

  constructor(options: AnthropicProviderOptions) {
    this.apiKey = options.apiKey;
    this.model = options.model ?? "claude-sonnet-5";
  }

  async generateEducation(input: MedicationEducationInput): Promise<MedicationEducationResult> {
    const { system, user } = buildPrompt(input);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });

    if (!response.ok) {
      throw new Error(`anthropic provider: HTTP ${response.status}`);
    }

    const body = (await response.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = body.content?.find((block) => block.type === "text")?.text;
    if (!text) {
      throw new Error("anthropic provider: no text content in response");
    }

    // The model is instructed to return only a JSON object; parsing
    // failure here is treated the same as any other provider failure by
    // the caller (fail safe, no fabricated content shown).
    const parsed: unknown = JSON.parse(text);

    return {
      output: parsed as never, // validated by the caller, never trusted here
      provider: this.providerName,
      model: this.model,
      promptVersion: PROMPT_VERSION,
      usage: {
        inputTokens: body.usage?.input_tokens ?? 0,
        outputTokens: body.usage?.output_tokens ?? 0,
      },
    };
  }
}
