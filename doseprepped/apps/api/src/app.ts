import Fastify from "fastify";
import { registerSecurityPlugins } from "./plugins/security.js";
import { healthRoutes } from "./routes/health.js";
import { authRoutes } from "./routes/auth.js";
import { protectedRoutes } from "./routes/protected.js";
import { medicationRoutes } from "./routes/medications.js";
import { questionRoutes } from "./routes/questions.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
    // Keep request bodies bounded — a basic guard against oversized
    // payloads until per-route limits (e.g. file uploads) are added.
    bodyLimit: 1 * 1024 * 1024,
  });

  app.register(registerSecurityPlugins);
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(protectedRoutes);
  app.register(medicationRoutes);
  app.register(questionRoutes);

  return app;
}
