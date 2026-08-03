# DosePrepped — M0 Project Foundation

DosePrepped helps patients understand their medications and connect with
licensed pharmacists when they have medication-related questions.

> **Status: M0 (Project Foundation).** This is a structural scaffold only.
> There is no authentication, no AI, no medication database, no pharmacist
> workflow, and no real patient data. See
> [`docs/doseprepped/ARCHITECTURE.md`](../docs/doseprepped/ARCHITECTURE.md)
> for the full product spec and milestone plan. Every screen in the app is
> explicitly labeled as a placeholder.

## What's in M0

- A Next.js patient-facing PWA shell with the DosePrepped visual identity
  (mobile-first, healthcare-oriented, non-clinical) and eight structural
  placeholder screens: Landing, Login, Sign up, Patient Home, Medications,
  Ask a Question, Ask a Pharmacist, Profile.
- A minimal Fastify backend API (`/health`, verifying real DB connectivity).
- A PostgreSQL database via Prisma, with a `Role` (patient/pharmacist/admin)
  structure and a `PatientMedication` model, seeded with **synthetic demo
  data only**.
- Automated tests (Vitest) and lint/typecheck across every package.

Not in scope for M0 (see the architecture doc for when these land): AI,
medication reference database, OCR/medication scanning, pharmacist
messaging/dashboard, payments, real accounts, and any clinical decision
support.

## Project structure

```
doseprepped/
  apps/
    patient/     Next.js 16 patient PWA (App Router, TypeScript, Tailwind v4)
    api/         Fastify backend (TypeScript, built with tsup)
  packages/
    db/          Prisma schema, migrations, synthetic seed data, DB client
    types/       Shared framework-agnostic types (e.g. the Role union)
  docs/          (see ../docs/doseprepped for the architecture plan)
```

`packages/ui` (a shared component library) is intentionally **not** created
yet — there is only one consumer app (`patient`) so far. It's reserved in
the architecture for when the pharmacist dashboard is built and there's an
actual second consumer to share components with.

## Prerequisites

- Node.js 20+
- pnpm 10+ (`corepack enable` or `npm i -g pnpm`)
- A local PostgreSQL 16 server (or any reachable Postgres instance)

## Setup

```bash
cd doseprepped
pnpm install
```

Copy the environment files and fill in your local values:

```bash
cp .env.example .env                        # reference for the whole monorepo
cp apps/api/.env.example apps/api/.env
cp apps/patient/.env.example apps/patient/.env.local
cp packages/db/.env.example packages/db/.env
```

At minimum, set `DATABASE_URL` in `apps/api/.env` and `packages/db/.env` to
point at your local Postgres database. Never point it at a database
containing real patient data — this milestone (and the MVP pilot generally)
uses synthetic data only.

Then set up the database:

```bash
pnpm db:generate    # generate the Prisma client
pnpm db:migrate      # create the doseprepped_dev schema locally
pnpm db:seed          # load synthetic demo patients/pharmacist/admin
```

The seed creates four synthetic accounts (`patient-a@demo.doseprepped.dev`,
`patient-b@demo.doseprepped.dev`, `pharmacist@demo.doseprepped.dev`,
`admin@demo.doseprepped.dev`) matching the demo patients described in the
architecture doc (Patient A: Lisinopril + Metformin; Patient B: Semaglutide
+ Ondansetron). None of this is real patient data.

## Development commands

Run from the `doseprepped/` root unless noted otherwise.

| Command | What it does |
|---|---|
| `pnpm dev` | Start the patient app at http://localhost:3000 |
| `pnpm dev:api` | Start the backend API at http://localhost:4000 (with reload) |
| `pnpm build` | Build every package/app |
| `pnpm test` | Run all automated tests |
| `pnpm lint` | Run ESLint across the patient app and the API |
| `pnpm typecheck` | Type-check every package |
| `pnpm db:generate` | Regenerate the Prisma client after a schema change |
| `pnpm db:migrate` | Create/apply a Postgres migration (dev) |
| `pnpm db:seed` | Reload synthetic demo data |

To work on a single package directly, use pnpm's `--filter`, e.g.:

```bash
pnpm --filter @doseprepped/patient dev
pnpm --filter @doseprepped/api test
```

Run both the patient app and the API at once (two terminals):

```bash
pnpm dev        # terminal 1 — http://localhost:3000
pnpm dev:api    # terminal 2 — http://localhost:4000
```

## Testing

- `apps/patient` uses Vitest + React Testing Library (jsdom) for component
  and page tests: `pnpm --filter @doseprepped/patient test`.
- `apps/api` uses Vitest with Fastify's `inject()` for route tests (no open
  port needed): `pnpm --filter @doseprepped/api test`.
- `pnpm test` from the root runs both.

## Environment variables

See [`.env.example`](./.env.example) for the full reference, and the
per-app `.env.example` files for the subset each one reads. Nothing is
hardcoded — secrets, API keys, and connection strings all come from the
environment, and `.env*` files are git-ignored.

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `packages/db`, `apps/api` | Local Postgres only in M0 — never point at real patient data |
| `NODE_ENV` | `apps/api` | `development` \| `test` \| `production` |
| `API_PORT`, `API_HOST` | `apps/api` | Defaults to `4000` / `0.0.0.0` |
| `SESSION_SECRET` | `apps/api` | Reserved for M1 (auth); optional and unused until then |
| `NEXT_PUBLIC_API_URL` | `apps/patient` | Reserved — the patient app doesn't call the API yet in M0 |

## Security notes for this milestone

- No real patient data anywhere in this repo or its seed data — synthetic
  demo accounts only.
- No secrets are committed; `.env*` files are git-ignored and only
  `.env.example` files (with placeholder values) are tracked.
- The API validates its environment configuration at startup (via Zod) and
  fails fast on misconfiguration rather than running with defaults.
- Authentication, session management, RBAC enforcement, audit logging, and
  the rest of the security architecture in
  `docs/doseprepped/ARCHITECTURE.md` §8 are **not implemented yet** — the
  `Role` field on `User` establishes the data model only. Do not treat this
  milestone as handling anything beyond structural scaffolding.
