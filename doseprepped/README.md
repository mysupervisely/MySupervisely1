# DosePrepped — M0–M2 + M3 Phase 1–2 (Foundation, Auth, Medications, Question Intake, Deterministic Safety/Disposition)

DosePrepped is a digital medication-support layer: it helps patients
understand their medications and, eventually, connect with licensed
pharmacists (and their own provider when appropriate) when they have
medication-related questions.

> **Status: through M3 Phase 2 (Deterministic Safety & Disposition
> Layer).** Real accounts, login/logout, password hashing, sessions,
> server-enforced role-based access control (patient / pharmacist / admin),
> a full patient medication list, structured medication-question intake,
> and a deterministic, AI-independent safety/disposition routing layer are
> implemented. Every submitted question is now automatically routed to one
> of four dispositions (general education, pharmacist review, provider
> evaluation, or urgent/emergency guidance) using explicit, versioned,
> reviewable rules — **no AI/LLM is involved in this routing, and none is
> required for it to work.** This is routing only: nothing in this codebase
> diagnoses, recommends treatment, or tells a patient to start/stop/change
> a medication. No pharmacist reviews questions yet, no AI generates
> educational answers yet, and there is still no authoritative medication
> database, no OCR, no pharmacist messaging, no provider escalation
> workflow, no payments, and no comprehensive clinical decision support.
> See
> [`docs/doseprepped/ARCHITECTURE.md`](../docs/doseprepped/ARCHITECTURE.md)
> for the full product spec, the M3 "digital medication-support layer"
> architecture, and the milestone plan. Ask a Pharmacist and the pharmacist
> /admin dashboards remain explicit placeholders.

## What's in M0–M2 + M3 Phase 1–2

- A Next.js patient-facing PWA shell with the DosePrepped visual identity
  (mobile-first, healthcare-oriented, non-clinical) and screens for:
  Landing, Login, Sign up, Patient Home, Medications (list/add/detail/edit),
  Ask a Question (structured intake wizard), My Questions (list/detail),
  Ask a Pharmacist, Profile, plus a Pharmacist home and an Admin home.
- Real authentication: sign up, log in, log out, bcrypt password hashing,
  password strength validation, and DB-backed sessions via a signed httpOnly
  cookie.
- Server-enforced role-based access control (RBAC) for three roles —
  patient, pharmacist, admin — checked on the API for every protected
  request, not just hidden in the frontend.
- A patient medication list: add, view, edit, and archive ("mark inactive")
  medications, each strictly scoped to the authenticated patient who owns
  it — enforced server-side, never by the frontend alone. Records are never
  hard-deleted (see "Medication data model" below).
- A basic, clearly-labeled synthetic medication name autocomplete on the Add
  Medication form, behind a small Medication Data Abstraction Layer
  (`packages/db/src/medication-reference.ts`) designed so a real
  RxNorm/DailyMed-backed provider can be swapped in later without touching
  any caller.
