/** Closed set of audit actions recorded in M1. Extend this list (never use
 * an inline string) so `grep`-ing for every place a given action is
 * recorded stays reliable. */
export const AuditAction = {
  AUTH_SIGNUP: "auth.signup",
  AUTH_LOGIN_SUCCESS: "auth.login.success",
  AUTH_LOGIN_FAILURE: "auth.login.failure",
  AUTH_LOGOUT: "auth.logout",
  PATIENT_PROFILE_SELF_READ: "patient_profile.self_read",
  CLINICIAN_PROFILE_SELF_READ: "clinician_profile.self_read",
  CLINICIAN_PATIENT_LIST_READ: "clinician.assigned_patients.list_read",
  CLINICIAN_PATIENT_DETAIL_READ: "clinician.patient_profile.read",
  CLINICIAN_PATIENT_DETAIL_DENIED: "clinician.patient_profile.access_denied",
  ADMIN_USER_LIST_READ: "admin.users.list_read",
  ADMIN_CARE_RELATIONSHIP_LIST_READ: "admin.care_relationships.list_read",
  ADMIN_CARE_RELATIONSHIP_CREATE: "admin.care_relationships.create",
  ADMIN_CARE_RELATIONSHIP_STATUS_UPDATE: "admin.care_relationships.status_update",
  ADMIN_AUDIT_LOG_READ: "admin.audit_log.read",
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];
