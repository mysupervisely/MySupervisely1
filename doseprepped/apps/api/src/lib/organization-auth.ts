import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma, Role, OrganizationRole } from "@doseprepped/db";
import { authenticate } from "./auth.js";

declare module "fastify" {
  interface FastifyRequest {
    /**
     * The organization this request has been authorized against. Always
     * derived from the `:organizationId` URL path parameter and validated
     * against the database — never trusted from a request body or query
     * string. See docs/doseprepped/ARCHITECTURE.md "M5.4 — Authorization
     * helpers".
     */
    organizationId?: string;
    /**
     * The authenticated user's OrganizationMembership.role within
     * `organizationId`. Null when the request was authorized purely via
     * the platform-admin override (a platform admin may have no
     * membership row in the organization at all).
     */
    organizationRole?: OrganizationRole | null;
  }
}

function getOrganizationIdParam(request: FastifyRequest): string | undefined {
  const params = request.params as Record<string, string | undefined>;
  return params["organizationId"];
}

/**
 * Fastify preHandler: requires authentication AND platform Role.ADMIN.
 * This is DosePrepped-platform administration — distinct from, and never
 * to be confused with, organization administration
 * (OrganizationRole.ORG_ADMIN). See docs/doseprepped/ARCHITECTURE.md
 * "M5.4 — Platform admin vs. organization admin".
 */
export function requirePlatformAdmin() {
  return async function requirePlatformAdminHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await authenticate(request, reply);
    if (reply.sent) return;

    if (!request.user || request.user.role !== Role.ADMIN) {
      await reply.code(403).send({ error: "You do not have access to this resource." });
    }
  };
}

/**
 * Resolves and validates organization context for a request whose route
 * carries an `:organizationId` path parameter. The organization id is
 * read only from the URL — never from the body or query string — and
 * every call re-derives membership from the database; nothing about
 * organization access is ever cached on the session. A platform admin
 * (Role.ADMIN) is granted access to every organization without needing a
 * membership row — this is the "platform-admin override on all
 * organization routes" documented in
 * docs/doseprepped/ARCHITECTURE.md "M5.4 — Authorization helpers".
 *
 * Returns the resolved membership role (null for the platform-admin
 * override) on success, or undefined if a response (401/404) has already
 * been sent and the caller must stop.
 */
async function resolveOrganizationContext(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<OrganizationRole | null | undefined> {
  await authenticate(request, reply);
  if (reply.sent) return undefined;

  const organizationId = getOrganizationIdParam(request);
  if (!organizationId) {
    await reply.code(404).send({ error: "Organization not found." });
    return undefined;
  }

  if (request.user!.role === Role.ADMIN) {
    request.organizationId = organizationId;
    request.organizationRole = null;
    return null;
  }

  const membership = await prisma.organizationMembership.findUnique({
    where: { organizationId_userId: { organizationId, userId: request.user!.id } },
  });

  if (!membership) {
    // 404, not 403 — a non-member must never learn whether an
    // organization id even exists. Matches the existing 404-for-
    // out-of-scope-resource pattern used throughout the pharmacist queue
    // (see pharmacist-questions.ts). See
    // docs/doseprepped/ARCHITECTURE.md "M5.4 — Authorization helpers".
    await reply.code(404).send({ error: "Organization not found." });
    return undefined;
  }

  request.organizationId = organizationId;
  request.organizationRole = membership.role;
  return membership.role;
}

/**
 * Fastify preHandler: requires authentication AND organization membership
 * (any role) in the `:organizationId` path param, OR the platform-admin
 * override.
 */
export function requireOrganizationMember() {
  return async function requireOrganizationMemberHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    await resolveOrganizationContext(request, reply);
  };
}

/**
 * Fastify preHandler: requires authentication AND
 * OrganizationRole.ORG_ADMIN in the `:organizationId` path param, OR the
 * platform-admin override. Note an OrganizationRole.ORG_ADMIN is NOT
 * necessarily a platform Role.ADMIN — see
 * docs/doseprepped/ARCHITECTURE.md "M5.4 — Platform admin vs.
 * organization admin".
 */
export function requireOrganizationAdmin() {
  return async function requireOrganizationAdminHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const role = await resolveOrganizationContext(request, reply);
    if (reply.sent) return;

    const isPlatformAdmin = request.user!.role === Role.ADMIN;
    if (!isPlatformAdmin && role !== OrganizationRole.ORG_ADMIN) {
      await reply.code(403).send({ error: "You do not have access to this resource." });
    }
  };
}

/**
 * Fastify preHandler: requires authentication AND
 * OrganizationRole.ORG_PHARMACIST in the `:organizationId` path param, OR
 * the platform-admin override. A pharmacist never gains access to an
 * organization's queue merely by holding the platform Role.PHARMACIST —
 * organization-scoped queue access always requires an ORG_PHARMACIST
 * membership row in that specific organization. See
 * docs/doseprepped/ARCHITECTURE.md "M5.4 — Pharmacist / organization
 * relationship".
 */
export function requireOrganizationPharmacist() {
  return async function requireOrganizationPharmacistHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const role = await resolveOrganizationContext(request, reply);
    if (reply.sent) return;

    const isPlatformAdmin = request.user!.role === Role.ADMIN;
    if (!isPlatformAdmin && role !== OrganizationRole.ORG_PHARMACIST) {
      await reply.code(403).send({ error: "You do not have access to this resource." });
    }
  };
}
