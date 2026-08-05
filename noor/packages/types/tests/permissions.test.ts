import { describe, expect, it } from "vitest";
import { Permission, ROLE_PERMISSIONS, roleHasPermission, anyRoleHasPermission } from "../src/permissions.js";
import { ROLES } from "../src/role.js";

describe("permission matrix", () => {
  it("never grants ADMIN or SUPER_ADMIN clinical-content access", () => {
    // This is the concrete regression test for M1 requirement #6:
    // "Admin access must NOT automatically grant access to clinical/PHI
    // data." If this test ever fails, someone has widened the ADMIN or
    // SUPER_ADMIN permission set to include clinical content and that is
    // a deliberate architectural boundary, not an accident to fix here.
    expect(ROLE_PERMISSIONS.ADMIN).not.toContain(Permission.VIEW_CLINICAL_CONTENT);
    expect(ROLE_PERMISSIONS.SUPER_ADMIN).not.toContain(Permission.VIEW_CLINICAL_CONTENT);
  });

  it("never grants PATIENT any administrative or clinician-only permission", () => {
    const patientPermissions = ROLE_PERMISSIONS.PATIENT;
    expect(patientPermissions).not.toContain(Permission.VIEW_USERS);
    expect(patientPermissions).not.toContain(Permission.MANAGE_CARE_RELATIONSHIPS);
    expect(patientPermissions).not.toContain(Permission.VIEW_AUDIT_LOG);
    expect(patientPermissions).not.toContain(Permission.VIEW_ASSIGNED_PATIENTS);
  });

  it("only grants VIEW_CLINICAL_CONTENT to CLINICIAN", () => {
    for (const role of ROLES) {
      const expected = role === "CLINICIAN";
      expect(roleHasPermission(role, Permission.VIEW_CLINICAL_CONTENT)).toBe(expected);
    }
  });

  it("anyRoleHasPermission is true if at least one held role grants it", () => {
    expect(anyRoleHasPermission(["PATIENT", "CLINICIAN"], Permission.VIEW_ASSIGNED_PATIENTS)).toBe(true);
    expect(anyRoleHasPermission(["PATIENT"], Permission.VIEW_ASSIGNED_PATIENTS)).toBe(false);
  });

  it("every role maps to at least one permission", () => {
    for (const role of ROLES) {
      expect(ROLE_PERMISSIONS[role].length).toBeGreaterThan(0);
    }
  });
});
