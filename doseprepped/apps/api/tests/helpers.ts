import { randomUUID } from "node:crypto";
import type { LightMyRequestResponse } from "fastify";
import { prisma, Role } from "@doseprepped/db";
import { hashPassword } from "@doseprepped/auth";
import type { buildApp } from "../src/app.js";

export const TEST_EMAIL_DOMAIN = "test.doseprepped.local";
export const VALID_PASSWORD = "Sup3rSecret!Pass";

export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID()}@${TEST_EMAIL_DOMAIN}`;
}

export function cookieHeader(response: LightMyRequestResponse): string {
  return response.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

export async function createUserDirectly(role: Role, emailLabel: string) {
  const email = uniqueEmail(emailLabel);
  const passwordHash = await hashPassword(VALID_PASSWORD);
  const user = await prisma.user.create({
    data: { email, firstName: "Test", lastName: role, passwordHash, role },
  });
  return { user, email };
}

export async function loginAndGetCookie(
  app: ReturnType<typeof buildApp>,
  email: string,
  password = VALID_PASSWORD,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  });
  return cookieHeader(response);
}

export const VALID_MEDICATION_PAYLOAD = {
  name: "Lisinopril",
  strength: "10 mg",
  dosageForm: "Tablet",
  directions: "Take one tablet by mouth once daily.",
  frequency: "Once daily",
  route: "Oral",
  startDate: "2026-01-01",
};

export async function createMedicationForPatient(
  app: ReturnType<typeof buildApp>,
  cookie: string,
  overrides: Partial<typeof VALID_MEDICATION_PAYLOAD> = {},
) {
  const response = await app.inject({
    method: "POST",
    url: "/medications",
    headers: { cookie },
    payload: { ...VALID_MEDICATION_PAYLOAD, ...overrides },
  });
  return response.json().medication;
}
