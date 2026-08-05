import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Integration tests hit a real local Postgres test database (never a
    // mock DB layer, so RBAC/ownership queries are exercised for real) —
    // see tests/helpers.ts and docs/noor/M1-IMPLEMENTATION.md "Tests."
    // Every test file truncates shared tables in beforeEach
    // (resetDatabase()), so test FILES must run sequentially against the
    // one shared database — otherwise two files' setup steps race each
    // other (e.g. concurrent Role upserts hitting the same unique
    // constraint). Tests within a single file still run in their declared
    // order.
    fileParallelism: false,
    hookTimeout: 30000,
    testTimeout: 30000,
    env: {
      NODE_ENV: "test",
    },
  },
});
