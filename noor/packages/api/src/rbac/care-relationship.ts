// Ownership/care-relationship authorization — docs/noor/ARCHITECTURE.md §E
// "ownership scoping" and the M1 implementation requirement: "Clinician
// access must be limited to patients with an authorized care relationship."
//
// This is the ONLY function in the codebase allowed to decide whether a
// clinician may read a given patient's data. Every clinician-facing route
// that takes a patientId must call this before touching that patient's
// records — see routes/clinicians.ts.

import { prisma, CareRelationshipStatus } from "@noor/db";
import { AuthorizationError } from "../lib/errors.js";

/**
 * Throws AuthorizationError unless there is an ACTIVE CareRelationship
 * between the given clinician and patient. Returns the relationship row on
 * success (callers sometimes want relationshipType/startedAt).
 *
 * Deliberately does NOT accept REQUESTED, PAUSED, or ENDED relationships —
 * a clinician can only act on a patient once care has actually started and
 * has not ended. Whether a PAUSED relationship should allow read-only
 * access is a [NEEDS PRODUCT DECISION] left for a later milestone; M1
 * takes the stricter reading.
 */
export async function assertClinicianHasActiveCareRelationship(clinicianId: string, patientId: string) {
  const relationship = await prisma.careRelationship.findFirst({
    where: {
      clinicianId,
      patientId,
      status: CareRelationshipStatus.ACTIVE,
    },
  });

  if (!relationship) {
    throw new AuthorizationError("No active care relationship with this patient.");
  }

  return relationship;
}
