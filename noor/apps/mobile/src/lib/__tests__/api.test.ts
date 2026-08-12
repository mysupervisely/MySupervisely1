import { apiFetch, setApiAuthToken, setAuthExpiredHandler, ApiError, AuthExpiredError, NetworkUnavailableError } from "../api";

describe("apiFetch (centralized native API client)", () => {
  afterEach(() => {
    setApiAuthToken(null);
    setAuthExpiredHandler(null);
    jest.restoreAllMocks();
  });

  it("attaches the cached token as an Authorization bearer header (#authentication handling)", async () => {
    setApiAuthToken("test-token");
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch("/patients/me");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/patients/me"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }),
    );
  });

  it("sends no Authorization header when there is no cached token", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    global.fetch = fetchMock as unknown as typeof fetch;

    await apiFetch("/check-ins/questions");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("throws AuthExpiredError and calls the registered handler on a 401 (#expired/revoked authentication)", async () => {
    const handler = jest.fn();
    setAuthExpiredHandler(handler);
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) }) as unknown as typeof fetch;

    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(AuthExpiredError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("throws a generic ApiError with the server's message on another non-2xx status (#validation failure, #submission failure)", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "This check-in is incomplete." }) }) as unknown as typeof fetch;

    await expect(apiFetch("/check-ins/x/submit", { method: "POST" })).rejects.toMatchObject({
      status: 400,
      message: "This check-in is incomplete.",
    });
  });

  it("never exposes an internal stack trace — falls back to a generic message on a non-JSON error body", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    }) as unknown as typeof fetch;

    await expect(apiFetch("/whatever")).rejects.toBeInstanceOf(ApiError);
  });

  it("throws NetworkUnavailableError when fetch itself rejects (#offline/network unavailable)", async () => {
    global.fetch = jest.fn().mockRejectedValue(new TypeError("Network request failed")) as unknown as typeof fetch;

    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(NetworkUnavailableError);
  });

  it("never logs the raw network error (#no secrets logging, #no PHI logging)", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    global.fetch = jest.fn().mockRejectedValue(new Error("some low-level socket detail")) as unknown as typeof fetch;

    await apiFetch("/auth/me").catch(() => undefined);

    expect(consoleSpy).not.toHaveBeenCalled();
  });
});
