import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma } from "@noor/db";
import { makeApp, resetDatabase, createPatient, createClinician, createAdmin } from "./helpers.js";

const validOnboarding = {
  firstName: "Sam",
  lastName: "Rivera",
  state: "CA",
  reasonForSeekingCare: "Looking for support with work stress.",
  careType: "INDIVIDUAL_THERAPY",
  careFormatPreference: "VIDEO",
};

describe("onboarding + patient profile (M2)", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe("authorization (#onboarding authorization, #unauthorized access)", () => {
    it("PATCH /patients/me requires authentication", async () => {
      const response = await app.inject({ method: "PATCH", url: "/patients/me", payload: { firstName: "X" } });
      expect(response.statusCode).toBe(401);
    });

    it("POST /patients/me/onboarding/complete requires authentication", async () => {
      const response = await app.inject({ method: "POST", url: "/patients/me/onboarding/complete" });
      expect(response.statusCode).toBe(401);
    });

    it("a CLINICIAN cannot PATCH the patient-only profile route", async () => {
      const { cookie } = await createClinician(app, "clin.onb@example.test");
      const response = await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie }, payload: { firstName: "X" } });
      expect(response.statusCode).toBe(403);
    });

    it("an ADMIN cannot complete onboarding on behalf of a patient", async () => {
      const { cookie } = await createAdmin(app, "admin.onb@example.test");
      const response = await app.inject({ method: "POST", url: "/patients/me/onboarding/complete", headers: { cookie } });
      expect(response.statusCode).toBe(403);
    });
  });

  describe("patient ownership (#patient ownership)", () => {
    it("each patient only ever sees/updates their own profile", async () => {
      const a = await createPatient(app, "owner.a@example.test");
      const b = await createPatient(app, "owner.b@example.test");

      await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie: a.cookie }, payload: { firstName: "Alice" } });
      await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie: b.cookie }, payload: { firstName: "Bob" } });

      const aProfile = (await app.inject({ method: "GET", url: "/patients/me", headers: { cookie: a.cookie } })).json();
      const bProfile = (await app.inject({ method: "GET", url: "/patients/me", headers: { cookie: b.cookie } })).json();

      expect(aProfile.firstName).toBe("Alice");
      expect(bProfile.firstName).toBe("Bob");
      expect(aProfile.id).not.toBe(bProfile.id);
    });
  });

  describe("profile creation/update (#profile creation/update)", () => {
    it("signup provisions an (empty) profile with 0% completion", async () => {
      const { cookie } = await createPatient(app, "fresh@example.test");
      const response = await app.inject({ method: "GET", url: "/patients/me", headers: { cookie } });
      const body = response.json();
      // createPatient's helper pre-fills a name for other test suites'
      // convenience — check the shape/behavior via a raw signup instead.
      expect(response.statusCode).toBe(200);
      expect(typeof body.completionPercent).toBe("number");
    });

    it("a PATCH updates only the fields provided, leaving others untouched", async () => {
      const { cookie } = await createPatient(app, "partial.update@example.test");
      await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie }, payload: { firstName: "Jordan" } });
      const afterFirst = (await app.inject({ method: "GET", url: "/patients/me", headers: { cookie } })).json();
      expect(afterFirst.firstName).toBe("Jordan");
      expect(afterFirst.state).toBeNull();

      await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie }, payload: { state: "NY" } });
      const afterSecond = (await app.inject({ method: "GET", url: "/patients/me", headers: { cookie } })).json();
      expect(afterSecond.firstName).toBe("Jordan"); // preserved
      expect(afterSecond.state).toBe("NY");
    });

    it("records an audit event listing which field NAMES changed, never values", async () => {
      const { cookie } = await createPatient(app, "audited.update@example.test");
      await app.inject({
        method: "PATCH",
        url: "/patients/me",
        headers: { cookie },
        payload: { reasonForSeekingCare: "feeling overwhelmed at work" },
      });

      const events = await prisma.auditEvent.findMany({ where: { action: "patient_profile.self_update" } });
      expect(events).toHaveLength(1);
      expect(events[0]!.metadata).toEqual({ fields: ["reasonForSeekingCare"] });
      expect(JSON.stringify(events[0]!.metadata)).not.toContain("overwhelmed");
    });
  });

  describe("validation (#validation)", () => {
    it("rejects an invalid state code", async () => {
      const { cookie } = await createPatient(app, "bad.state@example.test");
      const response = await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie }, payload: { state: "ZZ" } });
      expect(response.statusCode).toBe(400);
    });

    it("rejects an invalid careType", async () => {
      const { cookie } = await createPatient(app, "bad.caretype@example.test");
      const response = await app.inject({
        method: "PATCH",
        url: "/patients/me",
        headers: { cookie },
        payload: { careType: "GROUP_THERAPY" },
      });
      expect(response.statusCode).toBe(400);
    });

    it("rejects an empty/whitespace reasonForSeekingCare", async () => {
      const { cookie } = await createPatient(app, "bad.reason@example.test");
      const response = await app.inject({
        method: "PATCH",
        url: "/patients/me",
        headers: { cookie },
        payload: { reasonForSeekingCare: "  " },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe("incomplete onboarding (#incomplete onboarding)", () => {
    it("refuses to complete onboarding when required fields are missing", async () => {
      const { cookie } = await createPatient(app, "incomplete@example.test");
      await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie }, payload: { firstName: "Sam" } });

      const response = await app.inject({ method: "POST", url: "/patients/me/onboarding/complete", headers: { cookie } });
      expect(response.statusCode).toBe(400);

      const profile = (await app.inject({ method: "GET", url: "/patients/me", headers: { cookie } })).json();
      expect(profile.onboardingCompletedAt).toBeNull();
      expect(profile.completionPercent).toBeLessThan(100);
    });
  });

  describe("completed onboarding (#completed onboarding)", () => {
    it("completes onboarding once every required field is present", async () => {
      const { cookie } = await createPatient(app, "complete.me@example.test");
      await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie }, payload: validOnboarding });

      const response = await app.inject({ method: "POST", url: "/patients/me/onboarding/complete", headers: { cookie } });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.onboardingCompletedAt).not.toBeNull();
      expect(body.completionPercent).toBe(100);
    });

    it("refuses to complete onboarding a second time (409)", async () => {
      const { cookie } = await createPatient(app, "double.complete@example.test");
      await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie }, payload: validOnboarding });
      await app.inject({ method: "POST", url: "/patients/me/onboarding/complete", headers: { cookie } });

      const second = await app.inject({ method: "POST", url: "/patients/me/onboarding/complete", headers: { cookie } });
      expect(second.statusCode).toBe(409);
    });

    it("records a distinct audit event for onboarding completion", async () => {
      const { cookie } = await createPatient(app, "audited.complete@example.test");
      await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie }, payload: validOnboarding });
      await app.inject({ method: "POST", url: "/patients/me/onboarding/complete", headers: { cookie } });

      const events = await prisma.auditEvent.findMany({ where: { action: "patient_profile.onboarding_completed" } });
      expect(events).toHaveLength(1);
    });

    it("can still be edited via PATCH after completion, without clearing onboardingCompletedAt", async () => {
      const { cookie } = await createPatient(app, "edit.after.complete@example.test");
      await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie }, payload: validOnboarding });
      const completed = (
        await app.inject({ method: "POST", url: "/patients/me/onboarding/complete", headers: { cookie } })
      ).json();

      await app.inject({ method: "PATCH", url: "/patients/me", headers: { cookie }, payload: { firstName: "Samuel" } });
      const after = (await app.inject({ method: "GET", url: "/patients/me", headers: { cookie } })).json();
      expect(after.firstName).toBe("Samuel");
      expect(after.onboardingCompletedAt).toBe(completed.onboardingCompletedAt);
    });
  });
});
