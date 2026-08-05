import type { PaymentProvider } from "./types.js";
import { createMockPaymentProvider } from "./mock.js";

export function createPaymentProvider(providerKey: string): PaymentProvider {
  switch (providerKey) {
    case "mock":
      return createMockPaymentProvider();
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${providerKey}". Only "mock" is implemented in M1 — see docs/noor/ARCHITECTURE.md §H.`,
      );
  }
}
