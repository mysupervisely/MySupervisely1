import { describe, expect, it } from "vitest";
import { assertSafeMetadata } from "../src/audit/audit-service.js";

describe("assertSafeMetadata (#8: never put PHI in audit metadata)", () => {
  it("allows structured, non-content metadata", () => {
    expect(() => assertSafeMetadata({ count: 3, status: "ACTIVE", patientId: "abc-123" })).not.toThrow();
  });

  it("rejects a 'notes' key that could carry free-text clinical content", () => {
    expect(() => assertSafeMetadata({ notes: "patient said they felt anxious" })).toThrow(/free-text/);
  });

  it("rejects a 'responses' key", () => {
    expect(() => assertSafeMetadata({ responses: ["8/10"] })).toThrow(/free-text/);
  });

  it("rejects case-insensitively", () => {
    expect(() => assertSafeMetadata({ Diagnosis: "n/a" })).toThrow(/free-text/);
  });
});
