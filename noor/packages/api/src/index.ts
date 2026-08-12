import { buildApp } from "./app.js";
import { env } from "./config/env.js";
import { ensureRolesSeeded, ensureCheckInQuestionsSeeded } from "./lib/bootstrap.js";

async function main() {
  await ensureRolesSeeded();
  await ensureCheckInQuestionsSeeded();

  const app = buildApp();
  await app.listen({ port: env.API_PORT, host: env.API_HOST });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
