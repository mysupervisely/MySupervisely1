import * as SecureStore from "expo-secure-store";
import { saveSession, loadSession, clearSession } from "../secureSession";

describe("secureSession (#secure credential handling abstractions)", () => {
  afterEach(async () => {
    await clearSession();
    jest.clearAllMocks();
  });

  it("persists the token via expo-secure-store, never AsyncStorage (#authentication secrets are not written to ordinary local storage)", async () => {
    await saveSession({ token: "abc123", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("noor.session.token", "abc123");
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("noor.session.expiresAt", expect.any(String));
  });

  it("round-trips a saved, unexpired session", async () => {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await saveSession({ token: "round-trip-token", expiresAt });
    const loaded = await loadSession();
    expect(loaded).toEqual({ token: "round-trip-token", expiresAt });
  });

  it("returns null and clears storage when the stored session is already expired", async () => {
    await saveSession({ token: "expired-token", expiresAt: new Date(Date.now() - 1000).toISOString() });
    const loaded = await loadSession();
    expect(loaded).toBeNull();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("noor.session.token");
  });

  it("returns null when nothing has ever been saved", async () => {
    const loaded = await loadSession();
    expect(loaded).toBeNull();
  });

  it("clearSession removes both stored keys", async () => {
    await saveSession({ token: "to-clear", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    await clearSession();
    const loaded = await loadSession();
    expect(loaded).toBeNull();
  });
});
