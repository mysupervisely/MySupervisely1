import Fastify from "fastify";
import type { MedicationEducationProvider } from "@doseprepped/ai-service";
import { createMedicationEducationProvider } from "@doseprepped/ai-service";
import { registerSecurityPlugins } from "./plugins/security.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { protectedRoutes } from "./routes/protected.js";
import { medicationRoutes } from "./routes/medications.js";
import { questionRoutes } from "./routes/questions.js";
import { env } from "./config/env.js";

export interface BuildAppOptions {
  /**
   * Overrides the AI provider normally selected from AI_PROVIDER/
   * ANTHROPIC_API_KEY. Tests inject a MockMedicationEducationProvider
   * here — see docs/doseprepped/ARCHITECTURE.md "Testing". Never
   * defaulted to a real network call in the test suite.
   */
  aiProvider?: MedicationEducationProvider;
  /** Overrides AI_TIMEOUT_MS — tests use a small value with the mock
   * provider's "slow" mode to exercise the timeout path quickly. */
  aiTimeoutMs?: number;
}

export function buildApp(options: BuildAppOptions = {}) {
  const app = Fastify({
    logger: true,
    // Keep request bodies bounded — a basic guard against oversized
    // payloads until per-route limits (e.g. file uploads) are added.
    bodyLimit: 1 * 1024 * 1024,
  });

  const aiProvider = options.aiProvider ?? createMedicationEducationProvider(env);
  const aiTimeoutMs = options.aiTimeoutMs ?? env.AI_TIMEOUT_MS;

  app.register(registerSecurityPlugins);
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(protectedRoutes);
  app.register(medicationRoutes);
  app.register(questionRoutes, { aiProvider, aiTimeoutMs });

  return app;
}
