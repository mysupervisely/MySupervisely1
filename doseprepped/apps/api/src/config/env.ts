import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Used to sign the session cookie (see @fastify/cookie) so a tampered
  // cookie value is rejected before it ever reaches a database lookup.
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  // Origin of the frontend app, for CORS. Comma-separated for multiple.
  APP_ORIGINS: z
    .string()
    .min(1)
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim())),
  // M3 Phase 3 — see @doseprepped/ai-service. "mock" is the only provider
  // that actually runs in this environment; ANTHROPIC_API_KEY is only
  // required when AI_PROVIDER=anthropic (enforced below, same fail-fast
  // pattern as SESSION_SECRET).
  AI_PROVIDER: z.enum(["mock", "anthropic"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).optional(),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    console.error(parsed.error.format());
    throw new Error("Invalid environment configuration. See .env.example.");
  }
  if (parsed.data.AI_PROVIDER === "anthropic" && !parsed.data.ANTHROPIC_API_KEY) {
    throw new Error(
      "AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY to be set. Set AI_PROVIDER=mock for local development instead.",
    );
  }
  return parsed.data;
}

export const env = loadEnv();