- **Structured medication-question intake (M3 Phase 1):** a patient picks a
  medication (or starts from that medication's own detail page), a
  patient-friendly category, and describes their question in their own
  words. The question is snapshotted, stored, and immediately visible in
  "My Questions" with a `Received` status. See "Question data model" below.
- **Deterministic safety & disposition routing (M3 Phase 2):** every
  submitted question is run, synchronously and server-side, through
  `packages/safety-rules` — a small, versioned, zero-dependency rule engine
  that assigns one of four dispositions (`GENERAL_EDUCATION`,
  `PHARMACIST_REVIEW`, `PROVIDER_EVALUATION`, `URGENT_EMERGENCY`) from the
  patient's chosen category plus a small set of named, reviewable text
  patterns. It never calls an AI/LLM and never requires one to be
  available. See "Deterministic safety & disposition architecture" below.
- A minimal Fastify backend API: `/health` (DB connectivity), `/auth/*`
  (signup/login/logout/me), `/medications*` (CRUD + archive + reference
  search), `/questions*` (create/list/detail), and one role-gated
  placeholder ping route per role (`/patient/ping`, `/pharmacist/ping`,
  `/admin/ping`).
- A PostgreSQL database via Prisma: `User`, `Session`, `PatientMedication`,
  `MedicationReference`, and `MedicationQuestion`, seeded with **synthetic
  demo data only**.
- Automated tests (Vitest) and lint/typecheck across every package,
  including 53 auth/RBAC/medication/question/disposition integration tests
  against a real (disposable) test database, plus 16 standalone unit tests
  for the safety-rules engine.

Not in scope yet (see the architecture doc for when these land): AI-
generated educational answers, an authoritative medication reference
database, OCR/medication scanning, pharmacist messaging/dashboard
functionality, provider escalation workflow, payments, account deletion,
consent tracking, drug interaction checking, and any comprehensive clinical
decision support. M3 Phase 2's rule engine performs **routing only** — it
does not diagnose, does not recommend treatment, and does not evaluate
whether a medication is "safe" for a given patient.

## Project structure

```
doseprepped/
  apps/
    patient/     Next.js 16 app (App Router, TypeScript, Tailwind v4) —
                 hosts the patient PWA *and*, for now, the pharmacist/admin
                 placeholder home screens (no separate pharmacist app yet)
    api/         Fastify backend (TypeScript, built with tsup)
  packages/
    db/          Prisma schema, migrations, synthetic seed data, DB client
    auth/        Shared password hashing + session logic (bcrypt, DB-backed
                 sessions) used by apps/api; the frontend never sees this
                 package directly — it only talks to the API
    types/       Shared framework-agnostic types (e.g. the Role union)
    safety-rules/ Deterministic, zero-dependency safety/disposition rule
                 engine (pure function: category + question text →
                 disposition). No DB, HTTP, or AI dependency by design.
  docs/          (see ../docs/doseprepped for the architecture plan)
```

`packages/ui` (a shared component library) is intentionally **not** created
yet — there is only one consumer app (`patient`) so far.

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

At minimum, set in `apps/api/.env`:
- `DATABASE_URL` — your local Postgres connection string. Never point this
  at a database containing real patient data.
- `SESSION_SECRET` — a real random value, e.g. `openssl rand -base64 32`.
  Required; the API refuses to start without it.

Then set up the database:

```bash
pnpm db:generate    # generate the Prisma client
pnpm db:migrate      # apply migrations to doseprepped_dev locally
pnpm db:seed          # load synthetic demo accounts
```

The seed creates four synthetic accounts, all with the password
**`DosepreppedDemo!1`** (a publicly-documented local-dev-only demo
password — not a secret, never use it for anything real):

| Email | Role |
|---|---|
| `patient-a@demo.doseprepped.dev` | Patient (Lisinopril + Metformin) |
| `patient-b@demo.doseprepped.dev` | Patient (Semaglutide + Ondansetron) |
| `pharmacist@demo.doseprepped.dev` | Pharmacist |
| `admin@demo.doseprepped.dev` | Admin |

None of this is real patient data. Public sign-up (via the UI or
`POST /auth/signup`) always creates a **patient** account — pharmacist and
admin accounts are only created via seeding/direct DB access in this
milestone, by design (no public pharmacist self-registration).

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
  port needed): `pnpm --filter @doseprepped/api test`. The auth/RBAC suite
  does real reads/writes against Postgres, so it needs a reachable
  **disposable** test database — never point it at data that matters:

  ```bash
  # one-time setup, as the postgres superuser:
  createdb -O doseprepped doseprepped_test
  # apply migrations to it:
  DATABASE_URL="postgresql://doseprepped:<password>@localhost:5432/doseprepped_test" \
    pnpm --filter @doseprepped/db exec prisma migrate deploy
  ```

  By default the tests point at
  `postgresql://doseprepped:doseprepped_dev_password@localhost:5432/doseprepped_test`;
  override with a `TEST_DATABASE_URL` env var if yours differs. Test data
  lives under the `@test.doseprepped.local` email domain and is deleted by
  the suite's `afterAll` hook.
- `pnpm test` from the root runs both.

## Environment variables

