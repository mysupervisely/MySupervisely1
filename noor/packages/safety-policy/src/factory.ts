import type { SafetyPolicyProvider } from "./types.js";
import { createDefaultSafetyPolicy } from "./default-policy.js";

/**
 * Selects the concrete SafetyPolicyProvider from configuration
 * (SAFETY_POLICY_PROVIDER), mirroring EhrProvider/PaymentProvider/
 * AIProvider's factory pattern. "default-placeholder" is the only
 * supported value in M3 — see default-policy.ts for why it is explicitly
 * a placeholder, not a clinical protocol.
 */
export function createSafetyPolicyProvider(providerKey: string): SafetyPolicyProvider {
  switch (providerKey) {
    case "default-placeholder":
      return createDefaultSafetyPolicy();
    default:
      throw new Error(
        `Unknown SAFETY_POLICY_PROVIDER "${providerKey}". Only "default-placeholder" is implemented in M3 — see docs/noor/M3-IMPLEMENTATION.md.`,
      );
  }
}
