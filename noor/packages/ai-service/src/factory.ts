import type { AIProvider } from "./types.js";
import { createMockAIProvider } from "./mock.js";

export function createAIProvider(providerKey: string): AIProvider {
  switch (providerKey) {
    case "mock":
      return createMockAIProvider();
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${providerKey}". Only "mock" is implemented in M1 — real providers require a ` +
          "confirmed BAA and explicit configuration before any patient content may reach them. See docs/noor/ARCHITECTURE.md §I.",
      );
  }
}
