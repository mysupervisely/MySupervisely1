import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@noor/db";
import { makeApp, resetDatabase, createPatient, TEST_PASSWORD } from "./helpers.js";

describe("auth", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("POST /auth/signup", () => {
    it("creates a PATIENT account and sets an httpOnly session cookie", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "new.patient@example.test", password: "Correct-Horse-9" },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.user.email).toBe("new.patient@example.test");
      expect(body.user.roles).toEqual(["PATIENT"]);

      const setCookie = response.headers["set-cookie"];
      const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
      expect(cookieHeader).toContain("HttpOnly");
      expect(cookieHeader).toMatch(/noor_session=/);
    });

    it("provisions a Patient + PatientProfile row (not just a User row)", async () => {
      await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "provisioned@example.test", password: "Correct-Horse-9" },
      });
      const user = await prisma.user.findUniqueOrThrow({ where: { email: "provisioned@example.test" }, include: { patient: { include: { profile: true } } } });
      expect(user.patient).not.toBeNull();
      expect(user.patient?.profile).not.toBeNull();
    });

    it("never accepts a client-supplied role (privilege escalation guard)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "wannabe.admin@example.test", password: "Correct-Horse-9", role: "SUPER_ADMIN" },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().user.roles).toEqual(["PATIENT"]);
    });

    it("rejects a weak password", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "weak@example.test", password: "short" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects a duplicate email with 409, not 500", async () => {
      await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "dupe@example.test", password: "Correct-Horse-9" },
      });
      const second = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "dupe@example.test", password: "Another-Horse-9" },
      });
      expect(second.statusCode).toBe(409);
    });

    it("records an audit event for the signup", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "audited@example.test", password: "Correct-Horse-9" },
      });
      const userId = response.json().user.id;
      const events = await prisma.auditEvent.findMany({ where: { entityId: userId, action: "auth.signup" } });
      expect(events).toHaveLength(1);
    });
  });

  describe("POST /auth/login", () => {
    it("logs in with correct credentials", async () => {
      await createPatient(app, "login.me@example.test");
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "login.me@example.test", password: TEST_PASSWORD },
      });
      expect(response.statusCode).toBe(200);
    });

    it("rejects an incorrect password with 401 and records a login-failure audit event", async () => {
      await createPatient(app, "wrong.pw@example.test");
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "wrong.pw@example.test", password: "totally-wrong-9" },
      });
      expect(response.statusCode).toBe(401);
      const events = await prisma.auditEvent.findMany({ where: { action: "auth.login.failure" } });
      expect(events.length).toBeGreaterThan(0);
    });

    it("rejects an unknown email with the same 401 (no user enumeration)", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "does.not.exist@example.test", password: "whatever-9" },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error).toBe("Invalid email or password.");
    });
  });

  describe("GET /auth/me", () => {
    it("requires authentication", async () => {
      const response = await app.inject({ method: "GET", url: "/auth/me" });
      expect(response.statusCode).toBe(401);
    });

    it("returns identity fields for an authenticated user, never a password hash", async () => {
      const { cookie } = await createPatient(app, "me.check@example.test");
      const response = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.email).toBe("me.check@example.test");
      expect(body).not.toHaveProperty("passwordHash");
      expect(JSON.stringify(body)).not.toContain(TEST_PASSWORD);
    });
  });

  describe("POST /auth/logout", () => {
    it("invalidates the session so /auth/me subsequently requires re-authentication", async () => {
      const { cookie } = await createPatient(app, "logout.me@example.test");
      const logoutResponse = await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie } });
      expect(logoutResponse.statusCode).toBe(200);

      const meResponse = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
      expect(meResponse.statusCode).toBe(401);
    });
  });

  describe("tampered session cookie", () => {
    it("is treated as unauthenticated, not trusted", async () => {
      const response = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { cookie: "noor_session=not-a-real-signed-value" },
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
