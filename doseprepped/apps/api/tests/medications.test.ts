import { afterAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma, Role } from "@doseprepped/db";
import { TEST_EMAIL_DOMAIN, createUserDirectly, loginAndGetCookie } from "./helpers.js";

const validMedicationPayload = {
  name: "Lisinopril",
  strength: "10 mg",
  dosageForm: "Tablet",
  directions: "Take one tablet by mouth once daily.",
  frequency: "Once daily",
  route: "Oral",
  startDate: "2026-01-01",
};

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { endsWith: `@${TEST_EMAIL_DOMAIN}` } } });
  await prisma.$disconnect();
});

async function createPatientWithCookie(app: ReturnType<typeof buildApp>, label: string) {
  const { user, email } = await createUserDirectly(Role.PATIENT, label);
  const cookie = await loginAndGetCookie(app, email);
  return { user, cookie };
}

describe("POST /medications", () => {
  it("lets an authenticated patient create a medication", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "med-create");

    const response = await app.inject({
      method: "POST",
      url: "/medications",
      headers: { cookie },
      payload: validMedicationPayload,
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.medication.name).toBe("Lisinopril");
    expect(body.medication.status).toBe("ACTIVE");

    await app.close();
  });

  it("validates required fields", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "med-validate");

    const response = await app.inject({
      method: "POST",
      url: "/medications",
      headers: { cookie },
      payload: { name: "" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.details.fieldErrors.name).toBeDefined();

    await app.close();
  });

  it("rejects an end date before the start date", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "med-daterange");

    const response = await app.inject({
      method: "POST",
      url: "/medications",
      headers: { cookie },
      payload: { ...validMedicationPayload, startDate: "2026-06-01", endDate: "2026-01-01" },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it("rejects unauthenticated requests", async () => {
    const app = buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/medications",
      payload: validMedicationPayload,
    });

    expect(response.statusCode).toBe(401);

    await app.close();
  });
});

describe("GET /medications and /medications/:id", () => {
  it("lets a patient retrieve their own medications", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "med-list");

    await app.inject({ method: "POST", url: "/medications", headers: { cookie }, payload: validMedicationPayload });

    const response = await app.inject({ method: "GET", url: "/medications", headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().medications).toHaveLength(1);

    await app.close();
  });

  it("lets a patient retrieve medication details", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "med-detail");

    const created = await app.inject({
      method: "POST",
      url: "/medications",
      headers: { cookie },
      payload: validMedicationPayload,
    });
    const id = created.json().medication.id;

    const response = await app.inject({ method: "GET", url: `/medications/${id}`, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json().medication.id).toBe(id);

    await app.close();
  });

  it("rejects unauthenticated access to medication endpoints", async () => {
    const app = buildApp();
    const listResponse = await app.inject({ method: "GET", url: "/medications" });
    const detailResponse = await app.inject({ method: "GET", url: "/medications/does-not-matter" });

    expect(listResponse.statusCode).toBe(401);
    expect(detailResponse.statusCode).toBe(401);

    await app.close();
  });

  it("never lets a patient retrieve another patient's medication", async () => {
    const app = buildApp();
    const owner = await createPatientWithCookie(app, "med-owner");
    const intruder = await createPatientWithCookie(app, "med-intruder");

    const created = await app.inject({
      method: "POST",
      url: "/medications",
      headers: { cookie: owner.cookie },
      payload: validMedicationPayload,
    });
    const id = created.json().medication.id;

    const response = await app.inject({
      method: "GET",
      url: `/medications/${id}`,
      headers: { cookie: intruder.cookie },
    });
    expect(response.statusCode).toBe(404);

    const listResponse = await app.inject({
      method: "GET",
      url: "/medications",
      headers: { cookie: intruder.cookie },
    });
    expect(listResponse.json().medications).toHaveLength(0);

    await app.close();
  });
});

describe("PATCH /medications/:id", () => {
  it("lets a patient edit their own medication", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "med-edit");

    const created = await app.inject({
      method: "POST",
      url: "/medications",
      headers: { cookie },
      payload: validMedicationPayload,
    });
    const id = created.json().medication.id;

    const response = await app.inject({
      method: "PATCH",
      url: `/medications/${id}`,
      headers: { cookie },
      payload: { directions: "Take two tablets by mouth once daily.", notes: "Updated by patient." },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.medication.directions).toBe("Take two tablets by mouth once daily.");
    expect(body.medication.notes).toBe("Updated by patient.");

    await app.close();
  });

  it("rejects invalid medication data on edit", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "med-edit-invalid");

    const created = await app.inject({
      method: "POST",
      url: "/medications",
      headers: { cookie },
      payload: validMedicationPayload,
    });
    const id = created.json().medication.id;

    const response = await app.inject({
      method: "PATCH",
      url: `/medications/${id}`,
      headers: { cookie },
      payload: { name: "" },
    });

    expect(response.statusCode).toBe(400);

    await app.close();
  });

  it("enforces ownership server-side: a patient cannot edit another patient's medication", async () => {
    const app = buildApp();
    const owner = await createPatientWithCookie(app, "med-edit-owner");
    const intruder = await createPatientWithCookie(app, "med-edit-intruder");

    const created = await app.inject({
      method: "POST",
      url: "/medications",
      headers: { cookie: owner.cookie },
      payload: validMedicationPayload,
    });
    const id = created.json().medication.id;

    const response = await app.inject({
      method: "PATCH",
      url: `/medications/${id}`,
      headers: { cookie: intruder.cookie },
      payload: { name: "Hijacked" },
    });
    expect(response.statusCode).toBe(404);

    const stillOwners = await app.inject({
      method: "GET",
      url: `/medications/${id}`,
      headers: { cookie: owner.cookie },
    });
    expect(stillOwners.json().medication.name).toBe("Lisinopril");

    await app.close();
  });
});

describe("POST /medications/:id/archive", () => {
  it("lets a patient mark their own medication inactive", async () => {
    const app = buildApp();
    const { cookie } = await createPatientWithCookie(app, "med-archive");

    const created = await app.inject({
      method: "POST",
      url: "/medications",
      headers: { cookie },
      payload: validMedicationPayload,
    });
    const id = created.json().medication.id;

    const response = await app.inject({ method: "POST", url: `/medications/${id}/archive`, headers: { cookie } });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.medication.status).toBe("INACTIVE");
    expect(body.medication.archivedAt).not.toBeNull();

    await app.close();
  });

  it("cannot archive another patient's medication", async () => {
    const app = buildApp();
    const owner = await createPatientWithCookie(app, "med-archive-owner");
    const intruder = await createPatientWithCookie(app, "med-archive-intruder");

    const created = await app.inject({
      method: "POST",
      url: "/medications",
      headers: { cookie: owner.cookie },
      payload: validMedicationPayload,
    });
    const id = created.json().medication.id;

    const response = await app.inject({
      method: "POST",
      url: `/medications/${id}/archive`,
      headers: { cookie: intruder.cookie },
    });
    expect(response.statusCode).toBe(404);

    const check = await app.inject({ method: "GET", url: `/medications/${id}`, headers: { cookie: owner.cookie } });
    expect(check.json().medication.status).toBe("ACTIVE");

    await app.close();
  });
});
