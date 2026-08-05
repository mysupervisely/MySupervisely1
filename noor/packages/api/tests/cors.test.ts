import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { makeApp, resetDatabase } from "./helpers.js";

// Regression test for a real bug caught during M2 manual verification:
// @fastify/cors's own default `methods` list is GET,HEAD,POST — missing
// PATCH/DELETE, which silently blocks those requests at the browser's
// CORS preflight step (the request never reaches a route handler at all,
// so nothing shows up in server logs or in an app.inject()-based test
// that doesn't go through a real CORS preflight). This test asserts the
// preflight response explicitly grants every method a route actually
// uses.
describe("CORS preflight", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    await resetDatabase();
    app = makeApp();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(["GET", "POST", "PATCH", "DELETE"])("allows a %s preflight from an allowed origin", async (method) => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/patients/me",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": method,
        "access-control-request-headers": "content-type",
      },
    });
    expect(response.statusCode).toBe(204);
    const allowed = response.headers["access-control-allow-methods"];
    expect(allowed).toBeDefined();
    expect(String(allowed)).toContain(method);
  });
});
