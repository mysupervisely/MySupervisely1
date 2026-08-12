import { renderHook, waitFor, act } from "@testing-library/react-native";
import { AuthProvider, useAuth } from "../AuthContext";
import { apiFetch, ApiError } from "../api";
import { saveSession, loadSession, clearSession } from "../secureSession";

jest.mock("../api", () => {
  const actual = jest.requireActual("../api");
  return { ...actual, apiFetch: jest.fn() };
});

const mockedApiFetch = apiFetch as jest.Mock;

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthContext (#authentication persistence, #login, #signup, #logout)", () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearSession();
  });

  it("starts signedOut when no session is stored", async () => {
    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
  });

  it("bootstraps to signedIn from a valid stored session (#authentication persistence)", async () => {
    await saveSession({ token: "stored-token", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    mockedApiFetch.mockResolvedValueOnce({ id: "u1", email: "sam@example.test", roles: ["PATIENT"] });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));
    expect(result.current.me?.email).toBe("sam@example.test");
  });

  it("falls back to signedOut and clears storage if the stored token is no longer honored by the server (#revoked authentication)", async () => {
    await saveSession({ token: "revoked-token", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    mockedApiFetch.mockRejectedValueOnce(new ApiError(401, "Session expired"));

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    expect(await loadSession()).toBeNull();
  });

  it("signIn requests clientType: native and persists the returned token (#login)", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      user: { id: "u1", email: "sam@example.test", roles: ["PATIENT"] },
      session: { token: "fresh-token", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    await act(async () => {
      await result.current.signIn("sam@example.test", "Test-Password-9");
    });

    expect(result.current.status).toBe("signedIn");
    expect(mockedApiFetch).toHaveBeenCalledWith(
      "/auth/login",
      expect.objectContaining({ body: expect.stringContaining('"clientType":"native"') }),
    );
    expect((await loadSession())?.token).toBe("fresh-token");
  });

  it("signUp behaves the same way as signIn on success (#signup)", async () => {
    mockedApiFetch.mockResolvedValueOnce({
      user: { id: "u2", email: "new@example.test", roles: ["PATIENT"] },
      session: { token: "signup-token", expiresAt: new Date(Date.now() + 60_000).toISOString() },
    });

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    await act(async () => {
      await result.current.signUp("new@example.test", "Test-Password-9");
    });

    expect(result.current.status).toBe("signedIn");
    expect(result.current.me?.email).toBe("new@example.test");
  });

  it("a failed signIn surfaces an error without changing status, and never leaks whether the account exists", async () => {
    mockedApiFetch.mockRejectedValueOnce(new ApiError(401, "Invalid email or password."));

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    await act(async () => {
      await result.current.signIn("nobody@example.test", "wrong").catch(() => undefined);
    });

    expect(result.current.status).toBe("signedOut");
    expect(result.current.error).toBe("Invalid email or password.");
  });

  it("signOut calls the API, clears the stored session, and returns to signedOut (#logout)", async () => {
    await saveSession({ token: "to-sign-out", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    mockedApiFetch
      .mockResolvedValueOnce({ id: "u1", email: "sam@example.test", roles: ["PATIENT"] }) // bootstrap /auth/me
      .mockResolvedValueOnce({ ok: true }); // /auth/logout

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.status).toBe("signedOut");
    expect(result.current.me).toBeNull();
    expect(await loadSession()).toBeNull();
  });

  it("signOut still clears local state even if the network call fails (never gets stuck signed in)", async () => {
    await saveSession({ token: "network-fails", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    mockedApiFetch
      .mockResolvedValueOnce({ id: "u1", email: "sam@example.test", roles: ["PATIENT"] })
      .mockRejectedValueOnce(new Error("offline"));

    const { result } = await renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.status).toBe("signedOut");
    expect(await loadSession()).toBeNull();
  });
});
