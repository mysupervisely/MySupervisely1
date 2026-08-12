import type { FastifyInstance } from "fastify";
import { prisma, CareRelationshipStatus, CheckInStatus, CheckInSafetyStatus } from "@noor/db";
import { Permission } from "@noor/types";
import { requireRole, requirePermission } from "../rbac/policy.js";
import { assertClinicianHasActiveCareRelationship } from "../rbac/care-relationship.js";
import { AuthorizationError, ConflictError, NotFoundError } from "../lib/errors.js";
import { recordAuditEvent } from "../audit/audit-service.js";
import { AuditAction } from "../audit/actions.js";
import { serializeDetail, serializeSummary } from "../checkins/serialize.js";

const CLINICIAN_VISIBLE_CHECK_IN_STATUSES: CheckInStatus[] = [CheckInStatus.SUBMITTED, CheckInStatus.REVIEWED];

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

    let relationship;
    try {
      relationship = await assertClinicianHasActiveCareRelationship(user.clinicianId, patientId);
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

    // The "patient care view" (M4 brief §9): identity fields plus the
    // care-relationship context that makes this a *care* view rather than
    // a bare profile lookup. Deliberately still not a medical chart — no
    // diagnosis/medication/treatment-plan/billing field exists here or
    // anywhere else in Noor (brief §9's explicit "do not" list).
    return {
      id: profile.id,
      firstName: profile.firstName,
      lastName: profile.lastName,
      state: profile.state,
      city: profile.city,
      careRelationship: {
        id: relationship.id,
        relationshipType: relationship.relationshipType,
        status: relationship.status,
        startedAt: relationship.startedAt ? relationship.startedAt.toISOString() : null,
      },
    };
  });

  // Clinician Home dashboard summary (M4 brief §2). Every number here is
  // computed from a query already scoped to this clinician's own ACTIVE
  // care relationships — never an organization-wide count (brief: "Do not
  // display organization-wide patient counts if the clinician is not
  // authorized to know them"). No fake "Today" appointment data is
  // returned; that section is a static, honest empty state owned entirely
  // by the frontend until real scheduling exists (a future milestone).
  app.get("/clinicians/me/dashboard", async (request) => {
    const user = requireRole(request, "CLINICIAN");
    requirePermission(request, Permission.VIEW_CLINICAL_CONTENT);
    if (!user.clinicianId) throw new NotFoundError("No clinician record for this account.");

    const profile = await prisma.clinicianProfile.findUnique({ where: { clinicianId: user.clinicianId } });
    if (!profile) throw new NotFoundError("No clinician profile for this account.");

    const [checkInsToReviewCount, activePatientCount] = await Promise.all([
      prisma.checkIn.count({
        where: { status: CheckInStatus.SUBMITTED, careRelationship: { clinicianId: user.clinicianId, status: CareRelationshipStatus.ACTIVE } },
      }),
      prisma.careRelationship.count({ where: { clinicianId: user.clinicianId, status: CareRelationshipStatus.ACTIVE } }),
    ]);

    await recordAuditEvent({
      request,
      action: AuditAction.CLINICIAN_DASHBOARD_READ,
      entityType: "clinician",
      entityId: user.clinicianId,
    });

    return {
      displayName: profile.displayName,
      checkInsToReviewCount,
      activePatientCount,
    };
  });

  // The check-in review queue (M4 brief §3): every SUBMITTED check-in
  // across this clinician's ACTIVE-care-relationship patients — the
  // authorization filter (`careRelationship: { clinicianId, status:
  // ACTIVE }`) is baked directly into the query, not applied after the
  // fact, so there is no code path that could return another clinician's
  // patient's check-in. Only queue-appropriate fields are returned — no
  // free-text answers, no full patient object (brief §16 data
  // minimization). `safetyFlagged` surfaces M3's existing deterministic
  // CheckInSafetyStatus as-is; nothing here computes a new classification.
  app.get("/clinicians/me/check-ins", async (request) => {
    const user = requireRole(request, "CLINICIAN");
    requirePermission(request, Permission.VIEW_CLINICAL_CONTENT);
    if (!user.clinicianId) throw new NotFoundError("No clinician record for this account.");

    const checkIns = await prisma.checkIn.findMany({
      where: {
        status: CheckInStatus.SUBMITTED,
        careRelationship: { clinicianId: user.clinicianId, status: CareRelationshipStatus.ACTIVE },
      },
      include: { patient: { include: { profile: true } } },
      orderBy: { submittedAt: "desc" },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.CLINICIAN_CHECK_IN_QUEUE_READ,
      entityType: "clinician",
      entityId: user.clinicianId,
      metadata: { count: checkIns.length },
    });

    return checkIns.map((c) => ({
      id: c.id,
      patientId: c.patientId,
      patientFirstName: c.patient.profile?.firstName ?? null,
      patientLastName: c.patient.profile?.lastName ?? null,
      submittedAt: c.submittedAt ? c.submittedAt.toISOString() : null,
      status: c.status,
      safetyFlagged: c.safetyStatus === CheckInSafetyStatus.FLAGGED,
    }));
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

  // Mark a check-in reviewed (M4 brief §5). Reuses the M3 foundation
  // directly on CheckIn (`reviewedAt`/`reviewedByClinicianId`) rather than
  // introducing a separate ClinicianReview table — those columns already
  // exist from the M3 migration and are exactly what this action needs;
  // see docs/noor/M4-IMPLEMENTATION.md for why the M0-sketched
  // ClinicianReview table (which additionally modeled a draft "response"
  // field intended for future messaging) was NOT built as-is here. No
  // clinician free-text note field was added — M4 §14's explicit "if a
  // free-text field is not necessary yet, prefer not to add it."
  //
  // Clinicians review patient-reported data; they never rewrite it (brief
  // §15) — this route only ever changes `status`/`reviewedAt`/
  // `reviewedByClinicianId`, never touches a CheckInResponse row.
  app.post<{ Params: { patientId: string; checkInId: string } }>(
    "/clinicians/me/patients/:patientId/check-ins/:checkInId/review",
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
            metadata: { requested: "review" },
          });
        }
        throw err;
      }

      const checkIn = await prisma.checkIn.findFirst({ where: { id: checkInId, patientId } });
      if (!checkIn || !CLINICIAN_VISIBLE_CHECK_IN_STATUSES.includes(checkIn.status)) {
        throw new NotFoundError("Check-in not found.");
      }
      if (checkIn.status === CheckInStatus.REVIEWED) {
        throw new ConflictError("This check-in has already been reviewed.");
      }

      const reviewed = await prisma.checkIn.update({
        where: { id: checkIn.id },
        data: {
          status: CheckInStatus.REVIEWED,
          reviewedAt: new Date(),
          reviewedByClinicianId: user.clinicianId,
        },
        include: { responses: true },
      });

      await recordAuditEvent({
        request,
        action: AuditAction.CLINICIAN_CHECK_IN_REVIEWED,
        entityType: "check_in",
        entityId: reviewed.id,
      });

      return serializeDetail(reviewed, reviewed.responses);
    },
  );
}
