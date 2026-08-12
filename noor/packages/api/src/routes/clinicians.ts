import type { FastifyInstance } from "fastify";
import { prisma, CareRelationshipStatus, CheckInStatus } from "@noor/db";
import { Permission } from "@noor/types";
import { requireRole, requirePermission } from "../rbac/policy.js";
import { assertClinicianHasActiveCareRelationship } from "../rbac/care-relationship.js";
import { AuthorizationError, NotFoundError } from "../lib/errors.js";
import { recordAuditEvent } from "../audit/audit-service.js";
import { AuditAction } from "../audit/actions.js";
import { serializeDetail, serializeSummary } from "../checkins/serialize.js";

const CLINICIAN_VISIBLE_CHECK_IN_STATUSES = [CheckInStatus.SUBMITTED, CheckInStatus.REVIEWED];

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

  // M3 backend foundation for clinician review (brief §9: "M3 may create
  // the backend foundation for clinician review, but do NOT build the
  // complete clinician dashboard yet"). No apps/clinician UI page reads
  // these routes yet — they exist so the ownership/permission model is
  // proven out against real clinical content, ahead of the M4 dashboard.
  //
  // Two enforcement layers, deliberately redundant: requirePermission
  // checks the ROLE can ever see clinical content at all (only CLINICIAN
  // holds Permission.VIEW_CLINICAL_CONTENT — see packages/types/src/
  // permissions.ts, unused until now), and
  // assertClinicianHasActiveCareRelationship checks THIS clinician may see
  // THIS patient's content specifically. Neither alone is sufficient.
  //
  // Drafts are never visible here at all (brief §7: "Drafts must remain
  // private to the patient") — both queries below filter to
  // SUBMITTED/REVIEWED only, the same filter the patient's own history
  // list uses.
  app.get<{ Params: { patientId: string } }>("/clinicians/me/patients/:patientId/check-ins", async (request) => {
    const user = requireRole(request, "CLINICIAN");
    requirePermission(request, Permission.VIEW_CLINICAL_CONTENT);
    if (!user.clinicianId) throw new NotFoundError("No clinician record for this account.");
    const { patientId } = request.params;

    try {
      await assertClinicianHasActiveCareRelationship(user.clinicianId, patientId);
    } catch (err) {
      if (err instanceof AuthorizationError) {
        await recordAuditEvent({
          request,
          action: AuditAction.CLINICIAN_CHECK_IN_DETAIL_DENIED,
          entityType: "patient",
          entityId: patientId,
          metadata: { requested: "check_in_list" },
        });
      }
      throw err;
    }

    const checkIns = await prisma.checkIn.findMany({
      where: { patientId, status: { in: CLINICIAN_VISIBLE_CHECK_IN_STATUSES } },
      include: { responses: true },
      orderBy: { submittedAt: "desc" },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.CLINICIAN_CHECK_IN_LIST_READ,
      entityType: "patient",
      entityId: patientId,
      metadata: { count: checkIns.length },
    });

    return checkIns.map((c) => serializeSummary(c, c.responses));
  });

  app.get<{ Params: { patientId: string; checkInId: string } }>(
    "/clinicians/me/patients/:patientId/check-ins/:checkInId",
    async (request) => {
      const user = requireRole(request, "CLINICIAN");
      requirePermission(request, Permission.VIEW_CLINICAL_CONTENT);
      if (!user.clinicianId) throw new NotFoundError("No clinician record for this account.");
      const { patientId, checkInId } = request.params;

      try {
        await assertClinicianHasActiveCareRelationship(user.clinicianId, patientId);
      } catch (err) {
        if (err instanceof AuthorizationError) {
          await recordAuditEvent({
            request,
            action: AuditAction.CLINICIAN_CHECK_IN_DETAIL_DENIED,
            entityType: "check_in",
            entityId: checkInId,
          });
        }
        throw err;
      }

      const checkIn = await prisma.checkIn.findFirst({
        where: { id: checkInId, patientId, status: { in: CLINICIAN_VISIBLE_CHECK_IN_STATUSES } },
        include: { responses: true },
      });
      if (!checkIn) throw new NotFoundError("Check-in not found.");

      await recordAuditEvent({
        request,
        action: AuditAction.CLINICIAN_CHECK_IN_DETAIL_READ,
        entityType: "check_in",
        entityId: checkIn.id,
      });

      return serializeDetail(checkIn, checkIn.responses);
    },
  );
}
