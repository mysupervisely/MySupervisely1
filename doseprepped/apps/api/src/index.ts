// Must run before any import that reads process.env at module load time
// (e.g. @doseprepped/db's Prisma client construction).
import "dotenv/config";

import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = buildApp();

app
  .listen({ port: env.API_PORT, host: env.API_HOST })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
