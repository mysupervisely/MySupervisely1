// Test-only in-memory stand-in for expo-secure-store (the real module
// talks to the OS Keychain/Keystore, unavailable under Jest/Node) — a
// Map instead of any AsyncStorage-backed shim, so a test that accidentally
// used AsyncStorage instead of SecureStore would fail loudly rather than
// silently passing against the wrong backend.
const mockSecureStoreMap = new Map();

jest.mock("expo-secure-store", () => ({
  setItemAsync: jest.fn((key, value) => {
    mockSecureStoreMap.set(key, value);
    return Promise.resolve();
  }),
  getItemAsync: jest.fn((key) => Promise.resolve(mockSecureStoreMap.has(key) ? mockSecureStoreMap.get(key) : null)),
  deleteItemAsync: jest.fn((key) => {
    mockSecureStoreMap.delete(key);
    return Promise.resolve();
  }),
  __mockSecureStoreMap: mockSecureStoreMap,
}));

// AsyncStorage isn't even a dependency of this app (M5 brief: "Do not
// store authentication secrets in AsyncStorage") — registered as a
// `virtual` mock (the real package was never installed) so that IF a
// future change ever adds it as a dependency and imports it, that import
// fails loudly in tests instead of silently working.
jest.mock(
  "@react-native-async-storage/async-storage",
  () => {
    throw new Error(
      "AsyncStorage must never be used in the Noor mobile app — see docs/noor/M5-IMPLEMENTATION.md §19. " +
        "Use src/lib/secureSession.ts (expo-secure-store) instead.",
    );
  },
  { virtual: true },
);
