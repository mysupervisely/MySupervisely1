import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle our own workspace packages (which ship TypeScript source, per
  // Prisma 7's generated client) instead of leaving them as unresolved
  // relative imports at runtime; real npm dependencies stay external.
  noExternal: ["@doseprepped/db", "@doseprepped/types"],
});
