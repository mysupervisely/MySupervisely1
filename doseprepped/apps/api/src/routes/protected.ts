import type { FastifyInstance } from "fastify";
import { Role } from "@doseprepped/db";
import { requireRole } from "../lib/auth.js";

/**
 * Minimal, role-gated placeholder endpoints. They exist to prove RBAC is
 * enforced server-side (not just hidden in the frontend) and to give each
 * role's home screen a protected route to render against. No clinical,
 * pharmacist, or admin functionality lives behind them yet — that's out of
 * scope for M1.
 */
export async function protectedRoutes(app: FastifyInstance) {
  app.get("/patient/ping", { preHandler: requireRole(Role.PATIENT) }, async (request) => ({
    message: "pong",
    role: request.user?.role,
  }));

  app.get("/pharmacist/ping", { preHandler: requireRole(Role.PHARMACIST) }, async (request) => ({
    message: "pong",
    role: request.user?.role,
  }));

  app.get("/admin/ping", { preHandler: requireRole(Role.ADMIN) }, async (request) => ({
    message: "pong",
    role: request.user?.role,
  }));
}
