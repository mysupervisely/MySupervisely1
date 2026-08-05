import type { FastifyInstance } from "fastify";
import { prisma, CareRelationshipStatus } from "@noor/db";
import { requireRole } from "../rbac/policy.js";
import { assertClinicianHasActiveCareRelationship } from "../rbac/care-relationship.js";
import { AuthorizationError, NotFoundError } from "../lib/errors.js";
import { recordAuditEvent } from "../audit/audit-service.js";
import { AuditAction } from "../audit/actions.js";

export async function clinicianRoutes(app: FastifyInstance) {
  app.get("/clinicians/me", async (request) => {
    const user = requireRole(request, "CLINICIAN");
    if (!user.clinicianId) throw new NotFoundError("No clinician record for this account.");

    const profile = await prisma.clinicianProfile.findUnique({ where: { clinicianId: user.clinicianId } });
    if (!profile) throw new NotFoundError("No clinician profile for this account.");

    await recordAuditEvent({
      request,
      action: AuditAction.CLINICIAN_PROFILE_SELF_READ,
      entityType: "clinician_profile",
      entityId: profile.id,
    });

    return {
      id: profile.id,
      displayName: profile.displayName,
      credentialsDisplay: profile.credentialsDisplay,
      bio: profile.bio,
    };
  });

  // Ownership/care-relationship scoping (M1 requirement #5): this list is
  // derived entirely from ACTIVE CareRelationship rows for the
  // authenticated clinician — never a global patient query. No clinical
  // content is returned (none exists yet — see packages/db schema
  // comments); only identity/relationship fields.
  app.get("/clinicians/me/patients", async (request) => {
    const user = requireRole(request, "CLINICIAN");
    if (!user.clinicianId) throw new NotFoundError("No clinician record for this account.");

    const relationships = await prisma.careRelationship.findMany({
      where: { clinicianId: user.clinicianId, status: CareRelationshipStatus.ACTIVE },
      include: { patient: { include: { profile: true } } },
      orderBy: { startedAt: "asc" },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.CLINICIAN_PATIENT_LIST_READ,
      entityType: "clinician",
      entityId: user.clinicianId,
      metadata: { count: relationships.length },
    });

    return relationships.map((rel) => ({
      careRelationshipId: rel.id,
      patientId: rel.patientId,
      relationshipType: rel.relationshipType,
      relationshipStatus: rel.status,
      startedAt: rel.startedAt,
      firstName: rel.patient.profile?.firstName ?? null,
      lastName: rel.patient.profile?.lastName ?? null,
    }));
  });

  // Ownership-scoped read of a SPECIFIC patient — the concrete case M1
  // requirement #7 ("audit all access to sensitive clinical resources, not
  // merely mutations") targets: every access attempt is audited, success
  // or denial, before any data is returned.
  app.get<{ Params: { patientId: string } }>("/clinicians/me/patients/:patientId", async (request) => {
    const user = requireRole(request, "CLINICIAN");
    if (!user.clinicianId) throw new NotFoundError("No clinician record for this account.");
    const { patientId } = request.params;

    try {
      await assertClinicianHasActiveCareRelationship(user.clinicianId, patientId);
    } catch (err) {
      if (err instanceof AuthorizationError) {
        await recordAuditEvent({
          request,
          action: AuditAction.CLINICIAN_PATIENT_DETAIL_DENIED,
          entityType: "patient",
          entityId: patientId,
        });
      }
      throw err;
    }

    const profile = await prisma.patientProfile.findUnique({ where: { patientId } });
    if (!profile) throw new NotFoundError("No profile for this patient.");

    await recordAuditEvent({
      request,
      action: AuditAction.CLINICIAN_PATIENT_DETAIL_READ,
      entityType: "patient",
      entityId: patientId,
    });

    return {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      state: profile.state,
      city: profile.city,
    };
  });
}
