import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Auth/RBAC tests do real reads and writes, so this must point at a
    // reachable, disposable Postgres database — never a database with real
    // data. See README "Testing" for how to create doseprepped_test locally.
    env: {
      DATABASE_URL:
        process.env["TEST_DATABASE_URL"] ??
        "postgresql://doseprepped:doseprepped_dev_password@localhost:5432/doseprepped_test",
      SESSION_SECRET: "test-session-secret-not-for-production-use-only-tests",
      APP_ORIGINS: "http://localhost:3000",
    },
    testTimeout: 15000,
  },
});
