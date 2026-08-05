import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@noor/db";
import { makeApp, resetDatabase, createAdmin, createPatient, createClinician } from "./helpers.js";

describe("GET /admin/audit-events", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("requires the VIEW_AUDIT_LOG permission", async () => {
    const { cookie } = await createPatient(app, "no.audit.access@example.test");
    const response = await app.inject({ method: "GET", url: "/admin/audit-events", headers: { cookie } });
    expect(response.statusCode).toBe(403);
  });

  it("returns recorded events with BigInt ids safely serialized as strings", async () => {
    await createClinician(app, "generates.an.event@example.test");
    const { cookie } = await createAdmin(app, "audit.reader@example.test");

    const response = await app.inject({ method: "GET", url: "/admin/audit-events", headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const events = response.json();
    expect(Array.isArray(events)).toBe(true);
    expect(events.length).toBeGreaterThan(0);
    expect(typeof events[0].id).toBe("string");
  });

  it("reading the audit log is itself audited", async () => {
    const { cookie } = await createAdmin(app, "self.auditing.admin@example.test");
    await app.inject({ method: "GET", url: "/admin/audit-events", headers: { cookie } });

    const events = await prisma.auditEvent.findMany({ where: { action: "admin.audit_log.read" } });
    expect(events.length).toBeGreaterThan(0);
  });
});
