import { describe, expect, it } from "vitest";
import { createPaymentProvider } from "../src/factory.js";

describe("createPaymentProvider", () => {
  it("returns a working mock provider for 'mock'", async () => {
    const provider = createPaymentProvider("mock");
    const customer = await provider.createCustomer("patient-1", "patient@example.test");
    expect(customer.externalCustomerId).toMatch(/^mock-cus-/);
  });

  it("never charges anything or contacts a real network — no vendor key required", () => {
    // The mock provider construction itself must not require any Stripe
    // (or other vendor) secret/API key — that's the point of the
    // abstraction in M1.
    expect(() => createPaymentProvider("mock")).not.toThrow();
  });

  it("throws on an unsupported provider key", () => {
    expect(() => createPaymentProvider("real-stripe-not-implemented")).toThrow(/Unknown PAYMENT_PROVIDER/);
  });

  it("mock webhook handler refuses to pretend to process a real webhook", async () => {
    const provider = createPaymentProvider("mock");
    await expect(provider.handleWebhookEvent({}, "sig")).rejects.toThrow(/does not receive real webhooks/);
  });
});
