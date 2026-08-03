import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma, Role } from "@doseprepped/db";
import {
  TEST_EMAIL_DOMAIN,
  VALID_PASSWORD,
  createUserDirectly,
  loginAndGetCookie,
  uniqueEmail,
} from "./helpers.js";

// All accounts created by this file live under TEST_EMAIL_DOMAIN so they can
// be cleaned up here without touching seed or manually-created data.
afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } });
  await prisma.$disconnect();
});

describe("POST /auth/signup", () => {
  it("registers a new patient", async () => {
    const app = buildApp();
    const email = uniqueEmail("signup");

    const response = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        firstName: "Ada",
        lastName: "Lovelace",
        email,
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.user.email).toBe(email);
    expect(body.user.role).toBe("PATIENT");
    expect(response.cookies.some((c) => c.name === "doseprepped_session")).toBe(true);

    await app.close();
  });

  it("rejects duplicate email registration", async () => {
    const app = buildApp();
    const email = uniqueEmail("dup");
    const payload = {
      firstName: "Ada",
      lastName: "Lovelace",
      email,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
    };

    const first = await app.inject({ method: "POST", url: "/auth/signup", payload });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({ method: "POST", url: "/auth/signup", payload });
    expect(second.statusCode).toBe(409);

    await app.close();
  });

  it("never stores the password in plaintext", async () => {
    const app = buildApp();
    const email = uniqueEmail("hash-check");

    await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        firstName: "Ada",
        lastName: "Lovelace",
        email,
        password: VALID_PASSWORD,
        confirmPassword: VALID_PASSWORD,
      },
    });

    const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(stored.passwordHash).not.toBe(VALID_PASSWORD);
    expect(stored.passwordHash).not.toContain(VALID_PASSWORD);
    // bcrypt hashes are identifiable by their $2*$ prefix.
    expect(stored.passwordHash).toMatch(/^\$2[aby]?\$/);

    await app.close();
  });
});

describe("POST /auth/login and /auth/logout", () => {
  it("logs in with correct credentials", async () => {
    const app = buildApp();
    const { email } = await createUserDirectly(Role.PATIENT, "login");

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: VALID_PASSWORD },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe(email);

    await app.close();
  });

  it("rejects invalid credentials", async () => {
    const app = buildApp();
    const { email } = await createUserDirectly(Role.PATIENT, "badpw");

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email, password: "TotallyWrongPassword1" },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toMatch(/invalid email or password/i);

    await app.close();
  });

  it("logs out and invalidates the session", async () => {
    const app = buildApp();
    const { email } = await createUserDirectly(Role.PATIENT, "logout");
    const cookie = await loginAndGetCookie(app, email);

    const logoutResponse = await app.inject({
      method: "POST",
      url: "/auth/logout",
      headers: { cookie },
    });
    expect(logoutResponse.statusCode).toBe(204);

    const meAfterLogout = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { cookie },
    });
    expect(meAfterLogout.statusCode).toBe(401);

    await app.close();
  });
});

describe("Protected routes and role-based access control", () => {
  it("requires authentication for the protected patient route", async () => {
    const app = buildApp();
    const response = await app.inject({ method: "GET", url: "/patient/ping" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("allows a patient to access the patient route", async () => {
    const app = buildApp();
    const { email } = await createUserDirectly(Role.PATIENT, "rbac-patient-ok");
    const cookie = await loginAndGetCookie(app, email);

    const response = await app.inject({ method: "GET", url: "/patient/ping", headers: { cookie } });
    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it("blocks a patient from the pharmacist route", async () => {
    const app = buildApp();
    const { email } = await createUserDirectly(Role.PATIENT, "rbac-patient-vs-pharmacist");
    const cookie = await loginAndGetCookie(app, email);

    const response = await app.inject({ method: "GET", url: "/pharmacist/ping", headers: { cookie } });
    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it("blocks a patient from the admin route", async () => {
    const app = buildApp();
    const { email } = await createUserDirectly(Role.PATIENT, "rbac-patient-vs-admin");
    const cookie = await loginAndGetCookie(app, email);

    const response = await app.inject({ method: "GET", url: "/admin/ping", headers: { cookie } });
    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it("allows a pharmacist to access the pharmacist route", async () => {
    const app = buildApp();
    const { email } = await createUserDirectly(Role.PHARMACIST, "rbac-pharmacist-ok");
    const cookie = await loginAndGetCookie(app, email);

    const response = await app.inject({ method: "GET", url: "/pharmacist/ping", headers: { cookie } });
    expect(response.statusCode).toBe(200);

    await app.close();
  });

  it("blocks a pharmacist from the admin route", async () => {
    const app = buildApp();
    const { email } = await createUserDirectly(Role.PHARMACIST, "rbac-pharmacist-vs-admin");
    const cookie = await loginAndGetCookie(app, email);

    const response = await app.inject({ method: "GET", url: "/admin/ping", headers: { cookie } });
    expect(response.statusCode).toBe(403);

    await app.close();
  });

  it("allows an admin to access the admin route", async () => {
    const app = buildApp();
    const { email } = await createUserDirectly(Role.ADMIN, "rbac-admin-ok");
    const cookie = await loginAndGetCookie(app, email);

    const response = await app.inject({ method: "GET", url: "/admin/ping", headers: { cookie } });
    expect(response.statusCode).toBe(200);

    await app.close();
  });
});
