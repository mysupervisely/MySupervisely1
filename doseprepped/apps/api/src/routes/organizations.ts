import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma, Role, OrganizationRole, type Organization, type OrganizationMembership } from "@doseprepped/db";
import { authenticate, requireRole } from "../lib/auth.js";
import {
  requirePlatformAdmin,
  requireOrganizationMember,
  requireOrganizationAdmin,
  requireOrganizationPharmacist,
} from "../lib/organization-auth.js";
import { buildAnalyticsReport } from "../lib/analytics-report.js";
import { buildPharmacistQueueResponse, queueQuerySchema } from "./pharmacist-questions.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Slug must be lowercase letters, numbers, and hyphens only.");

const createOrganizationSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(200),
  slug: slugSchema,
});

const ORG_ROLES = Object.values(OrganizationRole) as [OrganizationRole, ...OrganizationRole[]];

const addMembershipSchema = z.object({
  userId: z.string().trim().min(1, "userId is required."),
  role: z.enum(ORG_ROLES),
});

const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function serializeOrganization(organization: Organization) {
  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    createdAt: organization.createdAt.toISOString(),
    updatedAt: organization.updatedAt.toISOString(),
  };
}

interface MembershipWithUser extends OrganizationMembership {
  user?: { id: string; email: string; firstName: string; lastName: string; role: Role };
}

function serializeMembership(membership: MembershipWithUser) {
  return {
    id: membership.id,
    organizationId: membership.organizationId,
    userId: membership.userId,
    role: membership.role,
    createdAt: membership.createdAt.toISOString(),
    user: membership.user
      ? {
          id: membership.user.id,
          email: membership.user.email,
          firstName: membership.user.firstName,
          lastName: membership.user.lastName,
          role: membership.user.role,
        }
      : undefined,
  };
}

const MEMBER_SELECT = {
  select: { id: true, email: true, firstName: true, lastName: true, role: true },
} as const;

/**
 * M5.4 — the minimum organization-management surface for the multi-tenant
 * foundation. See docs/doseprepped/ARCHITECTURE.md "M5.4 — Organization
 * management API" for the full route table and the reasoning behind each
 * authorization choice. Deliberately no invitation/email flow, no
 * self-service organization creation, no org rename/delete — all
 * documented as intentionally deferred.
 */
