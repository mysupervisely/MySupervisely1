import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@noor/db";
import {
  makeApp,
  resetDatabase,
  createPatient,
  createClinician,
  createAdmin,
  getPatientId,
  getClinicianId,
  createActiveCareRelationship,
} from "./helpers.js";

describe("RBAC + ownership/care-relationship authorization (M1 requirements #3-#7)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("unauthenticated access", () => {
    it("is rejected on every protected resource (#3: authorization enforced server-side)", async () => {
      const protectedRoutes = [
        "/patients/me",
        "/clinicians/me",
        "/clinicians/me/patients",
        "/admin/users",
        "/admin/care-relationships",
        "/admin/audit-events",
      ];
      for (const url of protectedRoutes) {
        const response = await app.inject({ method: "GET", url });
        expect(response.statusCode, `${url} should require auth`).toBe(401);
      }
    });
  });

  describe("patient self-access (#4: ownership scoping)", () => {
    it("a patient can read their own profile", async () => {
      const { cookie } = await createPatient(app, "self1@example.test");
      const response = await app.inject({ method: "GET", url: "/patients/me", headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.json().firstName).toBe("Test");
    });

    it("a clinician cannot use the patient-only /patients/me route", async () => {
      const { cookie } = await createClinician(app, "clin1@example.test");
      const response = await app.inject({ method: "GET", url: "/patients/me", headers: { cookie } });
      expect(response.statusCode).toBe(403);
    });

    it("an admin cannot use the patient-only /patients/me route either", async () => {
      const { cookie } = await createAdmin(app, "admin1@example.test");
      const response = await app.inject({ method: "GET", url: "/patients/me", headers: { cookie } });
      expect(response.statusCode).toBe(403);
    });
  });

  describe("clinician access is limited to patients with an active care relationship (#5)", () => {
    it("a clinician with no assigned patients sees an empty list", async () => {
      const { cookie } = await createClinician(app, "lonely.clinician@example.test");
      const response = await app.inject({ method: "GET", url: "/clinicians/me/patients", headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it("a clinician sees a patient after an ACTIVE care relationship is created", async () => {
      const patient = await createPatient(app, "assigned.patient@example.test");
      const clinician = await createClinician(app, "assigned.clinician@example.test");
      const patientId = await getPatientId(patient.userId);
      const clinicianId = await getClinicianId(clinician.userId);
      await createActiveCareRelationship(patientId, clinicianId);

      const list = await app.inject({ method: "GET", url: "/clinicians/me/patients", headers: { cookie: clinician.cookie } });
      expect(list.statusCode).toBe(200);
      const body = list.json();
      expect(body).toHaveLength(1);
      expect(body[0].patientId).toBe(patientId);

      const detail = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}`,
        headers: { cookie: clinician.cookie },
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().firstName).toBe("Test");
    });

    it("a clinician CANNOT read a patient they have no active relationship with (403, not data leakage)", async () => {
      const unrelatedPatient = await createPatient(app, "unrelated.patient@example.test");
      const clinician = await createClinician(app, "no.access.clinician@example.test");
      const unrelatedPatientId = await getPatientId(unrelatedPatient.userId);

      const response = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${unrelatedPatientId}`,
        headers: { cookie: clinician.cookie },
      });
      expect(response.statusCode).toBe(403);
      expect(JSON.stringify(response.json())).not.toContain("Test"); // no profile data in the denial response
    });

    it("a PAUSED or ENDED relationship does not grant clinician access", async () => {
      const patient = await createPatient(app, "paused.patient@example.test");
      const clinician = await createClinician(app, "paused.clinician@example.test");
      const patientId = await getPatientId(patient.userId);
      const clinicianId = await getClinicianId(clinician.userId);
      const relationship = await createActiveCareRelationship(patientId, clinicianId);
      await prisma.careRelationship.update({ where: { id: relationship.id }, data: { status: "PAUSED" } });

      const response = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}`,
        headers: { cookie: clinician.cookie },
      });
      expect(response.statusCode).toBe(403);
    });

    it("a denied access attempt is still audited (#7: audit reads, not merely mutations)", async () => {
      const unrelatedPatient = await createPatient(app, "audited.denial.patient@example.test");
      const clinician = await createClinician(app, "audited.denial.clinician@example.test");
      const patientId = await getPatientId(unrelatedPatient.userId);

      await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}`,
        headers: { cookie: clinician.cookie },
      });

      const events = await prisma.auditEvent.findMany({
        where: { action: "clinician.patient_profile.access_denied", entityId: patientId },
      });
      expect(events.length).toBe(1);
    });

    it("a successful patient-detail read by a clinician is audited (#7)", async () => {
      const patient = await createPatient(app, "audited.success.patient@example.test");
      const clinician = await createClinician(app, "audited.success.clinician@example.test");
      const patientId = await getPatientId(patient.userId);
      const clinicianId = await getClinicianId(clinician.userId);
      await createActiveCareRelationship(patientId, clinicianId);

      await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}`,
        headers: { cookie: clinician.cookie },
      });

      const events = await prisma.auditEvent.findMany({
        where: { action: "clinician.patient_profile.read", entityId: patientId },
      });
      expect(events.length).toBe(1);
    });
  });

  describe("admin access does NOT automatically grant clinical/PHI access (#6)", () => {
    it("a PATIENT cannot access any /admin/* route", async () => {
      const { cookie } = await createPatient(app, "patient.no.admin@example.test");
      const response = await app.inject({ method: "GET", url: "/admin/users", headers: { cookie } });
      expect(response.statusCode).toBe(403);
    });

    it("a CLINICIAN cannot access any /admin/* route", async () => {
      const { cookie } = await createClinician(app, "clinician.no.admin@example.test");
      const response = await app.inject({ method: "GET", url: "/admin/users", headers: { cookie } });
      expect(response.statusCode).toBe(403);
    });

    it("an ADMIN can list users and care relationships (non-clinical account data)", async () => {
      const { cookie } = await createAdmin(app, "real.admin@example.test");
      const usersResponse = await app.inject({ method: "GET", url: "/admin/users", headers: { cookie } });
      expect(usersResponse.statusCode).toBe(200);

      const relationshipsResponse = await app.inject({ method: "GET", url: "/admin/care-relationships", headers: { cookie } });
      expect(relationshipsResponse.statusCode).toBe(200);
    });

    it("an ADMIN cannot use the clinician-only patient-detail route to read clinical content", async () => {
      const patient = await createPatient(app, "admin.blocked.patient@example.test");
      const patientId = await getPatientId(patient.userId);
      const { cookie } = await createAdmin(app, "blocked.admin@example.test");

      const response = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
    });

    it("an ADMIN can assign a clinician to a patient, and that action is audited", async () => {
      const patient = await createPatient(app, "to.be.assigned@example.test");
      const clinician = await createClinician(app, "assignee.clinician@example.test");
      const patientId = await getPatientId(patient.userId);
      const clinicianId = await getClinicianId(clinician.userId);
      const { cookie } = await createAdmin(app, "assigning.admin@example.test");

      const response = await app.inject({
        method: "POST",
        url: "/admin/care-relationships",
        headers: { cookie },
        payload: { patientId, clinicianId },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json().status).toBe("ACTIVE");

      const events = await prisma.auditEvent.findMany({ where: { action: "admin.care_relationships.create" } });
      expect(events.length).toBe(1);

      // ...and the clinician now actually has access, exercising the full
      // admin-assigns -> clinician-can-read chain end to end.
      const detail = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}`,
        headers: { cookie: clinician.cookie },
      });
      expect(detail.statusCode).toBe(200);
    });
  });
});
