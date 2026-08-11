# DosePrepped — Remote Demo Deployment (M6.1)

Status: **readiness preparation only — nothing has been deployed.** This
document describes how to put the M6.0 Demo Mode experience
(`/demo`) on a public, HTTPS URL reachable from a laptop or phone, using
free/low-cost hosting, without touching the core clinical/production
architecture. See the M6.1 completion report (delivered alongside this
document) for the explicit stop condition this was produced under: no
purchase, no domain, no paid account, no deploy — approval required first.

This is a **demo deployment**, not a production deployment. It is not,
and does not claim to be, HIPAA compliant. It carries no real patient
data.

---

## 1. Recommended architecture

```
Browser (laptop / phone)
   │  HTTPS
   ▼
Next.js patient app  ──────────────►  Vercel
   │  server-to-server HTTPS
   │  (Demo Mode's own login + forwarded
   │   session cookie — see §7)
   ▼
Fastify API  ─────────────────────►  Render (Web Service)
   │  Postgres wire protocol
   ▼
Dedicated demo PostgreSQL  ────────►  Neon (free, serverless Postgres)
```

| Layer | Service | Why |
|---|---|---|
| Frontend (`apps/patient`, Next.js) | **Vercel** | Zero-config Next.js hosting, built specifically for this framework (Server Actions, Server Components work with no extra configuration), generous free Hobby tier, automatic HTTPS + a free `*.vercel.app` URL immediately. |
| API (`apps/api`, Fastify) | **Render** (Web Service, Docker) | Runs a long-lived Node process (Fastify needs one — Vercel's serverless functions are the wrong shape for a stateful Fastify app with in-process rate-limiting and a demo-session cache). Render deploys straight from the new `apps/api/Dockerfile` (§4) with no extra glue. Free tier available; see cost caveats in §2. |
| Database | **Neon** (serverless Postgres) | A dedicated demo-only database, isolated from any development or production database. Neon's free tier doesn't expire (unlike Render's free Postgres, which is deleted after 30 days — a bad fit for an ongoing sales demo). Standard `postgresql://` connection string, works with Prisma/`@prisma/adapter-pg` unmodified. |

This is the **simplest** architecture that satisfies every stated
constraint (isolated demo DB, no public reset endpoint, no secrets in the
browser, existing auth/authorization untouched). Railway or Fly.io are
viable drop-in alternatives for the API + DB layer — both accept the same
`apps/api/Dockerfile` unmodified — but Render + Neon has the least setup
friction and the clearest free/low-cost path.

---

## 2. Estimated monthly hosting cost

| Tier | Frontend (Vercel) | API (Render) | DB (Neon) | Total | Trade-off |
|---|---|---|---|---|---|
| **Free / starter** | $0 (Hobby) | $0 (Free Web Service) | $0 (Free tier) | **$0/mo** | Render's free Web Service **spins down after 15 minutes of inactivity** and takes ~30–50s to wake on the next request. Acceptable for casual link-sharing; a live sales call would open the link a minute or two early to "warm it up," or use the paid tier below. Vercel's Hobby plan is licensed for personal/non-commercial use per Vercel's terms — using it to demo a product to prospective customers is a gray area worth flagging, not a hard blocker. |
| **Recommended for live sales calls** | $20/mo (Pro) | $7/mo (Starter — always on, no cold start) | $0 (Neon free tier is enough for synthetic demo data at this scale) | **~$27/mo** | No cold starts, Vercel's commercial-use terms clearly satisfied, still no long-term contract — cancel anytime. |

These are current list prices for each platform's smallest paid tier as
of this writing; verify at deploy time, since hosting pricing changes.

---

## 3. Required services (to sign up for, not yet created)

1. A **Vercel** account (GitHub login is enough to start).
2. A **Render** account.
3. A **Neon** account (or Render's own Postgres / Railway Postgres if you'd
   rather keep everything on one platform, trading Render Postgres's
   30-day free-tier expiry for one-vendor convenience).

None of these have been created as part of this preparation. No account
was opened, no domain purchased, no payment method entered.

---

## 4. Deployment configuration added in this preparation pass

Two files were added to the repository; nothing else changed:

- **`apps/api/Dockerfile`** — builds and runs the Fastify API from the
  pnpm workspace. Build context is the `doseprepped/` repo root (the API
  depends on sibling workspace packages).
- **`.dockerignore`** (repo root) — keeps `node_modules`, build output,
  and any local `.env*` files out of the Docker build context.

Both were validated in this sandbox (§10) by running the Dockerfile's
exact command sequence — `pnpm install --frozen-lockfile` →
`pnpm approve-builds --all` → `pnpm --filter @doseprepped/db run generate`
→ `pnpm --filter @doseprepped/api run build` → a production-only install
pass — against a clean checkout, then booting the resulting build against
a real Postgres instance and confirming `/health`, login, and the mock AI
provider all work. The container image itself could not be built in this
sandbox because its network policy blocks the Docker Hub CDN used to pull
the `node:20-alpine` base image (a `403 Forbidden` from
`production.cloudfront.docker.com`) — this is a sandbox network
restriction, not a defect in the Dockerfile, and Render's own build
infrastructure does not sit behind this restriction.

No `vercel.json` was added. Vercel's zero-config Next.js detection is
sufficient — the only configuration needed is setting "Root Directory" to
`doseprepped/apps/patient` in the Vercel project dashboard (§8). Adding a
platform-specific config file for Render (`render.yaml`) or Railway
(`railway.toml`) was deliberately **not** done in this pass, since that
would commit the repository to a specific paid vendor before you've
approved one — happy to add it in the same PR once you pick a platform.

No code, schema, seed data, authentication, or authorization logic was
changed.

---

## 5. Database requirements

- A **new, dedicated PostgreSQL database**, separate from your local dev
  database and from any future production database. Nothing in this
  preparation reuses or touches `doseprepped_dev` or any other existing
  database.
- Initialize it with the **existing, unmodified** Prisma workflow — no
  new commands were introduced:
  ```
  DATABASE_URL="<demo db connection string>" \
    pnpm --filter @doseprepped/db exec prisma migrate deploy
  DATABASE_URL="<demo db connection string>" pnpm db:seed
  ```
  `migrate deploy` applies all 14 existing migrations in order (the same
  ones your local dev database has); `pnpm db:seed` is the same seed
  script already used locally (§6) — both run from your machine (or a CI
  job), pointed at the demo database via `DATABASE_URL`. Neither command
  is exposed over HTTP.
- The seed script is already idempotent — confirmed again in this pass by
  running it twice in a row locally and diffing the demo org's data
  (unchanged both times). It always contains only synthetic data:
  five synthetic base accounts, two synthetic demo organizations used to
  prove tenant isolation (Meridian Telehealth (Demo), Northstar Digital
  Pharmacy (Demo)), and the dedicated M6.0 "DosePrepped Demo Mode"
  organization with its three `demo-mode-*` accounts and two canned
  scenarios. No real patient information exists anywhere in this seed
  data or in this repository.

---

## 6. Demo reset procedure

The safest and simplest reset is the one that already exists — re-run the
seed command against the demo database's connection string:

```
DATABASE_URL="<demo db connection string>" pnpm db:seed
```

This clears and recreates the two canned scenarios and the demo accounts'
adherence/check-in history, deterministically, every time. Any disposable
"Try it yourself" questions a visitor submitted are cleared along with
it. **No public/HTTP reset endpoint exists or was added** — resetting is
a command you (or a scheduled CI job, if you want the demo to
auto-refresh nightly, an optional future enhancement) run directly against
the database connection string, which is never exposed to the browser.

---

## 7. Environment variables

### Server-only secrets — **never** sent to the browser

| Variable | Used by | Required | Notes |
|---|---|---|---|
| `DATABASE_URL` | API (Render) | **Yes** | The dedicated demo Postgres connection string. Never appears in any client bundle — confirmed in §10. |
| `SESSION_SECRET` | API (Render) | **Yes** | Generate a fresh value for the demo deployment: `openssl rand -base64 32`. Must **not** reuse the local dev value committed in `apps/api/.env.example` or any value used by a real deployment. |
| `AI_PROVIDER` | API (Render) | No (defaults to `mock`) | Leave unset, or set explicitly to `mock`. See §8. |
| `ANTHROPIC_API_KEY` | API (Render) | No | Do not set. Only read when `AI_PROVIDER=anthropic`; the demo must never require it (constraint from the task). |
| `DEMO_MODE_PASSWORD` | Next.js server (Vercel) | No (has a built-in default) | Overrides the shared password Demo Mode's server-side code uses to log in as its own dedicated accounts. Not a secrecy boundary — the default value is already the one baked into the public seed script, and Demo Mode's isolation comes from the accounts' organization membership (see "M6.0 — Demo Mode" §3 in `ARCHITECTURE.md`), not from this password being unknown. Setting it is optional defense-in-depth, not a requirement. |

### Public / browser-safe

| Variable | Used by | Required | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | Next.js (build-time, baked into the client bundle) | **Yes** | The API's own public HTTPS URL (e.g. `https://doseprepped-api-demo.onrender.com`). This is deliberately public — it's simply where the browser sends requests for the app's non-demo pages (real login, medication forms, etc.); it is not a secret. Confirmed present in the built client bundle, and confirmed **no** other env var accompanies it there (§10). Because Next.js inlines `NEXT_PUBLIC_*` values at build time, this must be set correctly in Vercel **before** the first deploy — changing it later requires a rebuild, not just a redeploy. |

### Other required API config (not secret, not currently a NEXT_PUBLIC value)

| Variable | Used by | Required | Notes |
|---|---|---|---|
| `APP_ORIGINS` | API (Render) | Yes (has a `localhost`-only default) | Must be set to the deployed frontend's exact HTTPS origin (e.g. `https://doseprepped-demo.vercel.app`) so CORS allows the browser-facing (non-demo) routes to keep working. `/demo` itself does not depend on this (§7 below explains why), but the rest of the app does, and this preparation should not silently break it. |
| `NODE_ENV` | API (Render) | Recommended: `production` | Enables the `Secure` flag on the real login session cookie (see `apps/api/src/lib/auth.ts`) — required once the app is served over HTTPS. |
| `API_PORT` / `API_HOST` | API (Render) | No | Render sets `PORT` itself; the Dockerfile defaults `API_PORT=4000` and `API_HOST=0.0.0.0`, so bind the API to whatever `PORT` Render assigns via that same env var name if Render's dashboard requires it (Render Web Services typically respect an app's own listen port when a Dockerfile `EXPOSE`s it — verify against Render's current Docker deploy docs). |

---

## 8. Why automatic Demo Mode authentication works safely across two domains

The task's stop condition here — *"if automatic demo authentication
cannot safely work with the selected hosting architecture, stop and
explain the issue"* — does not trigger. It was checked directly, not
assumed:

Demo Mode never gives the visitor's browser a session cookie at all. Every
`/demo/*` page performs its data fetch **on the Next.js server**, which
itself performs the ordinary `POST /auth/login` against the Fastify API
as one of the three dedicated demo accounts and forwards only that
cookie on its own outbound server-to-server request — never on the
response to the visitor's browser. The visitor has no session to swap or
elevate; there is nothing cross-origin for the browser to fail at.

Concretely, with the frontend on `*.vercel.app` and the API on
`*.onrender.com` (two unrelated domains):

- **Reads** (`/demo`, `/demo/patient`, `/demo/pharmacist`, `/demo/admin`,
  `/demo/journey`) — pure Next.js Server Components calling the API
  server-to-server. No browser cookie, no CORS exposure, no cross-site
  cookie policy involved at all.
- **Writes** ("Try it yourself" submit, pharmacist claim/respond) — Next.js
  Server Actions. The browser's form POST always goes to the Next.js
  server it's already on (same-origin, handled internally by Next's
  Server Actions machinery); the Next.js server then calls the API
  server-to-server exactly as above.

This was re-verified against the actual API this session (§10), not just
reasoned about: direct authorization checks against the running API
confirm the demo accounts' session cookie behaves identically regardless
of what origin issued the request that triggered it, because the
cookie never leaves the server side to begin with.

One related, explicitly **out-of-scope** note for completeness: the
app's *real* (non-demo) login flow **does** set a cookie on the visitor's
own browser (`apps/api/src/lib/auth.ts`, `sameSite: "lax"`), which is
fine for same-site subdomains (e.g. `app.doseprepped.com` +
`api.doseprepped.com`) but would need `sameSite: "none"` to work reliably
across two unrelated free-tier domains (`*.vercel.app` +
`*.onrender.com`). That only affects the real login/signup pages, not
`/demo`, and changing it is exactly the kind of core-authentication
change this task said not to make — flagged here as a known limitation
of the free/starter URL combination, not something this pass touched.

---

## 9. AI provider

No change needed. `AI_PROVIDER` already defaults to `"mock"` in
`apps/api/src/config/env.ts` (confirmed by reading that file, not
assumed), and the API only requires `ANTHROPIC_API_KEY` when
`AI_PROVIDER=anthropic` is explicitly set. Leaving `AI_PROVIDER` unset on
the demo deployment reproduces exactly the local dev/demo behavior
already tested throughout M6.0 and re-verified in this pass (§10) — the
demo's AI education responses come from
`MockMedicationEducationProvider`, deterministic and free, no external AI
billing or API key required.

---

## 10. Testing performed in this preparation pass

All of the following were run before writing this report — see the
accompanying M6.1 completion report for a summary; this section has the
detail.

1. `pnpm -r lint` — clean.
2. `pnpm -r typecheck` — clean.
3. `pnpm -r test` — 233/233 tests passing (safety-rules 16, ai-service
   17, patient 16 across 9 files, api 184).
4. `pnpm build` — succeeds; the route manifest includes every M6.0 route
   (`/demo`, `/demo/patient`, `/demo/pharmacist`, `/demo/admin`,
   `/demo/journey`) alongside every pre-existing route, unchanged.
5. Full local smoke test against the fresh build: `pnpm db:seed` →
   `pnpm dev:api` → `pnpm dev`, then every `/demo/*` route checked live
   (`200` on all five), and the complete interactive workflow driven
   end-to-end via a headless browser: landing → patient perspective →
   live question submission → AI education response → pharmacist queue →
   claim → response → **patient sees the pharmacist's saved response**
   (re-confirmed via the submission's own link) → escalation scenario →
   organization analytics → Full Journey stepper.
6. Live authorization checks against the running API (not just unit
   tests): the demo admin account's own membership lookup returns only
   the "DosePrepped Demo Mode" organization; direct requests for
   Meridian Telehealth's and Northstar Digital Pharmacy's organization
   records both return `404 "Organization not found"`; a demo patient
   hitting the pharmacist queue route gets `403`; a demo pharmacist
   attempting to `PATCH` the organization's own settings gets `403` and
   the organization's name is confirmed unchanged afterward.
7. Client-bundle secret scan against the actual built output
   (`apps/patient/.next/static/`): no occurrence of `DATABASE_URL`, the
   session secret value, `ANTHROPIC_API_KEY`, or the demo password
   anywhere in any shipped JS chunk. `NEXT_PUBLIC_API_URL` is present, as
   intended (§7).
8. The `Dockerfile`'s exact build sequence was run — not merely read —
   against a clean checkout of the repository (a fresh copy containing
   only git-tracked files, no carried-over `node_modules`/build output),
   and the resulting production-only build was booted against a real
   Postgres database and confirmed to serve `/health`, log a demo account
   in, and respond correctly. This surfaced and fixed two real problems a
   from-scratch cloud build would otherwise have hit (documented inline
   in the Dockerfile): pnpm's newer versions silently skip native
   postinstall scripts (esbuild, Prisma's engine downloader) unless
   explicitly approved, and `pnpm prune --prod` — the initially-obvious
   way to drop devDependencies — actually emptied each workspace
   package's `node_modules` entirely rather than trimming it, breaking
   the built server at startup; a fresh `--prod` install pass was used
   instead and confirmed correct.
9. What could **not** be validated in this sandbox: an actual
   `docker build` of the image (blocked by this sandbox's network policy
   on the Docker Hub CDN, not a defect in the Dockerfile — see §4), and
   anything that requires a real Vercel/Render/Neon account (deployment
   itself is explicitly out of scope for this pass).
