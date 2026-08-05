import type { FastifyInstance } from "fastify";
import { prisma } from "@noor/db";
import { requireRole } from "../rbac/policy.js";
import { NotFoundError } from "../lib/errors.js";
import { recordAuditEvent } from "../audit/audit-service.js";
import { AuditAction } from "../audit/actions.js";

export async function patientRoutes(app: FastifyInstance) {
  // Ownership: a PATIENT may only ever read their OWN profile — there is
  // no :patientId route parameter here at all, by design, so there is no
  // path that needs a separate ownership check to get wrong. Onboarding
  // (collecting/editing these fields) is M2 — this is read-only in M1.
  app.get("/patients/me", async (request) => {
    const user = requireRole(request, "PATIENT");
    if (!user.patientId) throw new NotFoundError("No patient record for this account.");

    const profile = await prisma.patientProfile.findUnique({
      where: { patientId: user.patientId },
    });
    if (!profile) throw new NotFoundError("No patient profile for this account.");

    await recordAuditEvent({
      request,
      action: AuditAction.PATIENT_PROFILE_SELF_READ,
      entityType: "patient_profile",
      entityId: profile.id,
    });

    return {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      state: profile.state,
      city: profile.city,
      onboardingCompletedAt: profile.onboardingCompletedAt,
    };
  });
}
