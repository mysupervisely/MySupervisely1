import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";

export function buildApp() {
  const app = Fastify({
    logger: true,
    // Keep request bodies bounded — a basic guard against oversized
    // payloads until per-route limits (e.g. file uploads) are added.
    bodyLimit: 1 * 1024 * 1024,
  });

  app.register(healthRoutes);

  return app;
}
