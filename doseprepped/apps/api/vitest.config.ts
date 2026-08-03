import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    env: {
      // A syntactically valid placeholder so @doseprepped/db can construct a
      // client during tests. The health route tolerates an unreachable
      // database (reports "unavailable" instead of failing), so tests never
      // require a real Postgres instance.
      DATABASE_URL: "postgresql://test:test@localhost:5432/doseprepped_test",
    },
  },
});
