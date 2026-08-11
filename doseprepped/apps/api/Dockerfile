# DosePrepped API — deployment image (M6.1)
#
# Builds and runs the Fastify API (apps/api) out of the pnpm workspace.
# Build context MUST be the monorepo root (doseprepped/), because this is
# a pnpm workspace and the API depends on sibling workspace packages
# (@doseprepped/db, @doseprepped/auth, @doseprepped/safety-rules,
# @doseprepped/ai-service, @doseprepped/types).
#
# Build from the `doseprepped/` directory:
#   docker build -f apps/api/Dockerfile -t doseprepped-api .
#
# Run (see docs/doseprepped/DEPLOYMENT.md for the full required env var
# list — DATABASE_URL and SESSION_SECRET are required, everything else
# has a safe default):
#   docker run -p 4000:4000 \
#     -e DATABASE_URL="postgresql://..." \
#     -e SESSION_SECRET="$(openssl rand -base64 32)" \
#     -e APP_ORIGINS="https://your-demo-frontend.example" \
#     doseprepped-api
#
# This single stage installs full workspace dependencies (including
# devDependencies, needed to run `prisma generate` and `tsup`), builds
# the API, then prunes devDependencies before the final image layer.
# apps/api's own build step (tsup, see apps/api/tsup.config.ts) already
# bundles all @doseprepped/* workspace packages directly into
# dist/index.js, so only the API's *external* npm dependencies (fastify,
# pg, @prisma/client, etc.) need to remain installed at runtime — pruning
# removes the rest.
FROM node:20-alpine AS runtime

RUN corepack enable

WORKDIR /repo

# Copy the whole workspace. package.json/pnpm-lock.yaml first would allow
# a smaller Docker layer-cache footprint on dependency-only changes, but
# this monorepo's pnpm-workspace.yaml globs (apps/*, packages/*) make a
# partial copy fragile to keep in sync — a full copy keeps this Dockerfile
# simple and correct, which matters more for a small demo deployment than
# shaving build-cache time.
COPY . .

# pnpm >=10 refuses to run dependencies' native postinstall scripts
# (esbuild's platform binary, Prisma's engine downloader, etc.) on a
# fresh install unless explicitly approved — the repo's pre-existing
# `pnpm-workspace.yaml` `onlyBuiltDependencies` list alone did NOT
# suppress this on a truly fresh install (confirmed while preparing this
# Dockerfile, by running this exact sequence against a clean checkout).
# `pnpm-workspace.yaml` now also carries an `allowBuilds` block (added in
# the same pass, via `pnpm approve-builds --all`), which — re-confirmed
# the same way — *does* make a fresh, non-interactive `pnpm install`
# run those postinstall scripts automatically. If a future pnpm upgrade
# changes this behavior again, `pnpm approve-builds --all` run once
# locally and committed is the fix.
RUN pnpm install --frozen-lockfile

# Prisma's generated client (packages/db/generated/) is gitignored and
# must exist on disk before `apps/api`'s tsup build runs, since tsup
# bundles @doseprepped/db's source (including that generated output)
# directly into dist/index.js.
RUN pnpm --filter @doseprepped/db run generate

RUN pnpm --filter @doseprepped/api run build

# Drop devDependencies (tsx, tsup, vitest, eslint, typescript, etc.) now
# that the build artifact exists. `pnpm prune --prod` was tried first but
# — confirmed while preparing this Dockerfile — it emptied each
# workspace package's node_modules/ entirely (including production
# dependency symlinks like `dotenv`, breaking `node apps/api/dist/index.js`
# at startup) rather than trimming it. A fresh `--prod` install pass does
# not have that problem and correctly re-links every production
# dependency, so use that instead. CI=true is required either way — pnpm
# refuses to prune/reinstall without a TTY (as every Docker build is)
# otherwise.
ENV CI=true
RUN pnpm install --frozen-lockfile --prod

ENV NODE_ENV=production
ENV API_HOST=0.0.0.0
ENV API_PORT=4000

EXPOSE 4000

# GET /health checks DB connectivity (see apps/api/src/routes/health.ts)
# and returns 200 even if the database is briefly unreachable, by design
# (it reports {"database":"unavailable"} rather than failing the process
# health check) — most hosting platforms' health checks only care about
# process liveness (HTTP 200), and DB status is visible in the JSON body
# for manual/monitoring checks.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/index.js"]
