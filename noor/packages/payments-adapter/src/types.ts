// Payment provider abstraction — docs/noor/ARCHITECTURE.md §H.
//
// No route, UI, or business-logic code may import a payment vendor SDK
// (e.g. Stripe) directly. Everything goes through this interface. M1 ships
// only a MockProvider (mock.ts) — no Stripe account, sandbox or otherwise,
// is wired into M1, and no Subscription-related database tables exist yet
// (deferred to M7, see packages/db schema comments). This package exists
// in M1 purely to preserve the abstraction boundary defined in M0.

export type NormalizedSubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete";

export interface CheckoutParams {
  patientId: string;
  planKey: string;
  successUrl: string;
  cancelUrl: string;
}

export interface NormalizedSubscriptionEvent {
  type: "created" | "trial_started" | "activated" | "renewed" | "payment_failed" | "canceled" | "refunded";
  externalSubscriptionId: string;
  status: NormalizedSubscriptionStatus;
  occurredAt: string; // ISO datetime
}

export interface PaymentProvider {
  createCustomer(patientId: string, email: string): Promise<{ externalCustomerId: string }>;
  createCheckoutSession(params: CheckoutParams): Promise<{ url: string }>;
  cancelSubscription(externalSubscriptionId: string, atPeriodEnd: boolean): Promise<void>;
  getSubscriptionStatus(externalSubscriptionId: string): Promise<NormalizedSubscriptionStatus>;
  handleWebhookEvent(rawEvent: unknown, signature: string): Promise<NormalizedSubscriptionEvent>;
}
