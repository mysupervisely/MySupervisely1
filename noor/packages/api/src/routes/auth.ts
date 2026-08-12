import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, RoleName } from "@noor/db";
import { hashPassword, verifyPassword, validatePasswordStrength, createSession, deleteSession, SESSION_COOKIE_NAME } from "@noor/auth";
import { env } from "../config/env.js";
import { AuthenticationError, ConflictError, ValidationError } from "../lib/errors.js";
import { requireAuth } from "../rbac/policy.js";
import { recordAuditEvent } from "../audit/audit-service.js";
import { AuditAction } from "../audit/actions.js";
import { readRawSessionToken } from "../lib/session-token.js";

// `clientType` distinguishes TRANSPORT (cookie vs. bearer token), not
// identity — see docs/noor/M5-IMPLEMENTATION.md §6. It is orthogonal to
// the pre-existing `app` field (which frontend — "patient"/"clinician" —
// for audit purposes). Only `clientType: "native"` causes the raw session
// token to be echoed in the response body; every other value (including
// the default) preserves today's web behavior exactly, where the raw
// token is NEVER present in a JS-readable response.
const clientTypeSchema = z.enum(["web", "native"]).optional();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  app: z.string().optional(),
  clientType: clientTypeSchema,
  // Deliberately no `role` field: public self-signup always creates a
  // PATIENT account. Clinician and admin accounts are provisioned out of
  // band (dev seed script in M1; a real provisioning process is a later
  // milestone) — accepting a client-supplied role here would be a
  // privilege-escalation vulnerability.
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  app: z.string().optional(),
  clientType: clientTypeSchema,
});

function setSessionCookie(reply: import("fastify").FastifyReply, token: string, expiresAt: Date) {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: "lax",
    domain: env.SESSION_COOKIE_DOMAIN,
    signed: true,
    expires: expiresAt,
  });
}

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/auth/signup",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = signupSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid signup request.");
      const { email, password, app: issuedForApp, clientType } = parsed.data;

      const strength = validatePasswordStrength(password);
      if (!strength.valid) throw new ValidationError(strength.errors.join(" "));

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new ConflictError("An account with this email already exists.");

      const patientRole = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.PATIENT } });
      const passwordHash = await hashPassword(password);

      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          status: "ACTIVE", // M1 does not enforce email-verification-gated access — see known limitations
          roles: { create: { roleId: patientRole.id } },
          patient: { create: { profile: { create: {} } } },
        },
      });

      const { token, expiresAt } = await createSession(user.id, {
        issuedForApp: issuedForApp ?? "patient",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });
      setSessionCookie(reply, token, expiresAt);

      await recordAuditEvent({
        request,
        actorUserId: user.id,
        actorRole: RoleName.PATIENT,
        action: AuditAction.AUTH_SIGNUP,
        entityType: "user",
        entityId: user.id,
        metadata: {},
      });

      reply.code(201);
      return {
        user: { id: user.id, email: user.email, roles: [RoleName.PATIENT] },
        // Only ever present for clientType: "native" — a web caller's
        // response body NEVER contains the raw token, unchanged from
        // pre-M5 behavior. See docs/noor/M5-IMPLEMENTATION.md §6.3.
        ...(clientType === "native" ? { session: { token, expiresAt: expiresAt.toISOString() } } : {}),
      };
    },
  );

  app.post(
    "/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) throw new ValidationError("Invalid login request.");
      const { email, password, app: issuedForApp, clientType } = parsed.data;

      const user = await prisma.user.findUnique({
        where: { email },
        include: { roles: { include: { role: true } } },
      });

      // Constant-shape failure path: verify against a real hash if the
      // account exists, otherwise still take the hashing cost of a dummy
      // comparison, so responses don't reveal by timing whether an email
      // is registered. bcrypt.compare against a fixed dummy hash below is
      // deliberately unconditional.
      const passwordOk = user
        ? await verifyPassword(password, user.passwordHash)
        : await verifyPassword(password, "$2a$12$invalidsaltinvalidsaltinvalidsaltinvalidsaltinva");

      if (!user || !passwordOk || user.status !== "ACTIVE") {
        await recordAuditEvent({
          request,
          actorUserId: null,
          actorRole: null,
          action: AuditAction.AUTH_LOGIN_FAILURE,
          entityType: "user",
          entityId: user?.id ?? email,
        });
        throw new AuthenticationError("Invalid email or password.");
      }

      const { token, expiresAt } = await createSession(user.id, {
        issuedForApp: issuedForApp ?? "unknown",
        ipAddress: request.ip,
        userAgent: request.headers["user-agent"],
      });
      setSessionCookie(reply, token, expiresAt);

      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

      const roles = user.roles.map((r) => r.role.name);
      await recordAuditEvent({
        request,
        actorUserId: user.id,
        actorRole: roles.join(","),
        action: AuditAction.AUTH_LOGIN_SUCCESS,
        entityType: "user",
        entityId: user.id,
      });

      return {
        user: { id: user.id, email: user.email, roles },
        // Only ever present for clientType: "native" — see signup above
        // and docs/noor/M5-IMPLEMENTATION.md §6.3.
        ...(clientType === "native" ? { session: { token, expiresAt: expiresAt.toISOString() } } : {}),
      };
    },
  );

  app.post("/auth/logout", async (request, reply) => {
    // Resolves either transport (cookie or native bearer header) so a
    // native client's logout actually revokes ITS session row — see
    // docs/noor/M5-IMPLEMENTATION.md §6.3 "Revocation."
    const rawToken = readRawSessionToken(request);
    if (rawToken) {
      await deleteSession(rawToken);
    }
    reply.clearCookie(SESSION_COOKIE_NAME, { path: "/", domain: env.SESSION_COOKIE_DOMAIN });

    if (request.sessionUser) {
      await recordAuditEvent({
        request,
        action: AuditAction.AUTH_LOGOUT,
        entityType: "user",
        entityId: request.sessionUser.id,
      });
    }

    return { ok: true };
  });

  app.get("/auth/me", async (request) => {
    const user = requireAuth(request);
    // Deliberately returns only account/identity fields — never PHI, never
    // clinical content. See docs/noor/ARCHITECTURE.md §F.
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: user.roles,
      mfaEnabled: user.mfaEnabled,
      patientId: user.patientId,
      clinicianId: user.clinicianId,
    };
  });
}
