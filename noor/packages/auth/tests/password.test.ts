import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword, validatePasswordStrength } from "../src/password.js";

describe("validatePasswordStrength", () => {
  it("rejects passwords shorter than the minimum length", () => {
    const result = validatePasswordStrength("short1");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects passwords with no letters", () => {
    expect(validatePasswordStrength("1234567890").valid).toBe(false);
  });

  it("rejects passwords with no numbers", () => {
    expect(validatePasswordStrength("abcdefghij").valid).toBe(false);
  });

  it("rejects common passwords even if they pass composition rules", () => {
    expect(validatePasswordStrength("password123").valid).toBe(false);
  });

  it("accepts a reasonable password", () => {
    const result = validatePasswordStrength("Correct-Horse-Battery-9");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects passwords over the bcrypt-safe max length", () => {
    const tooLong = `Aa1${"x".repeat(80)}`;
    expect(validatePasswordStrength(tooLong).valid).toBe(false);
  });
});

describe("hashPassword / verifyPassword", () => {
  it("produces a hash that verifies against the original password", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-9");
    await expect(verifyPassword("Correct-Horse-Battery-9", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password against a real hash", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-9");
    await expect(verifyPassword("wrong-password-1", hash)).resolves.toBe(false);
  });

  it("never stores the password in plaintext form as the hash", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-9");
    expect(hash).not.toContain("Correct-Horse-Battery-9");
  });
});
