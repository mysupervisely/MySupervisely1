import type { CheckInStatus } from "./checkins";

/**
 * Shared clinician-dashboard types — docs/noor/M4-IMPLEMENTATION.md. Plain
 * string unions rather than importing from `@noor/db` (same approach as
 * `./checkins.ts`), so this package stays dependency-free of the ORM.
 */

export type CareRelationshipType = "ASYNC" | "THERAPY" | "PSYCHIATRY";
export type CareRelationshipStatus = "REQUESTED" | "ACTIVE" | "PAUSED" | "ENDED";

/** GET /clinicians/me/dashboard. Every count here is already
 * authorization-scoped to the requesting clinician's own ACTIVE care
 * relationships — never an organization-wide number (M4 brief §2: "Do not
 * display organization-wide patient counts if the clinician is not
 * authorized to know them"). */
export interface ClinicianDashboardSummaryDTO {
  displayName: string;
  checkInsToReviewCount: number;
  activePatientCount: number;
}

/** One row of GET /clinicians/me/check-ins (the review queue). Only the
 * fields a queue actually needs — never free-text answers, never a full
 * patient object (brief §16: "data minimization... use explicit API
 * DTOs"). `status` is always SUBMITTED for this endpoint today, but
 * included for forward-compatibility (e.g. a future "reviewed" tab). */
export interface ClinicianCheckInQueueItemDTO {
  id: string;
  patientId: string;
  patientFirstName: string | null;
  patientLastName: string | null;
  submittedAt: string | null;
  status: CheckInStatus;
  safetyFlagged: boolean;
}

/** GET /clinicians/me/patients — unchanged shape from M1, formalized here
 * as a shared type (no behavior change to the route itself). */
export interface ClinicianPatientListItemDTO {
  careRelationshipId: string;
  patientId: string;
  relationshipType: CareRelationshipType;
  relationshipStatus: CareRelationshipStatus;
  startedAt: string | null;
  firstName: string | null;
  lastName: string | null;
}

/** GET /clinicians/me/patients/:patientId — M1's identity fields, now
 * with the care-relationship context a "patient care view" needs (brief
 * §9), still never a full medical chart: no diagnosis, medication,
 * treatment-plan, or billing field exists here or anywhere else in Noor. */
export interface ClinicianPatientDetailDTO {
  id: string;
  firstName: string | null;
  lastName: string | null;
  state: string | null;
  city: string | null;
  careRelationship: {
    id: string;
    relationshipType: CareRelationshipType;
    status: CareRelationshipStatus;
    startedAt: string | null;
  };
}