export async function organizationRoutes(app: FastifyInstance) {
  // Platform-admin-only creation — avoids public organization creation.
  // "Platform-admin-only organization creation is acceptable if that is
  // safer for this milestone" (M5.4 brief).
  app.post(
    "/organizations",
    { preHandler: requirePlatformAdmin() },
    async (request, reply) => {
      const parsed = createOrganizationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }

      const existing = await prisma.organization.findUnique({ where: { slug: parsed.data.slug } });
      if (existing) {
        return reply.code(409).send({ error: "An organization with this slug already exists." });
      }

      const organization = await prisma.organization.create({ data: parsed.data });
      return reply.code(201).send({ organization: serializeOrganization(organization) });
    },
  );

  // Fixed path registered before "/organizations/:organizationId" so it
  // isn't shadowed — mirrors the pattern in routes/medications.ts. Derived
  // entirely from the session; no organizationId is ever accepted from
  // the client here — this route exists precisely so the client never
  // needs to supply one to find out its own organization context.
  app.get(
    "/organizations/me",
    { preHandler: authenticate },
    async (request, reply) => {
      const memberships = await prisma.organizationMembership.findMany({
        where: { userId: request.user!.id },
        include: { organization: true },
        orderBy: { createdAt: "asc" },
      });

      return reply.send({
        memberships: memberships.map((m) => ({
          organizationId: m.organizationId,
          organizationName: m.organization.name,
          organizationSlug: m.organization.slug,
          role: m.role,
        })),
      });
    },
  );

  app.get(
    "/organizations/:organizationId",
    { preHandler: requireOrganizationMember() },
    async (request, reply) => {
      const organization = await prisma.organization.findUnique({ where: { id: request.organizationId! } });
      if (!organization) {
        return reply.code(404).send({ error: "Organization not found." });
      }
      return reply.send({ organization: serializeOrganization(organization) });
    },
  );

  app.get(
    "/organizations/:organizationId/memberships",
    { preHandler: requireOrganizationAdmin() },
    async (request, reply) => {
      const memberships = await prisma.organizationMembership.findMany({
        where: { organizationId: request.organizationId! },
        include: { user: MEMBER_SELECT },
        orderBy: { createdAt: "asc" },
      });
      return reply.send({ memberships: memberships.map(serializeMembership) });
    },
  );

  app.post(
    "/organizations/:organizationId/memberships",
    { preHandler: requireOrganizationAdmin() },
    async (request, reply) => {
      const parsed = addMembershipSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid input.", details: parsed.error.flatten() });
      }

      const organizationId = request.organizationId!;
      // The target user must already be a registered DosePrepped account
      // — no invitation/email flow (deliberately out of scope for M5.4).
      const user = await prisma.user.findUnique({ where: { id: parsed.data.userId } });
      if (!user) {
        return reply.code(404).send({ error: "User not found." });
      }

      const existing = await prisma.organizationMembership.findUnique({
        where: { organizationId_userId: { organizationId, userId: parsed.data.userId } },
      });
      if (existing) {
        return reply.code(409).send({ error: "This user is already a member of this organization." });
      }

      const membership = await prisma.organizationMembership.create({
        data: { organizationId, userId: parsed.data.userId, role: parsed.data.role },
        include: { user: MEMBER_SELECT },
      });

      return reply.code(201).send({ membership: serializeMembership(membership) });
    },
  );

  app.delete(
    "/organizations/:organizationId/memberships/:membershipId",
    { preHandler: requireOrganizationAdmin() },
    async (request, reply) => {
      const { membershipId } = request.params as { membershipId: string };
      const organizationId = request.organizationId!;

      // Scoped to organizationId (never findUnique by id alone) — a
      // membership id that exists but belongs to a different
      // organization must look identical to one that doesn't exist.
      const existing = await prisma.organizationMembership.findFirst({
        where: { id: membershipId, organizationId },
      });
      if (!existing) {
        return reply.code(404).send({ error: "Membership not found." });
      }

      await prisma.organizationMembership.delete({ where: { id: existing.id } });
      return reply.code(204).send();
    },
  );

  // Thin, tenant-aware alias onto the same queue-building logic as the
  // global /pharmacist/queue route (see
  // routes/pharmacist-questions.ts `buildPharmacistQueueResponse`), added
  // specifically to give requireOrganizationPharmacist a real,
  // directly-testable, self-documenting caller. Requires platform
  // Role.PHARMACIST exactly like every other pharmacist route — an
  // ORG_PHARMACIST membership alone is not sufficient, matching "Preserve
  // all existing pharmacist authorization rules." See
  // docs/doseprepped/ARCHITECTURE.md "M5.4 — Pharmacist / organization
  // relationship & tenant-isolated queue".
  app.get(
    "/organizations/:organizationId/pharmacist/queue",
    { preHandler: [requireRole(Role.PHARMACIST), requireOrganizationPharmacist()] },
    async (request, reply) => {
      const parsed = queueQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
      }

      const result = await buildPharmacistQueueResponse(request.user!.id, parsed.data.tab);
      return reply.send(result);
    },
  );

  // Organization-scoped analytics — the future GET /admin/analytics/report
  // equivalent for organization administrators, targeted by this
  // milestone's brief. Reuses `buildAnalyticsReport` from M5.3, passing
  // the now-load-bearing `organizationId`. The existing global
  // /admin/analytics/report route (routes/analytics.ts) is completely
  // unchanged and remains ADMIN-only — an organization administrator can
  // never reach it, and this route can never return cross-organization
  // data. See docs/doseprepped/ARCHITECTURE.md "M5.4 — Analytics — tenant
  // strategy".
  app.get(
    "/organizations/:organizationId/analytics/report",
    { preHandler: requireOrganizationAdmin() },
    async (request, reply) => {
      const parsed = reportQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid query.", details: parsed.error.flatten() });
      }

      const to = parsed.data.to ?? new Date();
      const from = parsed.data.from ?? new Date(to.getTime() - THIRTY_DAYS_MS);

      if (from > to) {
        return reply.code(400).send({
          error: "Invalid input.",
          details: { fieldErrors: { from: ["'from' must be on or before 'to'."] } },
        });
      }

      const report = await buildAnalyticsReport({ from, to, organizationId: request.organizationId! });
      return reply.send(report);
    },
  );
}
