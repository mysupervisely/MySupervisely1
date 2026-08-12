import Fastify from "fastify";
import type { FastifyError } from "fastify";
import { registerSecurityPlugins } from "./plugins/security.js";
import { registerSessionPlugin } from "./plugins/session.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { patientRoutes } from "./routes/patients.js";
import { clinicianRoutes } from "./routes/clinicians.js";
import { adminRoutes } from "./routes/admin.js";
import { checkInRoutes } from "./routes/checkins.js";
import { HttpError } from "./lib/errors.js";

export function buildApp() {
  const app = Fastify({
    // Quiet in tests — assertion output is what matters there; a real
    // deployment should still get structured request logs.
    logger: process.env["NODE_ENV"] !== "test",
    // Keep request bodies bounded — a basic guard against oversized
    // payloads.
    bodyLimit: 1 * 1024 * 1024,
  });

  app.register(registerSecurityPlugins);
  app.register(registerSessionPlugin);
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(patientRoutes);
  app.register(clinicianRoutes);
  app.register(adminRoutes);
  app.register(checkInRoutes);

  // Global safety net. Every deliberate route response already throws one
  // of the typed errors in lib/errors.ts or calls reply.send(...) directly;
  // this only intercepts *unexpected* exceptions (e.g. a raw Prisma error)
  // so their message/stack/internal detail is never forwarded to the
  // client — see docs/noor/ARCHITECTURE.md §J "no PHI in ... error
  // messages" and §15 of the product brief.
  app.setErrorHandler((error: FastifyError | HttpError, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    request.log.error({ err: error }, "Unhandled request error");

    const fastifyError = error as FastifyError;

    // @fastify/rate-limit already produces a safe, client-actionable 429.
    if (fastifyError.statusCode === 429) {
      return reply.code(429).send({ error: fastifyError.message });
    }

    // Fastify's own request-parsing errors (oversized body, malformed
    // JSON, unsupported content-type) are genuine 4xx client errors, but
    // their built-in messages can include framework detail we don't want
    // to promise as stable API surface — respond with the same status
    // code and a generic message instead.
    if (typeof fastifyError.statusCode === "number" && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
      return reply.code(fastifyError.statusCode).send({ error: "Invalid request." });
    }

    // Anything else is unexpected — never leak the error message, stack
    // trace, or any internal detail (e.g. a raw database error, which
    // could echo back query values) to the client.
    return reply.code(500).send({ error: "Something went wrong. Please try again." });
  });

  return app;
}
