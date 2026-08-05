import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import { env } from "../config/env.js";

async function securityPlugins(app: FastifyInstance) {
  // Exact-origin allowlist, not a wildcard — required for credentialed
  // (cookie-bearing) cross-origin requests from the three separate
  // frontend origins. See docs/noor/ARCHITECTURE.md §J.
  await app.register(cors, {
    origin: env.APP_ORIGINS,
    credentials: true,
    // @fastify/cors's own default method list is GET,HEAD,POST — missing
    // PATCH (onboarding/profile updates) and DELETE, which silently
    // breaks those requests at the browser's CORS preflight step (the
    // request never even reaches a route handler, so nothing appears in
    // server logs). Every method any route in this API actually uses
    // must be listed here explicitly.
    methods: ["GET", "HEAD", "POST", "PATCH", "PUT", "DELETE"],
  });

  await app.register(cookie, {
    secret: env.SESSION_SECRET,
    hook: "onRequest",
  });

  // Global default; auth routes apply a stricter per-route limit (see
  // routes/auth.ts) specifically to slow brute-force login/signup attempts.
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });
}

// fastify-plugin breaks Fastify's default encapsulation so the cors/cookie/
// rate-limit decorators are visible to sibling route registrations, not
// just within this plugin's own child scope.
export const registerSecurityPlugins = fp(securityPlugins, { name: "security-plugins" });
