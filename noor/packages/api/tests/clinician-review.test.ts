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

// M4 — Clinician Care Dashboard + Check-In Review. Covers everything that
// sits on top of M3's check-in backend: the dashboard summary, the
// cross-patient review queue, and the mark-reviewed action — plus the
// care-relationship enforcement, audit, and admin-boundary requirements
// the brief calls out explicitly (§26). Draft lifecycle, submission, and
// the safety-policy integration are already covered by tests/checkins.test.ts
// and are not duplicated here.

const VALID_ANSWERS = {
  overall_wellbeing: 7,
  mood: 6,
  stress: 5,
  sleep: 7,
  main_concern: "WORK_OR_SCHOOL",
  desired_support: "COPING_WITH_STRESS",
};

/** Creates, fully answers, and submits a check-in for the given patient
 * session, returning its id — the fixture every review/queue test in this
 * file needs to set up. */
async function submitCheckIn(app: FastifyInstance, patientCookie: string): Promise<string> {
  const draft = await app.inject({ method: "POST", url: "/check-ins", headers: { cookie: patientCookie } });
  const { id } = draft.json() as { id: string };
  await app.inject({
    method: "PATCH",
    url: `/check-ins/${id}/responses`,
    headers: { cookie: patientCookie },
    payload: VALID_ANSWERS,
  });
  await app.inject({ method: "POST", url: `/check-ins/${id}/submit`, headers: { cookie: patientCookie } });
  return id;
}

async function setUpPatientWithClinician(app: FastifyInstance, patientEmail: string, clinicianEmail: string) {
  const patient = await createPatient(app, patientEmail);
  const clinician = await createClinician(app, clinicianEmail);
  const patientId = await getPatientId(patient.userId);
  const clinicianId = await getClinicianId(clinician.userId);
  const relationship = await createActiveCareRelationship(patientId, clinicianId);
  return { patient, clinician, patientId, clinicianId, relationship };
}

