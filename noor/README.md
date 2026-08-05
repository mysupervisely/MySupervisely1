# Noor — patient platform

Noor is a behavioral-health patient engagement platform. This directory
now includes M1 ("Foundations": monorepo scaffold, authentication, RBAC,
ownership/care-relationship authorization, audit logging) and M2
("Patient Onboarding + Home": landing → signup → onboarding → patient
profile → Noor Home, for the patient app). **No clinical features exist
yet** — no weekly check-in, no scheduling, no subscriptions, no real
EHR/AI/payment integration, no clinical assessment or diagnosis. See
[`docs/noor/ARCHITECTURE.md`](../docs/noor/ARCHITECTURE.md) for the full
M0 architecture, [`docs/noor/M1-IMPLEMENTATION.md`](../docs/noor/M1-IMPLEMENTATION.md)
and [`docs/noor/M2-IMPLEMENTATION.md`](../docs/noor/M2-IMPLEMENTATION.md)
for what's actually implemented, including known limitations.

**Status: M1 + M2 only. Not production-ready. Not HIPAA compliant.
No clinical decision-making logic. No real patient data has ever touched
this codebase — every seeded account is synthetic.**

## Quick start

### 1. Database

Either start the bundled Postgres via Docker:

```bash
docker compose up -d
```

...or point `DATABASE_URL` at your own local Postgres instance. Either way,
use a database that will **only ever hold synthetic/test data**.

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

```bash
cp .env.example .env
cp packages/db/.env.example packages/db/.env
cp packages/api/.env.example packages/api/.env
# generate a real SESSION_SECRET for anything beyond quick local testing:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Set up the database

```bash
pnpm db:generate
pnpm db:migrate      # applies migrations, prompts to create noor_dev if missing
pnpm db:seed         # creates synthetic dev accounts — see below
```

### 5. Run everything

In separate terminals:

```bash
pnpm dev:api         # http://localhost:4000
pnpm dev             # patient app  — http://localhost:3000
pnpm dev:clinician   # clinician app — http://localhost:3001
pnpm dev:admin       # admin app     — http://localhost:3002
```

### Seeded dev accounts

`pnpm db:seed` creates four synthetic accounts, all sharing the password
`NoorDevSeed!2026` (obviously not a real password — dev/test only), already
linked by an active care relationship between the seeded patient and
clinician. The seeded patient account also has onboarding pre-completed,
so logging in takes you straight to a populated Home dashboard — sign up
a fresh account instead if you want to walk through the onboarding wizard.

| Email | Role | App |
|---|---|---|
| `patient.dev@example.test` | PATIENT | patient app (:3000) |
| `clinician.dev@example.test` | CLINICIAN | clinician app (:3001) |
| `admin.dev@example.test` | ADMIN | admin app (:3002) |
| `superadmin.dev@example.test` | SUPER_ADMIN | admin app (:3002) |

## Tests

```bash
pnpm test
```

The `@noor/api` package's integration suite runs against a **real**
Postgres database (never a mock DB layer) so RBAC/ownership queries are
exercised for real. Point `DATABASE_URL` (in `packages/api/.env` or the
shell environment) at a database whose connection string contains `test`
— `resetDatabase()` in `packages/api/tests/helpers.ts` refuses to run
otherwise, as a guard against ever truncating real data. Run migrations
against that test database first:

```bash
DATABASE_URL=postgresql://noor_app:noor_app_dev_password@localhost:5432/noor_test pnpm db:migrate:deploy
DATABASE_URL=postgresql://noor_app:noor_app_dev_password@localhost:5432/noor_test pnpm --filter @noor/api test
```

CI (`.github/workflows/noor-ci.yml`) does this automatically against a
disposable Postgres service container on every PR touching `noor/**`.

## Repository layout

See [`docs/noor/ARCHITECTURE.md` §L](../docs/noor/ARCHITECTURE.md#l-folderproject-structure).
