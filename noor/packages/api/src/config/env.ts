import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().min(1).default("0.0.0.0"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Signs the session cookie (@fastify/cookie) so a tampered cookie value is
  // rejected before it ever reaches a database lookup.
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  // Comma-separated allowed frontend origins for CORS.
  APP_ORIGINS: z
    .string()
    .min(1)
    .default("http://localhost:3000")
    .transform((value) => value.split(",").map((origin) => origin.trim())),
  // Cookie Domain attribute — see docs/noor/ARCHITECTURE.md §D and
  // .env.example for why "localhost" is safe to share across app ports in
  // local dev.
  SESSION_COOKIE_DOMAIN: z.string().min(1).default("localhost"),
  COOKIE_SECURE: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  // Provider abstraction selection — see docs/noor/ARCHITECTURE.md §G/§H/§I.
  // "mock" is the only value implemented in M1.
  EHR_PROVIDER: z.string().min(1).default("mock"),
  PAYMENT_PROVIDER: z.string().min(1).default("mock"),
  AI_PROVIDER: z.string().min(1).default("mock"),
  // Deterministic check-in safety-routing policy — see
  // packages/safety-policy and docs/noor/M3-IMPLEMENTATION.md "Safety
  // policy architecture". "default-placeholder" is the only value
  // implemented in M3 and is explicitly NOT a clinically-validated
  // protocol — see that package's default-policy.ts.
  SAFETY_POLICY_PROVIDER: z.string().min(1).default("default-placeholder"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    console.error(parsed.error.format());
    throw new Error("Invalid environment configuration. See .env.example.");
  }
  return parsed.data;
}

export const env = loadEnv();
