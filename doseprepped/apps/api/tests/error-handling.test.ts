import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

// M5.1 — global error handler. See docs/doseprepped/ARCHITECTURE.md
// "M5.1 — Error handling". Covers the one behavior that's genuinely new
// (unexpected thrown errors get sanitized) and confirms the existing
// deliberate response path is unaffected by adding it.
describe("Global error handler", () => {
  it("sanitizes an unexpected thrown error into a generic 500", async () => {
    const app = buildApp();

    // Diagnostic-only route, registered directly on this test's app
    // instance — not part of the real API surface. Simulates an
    // unexpected failure (e.g. a raw database error) that should never
    // reach the client verbatim.
    app.get("/__test-unexpected-error", async () => {
      throw new Error("internal detail: connection to db-primary-7 refused");
    });

    const response = await app.inject({ method: "GET", url: "/__test-unexpected-error" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "Something went wrong. Please try again." });
    expect(response.body).not.toMatch(/db-primary-7/);
    expect(response.body).not.toMatch(/connection/);

    await app.close();
  });

  it("leaves an existing deliberate 4xx response unchanged", async () => {
    const app = buildApp();

    // Unauthenticated request to a protected route — a handler-issued
    // reply.code(401).send(...), which never reaches setErrorHandler at
    // all. Confirms adding the handler didn't change this path.
    const response = await app.inject({ method: "GET", url: "/questions" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Authentication required." });

    await app.close();
  });
});
