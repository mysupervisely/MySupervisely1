import type { EhrProvider } from "./types.js";
import { createMockEhrProvider } from "./mock.js";

export type EhrProviderKey = "mock";

/**
 * Selects the concrete EhrProvider implementation from configuration
 * (EHR_PROVIDER). "mock" is the only value supported in M1 — see
 * docs/noor/ARCHITECTURE.md §G. Swapping to a real vendor later is meant
 * to be: implement the four interfaces in types.ts, add a case here, done.
 */
export function createEhrProvider(providerKey: string): EhrProvider {
  switch (providerKey) {
    case "mock":
      return createMockEhrProvider();
    default:
      throw new Error(
        `Unknown EHR_PROVIDER "${providerKey}". Only "mock" is implemented in M1 — see docs/noor/ARCHITECTURE.md §G.`,
      );
  }
}
