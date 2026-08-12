/** Closed set of audit actions recorded in M1. Extend this list (never use
 * an inline string) so `grep`-ing for every place a given action is
 * recorded stays reliable. */
export const AuditAction = {
  AUTH_SIGNUP: "auth.signup",
  AUTH_LOGIN_SUCCESS: "auth.login.success",
  AUTH_LOGIN_FAILURE: "auth.login.failure",
  AUTH_LOGOUT: "auth.logout",
  PATIENT_PROFILE_SELF_READ: "patient_profile.self_read",
  PATIENT_PROFILE_SELF_UPDATE: "patient_profile.self_update",
  PATIENT_ONBOARDING_COMPLETED: "patient_profile.onboarding_completed",
  CLINICIAN_PROFILE_SELF_READ: "clinician_profile.self_read",
  CLINICIAN_PATIENT_LIST_READ: "clinician.assigned_patients.list_read",
  CLINICIAN_PATIENT_DETAIL_READ: "clinician.patient_profile.read",
  CLINICIAN_PATIENT_DETAIL_DENIED: "clinician.patient_profile.access_denied",
  ADMIN_USER_LIST_READ: "admin.users.list_read",
  ADMIN_CARE_RELATIONSHIP_LIST_READ: "admin.care_relationships.list_read",
  ADMIN_CARE_RELATIONSHIP_CREATE: "admin.care_relationships.create",
  ADMIN_CARE_RELATIONSHIP_STATUS_UPDATE: "admin.care_relationships.status_update",
  ADMIN_AUDIT_LOG_READ: "admin.audit_log.read",
  CHECK_IN_CREATED: "check_in.created",
  CHECK_IN_RESPONSES_SAVED: "check_in.responses_saved",
  CHECK_IN_SUBMITTED: "check_in.submitted",
  CHECK_IN_ABANDONED: "check_in.abandoned",
  CHECK_IN_SELF_READ: "check_in.self_read",
  CHECK_IN_HISTORY_LIST_READ: "check_in.history_list_read",
  SAFETY_WORKFLOW_TRIGGERED: "safety_workflow.triggered",
  CLINICIAN_CHECK_IN_LIST_READ: "clinician.check_in.list_read",
  CLINICIAN_CHECK_IN_DETAIL_READ: "clinician.check_in.detail_read",
  CLINICIAN_CHECK_IN_DETAIL_DENIED: "clinician.check_in.access_denied",
  CLINICIAN_DASHBOARD_READ: "clinician.dashboard.read",
  CLINICIAN_CHECK_IN_QUEUE_READ: "clinician.check_in.queue_read",
  CLINICIAN_CHECK_IN_REVIEWED: "clinician.check_in.reviewed",
} as const;

export type AuditActionValue = (typeof AuditAction)[keyof typeof AuditAction];
