import { describe, expect, it } from "vitest";
import { createEhrProvider } from "../src/factory.js";

describe("createEhrProvider", () => {
  it("returns a mock provider implementing all four interfaces for 'mock'", () => {
    const provider = createEhrProvider("mock");
    expect(provider.patientRecords).toBeDefined();
    expect(provider.appointments).toBeDefined();
    expect(provider.clinicalMessaging).toBeDefined();
    expect(provider.documents).toBeDefined();
  });

  it("throws on an unsupported provider key instead of silently doing nothing", () => {
    expect(() => createEhrProvider("real-vendor-not-implemented")).toThrow(/Unknown EHR_PROVIDER/);
  });
});

describe("mock patient record round-trip", () => {
  it("creates, retrieves, and updates a patient record without persisting anywhere", async () => {
    const provider = createEhrProvider("mock");
    const created = await provider.patientRecords.createOrLinkPatientRecord({
      patientId: "patient-1",
      firstName: "Test",
      lastName: "Patient",
    });
    expect(created.externalId).toMatch(/^mock-ehr-patient-/);

    const fetched = await provider.patientRecords.getPatientRecord("patient-1");
    expect(fetched?.demographics.firstName).toBe("Test");

    await provider.patientRecords.updateDemographics("patient-1", { state: "CA" });
    const updated = await provider.patientRecords.getPatientRecord("patient-1");
    expect(updated?.demographics.state).toBe("CA");
  });
});