describe("Clinician Check-In Review (M4)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("authentication (#unauthenticated user cannot access clinician routes)", () => {
    it("rejects every new clinician route without a session", async () => {
      const routes: Array<{ method: "GET" | "POST"; url: string }> = [
        { method: "GET", url: "/clinicians/me/dashboard" },
        { method: "GET", url: "/clinicians/me/check-ins" },
        { method: "POST", url: "/clinicians/me/patients/some-id/check-ins/some-id/review" },
      ];
      for (const route of routes) {
        const response = await app.inject({ method: route.method, url: route.url });
        expect(response.statusCode, `${route.method} ${route.url}`).toBe(401);
      }
    });
  });

  describe("patient cannot access clinician routes (#patient cannot access clinician routes)", () => {
    it("a patient gets 403 on the dashboard, queue, and review routes", async () => {
      const { cookie } = await createPatient(app, "patient.no.clinician.routes@example.test");
      const dashboard = await app.inject({ method: "GET", url: "/clinicians/me/dashboard", headers: { cookie } });
      expect(dashboard.statusCode).toBe(403);
      const queue = await app.inject({ method: "GET", url: "/clinicians/me/check-ins", headers: { cookie } });
      expect(queue.statusCode).toBe(403);
      const review = await app.inject({
        method: "POST",
        url: "/clinicians/me/patients/some-id/check-ins/some-id/review",
        headers: { cookie },
      });
      expect(review.statusCode).toBe(403);
    });
  });

  describe("dashboard summary (authorization-scoped counts)", () => {
    it("counts only this clinician's own active patients and their submitted check-ins", async () => {
      const a = await setUpPatientWithClinician(app, "dash.patient.a@example.test", "dash.clinician@example.test");
      // A second clinician with their own separate patient — must never
      // contribute to the first clinician's counts (M4 §2: "Do not
      // display organization-wide patient counts").
      await setUpPatientWithClinician(app, "dash.other.patient@example.test", "dash.other.clinician@example.test");
      await submitCheckIn(app, a.patient.cookie);

      const response = await app.inject({ method: "GET", url: "/clinicians/me/dashboard", headers: { cookie: a.clinician.cookie } });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.checkInsToReviewCount).toBe(1);
      expect(body.activePatientCount).toBe(1);
      expect(typeof body.displayName).toBe("string");
    });

    it("a reviewed check-in no longer counts toward 'to review'", async () => {
      const { patient, clinician, patientId } = await setUpPatientWithClinician(
        app,
        "dash.reviewed.patient@example.test",
        "dash.reviewed.clinician@example.test",
      );
      const checkInId = await submitCheckIn(app, patient.cookie);
      await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${patientId}/check-ins/${checkInId}/review`,
        headers: { cookie: clinician.cookie },
      });

      const response = await app.inject({ method: "GET", url: "/clinicians/me/dashboard", headers: { cookie: clinician.cookie } });
      expect(response.json().checkInsToReviewCount).toBe(0);
    });

    it("is audited", async () => {
      const { clinician, clinicianId } = await setUpPatientWithClinician(
        app,
        "dash.audit.patient@example.test",
        "dash.audit.clinician@example.test",
      );
      await app.inject({ method: "GET", url: "/clinicians/me/dashboard", headers: { cookie: clinician.cookie } });
      const events = await prisma.auditEvent.findMany({ where: { action: "clinician.dashboard.read", entityId: clinicianId } });
      expect(events.length).toBe(1);
    });
  });

  describe("check-in review queue (#only authorized submitted check-ins appear, #drafts do not appear, #unrelated patients do not appear)", () => {
    it("lists only submitted check-ins for this clinician's active-relationship patients", async () => {
      const a = await setUpPatientWithClinician(app, "queue.patient.a@example.test", "queue.clinician@example.test");
      const checkInId = await submitCheckIn(app, a.patient.cookie);

      const response = await app.inject({ method: "GET", url: "/clinicians/me/check-ins", headers: { cookie: a.clinician.cookie } });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toHaveLength(1);
      expect(body[0].id).toBe(checkInId);
      expect(body[0].patientFirstName).toBe("Test");
      expect(body[0].status).toBe("SUBMITTED");
      // Queue-appropriate fields only — no free-text/select answer values.
      expect(body[0]).not.toHaveProperty("responses");
      expect(JSON.stringify(body)).not.toContain("WORK_OR_SCHOOL");
    });

    it("never includes a draft check-in", async () => {
      const a = await setUpPatientWithClinician(app, "queue.draft.patient@example.test", "queue.draft.clinician@example.test");
      await app.inject({ method: "POST", url: "/check-ins", headers: { cookie: a.patient.cookie } }); // draft only, never submitted

      const response = await app.inject({ method: "GET", url: "/clinicians/me/check-ins", headers: { cookie: a.clinician.cookie } });
      expect(response.json()).toHaveLength(0);
    });

    it("never includes an unrelated patient's check-in, even if submitted", async () => {
      const a = await setUpPatientWithClinician(app, "queue.unrelated.patient@example.test", "queue.unrelated.clinician@example.test");
      await submitCheckIn(app, a.patient.cookie);
      const { cookie: otherClinicianCookie } = await createClinician(app, "queue.stranger.clinician@example.test");

      const response = await app.inject({ method: "GET", url: "/clinicians/me/check-ins", headers: { cookie: otherClinicianCookie } });
      expect(response.json()).toHaveLength(0);
    });

    it("a reviewed check-in drops out of the queue (queue is 'to review', not 'ever submitted')", async () => {
      const a = await setUpPatientWithClinician(app, "queue.after.review.patient@example.test", "queue.after.review.clinician@example.test");
      const checkInId = await submitCheckIn(app, a.patient.cookie);
      await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${a.patientId}/check-ins/${checkInId}/review`,
        headers: { cookie: a.clinician.cookie },
      });

      const response = await app.inject({ method: "GET", url: "/clinicians/me/check-ins", headers: { cookie: a.clinician.cookie } });
      expect(response.json()).toHaveLength(0);
    });

    it("is audited with a count only", async () => {
      const a = await setUpPatientWithClinician(app, "queue.audit.patient@example.test", "queue.audit.clinician@example.test");
      await submitCheckIn(app, a.patient.cookie);
      await app.inject({ method: "GET", url: "/clinicians/me/check-ins", headers: { cookie: a.clinician.cookie } });

      const events = await prisma.auditEvent.findMany({ where: { action: "clinician.check_in.queue_read" } });
      expect(events.length).toBe(1);
      expect(events[0]!.metadata).toEqual({ count: 1 });
    });
  });

  describe("care relationship enforcement (#ended/inactive relationship removes access)", () => {
    it("an ENDED relationship removes queue visibility, dashboard counts, and review access", async () => {
      const a = await setUpPatientWithClinician(app, "ended.patient@example.test", "ended.clinician@example.test");
      const checkInId = await submitCheckIn(app, a.patient.cookie);
      await prisma.careRelationship.update({ where: { id: a.relationship.id }, data: { status: "ENDED", endedAt: new Date() } });

      const queue = await app.inject({ method: "GET", url: "/clinicians/me/check-ins", headers: { cookie: a.clinician.cookie } });
      expect(queue.json()).toHaveLength(0);

      const dashboard = await app.inject({ method: "GET", url: "/clinicians/me/dashboard", headers: { cookie: a.clinician.cookie } });
      expect(dashboard.json().checkInsToReviewCount).toBe(0);
      expect(dashboard.json().activePatientCount).toBe(0);

      const review = await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${a.patientId}/check-ins/${checkInId}/review`,
        headers: { cookie: a.clinician.cookie },
      });
      expect(review.statusCode).toBe(403);
    });

    it("a clinician cannot access another clinician's patient's check-in via the review action", async () => {
      const a = await setUpPatientWithClinician(app, "xclinic.patient@example.test", "xclinic.owner@example.test");
      const checkInId = await submitCheckIn(app, a.patient.cookie);
      const { cookie: strangerCookie } = await createClinician(app, "xclinic.stranger@example.test");

      const response = await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${a.patientId}/check-ins/${checkInId}/review`,
        headers: { cookie: strangerCookie },
      });
      expect(response.statusCode).toBe(403);

      const events = await prisma.auditEvent.findMany({ where: { action: "clinician.check_in.access_denied" } });
      expect(events.length).toBe(1);
    });
  });

  describe("review action (#authorized clinician can mark reviewed, #unauthorized clinician cannot, #review records correct clinician identity)", () => {
    it("an authorized clinician can mark a submitted check-in reviewed", async () => {
      const a = await setUpPatientWithClinician(app, "review.ok.patient@example.test", "review.ok.clinician@example.test");
      const checkInId = await submitCheckIn(app, a.patient.cookie);

      const response = await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${a.patientId}/check-ins/${checkInId}/review`,
        headers: { cookie: a.clinician.cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("REVIEWED");

      const stored = await prisma.checkIn.findUniqueOrThrow({ where: { id: checkInId } });
      expect(stored.status).toBe("REVIEWED");
      expect(stored.reviewedAt).not.toBeNull();
      expect(stored.reviewedByClinicianId).toBe(a.clinicianId); // #review records correct clinician identity
    });

    it("rejects reviewing a check-in a second time", async () => {
      const a = await setUpPatientWithClinician(app, "review.twice.patient@example.test", "review.twice.clinician@example.test");
      const checkInId = await submitCheckIn(app, a.patient.cookie);
      await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${a.patientId}/check-ins/${checkInId}/review`,
        headers: { cookie: a.clinician.cookie },
      });

      const second = await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${a.patientId}/check-ins/${checkInId}/review`,
        headers: { cookie: a.clinician.cookie },
      });
      expect(second.statusCode).toBe(409);
    });

    it("cannot review a draft check-in (not visible to the clinician at all)", async () => {
      const a = await setUpPatientWithClinician(app, "review.draft.patient@example.test", "review.draft.clinician@example.test");
      const draft = await app.inject({ method: "POST", url: "/check-ins", headers: { cookie: a.patient.cookie } });
      const { id: draftId } = draft.json() as { id: string };

      const response = await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${a.patientId}/check-ins/${draftId}/review`,
        headers: { cookie: a.clinician.cookie },
      });
      expect(response.statusCode).toBe(404);
    });

    it("does not touch the patient's submitted response values (#clinician cannot modify submitted patient responses)", async () => {
      const a = await setUpPatientWithClinician(app, "review.immutable.patient@example.test", "review.immutable.clinician@example.test");
      const checkInId = await submitCheckIn(app, a.patient.cookie);

      const before = await prisma.checkInResponse.findMany({ where: { checkInId }, orderBy: { questionKeySnapshot: "asc" } });
      await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${a.patientId}/check-ins/${checkInId}/review`,
        headers: { cookie: a.clinician.cookie },
      });
      const after = await prisma.checkInResponse.findMany({ where: { checkInId }, orderBy: { questionKeySnapshot: "asc" } });

      expect(after).toEqual(before);
    });

    it("has no route by which a client can supply its own clinician identity for the review (#no client-controlled clinician identity)", async () => {
      const a = await setUpPatientWithClinician(app, "review.no.spoof.patient@example.test", "review.no.spoof.clinician@example.test");
      const checkInId = await submitCheckIn(app, a.patient.cookie);
      const { clinicianId: otherClinicianId } = await setUpPatientWithClinician(
        app,
        "review.no.spoof.other.patient@example.test",
        "review.no.spoof.other.clinician@example.test",
      );

      // Attempting to inject a different clinicianId in the body has no
      // effect — the route only ever reads clinicianId from the
      // authenticated session, never from the request body.
      await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${a.patientId}/check-ins/${checkInId}/review`,
        headers: { cookie: a.clinician.cookie },
        payload: { clinicianId: otherClinicianId },
      });

      const stored = await prisma.checkIn.findUniqueOrThrow({ where: { id: checkInId } });
      expect(stored.reviewedByClinicianId).toBe(a.clinicianId);
      expect(stored.reviewedByClinicianId).not.toBe(otherClinicianId);
    });

    it("is audited, and the audit metadata never contains free-text or answer content", async () => {
      const a = await setUpPatientWithClinician(app, "review.audit.patient@example.test", "review.audit.clinician@example.test");
      const checkInId = await submitCheckIn(app, a.patient.cookie);
      await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${a.patientId}/check-ins/${checkInId}/review`,
        headers: { cookie: a.clinician.cookie },
      });

      const events = await prisma.auditEvent.findMany({ where: { action: "clinician.check_in.reviewed", entityId: checkInId } });
      expect(events.length).toBe(1);
      expect(JSON.stringify(events[0]!.metadata ?? {})).not.toContain("WORK_OR_SCHOOL");
      expect(JSON.stringify(events[0]!.metadata ?? {})).not.toContain("COPING_WITH_STRESS");
    });
  });

  describe("admin boundary (#admin denied by default)", () => {
    it("an admin cannot reach the dashboard, queue, or review action", async () => {
      const a = await setUpPatientWithClinician(app, "admin.denied.patient@example.test", "admin.denied.clinician@example.test");
      const checkInId = await submitCheckIn(app, a.patient.cookie);
      const { cookie: adminCookie } = await createAdmin(app, "admin.denied.admin@example.test");

      const dashboard = await app.inject({ method: "GET", url: "/clinicians/me/dashboard", headers: { cookie: adminCookie } });
      expect(dashboard.statusCode).toBe(403);

      const queue = await app.inject({ method: "GET", url: "/clinicians/me/check-ins", headers: { cookie: adminCookie } });
      expect(queue.statusCode).toBe(403);

      const review = await app.inject({
        method: "POST",
        url: `/clinicians/me/patients/${a.patientId}/check-ins/${checkInId}/review`,
        headers: { cookie: adminCookie },
      });
      expect(review.statusCode).toBe(403);
    });
  });

  describe("patient care view (#patient identity/care relationship info)", () => {
    it("includes care-relationship context, not just bare identity fields", async () => {
      const a = await setUpPatientWithClinician(app, "care.view.patient@example.test", "care.view.clinician@example.test");
      const response = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${a.patientId}`,
        headers: { cookie: a.clinician.cookie },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.careRelationship.status).toBe("ACTIVE");
      expect(body.careRelationship.relationshipType).toBeDefined();
    });
  });
});
