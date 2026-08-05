import type { Role } from "./role";

/**
 * Central permission catalog (docs/noor/ARCHITECTURE.md §E). This is the
 * single source of truth for "what can each role do," consumed by
 * packages/api/src/rbac so authorization checks read `requirePermission(...)`
 * instead of scattered `role === "ADMIN"` checks scattered across route
 * handlers — a maintainability requirement (dev rule 20), not just a
 * security one.
 *
 * Two permissions are deliberately NOT granted to ADMIN or SUPER_ADMIN
 * below: VIEW_CLINICAL_CONTENT and VIEW_ASSIGNED_PATIENTS. Per the M1
 * implementation requirement ("Admin access must NOT automatically grant
 * access to clinical/PHI data"), an administrator role never implies
 * clinical-content access — that would require a distinct, explicitly
 * granted capability this schema does not yet model (see
 * docs/noor/ARCHITECTURE.md §N, "[NEEDS PRODUCT/LEGAL DECISION]"). No M1
 * route currently reads clinical content at all (the check-in/review
 * tables don't exist yet — see packages/db schema comments), so this is a
 * boundary being documented ahead of the feature that will need it, not
 * something actively bypassed today.
 */
export enum Permission {
  VIEW_OWN_PATIENT_PROFILE = "VIEW_OWN_PATIENT_PROFILE",
  VIEW_OWN_CLINICIAN_PROFILE = "VIEW_OWN_CLINICIAN_PROFILE",
  /** Clinician read of a specific patient's record — still requires a
   * separate, per-resource active-CareRelationship check (see
   * packages/api/src/rbac/care-relationship.ts). This permission gates
   * "can this role ever do this," not "can this clinician access this
   * particular patient." */
  VIEW_ASSIGNED_PATIENTS = "VIEW_ASSIGNED_PATIENTS",
  /** Reserved for future clinical-content resources (check-in responses,
   * clinician review notes, care goals). Not used by any M1 route. */
  VIEW_CLINICAL_CONTENT = "VIEW_CLINICAL_CONTENT",
  MANAGE_CARE_RELATIONSHIPS = "MANAGE_CARE_RELATIONSHIPS",
  VIEW_USERS = "VIEW_USERS",
  VIEW_AUDIT_LOG = "VIEW_AUDIT_LOG",
  MANAGE_SYSTEM_CONFIG = "MANAGE_SYSTEM_CONFIG",
}

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  PATIENT: [Permission.VIEW_OWN_PATIENT_PROFILE],
  CLINICIAN: [
    Permission.VIEW_OWN_CLINICIAN_PROFILE,
    Permission.VIEW_ASSIGNED_PATIENTS,
    Permission.VIEW_CLINICAL_CONTENT,
  ],
  ADMIN: [Permission.VIEW_USERS, Permission.MANAGE_CARE_RELATIONSHIPS, Permission.VIEW_AUDIT_LOG],
  SUPER_ADMIN: [
    Permission.VIEW_USERS,
    Permission.MANAGE_CARE_RELATIONSHIPS,
    Permission.VIEW_AUDIT_LOG,
    Permission.MANAGE_SYSTEM_CONFIG,
  ],
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function anyRoleHasPermission(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((role) => roleHasPermission(role, permission));
}
