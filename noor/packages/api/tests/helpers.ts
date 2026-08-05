// Test helpers for the API integration suite. These tests run against a
// REAL local Postgres database (never a mock DB layer) so that RBAC and
// ownership/care-relationship queries are exercised for real — see
// docs/noor/M1-IMPLEMENTATION.md "Tests." The target database must:
//   1. Point DATABASE_URL at a database used ONLY for tests.
//   2. Already have migrations applied (`pnpm db:migrate:deploy`) before
//      the suite runs — see package.json / CI workflow.
// resetDatabase() below truncates every table between tests; it refuses to
// run unless DATABASE_URL contains "test", as a guardrail against ever
// truncating a real environment's data by accident.

import type { FastifyInstance } from "fastify";
import { prisma, RoleName, CareRelationshipStatus, CareRelationshipType } from "@noor/db";
import { hashPassword } from "@noor/auth";
import { buildApp } from "../src/app.js";
import { ensureRolesSeeded } from "../src/lib/bootstrap.js";

export async function resetDatabase(): Promise<void> {
  const url = process.env["DATABASE_URL"] ?? "";
  if (!url.includes("test")) {
    throw new Error(
      `Refusing to reset a database whose connection string does not contain "test" (got: ${url}). ` +
        "This guard exists so the test suite can never accidentally truncate a dev/staging/production database.",
    );
  }

  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE audit_events, sessions, care_relationships, patient_profiles, patients, clinician_profiles, clinicians, user_roles, users, roles RESTART IDENTITY CASCADE`,
  );
  await ensureRolesSeeded();
}

export function makeApp(): FastifyInstance {
  return buildApp();
}

const TEST_PASSWORD = "Test-Password-9";

export interface SeededUser {
  userId: string;
  email: string;
  cookie: string;
}

async function loginAndGetCookie(app: FastifyInstance, email: string, password: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Test login failed for ${email}: ${response.statusCode} ${response.body}`);
  }
  const setCookie = response.headers["set-cookie"];
  const cookieHeader = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!cookieHeader) throw new Error("Login response did not set a session cookie.");
  return cookieHeader.split(";")[0]!;
}

export async function createPatient(app: FastifyInstance, email: string): Promise<SeededUser> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.PATIENT } });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(TEST_PASSWORD),
      status: "ACTIVE",
      roles: { create: { roleId: role.id } },
      patient: { create: { profile: { create: { firstName: "Test", lastName: "Patient" } } } },
    },
    include: { patient: true },
  });
  const cookie = await loginAndGetCookie(app, email, TEST_PASSWORD);
  return { userId: user.id, email, cookie };
}

export async function createClinician(app: FastifyInstance, email: string): Promise<SeededUser> {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: RoleName.CLINICIAN } });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(TEST_PASSWORD),
      status: "ACTIVE",
      roles: { create: { roleId: role.id } },
      clinician: { create: { profile: { create: { displayName: "Test Clinician" } } } },
    },
    include: { clinician: true },
  });
  const cookie = await loginAndGetCookie(app, email, TEST_PASSWORD);
  return { userId: user.id, email, cookie };
}

export async function createAdmin(app: FastifyInstance, email: string, role: "ADMIN" | "SUPER_ADMIN" = "ADMIN"): Promise<SeededUser> {
  const roleRow = await prisma.role.findUniqueOrThrow({ where: { name: role as RoleName } });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(TEST_PASSWORD),
      status: "ACTIVE",
      roles: { create: { roleId: roleRow.id } },
    },
  });
  const cookie = await loginAndGetCookie(app, email, TEST_PASSWORD);
  return { userId: user.id, email, cookie };
}

export async function getPatientId(userId: string): Promise<string> {
  const patient = await prisma.patient.findUniqueOrThrow({ where: { userId } });
  return patient.id;
}

export async function getClinicianId(userId: string): Promise<string> {
  const clinician = await prisma.clinician.findUniqueOrThrow({ where: { userId } });
  return clinician.id;
}

export async function createActiveCareRelationship(patientId: string, clinicianId: string) {
  return prisma.careRelationship.create({
    data: {
      patientId,
      clinicianId,
      status: CareRelationshipStatus.ACTIVE,
      relationshipType: CareRelationshipType.ASYNC,
      startedAt: new Date(),
    },
  });
}

export { TEST_PASSWORD };