See [`.env.example`](./.env.example) for the full reference, and the
per-app `.env.example` files for the subset each one reads. Nothing is
hardcoded — secrets, API keys, and connection strings all come from the
environment, and `.env*` files are git-ignored.

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `packages/db`, `apps/api` | Local Postgres only — never point at real patient data |
| `NODE_ENV` | `apps/api` | `development` \| `test` \| `production` |
| `API_PORT`, `API_HOST` | `apps/api` | Defaults to `4000` / `0.0.0.0` |
| `SESSION_SECRET` | `apps/api` | **Required.** Signs the session cookie. Generate with `openssl rand -base64 32`; never reuse the example value |
| `APP_ORIGINS` | `apps/api` | Comma-separated frontend origin(s) allowed to call the API with credentials (CORS). Defaults to `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | `apps/patient` | Base URL the frontend (browser and server) uses to reach the API |

## Authentication architecture

- **Passwords**: hashed with bcrypt (cost factor 12) via `packages/auth`.
  Never logged, never returned by any API response, never stored in
  plaintext. Validated server-side (min 10 chars, at least one letter and
  one number, checked against a common-password blocklist) independent of
  any client-side checks.
- **Sessions**: on login/signup the API generates a 256-bit random token,
  stores only its SHA-256 hash in the `sessions` table (so a database read
  alone can't be replayed as a live session), and sends the raw token to
  the browser as an `httpOnly`, `SameSite=Lax`, **signed** cookie
  (`@fastify/cookie`, signed with `SESSION_SECRET`) — signing lets a
  tampered cookie be rejected before it ever reaches a database lookup.
  Sessions expire after 7 days. Logout deletes the session server-side and
  clears the cookie.
- **Frontend**: the Next.js app never talks to the database directly for
  auth. Server Components forward the incoming request's cookies to the
  API's `GET /auth/me` (see `apps/patient/src/lib/session.ts`) to resolve
  the current user, then redirect via `apps/patient/src/lib/require-role.ts`
  if unauthenticated or wrong-role. This keeps one authoritative session
  check (the API) instead of duplicating session-validation logic in two
  runtimes.
- **Rate limiting**: `/auth/login` and `/auth/signup` are limited to 10
  requests/minute per IP (stricter than the API's 100/minute global
  default) via `@fastify/rate-limit`, to slow credential-stuffing attempts.

## Role-based access control architecture

- Enforcement lives entirely on the API (`apps/api/src/lib/auth.ts`):
  `authenticate` is a Fastify `preHandler` that resolves and attaches the
  session user or responds `401`; `requireRole(...roles)` composes with it
  and responds `403` if the user's role doesn't match. Every protected
  route declares its own required role(s) explicitly — there's no implicit
  hierarchy (an admin does **not** automatically pass a pharmacist-only
  check, and vice versa).
- The frontend's route guards (`requireRole` in
  `apps/patient/src/lib/require-role.ts`) are a UX convenience — they
  redirect a signed-in user to their own role's home page instead of
  showing a 403 page — but they call the same API endpoint the backend
  trusts, so there is no separate, weaker "frontend-only" check to bypass.
- The three roles today: `PATIENT` (self-service sign-up), `PHARMACIST` and
  `ADMIN` (seeded/DB-created only — no public self-registration path
  exists for these roles).
- **Resource ownership** (introduced in M2, extended in M3) is a separate
  check from role: every medication and question route scopes its database
  query to `{ id, patientId: request.user.id }` together, never `id` alone
  (`apps/api/src/routes/medications.ts`, `.../questions.ts`). A record that
  exists but belongs to another patient returns the same `404` as one that
  doesn't exist at all, so the API never confirms or denies another
  patient's records exist. Creating a question additionally re-verifies
  that the given `medicationId` belongs to the requesting patient before
  anything is written — a client-supplied ID is never trusted on its own.

## Medication data model

- `PatientMedication` belongs to exactly one `User` (`patientId`) and holds:
  name, strength, dosage form, directions, frequency, route, start date, an
  optional end date, optional notes, a `status` (`ACTIVE` | `INACTIVE`),
  and `createdAt` / `updatedAt` / `archivedAt` timestamps.
- **Archive, don't delete**: there is no delete endpoint. "Removing" a
  medication (`POST /medications/:id/archive`) sets `status = INACTIVE` and
  stamps `archivedAt` — the record and its history stay intact for future
  audit/adherence/history features described in the architecture doc. The
  one exception is that a patient's medications are cascade-deleted if
  their *account* itself is ever deleted (not implemented yet) — a
  different, account-level concern from a patient archiving one medication.
- **Not an authoritative medication database**: `MedicationReference` is a
  small, explicitly synthetic (`isSynthetic: true`, `source:
  "synthetic_demo"`) table that only powers the Add Medication name
  autocomplete. `GET /medications/reference?q=` and every API response
  using it flags `isSynthetic: true` so the frontend never presents it as
  clinical fact. All medication *record* fields remain free-text patient
  entry — picking a suggestion just pre-fills the form.

## Question data model

Implements `MedicationQuestion` per `docs/doseprepped/ARCHITECTURE.md` "M3
— The Digital Medication-Support Layer" §2/§15. M3 Phase 1–2 only ever
write a subset of its fields — the rest exist now so later phases (AI
education, pharmacist review, provider escalation) don't require a schema
change:

- **Ownership**: `patientId` (owner) and `medicationId` (the medication
  it's about), both FKs, both enforced server-side exactly like
  `PatientMedication`.
- **Medication snapshot** (`medicationSnapshot`, JSON): `{name, strength,
  directions, frequency, route}` captured from the live `PatientMedication`
  row **at the moment the question is created**, and never re-derived on
  read. If the patient later edits that medication (M2
  `PATCH /medications/:id`), this question's snapshot — and therefore its
  history — does not change. Verified by a dedicated test
  (`does not change the snapshot when the medication is edited afterward`).
- **Other-medications snapshot** (`otherMedicationsSnapshot`, JSON,
  nullable): a minimal `{name, strength}[]` list of the patient's other
  *active* medications, captured only when the category is
  `DRUG_INTERACTION` or `SIDE_EFFECT` — every other category leaves this
  `null`, per the minimum-necessary-data principle.
- **Category** (`category`): patient-selected, one of `GENERAL_INFO`,
  `ADMINISTRATION`, `MISSED_DOSE`, `SIDE_EFFECT`, `DRUG_INTERACTION`,
  `STORAGE`, `ADHERENCE`, `COST_ACCESS`, `OTHER`. `aiSuggestedCategory`
  exists for a later phase and is always `null` today.
- **Question text** (`questionText`): the patient's own words, required,
  length-capped.
- **Status** (`status`): defaults to `RECEIVED` on creation and is never
  transitioned further by any code path in Phase 1. Every other status
  value (`AI_PROCESSING`, `AI_ANSWERED`, `PHARMACIST_REQUESTED`,
  `PHARMACIST_IN_PROGRESS`, `WAITING_FOR_PATIENT`, `PHARMACIST_RESOLVED`,
  `ESCALATED`, `CLOSED`) is defined in the schema but unreachable until a
  later phase implements the code path that sets it.
- **Disposition** (`disposition`, `dispositionSource`,
  `dispositionRuleIds`, `safetyRuleSetVersion`, `dispositionAssignedAt`):
  assigned deterministically at creation time by `packages/safety-rules`
  (M3 Phase 2) — see "Deterministic safety & disposition architecture"
  below. `dispositionSource` is always `DETERMINISTIC` today (the
  `AI_ASSISTED` value exists for a future refinement layer that is not
  implemented). `dispositionRuleIds` records which named escalation
  rule(s), if any, fired; empty means the category baseline applied.
  `safetyRuleSetVersion` pins the exact rule set that produced the
  disposition, so a later rule change never silently reinterprets a past
  question.
- **AI education / pharmacist / escalation fields**
  (`aiEducationResponse`, `aiModelVersion`, `pharmacistId`,
  `pharmacistResponse`, `escalatedAt`, `escalationReason`, etc.): present
  in the schema and in every API response (always `null`), but nothing in
  this codebase writes to them yet — no LLM is called, no pharmacist queue
  exists. This is intentional: it's the "clean integration point" for the
  next phase, not a placeholder answer that could be mistaken for real
  guidance.

## Deterministic safety & disposition architecture

Full rationale and audit trail lives in `docs/doseprepped/ARCHITECTURE.md`
under "Deterministic Safety & Disposition Rule Engine" — this is a summary.

- **Purpose is routing, not clinical judgment.** The engine decides which
  human tier (general education / pharmacist / provider) should see a
  question next, or whether to surface urgent/emergency guidance. It never
  diagnoses, never recommends a treatment or dose change, never tells a
  patient to start or stop a medication, and never determines whether a
  medication is "safe" for that specific patient.
- **Deterministic-first, AI-independent by construction.**
  `packages/safety-rules` (`evaluateDisposition(questionText, category)`)
  is a pure, synchronous function with **zero runtime dependencies** — no
  database, no HTTP client, no AI/LLM client. There is no code path through
  which question creation could require an AI service to be available; a
  future AI-assisted refinement layer (`AI_ASSISTED`, not implemented) can
  only ever escalate a disposition toward more caution, never downgrade or
  replace the deterministic result (the "conservative floor").
- **Two-layer algorithm:**
  1. **Category baseline** — the patient's own category selection
     (`GENERAL_INFO` / `ADMINISTRATION` / `STORAGE` → `GENERAL_EDUCATION`;
     everything else → `PHARMACIST_REVIEW`) is a structured, unambiguous
     signal, so it sets the floor before any text is examined.
  2. **Named escalation rules** — a small, intentionally non-exhaustive set
     of pattern-matching rules (severe allergic reaction, possible overdose
     or poisoning, loss of consciousness, chest pain, suicidal
     ideation/self-harm → `URGENT_EMERGENCY`; severe/rapidly worsening
     symptoms, medication errors with potential harm →
     `PROVIDER_EVALUATION`) scan the question text and, on a match, raise
     the disposition above the category baseline — never below it. Each
     rule has a stable `id`, an audit description, and lives in
     `packages/safety-rules/src/rules.ts` for clinical review.
- **When uncertain, it defaults to human review.** Six of the nine
  categories baseline to `PHARMACIST_REVIEW` rather than
  `GENERAL_EDUCATION`; there is no confidence threshold or "maybe" state —
  a question either matches a named escalation pattern or it doesn't, and
  ambiguous/unmatched text always falls back to its category's
  human-reviewed baseline rather than being assumed safe for pure
  education.
- **Versioned and auditable.** `SAFETY_RULE_SET_VERSION`
  (`packages/safety-rules/src/rules.ts`) is a date-stamped string bumped on
  any rule or baseline change. Every question stores the exact version and
  rule ID(s) that produced its disposition at creation time, so editing the
  rules later never rewrites the meaning of a past question.
- **Patient-facing copy** (`apps/patient/src/lib/question-labels.ts`,
  `DISPOSITION_MESSAGES`) is deliberately routing-only language — e.g.
  "This question is better reviewed by a pharmacist." — and never implies
  a pharmacist or physician has already reviewed the question, since none
  has yet.
- **Current limitations — requires clinical review before production
  use.** The rule set is small and intentionally does not attempt to
  enumerate every possible medical emergency; patterns are English-only
  and text-based (no medication-specific interaction/risk awareness). This
  is a first deterministic pass meant to be extended, and reviewed by a
  licensed pharmacist/clinician, before it is relied on with real patient
  data.
- **What Phase 2 does *not* do:** it does not create a pharmacist queue or
  send any pharmacist/provider notification, does not transition
  `MedicationQuestion.status` away from `RECEIVED`, and does not generate
  any AI-written educational answer. It only computes and stores a
  disposition value at creation time. Those integrations are explicitly
  future phases.

## Security notes for this milestone

- No real patient data anywhere in this repo or its seed data — synthetic
  demo accounts only.
- No secrets are committed; `.env*` files are git-ignored and only
  `.env.example` files (with placeholder values) are tracked.
- The API validates its environment configuration at startup (via Zod) and
  fails fast on misconfiguration rather than running with defaults.
- Login failures return the same generic "Invalid email or password" for
  both "no such user" and "wrong password", to avoid leaking which emails
  have accounts.
- Medication and question IDs in URLs are opaque UUIDs (never medication
  names or question content); Fastify's request logging records
  method/URL/status only, never request bodies, so medication details and
  question text are never written to logs.
- No AI/LLM is called anywhere in this codebase yet, and no placeholder or
  simulated AI/pharmacist response is generated — a question's `status`
  stays `RECEIVED` and every AI-education/pharmacist field stays `null`
  until a later phase actually implements that processing, so nothing on
  screen could be mistaken for reviewed clinical guidance. Disposition
  assignment (M3 Phase 2) is the one exception to "nothing runs yet" — it
  is a deterministic, non-AI routing computation, not clinical guidance,
  and is documented as such everywhere it's surfaced.
- Not implemented yet, and out of scope for this milestone: audit logging,
  account lockout after repeated failures, password reset, email
  verification, multi-factor auth, account deletion, and consent tracking.
  See `docs/doseprepped/ARCHITECTURE.md` §8 for the full target security
  architecture and what's still required — technically, operationally, and
  legally — before this could handle real PHI. This project is **not**
  HIPAA compliant, and nothing here should be read as a claim otherwise.
