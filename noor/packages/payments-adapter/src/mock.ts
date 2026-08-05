import { randomUUID } from "node:crypto";
import type { CheckoutParams, NormalizedSubscriptionEvent, NormalizedSubscriptionStatus, PaymentProvider } from "./types.js";

/**
 * In-memory MockProvider. No network calls, no real payment processor —
 * nothing here charges money or persists to Postgres. Not called by any M1
 * route (there is no subscription feature yet — see M7 in
 * docs/noor/ARCHITECTURE.md §M).
 */
export function createMockPaymentProvider(): PaymentProvider {
  const statuses = new Map<string, NormalizedSubscriptionStatus>();

  return {
    async createCustomer(_patientId: string, _email: string) {
      return { externalCustomerId: `mock-cus-${randomUUID()}` };
    },
    async createCheckoutSession(params: CheckoutParams) {
      return { url: `${params.successUrl}?mock_session=${randomUUID()}` };
    },
    async cancelSubscription(externalSubscriptionId: string, _atPeriodEnd: boolean) {
      statuses.set(externalSubscriptionId, "canceled");
    },
    async getSubscriptionStatus(externalSubscriptionId: string) {
      return statuses.get(externalSubscriptionId) ?? "incomplete";
    },
    async handleWebhookEvent(_rawEvent: unknown, _signature: string): Promise<NormalizedSubscriptionEvent> {
      throw new Error("Mock payment provider does not receive real webhooks. No webhook endpoint exists in M1.");
    },
  };
}
