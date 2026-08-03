import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { env } from "../config/env.js";

async function securityPlugins(app: FastifyInstance) {
  await app.register(cors, {
    origin: env.APP_ORIGINS,
    credentials: true,
  });

  await app.register(cookie, {
    secret: env.SESSION_SECRET,
    hook: "onRequest",
  });

  // Global default; auth routes apply stricter per-route limits (see
  // routes/auth.ts) to slow brute-force login/signup attempts specifically.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });
}

// fastify-plugin breaks Fastify's default encapsulation so the cors/cookie/
// rate-limit decorators are visible to sibling route registrations (e.g.
// routes/auth.ts), not just within this plugin's own child scope.
export const registerSecurityPlugins = fp(securityPlugins, { name: "security-plugins" });
