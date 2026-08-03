import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, Role } from "@doseprepped/db";
import {
  createSession,
  deleteSession,
  hashPassword,
  validatePasswordStrength,
  verifyPassword,
  type SessionUser,
} from "@doseprepped/auth";
import { authenticate, clearSessionCookie, readSessionToken, setSessionCookie } from "../lib/auth.js";

const emailSchema = z.string().trim().toLowerCase().email().max(255);
const nameSchema = z.string().trim().min(1, "This field is required.").max(100);

const signupSchema = z
  .object({
    firstName: nameSchema,
    lastName: nameSchema,
    email: emailSchema,
    password: z.string(),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required."),
});

function serializeUser(user: SessionUser | { id: string; email: string; firstName: string; lastName: string; role: Role; createdAt: Date }) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

// Stricter than the global default (see plugins/security.ts) to slow
// credential-stuffing / brute-force attempts specifically.
const authRateLimit = { max: 10, timeWindow: "1 minute" };

export async function authRoutes(app: FastifyInstance) {
  app.post(
    "/auth/signup",
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const parsed = signupSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }

      const { firstName, lastName, email, password } = parsed.data;

      const passwordCheck = validatePasswordStrength(password);
      if (!passwordCheck.valid) {
        return reply.code(400).send({ error: "Password does not meet requirements.", details: passwordCheck.errors });
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return reply.code(409).send({ error: "An account with this email already exists." });
      }

      const passwordHash = await hashPassword(password);
      const user = await prisma.user.create({
        data: { firstName, lastName, email, passwordHash, role: Role.PATIENT },
      });

      const { token, expiresAt } = await createSession(user.id);
      setSessionCookie(reply, token, expiresAt);

      return reply.code(201).send({ user: serializeUser(user) });
    },
  );

  app.post(
    "/auth/login",
    { config: { rateLimit: authRateLimit } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }

      const { email, password } = parsed.data;
      const genericError = { error: "Invalid email or password." };

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || user.deletedAt) {
        return reply.code(401).send(genericError);
      }

      const passwordValid = await verifyPassword(password, user.passwordHash);
      if (!passwordValid) {
        return reply.code(401).send(genericError);
      }

      const { token, expiresAt } = await createSession(user.id);
      setSessionCookie(reply, token, expiresAt);

      return reply.send({ user: serializeUser(user) });
    },
  );

  app.post("/auth/logout", { preHandler: authenticate }, async (request, reply) => {
    await deleteSession(readSessionToken(request));
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get("/auth/me", { preHandler: authenticate }, async (request, reply) => {
    if (!request.user) {
      return reply.code(401).send({ error: "Authentication required." });
    }
    return reply.send({ user: serializeUser(request.user) });
  });
}
