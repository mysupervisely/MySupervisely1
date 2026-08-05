import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { ensureRolesSeeded } from "./lib/bootstrap.js";

async function main() {
  await ensureRolesSeeded();

  const app = buildApp();
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
