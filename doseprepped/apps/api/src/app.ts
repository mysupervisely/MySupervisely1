import Fastify from "fastify";
import type { FastifyError } from "fastify";
import type { MedicationEducationProvider } from "@doseprepped/ai-service";
import { createMedicationEducationProvider } from "@doseprepped/ai-service";
import { registerSecurityPlugins } from "./plugins/security.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { protectedRoutes } from "./routes/protected.js";
import { medicationRoutes } from "./routes/medications.js";
import { questionRoutes } from "./routes/questions.js";
import { pharmacistQuestionRoutes } from "./routes/pharmacist-questions.js";
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
  app.register(pharmacistQuestionRoutes);

  // M5.1 — global safety net. Every deliberate route response
  // (400/401/403/404/409) already calls reply.code(...).send({ error })
  // directly and never reaches this handler, since a handled response
  // isn't a thrown error. This only intercepts *unexpected* exceptions
  // (e.g. a raw Prisma error) so their message/stack/internal detail is
  // never forwarded to the client — see
  // docs/doseprepped/ARCHITECTURE.md "M5.1 — Error handling".
  app.setErrorHandler((error: FastifyError, request, reply) => {
    request.log.error({ err: error }, "Unhandled request error");

    // @fastify/rate-limit already produces a safe, client-actionable 429
    // — pass it through unchanged.
    if (error.statusCode === 429) {
      return reply.code(429).send({ error: error.message });
    }

    // Fastify's own request-parsing errors (oversized body, malformed
    // JSON, unsupported content-type) are genuine 4xx client errors, but
    // their built-in messages can include framework detail we don't want
    // to promise as stable API surface — respond with the same status
    // code and a generic message instead.
    if (typeof error.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: "Invalid request." });
    }

    // Anything else is unexpected — never leak the error message, stack
    // trace, or any internal detail (e.g. a raw database error) to the
    // client.
    return reply.code(500).send({ error: "Something went wrong. Please try again." });
  });

  return app;
}
