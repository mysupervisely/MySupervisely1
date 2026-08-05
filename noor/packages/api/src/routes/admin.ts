import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, CareRelationshipStatus, CareRelationshipType } from "@noor/db";
import { Permission } from "@noor/types";
import { requirePermission } from "../rbac/policy.js";
import { NotFoundError, ValidationError } from "../lib/errors.js";
import { recordAuditEvent } from "../audit/audit-service.js";
import { AuditAction } from "../audit/actions.js";

const createCareRelationshipSchema = z.object({
  patientId: z.string().uuid(),
  clinicianId: z.string().uuid(),
  relationshipType: z.nativeEnum(CareRelationshipType).default(CareRelationshipType.ASYNC),
});

const updateCareRelationshipSchema = z.object({
  status: z.nativeEnum(CareRelationshipStatus),
});

/**
 * Admin-facing routes. Every handler here calls requirePermission with a
 * permission from packages/types/src/permissions.ts — none of those
 * permissions include VIEW_CLINICAL_CONTENT (see that file's comments), so
 * this router structurally cannot return clinical content even by
 * accident: there is no clinical-content table in M1's schema for it to
 * query in the first place (see packages/db schema comments). The account
 * and care-relationship metadata below (email, name, relationship status)
 * is Tier 2 PII per docs/noor/ARCHITECTURE.md §F, handled here for
 * ordinary account-administration purposes — not clinical content.
 */
export async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/users", async (request) => {
    requirePermission(request, Permission.VIEW_USERS);

    const users = await prisma.user.findMany({
      include: { roles: { include: { role: true } } },
      orderBy: { createdAt: "asc" },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.ADMIN_USER_LIST_READ,
      entityType: "user",
      entityId: "list",
      metadata: { count: users.length },
    });

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      displayName: u.displayName,
      status: u.status,
      roles: u.roles.map((r) => r.role.name),
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
    }));
  });

  app.get("/admin/care-relationships", async (request) => {
    requirePermission(request, Permission.MANAGE_CARE_RELATIONSHIPS);

    const relationships = await prisma.careRelationship.findMany({
      include: {
        patient: { include: { profile: true } },
        clinician: { include: { profile: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.ADMIN_CARE_RELATIONSHIP_LIST_READ,
      entityType: "care_relationship",
      entityId: "list",
      metadata: { count: relationships.length },
    });

    return relationships.map((rel) => ({
      id: rel.id,
      status: rel.status,
      relationshipType: rel.relationshipType,
      requestedAt: rel.requestedAt,
      startedAt: rel.startedAt,
      endedAt: rel.endedAt,
      patient: {
        id: rel.patientId,
        firstName: rel.patient.profile?.firstName ?? null,
        lastName: rel.patient.profile?.lastName ?? null,
      },
      clinician: {
        id: rel.clinicianId,
        displayName: rel.clinician.profile?.displayName ?? null,
      },
    }));
  });

  // Admin-assigned care relationships (docs/noor/ARCHITECTURE.md §M, M4
  // roadmap note: "CareRelationship (admin-assigned for MVP)"). There is
  // no patient-initiated "request care" flow yet (M5), so this is
  // currently the only way a CareRelationship is created, and it is set
  // directly to ACTIVE — there's no separate accept/confirm step in M1.
  app.post("/admin/care-relationships", async (request, reply) => {
    requirePermission(request, Permission.MANAGE_CARE_RELATIONSHIPS);

    const parsed = createCareRelationshipSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request.");
    const { patientId, clinicianId, relationshipType } = parsed.data;

    const [patient, clinician] = await Promise.all([
      prisma.patient.findUnique({ where: { id: patientId } }),
      prisma.clinician.findUnique({ where: { id: clinicianId } }),
    ]);
    if (!patient) throw new NotFoundError("Patient not found.");
    if (!clinician) throw new NotFoundError("Clinician not found.");

    const relationship = await prisma.careRelationship.create({
      data: {
        patientId,
        clinicianId,
        relationshipType,
        status: CareRelationshipStatus.ACTIVE,
        startedAt: new Date(),
      },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.ADMIN_CARE_RELATIONSHIP_CREATE,
      entityType: "care_relationship",
      entityId: relationship.id,
      metadata: { patientId, clinicianId, relationshipType, status: relationship.status },
    });

    reply.code(201);
    return { id: relationship.id, status: relationship.status, relationshipType: relationship.relationshipType };
  });

  app.patch<{ Params: { id: string } }>("/admin/care-relationships/:id", async (request) => {
    requirePermission(request, Permission.MANAGE_CARE_RELATIONSHIPS);

    const parsed = updateCareRelationshipSchema.safeParse(request.body);
    if (!parsed.success) throw new ValidationError(parsed.error.issues[0]?.message ?? "Invalid request.");
    const { status } = parsed.data;
    const { id } = request.params;

    const existing = await prisma.careRelationship.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Care relationship not found.");

    const relationship = await prisma.careRelationship.update({
      where: { id },
      data: {
        status,
        startedAt: status === CareRelationshipStatus.ACTIVE && !existing.startedAt ? new Date() : existing.startedAt,
        endedAt: status === CareRelationshipStatus.ENDED ? new Date() : existing.endedAt,
      },
    });

    await recordAuditEvent({
      request,
      action: AuditAction.ADMIN_CARE_RELATIONSHIP_STATUS_UPDATE,
      entityType: "care_relationship",
      entityId: relationship.id,
      metadata: { previousStatus: existing.status, newStatus: relationship.status },
    });

    return { id: relationship.id, status: relationship.status };
  });

  app.get<{ Querystring: { limit?: string; entityType?: string } }>("/admin/audit-events", async (request) => {
    requirePermission(request, Permission.VIEW_AUDIT_LOG);

    const limit = Math.min(Number(request.query.limit ?? 50) || 50, 200);
    const events = await prisma.auditEvent.findMany({
      where: request.query.entityType ? { entityType: request.query.entityType } : undefined,
      orderBy: { occurredAt: "desc" },
      take: limit,
    });

    // Reading the audit log is itself sensitive — audit that too.
    await recordAuditEvent({
      request,
      action: AuditAction.ADMIN_AUDIT_LOG_READ,
      entityType: "audit_event",
      entityId: "list",
      metadata: { count: events.length },
    });

    // BigInt ids aren't JSON-serializable by default — convert explicitly.
    return events.map((e) => ({
      id: e.id.toString(),
      actorUserId: e.actorUserId,
      actorRole: e.actorRole,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      metadata: e.metadata,
      occurredAt: e.occurredAt,
    }));
  });
}
