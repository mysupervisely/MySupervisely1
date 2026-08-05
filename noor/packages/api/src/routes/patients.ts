import type { FastifyInstance } from "fastify";
import { prisma } from "@noor/db";
import type { PatientProfile } from "@noor/db";
import { patientProfileUpdateSchema, REQUIRED_ONBOARDING_FIELDS } from "@noor/types";
import { requireRole } from "../rbac/policy.js";
import { ConflictError, NotFoundError, ValidationError } from "../lib/errors.js";
import { recordAuditEvent } from "../audit/audit-service.js";
import { AuditAction } from "../audit/actions.js";

/** Field-by-field completion, never the free-text/enum VALUES — used both
 * for the completion-percent the Home dashboard shows and for deciding
 * whether onboarding can be marked complete. */
function missingRequiredFields(profile: Pick<PatientProfile, (typeof REQUIRED_ONBOARDING_FIELDS)[number]>): string[] {
  return REQUIRED_ONBOARDING_FIELDS.filter((field) => {
    const value = profile[field];
    return value === null || value === undefined || value === "";
  });
}

function serializeProfile(profile: PatientProfile) {
  const missing = missingRequiredFields(profile);
  const completionPercent = Math.round(
    ((REQUIRED_ONBOARDING_FIELDS.length - missing.length) / REQUIRED_ONBOARDING_FIELDS.length) * 100,
  );

  return {
    id: profile.id,
    firstName: profile.firstName,
    lastName: profile.lastName,
    state: profile.state,
    whatBringsYouToNoor: profile.whatBringsYouToNoor,
    careType: profile.careType,
    careFormatPreference: profile.careFormatPreference,
    onboardingCompletedAt: profile.onboardingCompletedAt,
    completionPercent,
  };
}

async function getOwnProfileOrThrow(patientId: string) {
  const profile = await prisma.patientProfile.findUnique({ where: { patientId } });
  if (!profile) throw new NotFoundError("No patient profile for this account.");
  return profile;
}

export async function patientRoutes(app: FastifyInstance) {
  // Ownership: a PATIENT may only ever read/write their OWN profile —
  // there is no :patientId route parameter anywhere in this file, by
  // design, so there is no path that needs a separate ownership check to
  // get wrong (docs/noor/ARCHITECTURE.md §E).
  app.get("/patients/me", async (request) => {
    const user = requireRole(request, "PATIENT");
    if (!user.patientId) throw new NotFoundError("No patient record for this account.");

    const profile = await getOwnProfileOrThrow(user.patientId);

    await recordAuditEvent({
      request,
      action: AuditAction.PATIENT_PROFILE_SELF_READ,
      entityType: "patient_profile",
      entityId: profile.id,
    });

    return serializeProfile(profile);
  });

  // Incremental save (per onboarding step) AND general profile editing
  // after onboarding (see apps/patient's /profile page) share this one
  // endpoint — every field is independently optional. Available whether
  // or not onboarding is already complete.
  app.patch("/patients/me", async (request) => {
    const user = requireRole(request, "PATIENT");
    if (!user.patientId) throw new NotFoundError("No patient record for this account.");

    const parsed = patientProfileUpdateSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid profile update.");

    // Ensure the profile row exists (it always should post-signup — see
    // routes/auth.ts — but this stays defensive rather than assuming).
    await getOwnProfileOrThrow(user.patientId);

    const updated = await prisma.patientProfile.update({
      where: { patientId: user.patientId },
      data: parsed.data,
    });

    // Audit WHICH fields changed, never the values themselves. Every
    // onboarding field is a fixed-choice enum now (see
    // packages/types/src/onboarding.ts), so there's no free text to leak
    // here even in principle — but the discipline of only ever logging
    // field names, never values, is kept regardless. See
    // docs/noor/ARCHITECTURE.md §F.
    await recordAuditEvent({
      request,
      action: AuditAction.PATIENT_PROFILE_SELF_UPDATE,
      entityType: "patient_profile",
      entityId: updated.id,
      metadata: { fields: Object.keys(parsed.data) },
    });

    return serializeProfile(updated);
  });

  // Marks onboarding complete. Requires every REQUIRED_ONBOARDING_FIELDS
  // entry to already be non-empty on the stored profile — callers are
  // expected to have PATCH'd the fields in (per-step or all at once)
  // before calling this. Idempotent-but-not-repeatable: once complete,
  // calling again is a 409 (use PATCH /patients/me to edit afterwards).
  app.post("/patients/me/onboarding/complete", async (request) => {
    const user = requireRole(request, "PATIENT");
    if (!user.patientId) throw new NotFoundError("No patient record for this account.");

    const profile = await getOwnProfileOrThrow(user.patientId);

    if (profile.onboardingCompletedAt) {
      throw new ConflictError("Onboarding has already been completed. Use PATCH /patients/me to edit your profile.");
    }

    const missing = missingRequiredFields(profile);
    if (missing.length > 0) {
      throw new ValidationError(`Onboarding is incomplete. Missing: ${missing.join(", ")}.`);
    }

    const completed = await prisma.patientProfile.update({
      where: { patientId: user.patientId },
      data: { onboardingCompletedAt: new Date() },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.PATIENT_ONBOARDING_COMPLETED,
      entityType: "patient_profile",
      entityId: completed.id,
    });

    return serializeProfile(completed);
  });
}
