import * as SecureStore from "expo-secure-store";

/**
 * The ONLY thing persisted on-device by this module: the opaque Noor
 * session token and its expiry, written to `expo-secure-store` (iOS
 * Keychain / Android Keystore-backed, encrypted at rest by the OS) — see
 * docs/noor/M5-IMPLEMENTATION.md §6/§19. Never `AsyncStorage`. Never a
 * password (the login screen never persists one, on any client — see
 * that section). No PHI, no clinical content, and no user profile data
 * lives here; those are re-fetched from the API on demand and held only
 * in-memory (React state) for the duration of a screen session.
 */
const TOKEN_KEY = "noor.session.token";
const EXPIRES_AT_KEY = "noor.session.expiresAt";

export interface StoredSession {
  token: string;
  expiresAt: string;
}

export async function saveSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, session.token);
  await SecureStore.setItemAsync(EXPIRES_AT_KEY, session.expiresAt);
}

export async function loadSession(): Promise<StoredSession | null> {
  const [token, expiresAt] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY),
    SecureStore.getItemAsync(EXPIRES_AT_KEY),
  ]);
  if (!token || !expiresAt) return null;

  // Client-side expiry is a UX shortcut only (skip a doomed network call)
  // — the server is still the authority on whether a token is actually
  // valid; every route re-checks expiry against the Session row regardless.
  if (new Date(expiresAt).getTime() <= Date.now()) {
    await clearSession();
    return null;
  }

  return { token, expiresAt };
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(EXPIRES_AT_KEY);
}
