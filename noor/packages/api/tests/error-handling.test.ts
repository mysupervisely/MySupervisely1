import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeApp, resetDatabase } from "./helpers.js";

describe("error handling", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("returns a generic 404 body for an unknown route, not a framework stack trace", async () => {
    const response = await app.inject({ method: "GET", url: "/this-route-does-not-exist" });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("at Object");
    expect(response.body).not.toContain(".ts:");
  });

  it("returns a generic 400 for malformed JSON, without echoing the raw parser error", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{not valid json",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("Invalid request.");
  });

  it("rejects a request body larger than the configured limit", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/signup",
      headers: { "content-type": "application/json" },
      payload: { email: "big@example.test", password: "x".repeat(2 * 1024 * 1024) },
    });
    expect(response.statusCode).toBe(413);
  });
});
