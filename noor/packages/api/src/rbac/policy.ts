// Central authorization policy module — docs/noor/ARCHITECTURE.md §E.
//
// Every protected route calls into this module before touching data. No
// route handler should ever write `if (request.sessionUser.roles.includes(...))`
// inline — that pattern is exactly what this module exists to replace, so
// the "who can access what" logic lives in one reviewable place instead of
// being re-derived (and potentially re-derived incorrectly) per route.

import type { FastifyRequest } from "fastify";
import type { SessionUser } from "@noor/auth";
import { Permission, roleHasPermission, type Role } from "@noor/types";
import { AuthenticationError, AuthorizationError } from "../lib/errors.js";

/** Throws AuthenticationError if there is no valid session. Returns the
 * SessionUser so callers get a non-null type back. */
export function requireAuth(request: FastifyRequest): SessionUser {
  if (!request.sessionUser) {
    throw new AuthenticationError();
  }
  return request.sessionUser;
}

/** Throws AuthorizationError unless the authenticated user holds a role
 * that grants the given permission (see packages/types/src/permissions.ts
 * for the full matrix — this function is deliberately a thin wrapper so
 * the matrix stays the single source of truth). */
export function requirePermission(request: FastifyRequest, permission: Permission): SessionUser {
  const user = requireAuth(request);
  const hasIt = user.roles.some((role) => roleHasPermission(role as Role, permission));
  if (!hasIt) {
    throw new AuthorizationError();
  }
  return user;
}

/** Throws AuthorizationError unless the authenticated user holds at least
 * one of the given roles. Prefer requirePermission where a permission
 * exists for the action — this exists for the handful of cases (e.g.
 * "must specifically be a PATIENT to hit this patient-only endpoint")
 * where the check is about role identity, not a granted capability. */
export function requireRole(request: FastifyRequest, ...roles: Role[]): SessionUser {
  const user = requireAuth(request);
  if (!user.roles.some((role) => roles.includes(role as Role))) {
    throw new AuthorizationError();
  }
  return user;
}

/** Ensures the authenticated user is the PATIENT identified by
 * `patientId` — used for "self" resources like GET /patients/me. Never
 * lets an ADMIN, CLINICIAN, or a different PATIENT through, even though
 * ADMIN/CLINICIAN might pass a role check elsewhere; self-scoped resources
 * are self-scoped, full stop. */
export function requireSelfPatient(request: FastifyRequest, patientId: string): SessionUser {
  const user = requireAuth(request);
  if (user.patientId !== patientId) {
    throw new AuthorizationError();
  }
  return user;
}

/** Same as requireSelfPatient but for a clinician acting on their own
 * account-level resources (e.g. GET /clinicians/me). For clinician access
 * to a *patient's* resource, see rbac/care-relationship.ts instead — that
 * is a materially different check (ownership via CareRelationship, not
 * self-identity). */
export function requireSelfClinician(request: FastifyRequest, clinicianId: string): SessionUser {
  const user = requireAuth(request);
  if (user.clinicianId !== clinicianId) {
    throw new AuthorizationError();
  }
  return user;
}
