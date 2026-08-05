import { describe, expect, it } from "vitest";
import type { FastifyRequest } from "fastify";
import type { SessionUser } from "@noor/auth";
import { requireAuth, requirePermission, requireRole, requireSelfPatient, requireSelfClinician } from "../src/rbac/policy.js";
import { Permission } from "@noor/types";
import { AuthenticationError, AuthorizationError } from "../src/lib/errors.js";

function fakeRequest(sessionUser: SessionUser | null): FastifyRequest {
  return { sessionUser } as unknown as FastifyRequest;
}

function fakeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "user-1",
    email: "u@example.test",
    displayName: null,
    status: "ACTIVE",
    mfaEnabled: false,
    roles: ["PATIENT"],
    patientId: "patient-1",
    clinicianId: null,
    ...overrides,
  };
}

describe("requireAuth", () => {
  it("throws AuthenticationError when there is no session", () => {
    expect(() => requireAuth(fakeRequest(null))).toThrow(AuthenticationError);
  });

  it("returns the session user when authenticated", () => {
    const user = fakeUser();
    expect(requireAuth(fakeRequest(user))).toBe(user);
  });
});

describe("requirePermission", () => {
  it("throws AuthorizationError when the role lacks the permission", () => {
    const user = fakeUser({ roles: ["PATIENT"] });
    expect(() => requirePermission(fakeRequest(user), Permission.VIEW_AUDIT_LOG)).toThrow(AuthorizationError);
  });

  it("passes when the role grants the permission", () => {
    const user = fakeUser({ roles: ["ADMIN"], patientId: null });
    expect(() => requirePermission(fakeRequest(user), Permission.VIEW_AUDIT_LOG)).not.toThrow();
  });

  it("never grants VIEW_CLINICAL_CONTENT to ADMIN even indirectly through this helper", () => {
    const user = fakeUser({ roles: ["ADMIN"], patientId: null });
    expect(() => requirePermission(fakeRequest(user), Permission.VIEW_CLINICAL_CONTENT)).toThrow(AuthorizationError);
  });
});

describe("requireRole", () => {
  it("rejects a role not in the allowed set", () => {
    const user = fakeUser({ roles: ["PATIENT"] });
    expect(() => requireRole(fakeRequest(user), "ADMIN", "SUPER_ADMIN")).toThrow(AuthorizationError);
  });

  it("accepts a role in the allowed set", () => {
    const user = fakeUser({ roles: ["CLINICIAN"], patientId: null, clinicianId: "clinician-1" });
    expect(() => requireRole(fakeRequest(user), "CLINICIAN")).not.toThrow();
  });
});

describe("requireSelfPatient / requireSelfClinician", () => {
  it("rejects when the session's patientId does not match", () => {
    const user = fakeUser({ patientId: "patient-1" });
    expect(() => requireSelfPatient(fakeRequest(user), "someone-elses-patient-id")).toThrow(AuthorizationError);
  });

  it("accepts when the session's patientId matches", () => {
    const user = fakeUser({ patientId: "patient-1" });
    expect(() => requireSelfPatient(fakeRequest(user), "patient-1")).not.toThrow();
  });

  it("rejects when the session's clinicianId does not match", () => {
    const user = fakeUser({ roles: ["CLINICIAN"], patientId: null, clinicianId: "clinician-1" });
    expect(() => requireSelfClinician(fakeRequest(user), "someone-elses-clinician-id")).toThrow(AuthorizationError);
  });
});
