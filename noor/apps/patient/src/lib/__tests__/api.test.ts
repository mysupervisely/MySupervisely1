import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "../api";

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("always sends credentials: include so the session cookie is attached", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch("/auth/me");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/auth/me"),
      expect.objectContaining({ credentials: "include" }),
    );
  });

  it("throws an ApiError with the server's error message on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ error: "You do not have access to this resource." }),
      }),
    );

    await expect(apiFetch("/admin/users")).rejects.toMatchObject({
      status: 403,
      message: "You do not have access to this resource.",
    });
  });

  it("falls back to a generic message if the error body isn't JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      }),
    );

    await expect(apiFetch("/whatever")).rejects.toBeInstanceOf(ApiError);
  });
});
