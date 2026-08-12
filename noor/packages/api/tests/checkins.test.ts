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

const VALID_ANSWERS = {
  overall_wellbeing: 7,
  mood: 6,
  stress: 5,
  sleep: 7,
  main_concern: "WORK_OR_SCHOOL",
  desired_support: "COPING_WITH_STRESS",
};

async function createDraft(app: FastifyInstance, cookie: string) {
  const response = await app.inject({ method: "POST", url: "/check-ins", headers: { cookie } });
  return response.json() as { id: string };
}

describe("Noor Check-In (M3)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("authentication (#unauthenticated users cannot access check-ins)", () => {
    it("rejects every check-in route without a session", async () => {
      const routes: Array<{ method: "GET" | "POST" | "PATCH"; url: string }> = [
        { method: "GET", url: "/check-ins/questions" },
        { method: "POST", url: "/check-ins" },
        { method: "GET", url: "/check-ins/active-draft" },
        { method: "GET", url: "/check-ins" },
        { method: "GET", url: "/check-ins/some-id" },
        { method: "PATCH", url: "/check-ins/some-id/responses" },
        { method: "POST", url: "/check-ins/some-id/submit" },
        { method: "POST", url: "/check-ins/some-id/abandon" },
      ];
      for (const route of routes) {
        const response = await app.inject({ method: route.method, url: route.url });
        expect(response.statusCode, `${route.method} ${route.url}`).toBe(401);
      }
    });
  });

  describe("questions endpoint (data-driven)", () => {
    it("returns the seeded, active questions ordered for display", async () => {
      const { cookie } = await createPatient(app, "questions.reader@example.test");
      const response = await app.inject({ method: "GET", url: "/check-ins/questions", headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const questions = response.json();
      expect(questions).toHaveLength(7);
      expect(questions[0].key).toBe("overall_wellbeing");
      expect(questions.find((q: { key: string }) => q.key === "main_concern").options).toHaveLength(10);
      expect(questions.find((q: { key: string }) => q.key === "additional_notes").isRequired).toBe(false);
    });
  });

  describe("draft lifecycle (#create draft, #save draft, #resume draft, #edit draft, #abandon draft)", () => {
    it("creates a new draft on first request (#patient can begin onboarding -> begin check-in)", async () => {
      const { cookie } = await createPatient(app, "begin.checkin@example.test");
      const response = await app.inject({ method: "POST", url: "/check-ins", headers: { cookie } });
      expect(response.statusCode).toBe(201);
      expect(response.json().status).toBe("DRAFT");
    });

    it("returns the SAME draft on a second create call — prefers one active draft per patient", async () => {
      const { cookie } = await createPatient(app, "one.draft@example.test");
      const first = await createDraft(app, cookie);
      const second = await app.inject({ method: "POST", url: "/check-ins", headers: { cookie } });
      expect(second.statusCode).toBe(200);
      expect(second.json().id).toBe(first.id);

      const count = await prisma.checkIn.count();
      expect(count).toBe(1);
    });

    it("saves draft responses via PATCH and they are readable via active-draft (#save draft, #resume draft)", async () => {
      const { cookie } = await createPatient(app, "save.draft@example.test");
      const draft = await createDraft(app, cookie);

      await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { overall_wellbeing: 8, mood: 7 },
      });

      const resumed = await app.inject({ method: "GET", url: "/check-ins/active-draft", headers: { cookie } });
      expect(resumed.statusCode).toBe(200);
      const body = resumed.json();
      expect(body.id).toBe(draft.id);
      const wellbeing = body.responses.find((r: { questionKey: string }) => r.questionKey === "overall_wellbeing");
      expect(wellbeing.valueNumeric).toBe(8);
    });

    it("edits a draft answer by saving the same question key again (#edit draft)", async () => {
      const { cookie } = await createPatient(app, "edit.draft@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie }, payload: { mood: 3 } });
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie }, payload: { mood: 9 } });

      const detail = await app.inject({ method: "GET", url: `/check-ins/${draft.id}`, headers: { cookie } });
      const mood = detail.json().responses.find((r: { questionKey: string }) => r.questionKey === "mood");
      expect(mood.valueNumeric).toBe(9);
      expect(detail.json().responses).toHaveLength(1); // upserted, not duplicated
    });

    it("preserves the option LABEL snapshot at answer time (#4 snapshot question content)", async () => {
      const { cookie } = await createPatient(app, "snapshot.checkin@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { main_concern: "WORK_OR_SCHOOL" },
      });

      // Change the question's live wording — the historical answer must
      // not change, because display reads the *Snapshot fields, never the
      // current CheckInQuestion row.
      await prisma.checkInQuestion.update({
        where: { key: "main_concern" },
        data: { promptText: "REWORDED PROMPT", options: [{ key: "WORK_OR_SCHOOL", label: "REWORDED LABEL" }] },
      });

      const detail = await app.inject({ method: "GET", url: `/check-ins/${draft.id}`, headers: { cookie } });
      const concern = detail.json().responses.find((r: { questionKey: string }) => r.questionKey === "main_concern");
      expect(concern.questionPrompt).toBe("What has been most difficult recently?");
      expect(concern.valueOptionLabel).toBe("Work or school");
    });

    it("abandons a draft, transitioning it to ARCHIVED (#abandon draft)", async () => {
      const { cookie } = await createPatient(app, "abandon.checkin@example.test");
      const draft = await createDraft(app, cookie);
      const response = await app.inject({ method: "POST", url: `/check-ins/${draft.id}/abandon`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("ARCHIVED");

      // A fresh POST /check-ins now creates a NEW draft — the abandoned
      // one is no longer "the" active draft.
      const next = await app.inject({ method: "POST", url: "/check-ins", headers: { cookie } });
      expect(next.statusCode).toBe(201);
      expect(next.json().id).not.toBe(draft.id);
    });

    it("refuses to abandon an already-submitted check-in", async () => {
      const { cookie } = await createPatient(app, "abandon.submitted@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie }, payload: VALID_ANSWERS });
      await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });

      const response = await app.inject({ method: "POST", url: `/check-ins/${draft.id}/abandon`, headers: { cookie } });
      expect(response.statusCode).toBe(409);
    });
  });

  describe("submission (#submit check-in, #submitted check-in cannot be modified, #duplicate submission is prevented)", () => {
    it("submits a fully-answered draft", async () => {
      const { cookie } = await createPatient(app, "submit.me@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie }, payload: VALID_ANSWERS });

      const response = await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe("SUBMITTED");
      expect(body.submittedAt).not.toBeNull();
    });

    it("rejects submission when a required question is unanswered", async () => {
      const { cookie } = await createPatient(app, "incomplete.checkin@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { overall_wellbeing: 7 },
      });
      const response = await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });
      expect(response.statusCode).toBe(400);
    });

    it("allows submission without the optional free-text question answered", async () => {
      const { cookie } = await createPatient(app, "no.notes@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie }, payload: VALID_ANSWERS });
      const response = await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });
      expect(response.statusCode).toBe(200);
    });

    it("cannot edit a submitted check-in (#submitted check-in cannot be modified)", async () => {
      const { cookie } = await createPatient(app, "no.edit.after.submit@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie }, payload: VALID_ANSWERS });
      await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });

      const editAttempt = await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { mood: 1 },
      });
      expect(editAttempt.statusCode).toBe(409);

      const stored = await prisma.checkInResponse.findFirst({ where: { checkInId: draft.id, questionKeySnapshot: "mood" } });
      expect(stored?.valueNumeric).toBe(6); // unchanged from VALID_ANSWERS
    });

    it("prevents duplicate submission (#duplicate submission is prevented)", async () => {
      const { cookie } = await createPatient(app, "no.double.submit@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie }, payload: VALID_ANSWERS });
      await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });

      const second = await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });
      expect(second.statusCode).toBe(409);
    });

    it("records audit events for creation and submission", async () => {
      const { cookie } = await createPatient(app, "audited.checkin@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie }, payload: VALID_ANSWERS });
      await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });

      const created = await prisma.auditEvent.findMany({ where: { action: "check_in.created", entityId: draft.id } });
      const submitted = await prisma.auditEvent.findMany({ where: { action: "check_in.submitted", entityId: draft.id } });
      expect(created).toHaveLength(1);
      expect(submitted).toHaveLength(1);
    });

    it("never stores free-text or option values in audit metadata (#no free-text clinical content in audit metadata)", async () => {
      const { cookie } = await createPatient(app, "audit.no.phi@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { additional_notes: "Some sensitive detail about my week." },
      });
      const events = await prisma.auditEvent.findMany({ where: { action: "check_in.responses_saved", entityId: draft.id } });
      expect(events).toHaveLength(1);
      expect(JSON.stringify(events[0]!.metadata)).not.toContain("sensitive detail");
      expect(events[0]!.metadata).toEqual({ fields: ["additional_notes"] });
    });
  });

  describe("safety policy (deterministic, not AI) (#deterministic safety-policy tests)", () => {
    it("flags a check-in when overall wellbeing is reported at the low end, and audits it", async () => {
      const { cookie } = await createPatient(app, "low.wellbeing@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { ...VALID_ANSWERS, overall_wellbeing: 1 },
      });
      await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });

      const stored = await prisma.checkIn.findUniqueOrThrow({ where: { id: draft.id } });
      expect(stored.safetyStatus).toBe("FLAGGED");

      const events = await prisma.auditEvent.findMany({ where: { action: "safety_workflow.triggered", entityId: draft.id } });
      expect(events).toHaveLength(1);
      expect((events[0]!.metadata as { signalIds: string[] }).signalIds).toContain("OVERALL_WELLBEING_VERY_LOW");
    });

    it("does not flag an unremarkable check-in", async () => {
      const { cookie } = await createPatient(app, "normal.wellbeing@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie }, payload: VALID_ANSWERS });
      await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });

      const stored = await prisma.checkIn.findUniqueOrThrow({ where: { id: draft.id } });
      expect(stored.safetyStatus).toBe("NONE");
    });

    it("never exposes the safety classification to the patient's own response", async () => {
      const { cookie } = await createPatient(app, "no.leak.safety@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { ...VALID_ANSWERS, overall_wellbeing: 1 },
      });
      const submitResponse = await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });
      expect(JSON.stringify(submitResponse.json())).not.toMatch(/flag|safety/i);
    });
  });

  describe("history (#patient sees own history, #patient cannot see another patient's history)", () => {
    it("lists only the patient's own submitted check-ins, with just the four scores", async () => {
      const { cookie } = await createPatient(app, "history.me@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie }, payload: VALID_ANSWERS });
      await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie } });

      const response = await app.inject({ method: "GET", url: "/check-ins", headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const list = response.json();
      expect(list).toHaveLength(1);
      expect(list[0].scores).toEqual({ overallWellbeing: 7, mood: 6, stress: 5, sleep: 7 });
    });

    it("never includes an unsubmitted draft in history", async () => {
      const { cookie } = await createPatient(app, "draft.not.in.history@example.test");
      await createDraft(app, cookie);
      const response = await app.inject({ method: "GET", url: "/check-ins", headers: { cookie } });
      expect(response.json()).toEqual([]);
    });

    it("each patient sees only their own history, never another patient's", async () => {
      const a = await createPatient(app, "history.a@example.test");
      const b = await createPatient(app, "history.b@example.test");
      const draftA = await createDraft(app, a.cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draftA.id}/responses`, headers: { cookie: a.cookie }, payload: VALID_ANSWERS });
      await app.inject({ method: "POST", url: `/check-ins/${draftA.id}/submit`, headers: { cookie: a.cookie } });

      const bHistory = await app.inject({ method: "GET", url: "/check-ins", headers: { cookie: b.cookie } });
      expect(bHistory.json()).toEqual([]);
    });
  });

  describe("ownership (#patient can access own check-in, #patient cannot access another patient's check-in, #no cross-patient access)", () => {
    it("a patient cannot read another patient's check-in by id", async () => {
      const a = await createPatient(app, "owner.a.checkin@example.test");
      const b = await createPatient(app, "owner.b.checkin@example.test");
      const draftA = await createDraft(app, a.cookie);

      const response = await app.inject({ method: "GET", url: `/check-ins/${draftA.id}`, headers: { cookie: b.cookie } });
      expect(response.statusCode).toBe(404); // not 403 — never confirms it exists
    });

    it("a patient cannot save responses on another patient's check-in (#no client-controlled ownership)", async () => {
      const a = await createPatient(app, "no.write.a@example.test");
      const b = await createPatient(app, "no.write.b@example.test");
      const draftA = await createDraft(app, a.cookie);

      const response = await app.inject({
        method: "PATCH",
        url: `/check-ins/${draftA.id}/responses`,
        headers: { cookie: b.cookie },
        payload: { mood: 1 },
      });
      expect(response.statusCode).toBe(404);

      const stored = await prisma.checkInResponse.findFirst({ where: { checkInId: draftA.id, questionKeySnapshot: "mood" } });
      expect(stored).toBeNull();
    });

    it("a patient cannot submit another patient's check-in", async () => {
      const a = await createPatient(app, "no.submit.a@example.test");
      const b = await createPatient(app, "no.submit.b@example.test");
      const draftA = await createDraft(app, a.cookie);

      const response = await app.inject({ method: "POST", url: `/check-ins/${draftA.id}/submit`, headers: { cookie: b.cookie } });
      expect(response.statusCode).toBe(404);
    });
  });

  describe("validation (#invalid response rejected, #missing required response rejected, #malformed requests rejected)", () => {
    it("rejects a scale value outside 1-10", async () => {
      const { cookie } = await createPatient(app, "bad.scale@example.test");
      const draft = await createDraft(app, cookie);
      const response = await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { overall_wellbeing: 99 },
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects an option key that isn't defined for that question", async () => {
      const { cookie } = await createPatient(app, "bad.option@example.test");
      const draft = await createDraft(app, cookie);
      const response = await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { main_concern: "NOT_A_REAL_OPTION" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects an unrecognized question key", async () => {
      const { cookie } = await createPatient(app, "unknown.question@example.test");
      const draft = await createDraft(app, cookie);
      const response = await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { not_a_real_question: 5 },
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects a malformed request body", async () => {
      const { cookie } = await createPatient(app, "malformed.checkin@example.test");
      const draft = await createDraft(app, cookie);
      const response = await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { overall_wellbeing: { nested: "object" } },
      });
      expect(response.statusCode).toBe(400);
    });

    it("does not partially save a batch when one answer in it is invalid", async () => {
      const { cookie } = await createPatient(app, "atomic.save@example.test");
      const draft = await createDraft(app, cookie);
      await app.inject({
        method: "PATCH",
        url: `/check-ins/${draft.id}/responses`,
        headers: { cookie },
        payload: { mood: 5, stress: 999 },
      });
      const detail = await app.inject({ method: "GET", url: `/check-ins/${draft.id}`, headers: { cookie } });
      expect(detail.json().responses).toHaveLength(0);
    });
  });

  describe("clinician authorization (#authorized clinician can access appropriate patient check-in, #unauthorized clinician cannot)", () => {
    it("an authorized clinician (active care relationship) can list and read a patient's submitted check-in", async () => {
      const patient = await createPatient(app, "clinician.access.patient@example.test");
      const clinician = await createClinician(app, "clinician.access.clinician@example.test");
      const patientId = await getPatientId(patient.userId);
      const clinicianId = await getClinicianId(clinician.userId);
      await createActiveCareRelationship(patientId, clinicianId);

      const draft = await createDraft(app, patient.cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie: patient.cookie }, payload: VALID_ANSWERS });
      await app.inject({ method: "POST", url: `/check-ins/${draft.id}/submit`, headers: { cookie: patient.cookie } });

      const list = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}/check-ins`,
        headers: { cookie: clinician.cookie },
      });
      expect(list.statusCode).toBe(200);
      expect(list.json()).toHaveLength(1);

      const detail = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}/check-ins/${draft.id}`,
        headers: { cookie: clinician.cookie },
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().responses.length).toBeGreaterThan(0);
    });

    it("an unauthorized clinician (no active care relationship) cannot access the patient's check-ins", async () => {
      const patient = await createPatient(app, "unauth.clin.patient@example.test");
      const clinician = await createClinician(app, "unauth.clin.clinician@example.test");
      const patientId = await getPatientId(patient.userId);

      const response = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}/check-ins`,
        headers: { cookie: clinician.cookie },
      });
      expect(response.statusCode).toBe(403);
    });

    it("a clinician never sees the patient's private, unsubmitted draft", async () => {
      const patient = await createPatient(app, "draft.private.patient@example.test");
      const clinician = await createClinician(app, "draft.private.clinician@example.test");
      const patientId = await getPatientId(patient.userId);
      const clinicianId = await getClinicianId(clinician.userId);
      await createActiveCareRelationship(patientId, clinicianId);

      const draft = await createDraft(app, patient.cookie);
      await app.inject({ method: "PATCH", url: `/check-ins/${draft.id}/responses`, headers: { cookie: patient.cookie }, payload: VALID_ANSWERS });
      // Deliberately NOT submitted.

      const list = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}/check-ins`,
        headers: { cookie: clinician.cookie },
      });
      expect(list.json()).toEqual([]);

      const detail = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}/check-ins/${draft.id}`,
        headers: { cookie: clinician.cookie },
      });
      expect(detail.statusCode).toBe(404);
    });

    it("audits a denied clinician access attempt", async () => {
      const patient = await createPatient(app, "denied.audit.patient@example.test");
      const clinician = await createClinician(app, "denied.audit.clinician@example.test");
      const patientId = await getPatientId(patient.userId);

      await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}/check-ins`,
        headers: { cookie: clinician.cookie },
      });

      const events = await prisma.auditEvent.findMany({ where: { action: "clinician.check_in.access_denied" } });
      expect(events.length).toBeGreaterThan(0);
    });
  });

  describe("admin authorization (#admin does not automatically receive clinical-content access)", () => {
    it("an admin cannot access any check-in route (no such route exists for admin at all)", async () => {
      const patient = await createPatient(app, "admin.no.checkin.patient@example.test");
      const { cookie } = await createAdmin(app, "admin.no.checkin@example.test");
      const patientId = await getPatientId(patient.userId);

      // Admin has no self check-in routes (PATIENT-role-gated) and no
      // clinician-style routes either (CLINICIAN-role-gated) — both
      // reject on role alone, before any ownership check even runs.
      const ownRoute = await app.inject({ method: "GET", url: "/check-ins", headers: { cookie } });
      expect(ownRoute.statusCode).toBe(403);

      const clinicianRoute = await app.inject({
        method: "GET",
        url: `/clinicians/me/patients/${patientId}/check-ins`,
        headers: { cookie },
      });
      expect(clinicianRoute.statusCode).toBe(403);
    });
  });
});
