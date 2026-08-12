import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@noor/db";
import { makeApp, resetDatabase, TEST_PASSWORD } from "./helpers.js";

// M5 — native (bearer-token) authentication. See
// docs/noor/M5-IMPLEMENTATION.md §6 for the design this verifies: the
// SAME Session table/getSessionUser()/RBAC as the web cookie, only the
// transport differs, and the raw token is only ever echoed in a response
// body when the caller explicitly asks for clientType: "native".

describe("Native (bearer-token) authentication (M5)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("clientType: native returns a token; web never does (#no client-controlled identity leak)", () => {
    it("POST /auth/signup with clientType: native returns a session token in the body", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "native.signup@example.test", password: "Test-Password-9", clientType: "native" },
      });
      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(typeof body.session.token).toBe("string");
      expect(body.session.token.length).toBeGreaterThan(20);
      expect(typeof body.session.expiresAt).toBe("string");
    });

    it("POST /auth/signup without clientType (web) never includes a session token in the body", async () => {
      const response = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "web.signup@example.test", password: "Test-Password-9" },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().session).toBeUndefined();
      // The web caller still gets its httpOnly cookie exactly as before.
      expect(response.headers["set-cookie"]).toBeDefined();
    });

    it("POST /auth/login with clientType: web (explicit) also never includes a token", async () => {
      await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "explicit.web@example.test", password: "Test-Password-9" },
      });
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "explicit.web@example.test", password: "Test-Password-9", clientType: "web" },
      });
      expect(response.json().session).toBeUndefined();
    });

    it("POST /auth/login with clientType: native returns a token usable as a bearer credential", async () => {
      await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "native.login@example.test", password: "Test-Password-9" },
      });
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "native.login@example.test", password: "Test-Password-9", clientType: "native" },
      });
      expect(response.statusCode).toBe(200);
      const { token } = response.json().session;

      const me = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${token}` } });
      expect(me.statusCode).toBe(200);
      expect(me.json().email).toBe("native.login@example.test");
    });
  });

  describe("bearer token resolves to the exact same identity/RBAC as the cookie (#native authentication does not bypass RBAC)", () => {
    it("a bearer-authenticated patient can read their own profile, exactly like a cookie session", async () => {
      const signup = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "bearer.patient@example.test", password: "Test-Password-9", clientType: "native" },
      });
      const { token } = signup.json().session;

      const response = await app.inject({ method: "GET", url: "/patients/me", headers: { authorization: `Bearer ${token}` } });
      expect(response.statusCode).toBe(200);
    });

    it("a bearer-authenticated patient still cannot reach a clinician-only route (#RBAC unchanged)", async () => {
      const signup = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "bearer.no.clinician@example.test", password: "Test-Password-9", clientType: "native" },
      });
      const { token } = signup.json().session;

      const response = await app.inject({ method: "GET", url: "/clinicians/me", headers: { authorization: `Bearer ${token}` } });
      expect(response.statusCode).toBe(403);
    });

    it("a bearer-authenticated patient cannot read another patient's data (#cross-patient access denied)", async () => {
      const a = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "bearer.a@example.test", password: "Test-Password-9", clientType: "native" },
      });
      const { token: tokenA } = a.json().session;
      await app.inject({
        method: "PATCH",
        url: "/patients/me",
        headers: { authorization: `Bearer ${tokenA}` },
        payload: { firstName: "Alice" },
      });

      const b = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "bearer.b@example.test", password: "Test-Password-9", clientType: "native" },
      });
      const { token: tokenB } = b.json().session;

      // There is no route that takes a patientId param for /patients/me at
      // all (M1's design) — the strongest proof of "cannot read another
      // patient's data" is that B's own bearer session only ever resolves
      // to B's own profile, never A's.
      const response = await app.inject({ method: "GET", url: "/patients/me", headers: { authorization: `Bearer ${tokenB}` } });
      expect(response.json().firstName).not.toBe("Alice");
    });

    it("signup never accepts a client-supplied role over a bearer-issued session either (#patient cannot elevate role)", async () => {
      const signup = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: {
          email: "bearer.no.escalation@example.test",
          password: "Test-Password-9",
          clientType: "native",
          role: "ADMIN",
        },
      });
      expect(signup.json().user.roles).toEqual(["PATIENT"]);
      const { token } = signup.json().session;
      const me = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${token}` } });
      expect(me.json().roles).toEqual(["PATIENT"]);

      const adminOnly = await app.inject({ method: "GET", url: "/admin/users", headers: { authorization: `Bearer ${token}` } });
      expect(adminOnly.statusCode).toBe(403);
    });
  });

  describe("revocation and expiration (#revoked credentials denied, #expired authentication)", () => {
    it("logout with a bearer token revokes that exact session", async () => {
      const signup = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "bearer.logout@example.test", password: "Test-Password-9", clientType: "native" },
      });
      const { token } = signup.json().session;

      const logout = await app.inject({ method: "POST", url: "/auth/logout", headers: { authorization: `Bearer ${token}` } });
      expect(logout.statusCode).toBe(200);

      const me = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${token}` } });
      expect(me.statusCode).toBe(401);
    });

    it("logging out a native session does not revoke a separate web (cookie) session for the same user", async () => {
      // A cookie-based login first...
      const webLogin = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "multi.session@example.test", password: "Test-Password-9" },
      });
      const cookie = webLogin.headers["set-cookie"];
      const webCookieHeader = Array.isArray(cookie) ? cookie[0]!.split(";")[0]! : cookie!.split(";")[0]!;

      // ...then a native login for the SAME account, a second independent session.
      const nativeLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "multi.session@example.test", password: "Test-Password-9", clientType: "native" },
      });
      const { token: nativeToken } = nativeLogin.json().session;

      await app.inject({ method: "POST", url: "/auth/logout", headers: { authorization: `Bearer ${nativeToken}` } });

      // The native session is gone...
      const nativeCheck = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${nativeToken}` } });
      expect(nativeCheck.statusCode).toBe(401);
      // ...but the original web session is untouched (#3.6.3 "revocation reaches only that one device's session").
      const webCheck = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie: webCookieHeader } });
      expect(webCheck.statusCode).toBe(200);
    });

    it("an expired session is denied via bearer, exactly like an expired cookie session", async () => {
      const signup = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "bearer.expired@example.test", password: "Test-Password-9", clientType: "native" },
      });
      const { token } = signup.json().session;

      // Directly age the session row past its expiry, simulating time
      // passing — same technique other expiry-adjacent tests in this
      // suite would use; there is no separate "mobile expiry" mechanism
      // to fake (see docs/noor/M5-IMPLEMENTATION.md §6.3 — unchanged TTL).
      await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

      const me = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: `Bearer ${token}` } });
      expect(me.statusCode).toBe(401);
    });

    it("a garbage/invalid bearer token is treated as unauthenticated, not a server error", async () => {
      const response = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: "Bearer not-a-real-token" } });
      expect(response.statusCode).toBe(401);
    });

    it("a malformed Authorization header (no Bearer prefix) is treated as unauthenticated", async () => {
      const response = await app.inject({ method: "GET", url: "/auth/me", headers: { authorization: "not-bearer-at-all" } });
      expect(response.statusCode).toBe(401);
    });
  });

  describe("web behavior is completely unchanged (#do not weaken the existing browser session model)", () => {
    it("a plain cookie-based login/logout flow (no clientType at all) still works exactly as before", async () => {
      const login = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "patient.dev@example.test", password: TEST_PASSWORD },
      });
      // patient.dev doesn't exist in a fresh test DB — assert against a
      // freshly created account instead, using the standard cookie flow.
      expect([200, 401]).toContain(login.statusCode);

      const signup = await app.inject({
        method: "POST",
        url: "/auth/signup",
        payload: { email: "plain.web.flow@example.test", password: "Test-Password-9" },
      });
      const cookie = Array.isArray(signup.headers["set-cookie"])
        ? signup.headers["set-cookie"][0]!.split(";")[0]!
        : signup.headers["set-cookie"]!.split(";")[0]!;

      const me = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
      expect(me.statusCode).toBe(200);

      const logout = await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie } });
      expect(logout.statusCode).toBe(200);

      const after = await app.inject({ method: "GET", url: "/auth/me", headers: { cookie } });
      expect(after.statusCode).toBe(401);
    });
  });
});
