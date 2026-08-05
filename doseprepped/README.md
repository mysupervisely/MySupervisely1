# DosePrepped — M0–M5.5 (Foundation, Auth, Medications, Question Intake, Deterministic Safety/Disposition, AI-Assisted Education, Pharmacist Workflow, Pilot Readiness & Hardening, Medication Journey & Adherence Foundation, Pilot Analytics & ROI Instrumentation, Organization/Tenant Infrastructure, Organization Admin & Organization-Scoped Analytics)

DosePrepped is a digital medication-support layer: it helps patients
understand their medications and connect with licensed pharmacists (and
their own provider when appropriate) when they have medication-related
questions.

> **Status: through M5.5 (Organization Admin & Organization-Scoped
> Analytics).** Real
> accounts, login/logout, password hashing, sessions, server-enforced
> role-based access control (patient / pharmacist / admin), a full patient
> medication list, structured medication-question intake, a deterministic
> AI-independent safety/disposition routing layer, a single typed AI
> education call gated behind that disposition, and a real pharmacist
> queue/claim/respond/escalate workflow are all implemented. A question
> that needs human judgment (`PHARMACIST_REVIEW`/`PROVIDER_EVALUATION`
> disposition) is automatically queued for pharmacist review; a pharmacist
> claims it via a concurrency-safe atomic operation, writes their own
> response (stored completely separately from any AI content — the AI can
> never become "the pharmacist's answer"), or escalates it with a required
> structured reason. M5.1 hardened this M0–M4 product for a controlled
> pilot (accurate UI copy, sanitized error responses, a storage-only
> pharmacist profile foundation). M5.2 added the post-prescription
> medication journey, medication-agnostic throughout: a patient can
> record a dose as taken/missed/skipped, see a deterministic adherence
> percentage, complete a structured (non-clinical) medication check-in,
> and view a derived timeline for a medication; a pharmacist reviewing a
> routed question sees bounded, clearly-labeled context alongside it.
> **M5.3 instruments all of the above** with a centralized, non-PHI
> analytics event log and an admin-only aggregate report
> (`GET /admin/analytics/report`) answering patient engagement, question
> funnel, AI, pharmacist, provider-escalation, and adherence/check-in
> questions over a date range — built to help demonstrate business value
> to a prospective telehealth customer without inventing any clinical
> outcome or cost-savings claim. "Escalated to provider" and "resolved
> without provider escalation" are precisely defined, careful-language
> metrics — DosePrepped still never messages a real provider directly.
> See "M5.3 — Pilot Analytics & ROI Instrumentation" in
> [`docs/doseprepped/ARCHITECTURE.md`](../docs/doseprepped/ARCHITECTURE.md)
> for the full design, metric definitions, and privacy rules. DosePrepped
> is still not a chatbot: no chat history, no multi-turn AI conversation,
> and no automated pharmacist response — only an authenticated pharmacist
> can create one. **M5.4 added the minimum viable multi-tenant/B2B
> foundation**: an `Organization` + `OrganizationMembership` model, strict
> tenant isolation for the pharmacist queue and analytics, and a
> platform-admin-vs-organization-admin authorization split — all without
> touching the patient-facing experience, which remains completely
> unchanged (no organization branding, no org-switcher, no white-labeling).
> **M5.5 turns that foundation into a real organization-admin
> experience**: an org admin logs in to a `/org-admin` dashboard showing
> their own organization's name and source-of-truth counts, manages
> their own members (add by email, change role, remove — no invitation/
> email is ever sent), edits their organization's name, and views the
> same M5.3/M5.4 analytics report scoped to their organization only, with
> simple date-range controls — never another organization's data,
> verified by an extensive cross-tenant test suite. See "Organization
> admin experience (M5.5)" below. There is still no payments/billing, no
> invitation/email system, no organization branding/white-labeling/custom
> domains, no telemedicine/EHR integration, no real patient onboarding, no
> pharmacist compensation, no authoritative medication database, no OCR,
> no dosing/reminder engine, and no real financial ROI calculation.
> DosePrepped is medication support infrastructure connecting patients,
> medication education, pharmacists, and appropriate provider escalation —
> it is not an AI doctor, an emergency service, a replacement for the
> dispensing pharmacy, a diagnostic tool, or a replacement for a
> prescriber.

## What's in M0–M5.5

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
- **AI-assisted medication education (M3 Phase 3):** gated strictly behind
  the Phase 2 disposition, a single typed call to
  `packages/ai-service`'s `MedicationEducationProvider` generates general
  educational content (for `GENERAL_EDUCATION`) or brief supplementary
  context plus a structured pharmacist summary (for `PHARMACIST_REVIEW`/
  `PROVIDER_EVALUATION`) — never for `URGENT_EMERGENCY`, which the
  provider is never even called for. Every response is schema- and
  guardrail-validated before being stored or shown; any failure, timeout,
  or invalid output fails safe to the existing routing message, never a
  fabricated answer. See "AI-assisted medication education architecture"
  below.
- **Pharmacist review & concierge workflow (M4):** a question whose
  disposition is `PHARMACIST_REVIEW` or `PROVIDER_EVALUATION` is
  automatically queued (`status = PHARMACIST_REQUESTED`) the moment it's
  created — no separate "request a pharmacist" step. A pharmacist claims
  it via a single atomic, race-safe database update (two pharmacists
  racing for the same question: exactly one gets it, the other gets a
  clean `409`), sees a minimum-necessary view (never the patient's
  identity), writes their own response (stored in a column entirely
  separate from any AI content — there is no code path by which AI output
  can become a pharmacist response), or escalates with a required
  structured reason. See "Pharmacist review & concierge workflow
  architecture" below.
- A minimal Fastify backend API: `/health` (DB connectivity), `/auth/*`
  (signup/login/logout/me), `/medications*` (CRUD + archive + reference
  search + adherence events + check-ins + timeline — see below),
  `/questions*` (create/list/detail),
  `/pharmacist/queue`+`/pharmacist/questions/*` (queue, claim, release,
  respond, escalate), `/admin/analytics/report` (aggregate pilot
  reporting — see below), and one role-gated placeholder ping route for
  patient/pharmacist.
- **Pilot readiness & product hardening (M5.1):** corrected stale
  placeholder copy on the dev banner, patient home, and "Ask a Pharmacist"
  (which now explains automatic pharmacist routing and lists the
  patient's own pharmacist-routed questions); added root-level Next.js
  `loading`/`error`/`not-found` UI so every route has an intentional state
  instead of a blank screen or the framework default; added a global
  Fastify error handler so an unexpected thrown error (e.g. a raw
  database error) always returns a generic, safe 500 instead of leaking
  internal detail; and added a minimal `PharmacistProfile` model
  (license state, license number, `credentialStatus` — defaulting to
  `UNVERIFIED`) as a foundation for future licensing/state scoping. It is
  storage only — no verification logic, no claim that entering a license
  number verifies anything — and is only ever returned to the pharmacist
  it belongs to, via their own `GET /auth/me`; it is never exposed to
  patients or other pharmacists. See "M5.1 — Pilot Readiness & Product
  Hardening" in the architecture doc for the full audit (auth/authz, PHI
  in logs, auditability) and its findings.
- **Medication journey & adherence foundation (M5.2), medication-agnostic
  throughout — no dosing logic, no clinical recommendations:**
  - **Adherence tracking:** `POST`/`GET /medications/:id/adherence-events`
    let a patient record a dose as `TAKEN`/`MISSED`/`SKIPPED`
    (append-only — no edit/delete). Adherence is a bare, documented
    percentage — `takenCount / (taken + missed + skipped) × 100`, rounded,
    `null` (never `0%`) with zero recorded events — computed by one shared
    function (`apps/api/src/lib/adherence.ts`) so it can never disagree
    with itself across the patient and pharmacist views. No qualitative
    label ("good"/"poor") is ever attached to it.
  - **Medication check-ins:** `POST`/`GET /medications/:id/check-ins` let
    a patient answer "How are you doing with this medication?" (`Doing
    well` / `Having some issues` / `Having significant issues` / `I have
    a question`) plus optional free-text notes. Storage only — a
    concerning response surfaces a UI pathway to the existing "Ask a
    question" flow, never an automated clinical response.
  - **Medication timeline:** `GET /medications/:id/timeline` derives a
    chronological, patient-friendly timeline (started, doses taken/
    missed/skipped, check-ins, questions submitted/answered/escalated)
    purely from existing records — no duplicated storage.
  - **Pharmacist context:** the single-question pharmacist review
    endpoint (`GET /pharmacist/questions/:id`) gains a bounded
    `medicationContext` (adherence %, most recent check-in, most recent
    *other* question about the same medication) — never the queue list,
    never a full history, and clearly distinguished on-screen from
    AI-generated and pharmacist-generated content.
  - All new routes and models follow the same ownership-scoping,
    minimum-necessary-exposure, and no-PHI-in-logs patterns as the rest
    of the API. See "M5.2 — Medication Journey & Adherence Foundation" in
    the architecture doc for the full design and safety rationale.
- **Pilot analytics & ROI instrumentation (M5.3):** a centralized,
  versioned event taxonomy (`AnalyticsEventType` — 12 event types, each
  tied to a real, already-implemented workflow step, e.g.
  `QUESTION_SUBMITTED`, `PHARMACIST_CLAIMED`, `PROVIDER_ESCALATION_CREATED`
  — no speculative/"fake" events) instruments every meaningful
  patient/pharmacist action through one function
  (`emitAnalyticsEvent()`), fire-and-forget so an analytics write can
  never fail a real request. Event metadata is narrow and non-PHI —
  never question text, AI response text, pharmacist response text, or
  check-in notes. `GET /admin/analytics/report?from=&to=` (`ADMIN`-only)
  aggregates patient engagement, question funnel (by category/
  disposition), AI (invoked/succeeded/failed/skipped, token usage),
  pharmacist volume and response/handling time, provider escalation, and
  adherence/check-in engagement over any date range, computed primarily
  from the source-of-truth tables (not solely the event log, so a
  dropped analytics write never undercounts a real metric). **"Escalated
  to provider" and "resolved without provider escalation" are precisely,
  deliberately defined** (never conflated with a clinical outcome or
  cost-savings claim — DosePrepped still never messages a real provider
  directly), and a labeled `roiOperationalMetrics` section surfaces
  per-1,000-patient volume ratios with an explicit disclaimer that
  they're operational metrics, not a financial estimate. Global by
  default, and as of M5.4 also available per-organization (see below) —
  the two are separate, non-overlapping routes; an organization
  administrator can never reach the global report. The previously-
  placeholder `/admin` screen now renders the global report as labeled
  stat cards. See "M5.3 — Pilot Analytics & ROI Instrumentation" in the
  architecture doc for the full event catalog, metric definitions, and
  privacy/authorization rules.
- **Organization / tenant infrastructure (M5.4):** the minimum viable
  multi-tenant/B2B foundation — an `Organization` + `OrganizationMembership`
  model, strict tenant isolation for the pharmacist queue and analytics,
  and a platform-admin-vs-organization-admin authorization split. See
  "Organization / tenant infrastructure (M5.4)" below for the full
  summary and "M5.4 — Organization / Tenant Infrastructure" in the
  architecture doc for the complete design.
- **Organization admin experience (M5.5):** a real `/org-admin` dashboard
  — organization overview (source-of-truth counts, no invented metrics),
  the M5.3/M5.4 analytics report scoped to the org admin's own
  organization with simple date-range controls, member management (add
  an existing user by email, change their role, remove them — no
  invitation/email is ever sent, and an org admin can never promote
  anyone to platform admin because `OrganizationRole` has no such value),
  and a minimal settings screen (organization name only; `slug` is
  read-only). See "Organization admin experience (M5.5)" below for the
  full summary and "M5.5 — Organization Admin & Organization-Scoped
  Analytics" in the architecture doc for the complete design.
- A PostgreSQL database via Prisma: `User`, `Session`, `PatientMedication`,
  `MedicationReference`, `MedicationQuestion`, `PharmacistProfile`,
  `MedicationAdherenceEvent`, `MedicationCheckIn`, `AnalyticsEvent`,
  `Organization`, and `OrganizationMembership`, seeded with **synthetic
  demo data only** (including two synthetic pharmacist accounts, each
  with a demo profile, so the shared queue has more than one demo
  reviewer; a worked M5.2 example on the demo Semaglutide medication: 91%
  adherence, a "having some issues" check-in, and two linked questions;
  and, as of M5.4, two synthetic organizations — see "Organization /
  tenant infrastructure (M5.4)" below — `AnalyticsEvent` rows accrue from
  this point forward as the seeded workflows are used, not
  retroactively).
- Automated tests (Vitest) and lint/typecheck across every package,
  including auth/RBAC/medication/question/disposition/AI-education/
  pharmacist-workflow/error-handling/medication-journey/analytics/
  organization-tenant-isolation integration tests (including a genuine
  concurrent two-pharmacist claim race, and a genuine concurrent
  org-vs-org-less-pharmacist claim race) against a real (disposable) test
  database, plus standalone unit tests for the safety-rules engine, the
  ai-service package, and the patient app's own components. No test
  makes a real call to any AI vendor. See "Testing" below for the current
  total.

Not in scope yet (see the architecture doc for when these land): provider
messaging/EHR integration, secure two-way patient/pharmacist messaging, an
authoritative medication reference database, OCR/medication scanning,
a structured dosing/reminder engine, payments/billing/subscriptions,
pharmacist compensation, an invitation/email flow for organization
membership, organization branding/white-labeling/subdomain routing,
multi-organization admin UI (a user with two `ORG_ADMIN` memberships is
schema-legal but the org-admin dashboard has no organization switcher),
multi-organization patient/pharmacist UI (the schema allows a second
`OrganizationMembership` row; nothing builds or tests that today), a
"last admin" self-lockout guard on organization role changes, a real
financial ROI/cost-savings calculation, pharmacist self-service
analytics, telemedicine integration, account deletion, consent tracking,
drug interaction checking, and any comprehensive
clinical decision support. Neither the Phase 2 rule engine nor the Phase 3 AI layer diagnoses, recommends
treatment, or evaluates whether a medication is "safe" for a given
patient — both are routing/education aids, and the M4 pharmacist workflow
is where real clinical judgment enters the system, by a licensed human,
never automated.

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
    ai-service/  AI provider abstraction (MedicationEducationProvider),
                 output validation, and prompt building for M3 Phase 3.
                 Zero workspace/DB/HTTP-framework dependencies (only zod),
                 mirroring safety-rules's zero-dependency pattern. Ships a
                 mock provider (the only one this environment actually
                 runs with) and a minimal fetch-based Anthropic provider.
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

The seed creates the following synthetic accounts, all with the password
**`DosepreppedDemo!1`** (a publicly-documented local-dev-only demo
password — not a secret, never use it for anything real):

| Email | Role | Organization |
|---|---|---|
| `patient-a@demo.doseprepped.dev` | Patient (Lisinopril + Metformin) | none — DosePrepped Direct |
| `patient-b@demo.doseprepped.dev` | Patient (Semaglutide + Ondansetron) | none — DosePrepped Direct |
| `pharmacist@demo.doseprepped.dev` | Pharmacist | none — DosePrepped Direct |
| `pharmacist-b@demo.doseprepped.dev` | Pharmacist (a second reviewer, so the shared queue has more than one) | none — DosePrepped Direct |
| `admin@demo.doseprepped.dev` | Admin | none — this is the one DosePrepped **platform** admin |
| `orga-admin@demo.doseprepped.dev` | Patient (platform role — inert) | Meridian Telehealth (Demo), `ORG_ADMIN` |
| `orga-pharmacist@demo.doseprepped.dev` | Pharmacist | Meridian Telehealth (Demo), `ORG_PHARMACIST` |
| `orga-patient@demo.doseprepped.dev` | Patient (Atorvastatin) | Meridian Telehealth (Demo), `ORG_PATIENT` |
| `orgb-admin@demo.doseprepped.dev` | Patient (platform role — inert) | Northstar Digital Pharmacy (Demo), `ORG_ADMIN` |
| `orgb-pharmacist@demo.doseprepped.dev` | Pharmacist | Northstar Digital Pharmacy (Demo), `ORG_PHARMACIST` |
| `orgb-patient@demo.doseprepped.dev` | Patient (Levothyroxine) | Northstar Digital Pharmacy (Demo), `ORG_PATIENT` |

None of this is real patient data — organization names are obviously
synthetic and generic, never a real company. Public sign-up (via the UI
or `POST /auth/signup`) always creates a **patient** account with no
organization membership — pharmacist, admin, and every organization
membership are only created via seeding/direct DB access in this
milestone, by design (no public pharmacist self-registration, no
public/self-service organization creation or joining). An org admin's
*platform* role is deliberately `PATIENT` (inert) rather than `ADMIN` —
their administrative capability comes entirely from their
`OrganizationMembership.role = ORG_ADMIN`, not from the platform role.
As of M5.5, `orga-admin@demo.doseprepped.dev` and
`orgb-admin@demo.doseprepped.dev` can log in and land on a real
`/org-admin` dashboard for their own organization. See "Organization /
tenant infrastructure (M5.4)" and "Organization admin experience
(M5.5)" below.

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
| `AI_PROVIDER` | `apps/api` | `mock` (default) or `anthropic`. `mock` is the only provider this environment actually runs with — see "AI-assisted medication education architecture" |
| `ANTHROPIC_API_KEY` | `apps/api` | **Required if `AI_PROVIDER=anthropic`** — the API fails fast at startup if it's missing. Not set anywhere in this environment |
| `ANTHROPIC_MODEL` | `apps/api` | Optional, only used with `AI_PROVIDER=anthropic`. Defaults to a current Claude model identifier |
| `AI_TIMEOUT_MS` | `apps/api` | Milliseconds before an AI provider call is abandoned and the question fails safe. Defaults to `8000` |

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

## Medication journey & adherence data model (M5.2)

Full rationale lives in `docs/doseprepped/ARCHITECTURE.md` under "M5.2 —
Medication Journey & Adherence Foundation" — this is a summary.

- **`MedicationAdherenceEvent`**: one row per patient-reported dose —
  `scheduledAt` (the dose time, patient-supplied), `recordedAt`
  (server-stamped, when it was logged), and `status`
  (`TAKEN`/`MISSED`/`SKIPPED`). Append-only: no edit/delete route.
  Recording a *new* event requires the medication to be `ACTIVE` (`409`
  if `INACTIVE`); reading history is unaffected by archive status.
  `POST`/`GET /medications/:id/adherence-events`.
- **Adherence percentage**: `takenCount / (takenCount + missedCount +
  skippedCount) × 100`, rounded to the nearest whole number, `null` (not
  `0%`) with zero recorded events. Computed by exactly one function
  (`apps/api/src/lib/adherence.ts`) shared by the patient endpoint and
  the pharmacist context below, so it's always the same number everywhere
  it's shown. Always displayed as a bare stat ("Adherence: 91%") — never
  a qualitative label.
- **`MedicationCheckIn`**: a structured `response`
  (`DOING_WELL`/`HAVING_SOME_ISSUES`/`HAVING_SIGNIFICANT_ISSUES`/
  `HAS_A_QUESTION`) plus optional free-text `notes`. Storage only — no
  code path generates a diagnosis, treatment suggestion, or dose-change
  recommendation from it; a concerning response only ever surfaces a UI
  link to the existing "Ask a question" flow. `POST`/`GET
  /medications/:id/check-ins`.
- **Timeline**: `GET /medications/:id/timeline` derives a chronological
  list (medication started/archived, doses taken/missed/skipped,
  check-ins, questions submitted/answered/escalated) purely from the
  records above and `MedicationQuestion` — no new storage, so it can
  never drift from the data it's built from.
- **Ownership**: every route here uses the exact same scoping as
  `PatientMedication`/`MedicationQuestion` — `{ id, patientId:
  request.user.id }` together, never `id` alone. A medication that exists
  but belongs to another patient is `404`.
- **Pharmacist context**: `GET /pharmacist/questions/:id` includes a
  bounded `medicationContext` (medication start date, adherence summary,
  most recent check-in, most recent *other* question about the same
  medication) for the question the pharmacist already has authorized
  access to — never on the queue list, never a full history. See
  "Pharmacist context" in the architecture doc for the authorization
  rationale (this is a deliberate, narrow widening of what a pharmacist
  can see, documented there in full).

## Question data model

Implements `MedicationQuestion` per `docs/doseprepped/ARCHITECTURE.md` "M3
— The Digital Medication-Support Layer" §2/§15. As of M4, essentially
every field on this model is populated by a real code path — see each
bullet below for which milestone wired it up:

- **Ownership**: `patientId` (owner) and `medicationId` (the medication
  it's about), both FKs, both enforced server-side exactly like
  `PatientMedication`.
- **Medication snapshot** (`medicationSnapshot`, JSON): `{name, strength,
  dosageForm, directions, frequency, route}` (`dosageForm` added in M4 for
  the pharmacist review screen) captured from the live `PatientMedication`
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
  `STORAGE`, `ADHERENCE`, `COST_ACCESS`, `OTHER`. `aiSuggestedCategory` is
  populated by `packages/ai-service` (Phase 3) and is always advisory,
  never overriding the patient's own selection.
- **Question text** (`questionText`): the patient's own words, required,
  length-capped.
- **Status** (`status`): defaults to `RECEIVED` on creation.
  `AI_ANSWERED` (Phase 3, `GENERAL_EDUCATION` only) and
  `PHARMACIST_REQUESTED`/`PHARMACIST_IN_PROGRESS`/`PHARMACIST_RESOLVED`/
  `ESCALATED` (M4) are all reachable as of this milestone.
  `WAITING_FOR_PATIENT` and `CLOSED` remain reserved — no two-way
  patient/pharmacist thread UI exists yet.
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
  question. **No pharmacist route can write to any of these fields** —
  see "Pharmacist authorization" below.
- **AI education fields** (`aiEducationResponse`, `aiEducationGeneratedAt`,
  `aiModelVersion`, `aiProvider`, `aiPromptVersion`, `aiResponseStatus`,
  `aiUsage`, `aiPharmacistSummary`, `clarifyingExchange`,
  `aiSuggestedCategory`): populated by `packages/ai-service` as of M3
  Phase 3, gated by disposition. `aiProvider`, `aiPromptVersion`,
  `aiModelVersion`, and `aiUsage` are audit-only and never returned by
  `GET /questions`/`GET /questions/:id` — only `aiEducationResponse`,
  `aiEducationGeneratedAt`, `aiResponseStatus`, and a derived
  `clarifyingQuestion` string reach the patient-facing API response.
  `aiPharmacistSummary` is likewise withheld from the patient but *is*
  surfaced (read-only, assistive) on the pharmacist review screen as of
  M4.
- **Pharmacist/escalation fields** (`pharmacistId`, `pharmacistRequestedAt`,
  `pharmacistClaimedAt`, `pharmacistResponse`, `pharmacistRespondedAt`,
  `escalatedAt`, `escalationReason`, `escalationReasonCategory`,
  `resolvedAt`): populated by the M4 pharmacist workflow —
  `pharmacistRequestedAt`/`status=PHARMACIST_REQUESTED` at question
  creation (automatic, see below), the rest by
  `/pharmacist/questions/:id/claim`, `/respond`, and `/escalate`. Only
  `escalationReasonCategory` is new in M4 — every other field here was
  reserved on the schema since Phase 1.

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

## AI-assisted medication education architecture

Full rationale lives in `docs/doseprepped/ARCHITECTURE.md` under "Phase 3
— AI-Assisted Medication Education" — this is a summary.

- **Disposition-gated, never disposition-changing.** The Phase 2
  deterministic disposition is passed into the AI provider as read-only
  context; `MedicationEducationOutput` has no field that could report a
  disposition back, so there is no code path through which an AI response
  could change `disposition`. Even a malformed provider response with an
  extra `"disposition"` key is silently stripped by Zod validation before
  it reaches application code.
- **One typed call, not a chatbot.** A single
  `MedicationEducationProvider.generateEducation(input)` call per question
  returns structuring (`suggestedCategory`, advisory only), at most one
  optional clarifying question (never blocking — the system proceeds
  without waiting for an answer), the education/context text, and (when
  applicable) a pharmacist summary. There is no follow-up endpoint, no chat
  history, and no second call against the same question.
- **`URGENT_EMERGENCY` never invokes the provider.** Checked in code before
  any provider call is constructed — not by prompting — so there is no
  latency or cost in front of emergency guidance, and no chance of normal
  educational content appearing where it shouldn't.
- **Fail-safe output validation.** Every response goes through
  `validateEducationOutput` (`packages/ai-service/src/validate.ts`): a
  structural Zod pass, then a small set of named guardrail regex checks for
  prohibited directive-clinical language (dose-change instructions, "stop
  taking," diagnostic phrasing). A provider error, a timeout
  (`AI_TIMEOUT_MS`), or a validation failure all produce the same outcome —
  `aiResponseStatus: FAILED`, nothing stored or shown, and the patient sees
  the unaffected Phase 2 routing message plus an honest fallback line.
  Nothing fabricated is ever displayed.
- **Input minimization.** The provider receives only the already-captured
  medication snapshot, the (already-conditionally-captured)
  other-medications snapshot, category, question text, and disposition —
  never the patient's identity, full medication list, or any other
  question.
- **Audit metadata, not prompt/response logging.** `aiProvider`,
  `aiModelVersion`, `aiPromptVersion`, `aiResponseStatus`, and `aiUsage`
  (`{inputTokens, outputTokens}`) are stored per question for auditability
  and future cost analysis — never the raw prompt or, for a real provider,
  the raw model response. Fastify's request logging already excludes
  bodies, and no application code logs question text or AI output.
- **Provider selection**: `AI_PROVIDER=mock` (default, and the only
  provider this codebase actually runs with — no `ANTHROPIC_API_KEY` is
  configured anywhere here) or `AI_PROVIDER=anthropic` (fails fast at
  startup without a key, same pattern as `SESSION_SECRET`). **The demo/dev
  "AI education" text you'll see running this app is the mock provider's
  synthetic output, not real AI-generated content** — see
  `packages/ai-service/src/providers/mock.ts`.
- **Current limitations — requires clinical, legal, privacy, and security
  review before production use.** The guardrail pattern list is
  non-exhaustive defense-in-depth, not a clinically validated boundary; the
  `anthropic` provider is implemented and unit-testable in shape but has
  not been exercised against the real API in this environment; there is no
  AI-specific rate limit beyond the existing per-route limit; response
  caching is explicitly not implemented. No BAA exists with any AI vendor
  here — this remains synthetic-data-only.

## Pharmacist review & concierge workflow architecture

Full rationale lives in `docs/doseprepped/ARCHITECTURE.md` under "M4 —
Pharmacist Review & Concierge Workflow" — this is a summary.

- **Automatic queueing, not patient-initiated.** `POST /questions` sets
  `status = PHARMACIST_REQUESTED` (and stamps `pharmacistRequestedAt`)
  directly whenever the Phase 2 disposition is `PHARMACIST_REVIEW` or
  `PROVIDER_EVALUATION` — in the same request that creates the question.
  There is no separate "request pharmacist review" endpoint.
  `GENERAL_EDUCATION` questions are never queued (AI already fully
  answered them); `URGENT_EMERGENCY` questions are never queued either
  (never handled by AI or pharmacist, full stop).
- **Queue visibility (`apps/api/src/routes/pharmacist-questions.ts`)**: a
  pharmacist sees exactly the union of the shared unclaimed pool
  (`status = PHARMACIST_REQUESTED`, `pharmacistId = null`) and their own
  claimed questions (`pharmacistId = request.user.id`, any status) — this
  `where` clause is the *only* way any pharmacist route reads a question,
  enforced identically for the list endpoint, the detail endpoint, and
  every mutation. A question outside that scope returns `404`, matching
  the patient-side ownership pattern exactly. The four dashboard counts
  (New/In Review/Completed/Escalated) are grouped from that same query, so
  the dashboard and the queue list can never disagree.
- **Claim concurrency — genuinely tested, not just reasoned about.**
  `POST /pharmacist/questions/:id/claim` is a single atomic
  `updateMany({ where: { id, status: "PHARMACIST_REQUESTED",
  pharmacistId: null }, data: {...} })`. PostgreSQL evaluates the `WHERE`
  and applies the `SET` as one row-locked operation, so when two
  pharmacists race for the same question, exactly one `UPDATE` matches;
  the winner gets `200`, the loser gets a clean `409 Conflict`. A
  dedicated test fires two claim requests concurrently via `Promise.all`
  against the same question and asserts exactly one succeeds — verified
  behavior, not just an atomic-looking query.
- **Patient/pharmacist response separation.** `pharmacistResponse` is a
  distinct database column, written only by
  `POST /pharmacist/questions/:id/respond` (only by the claiming
  pharmacist, only while `PHARMACIST_IN_PROGRESS`), with **no AI/LLM call
  anywhere in that handler** — there is no code path by which the Phase 3
  `aiEducationResponse`/`aiPharmacistSummary` content could become the
  official pharmacist response. The patient-facing UI renders the two
  under visually and textually distinct headings ("General information
  from DosePrepped" vs. "Pharmacist Response") and never merges them.
- **Escalation.** `POST /pharmacist/questions/:id/escalate` requires both
  a closed-taxonomy `escalationReasonCategory` (see `EscalationReasonCategory`
  in the schema) and a non-empty free-text `escalationReason` — a
  "structured reason" is a category plus a human explanation, not either
  alone. Only reachable from a question the pharmacist has already
  claimed. Sets `status = ESCALATED`; does not send any message to a
  provider (DosePrepped has no provider accounts/messaging yet) — the
  patient is told to contact their own healthcare provider.
- **Authorization**, all enforced server-side: a pharmacist can never view
  a question outside the scope above, can never touch
  `PatientMedication` at all, can never write to `disposition`/
  `dispositionSource`/`dispositionRuleIds`/`safetyRuleSetVersion` (no
  pharmacist route's Zod schema or Prisma `data` object includes them —
  Zod strips any smuggled extra field), can never act as another
  pharmacist (every write uses `request.user.id` from the session, never a
  client-supplied ID), and can only claim/respond/escalate/release a
  question that is unclaimed or already theirs.
- **AI's role stays assistive.** The Phase 3 `aiPharmacistSummary` is
  shown read-only on the pharmacist review screen as a starting point — no
  new AI model or operation is introduced in M4, and nothing lets AI
  content flow into `pharmacistResponse` automatically.
- **Time metrics computed on read**, not stored as separate events:
  submission→claim, claim→response, submission→response, and
  submission→escalation are all simple deltas of the timestamp fields
  above (`createdAt`, `pharmacistClaimedAt`, `pharmacistRespondedAt`,
  `escalatedAt`). No billing/compensation calculation — explicitly out of
  scope for M4.
- **Current limitations.** Synthetic pharmacist accounts only, no real
  licensure verification; no SLA enforcement or queue-depth alerting; no
  secure two-way patient/pharmacist messaging (`WAITING_FOR_PATIENT`
  remains reserved-but-unbuilt); no pharmacist state/licensure scoping
  (any pharmacist can claim any queued question); queue prioritization
  (provider-evaluation before pharmacist-review, then oldest-first) is
  presentation-only, not a clinical triage system; no independent
  append-only audit log beyond `MedicationQuestion`'s own columns.

## Analytics & reporting architecture (M5.3)

Full rationale lives in `docs/doseprepped/ARCHITECTURE.md` under "M5.3 —
Pilot Analytics & ROI Instrumentation" — this is a summary.

- **Centralized event taxonomy.** `AnalyticsEventType` (a closed Prisma
  enum) lists exactly 12 event types, each emitted from exactly one
  existing, already-authenticated route handler via one function,
  `emitAnalyticsEvent()` (`apps/api/src/lib/analytics.ts`) — there is no
  public event-ingestion endpoint. Every event type corresponds to a real
  workflow step already implemented in M3/M4/M5.2; none are speculative.
  `AnalyticsEvent` (`apps/api/prisma` via `packages/db`) has no `@relation`
  to `User`/`MedicationQuestion`/`PatientMedication` — it's an
  independent, append-only log, not a first-class domain entity.
- **Fire-and-forget, never blocking.** An analytics write failure is
  logged and swallowed, never thrown — it can never turn a successful
  patient/pharmacist action into a failed response. This is also why the
  reporting service computes headline funnel numbers from the
  source-of-truth tables (`MedicationQuestion`, `PatientMedication`,
  `MedicationAdherenceEvent`, `MedicationCheckIn`) wherever one exists,
  rather than solely from the event log.
- **Non-PHI by construction.** Event `metadata` is a small, explicitly
  enumerated object per event type — e.g. `MEDICATION_CHECKIN_COMPLETED`
  stores the closed-taxonomy `response` but never `notes`;
  `PHARMACIST_RESPONDED` stores a computed handling-time number but
  never `responseText`; `PHARMACIST_ESCALATED` stores
  `escalationReasonCategory` but never the free-text `escalationReason`.
  Verified by a dedicated test that creates a question with distinctive
  text and a check-in with distinctive notes, then asserts neither string
  appears anywhere in any event's stored metadata.
- **`GET /admin/analytics/report?from=&to=`** (`ADMIN`-only, `403` for
  patient/pharmacist) returns an aggregate report — patient engagement,
  question funnel (by category/disposition), AI
  (invoked/succeeded/failed/skipped, token usage), pharmacist volume and
  response/handling time, provider escalation, and adherence/check-in
  engagement — for the requested date range (defaults to the last 30
  days). No patient-level data is ever returned by this or any endpoint
  to anyone but that patient themselves.
- **"Escalated to provider," precisely defined**: a question counts as
  escalated to provider if *either* its deterministic disposition was
  `PROVIDER_EVALUATION` at creation (automatic routing) *or* a pharmacist
  later set `status = ESCALATED` on it (pharmacist-initiated) —
  deduplicated, counted once per question even if both are true.
  **"Resolved without provider escalation"** = total questions minus that
  count. `URGENT_EMERGENCY` is tracked separately and never folded into
  either metric — it's a categorically different, more severe pathway.
  Neither metric claims a clinical outcome: DosePrepped never messages a
  real provider (no such integration exists), so "escalated to provider"
  means the patient was routed/directed toward provider-level care, not
  that a provider received or acted on anything.
- **ROI-supporting operational metrics, not a savings claim.**
  `roiOperationalMetrics` surfaces questions/pharmacist-cases/provider-
  escalations per 1,000 patients, the resolved-without-escalation
  percentage, and average pharmacist response time — every number
  computed from real, already-measured activity, with a fixed disclaimer
  that combining these with a customer's actual labor costs is a future,
  pilot-specific exercise this codebase does not perform. No dollar
  figure or "time saved" claim is made anywhere.
- **Global by default; per-organization as of M5.4.** `GET
  /admin/analytics/report` (platform-admin-only) is unchanged from M5.3 —
  still every patient/pharmacist/question in the system. `GET
  /organizations/:organizationId/analytics/report` (organization-admin-only,
  see "Organization / tenant infrastructure (M5.4)" below) calls the same
  `buildAnalyticsReport()` with an `organizationId`, scoping every metric
  to that one organization's patients only. **Do not present either
  report to more than one prospective customer as if it were their own
  isolated data** — but as of M5.4 there is now a real mechanism for
  giving an organization *only* its own numbers, not just a documented
  intention.
- **Current limitations.** No pharmacist self-service analytics (only
  `ADMIN`/organization-admin can access a report); no historical backfill
  (events only exist from this milestone forward, though range-bound
  report metrics computed from source tables are unaffected); no event
  retention/archival policy; unclaimed-queue-volume and queue-aging are
  always a *live* snapshot, not reconstructable for a historical `to`; no
  read replica or pre-aggregated rollup table (the report queries the
  primary database directly, synchronously, on every request).

## Organization / tenant infrastructure (M5.4)

Full rationale, the tenant-boundary reasoning, and the complete route
table live in `docs/doseprepped/ARCHITECTURE.md` under "M5.4 —
Organization / Tenant Infrastructure" — this is a summary. **This is
infrastructure work, not a new patient-facing feature**: the patient
application is completely unchanged — no organization branding,
org-switcher, or org-specific copy anywhere in it.

- **`Organization` + `OrganizationMembership`.** An `Organization`
  represents one healthcare customer (a telehealth company, a digital
  pharmacy, a health plan — never Wasef or any other real company by
  name). `OrganizationMembership` is a join table
  (`organizationId` + `userId` + `OrganizationRole`), not a nullable
  column on `User` — this is what lets a user belong to more than one
  organization later without a schema change, even though M5.4 doesn't
  build or test that today. `OrganizationRole` (`ORG_ADMIN` |
  `ORG_PHARMACIST` | `ORG_PATIENT`) is a deliberately separate enum from
  the platform `Role` (`PATIENT` | `PHARMACIST` | `ADMIN`) — the two axes
  are never conflated, which is exactly what makes "an organization admin
  is not automatically a DosePrepped platform admin" a structural fact,
  not just a policy statement.
- **Patient-owned data was not touched.** No `organizationId` column was
  added to `PatientMedication`, `MedicationQuestion`,
  `MedicationAdherenceEvent`, `MedicationCheckIn`, or `AnalyticsEvent`.
  Organization visibility into a patient's records is derived *live* from
  the current `OrganizationMembership` graph (a nested Prisma relation
  filter), not from a stamped, potentially-stale column — patient
  ownership and organization ownership are different concepts and are
  never merged into one column.
- **Tenant-isolated pharmacist queue.** An org-affiliated pharmacist sees
  and can claim only questions from patients in their own organization; a
  DosePrepped Direct (org-less) pharmacist sees and can claim only
  DosePrepped Direct patients' questions — a strict, symmetric split,
  with zero behavior change for every pre-M5.4 account (which has no
  organization membership). This applies both to the existing shared
  `GET /pharmacist/queue` and, critically, to the atomic claim mutation
  itself (`POST /pharmacist/questions/:id/claim`) — not just the list —
  so a cross-organization question can never be claimed by ID even if a
  pharmacist somehow learned it existed. A cross-organization claim
  attempt returns `404`, the same as any other out-of-scope resource,
  never `409` (which would falsely confirm an in-scope race happened).
- **Organization-scoped analytics.** See "Analytics & reporting
  architecture" above — an organization administrator gets their own
  `GET /organizations/:organizationId/analytics/report`, computed by the
  same `buildAnalyticsReport()` used for the M5.3 global report, and can
  never reach the global platform-admin report.
- **Centralized authorization helpers**
  (`apps/api/src/lib/organization-auth.ts`): `requirePlatformAdmin`,
  `requireOrganizationMember`, `requireOrganizationAdmin`,
  `requireOrganizationPharmacist`. Every organization-scoped route reads
  `organizationId` only from the URL path and re-validates membership
  against the database on every request — never from a request body or
  query string, so organization context can never be spoofed by a
  client. A non-member gets `404`, not `403`, for any organization-scoped
  route (the API never confirms an organization's existence to a
  non-member) — the same existence-hiding pattern already used for
  patient/pharmacist resource ownership. A platform admin (`Role.ADMIN`)
  can act on any organization without needing a membership row.
- **Minimal management API, platform-admin-gated creation.**
  `POST /organizations` (platform-admin-only — no public organization
  creation), `GET`/`PATCH /organizations/:organizationId`,
  `GET`/`POST /organizations/:organizationId/memberships`,
  `PATCH`/`DELETE .../memberships/:id` (organization-admin self-service —
  no invitation/email flow, the target user must already have a
  DosePrepped account), and `GET /organizations/me` (derived from the
  session, returns only the caller's own memberships). The `PATCH`
  routes and the email-based membership lookup were added in M5.5 — see
  below.
- **What's intentionally deferred**: an invitation/email flow,
  organization branding/white-labeling/subdomain routing
  (`Organization.slug` is stored but not yet used for routing),
  multi-organization patient/pharmacist/admin UI or reasoning,
  billing/subscriptions/pricing, state licensure/collaborative-practice
  enforcement tied to an organization, and organization deletion. None of
  this is precluded by the M5.4 schema or authorization model — it's
  simply not built yet.

## Organization admin experience (M5.5)

Full rationale lives in `docs/doseprepped/ARCHITECTURE.md` under "M5.5 —
Organization Admin & Organization-Scoped Analytics" — this is a summary.
**This is the first UI built on top of the M5.4 authorization/API
foundation — no new authorization logic, no schema changes.**

- **`/org-admin` route group**, guarded by a new
  `apps/patient/src/lib/require-org-admin.ts` (deliberately separate from
  `requireRole` — organization administration is not a platform `Role`;
  it resolves an `ORG_ADMIN` membership via `GET /organizations/me` and
  redirects elsewhere if none exists). The API independently
  re-verifies on every request via `requireOrganizationAdmin` (M5.4) —
  the frontend guard is UX-only.
- **Overview** (`/org-admin`): organization name plus six source-of-truth
  counts (Patients, Pharmacists, Organization members, Medication
  questions, Pharmacist reviews, Provider escalations) — composed from
  three existing responses (`GET /organizations/:id`,
  `.../memberships`, `.../analytics/report`), no new "overview" endpoint.
- **Analytics** (`/org-admin/analytics`): the exact same M5.3/M5.4
  report and presentational sections the global `/admin` page renders,
  fetched from `GET /organizations/:id/analytics/report` instead of the
  global route. Date range: Last 7/30/90-day preset links plus a plain
  `<input type="date">` custom-range form — no new date-range capability
  was built, only a UI for the `from`/`to` query parameters that route
  already accepted.
- **Members** (`/org-admin/members`): add an existing user **by email**
  (`POST /organizations/:id/memberships`'s body changed from `{userId}`
  to `{email}` in M5.5 — the one "clearly documented dependency fix" to
  completed M5.4 code, since no org admin could plausibly know another
  user's internal id), change a member's role in place
  (`PATCH .../memberships/:id`, new in M5.5), or remove a member
  (`DELETE`, unchanged from M5.4). No invitation/email is ever sent.
  Promoting someone to platform admin is impossible from this screen or
  its API — `OrganizationRole` has no platform-admin value, so the
  `PATCH` schema cannot even accept one.
- **Settings** (`/org-admin/settings`): organization name only
  (`PATCH /organizations/:id`, new in M5.5); `slug` is shown read-only.
- **Authorization**: every route above goes through the existing
  `requireOrganizationAdmin` (or the platform-admin override) — zero new
  authorization helpers were introduced. `organizationId` is always
  resolved server-side (frontend: from the session's own
  `GET /organizations/me`; API: from the URL path, re-validated against
  the database) — never trusted from a query string, request body, or
  custom header, verified by a dedicated spoofing-resistance test suite.
- **Privacy**: the organization dashboard is aggregate-only — no route
  added in M5.5 exposes question text, AI/pharmacist response text, or
  check-in notes. An org admin gains no clinical/patient-chart access;
  that boundary (pharmacist question review) is untouched.
- **What's intentionally deferred**: multi-organization admin UI (no
  organization switcher if a user holds two `ORG_ADMIN` memberships), a
  "last admin" self-lockout guard on role change/removal (recoverable
  only via the platform-admin override), organization branding/logo/
  custom domain, billing/subscription UI, organization deletion UI, and
  any pharmacist-facing organization UI (the pharmacist dashboard is
  completely unchanged).

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
- Disposition assignment (M3 Phase 2), AI education (M3 Phase 3), and the
  pharmacist workflow (M4) are all real, implemented computations, but
  only one of them is clinical judgment: disposition is a deterministic,
  non-AI routing decision; AI content is schema/guardrail-validated, fails
  safe on any doubt, and is always labeled AI-generated with an explicit
  "not a diagnosis or personalized medical advice" disclosure; and any
  actual patient-specific counseling comes from a real, authenticated,
  licensed (in the demo/synthetic sense) pharmacist writing their own
  response — never generated or auto-sent by the application. See
  "AI-assisted medication education architecture" and "Pharmacist review &
  concierge workflow architecture" above.
- Pharmacist and patient question/response content is never written to
  application logs, consistent with the existing "don't log medication
  content" precedent — the pharmacist claim/respond/escalate handlers log
  nothing beyond what Fastify's standard method/URL/status request logging
  already captures.
- **M5.1 additions:** the global Fastify error handler (see "Pilot
  readiness & product hardening" above) logs the thrown error object
  itself for debugging, but never the request body — so a bug that throws
  mid-request still can't put question/response text into the logs. The
  new `PharmacistProfile` (license state/number, credential status) is
  storage/read-only, requires no verification to populate, is never
  claimed to constitute verification, and is exposed only to the
  pharmacist it belongs to via their own `GET /auth/me` — never to
  patients, never to other pharmacists.
- **M5.3 additions:** every `AnalyticsEvent` is a small, explicitly
  enumerated, non-free-text object per event type — never question text,
  AI response text, pharmacist response text, or check-in notes; verified
  by a dedicated test. `GET /admin/analytics/report` is `ADMIN`-only
  (`403` for patient/pharmacist) and returns aggregates only — no
  endpoint anywhere returns one patient's activity to anyone but that
  patient. Analytics writes are fire-and-forget and can never fail or
  block a real patient/pharmacist request.
- **M5.4 additions:** every organization-scoped route derives
  `organizationId` only from the URL path and re-validates the
  authenticated user's `OrganizationMembership` against the database on
  every request — never from a request body or query string, so
  organization context can never be spoofed by a client. A non-member
  gets `404` (never `403`, never a differently-shaped error) for any
  organization-scoped route, so the API never confirms an organization's
  existence to a non-member — the same pattern already used for
  patient/pharmacist resource ownership. The pharmacist queue's atomic
  claim mutation, not just its list view, is tenant-checked, so a
  cross-organization question can never be claimed by ID. Verified by a
  dedicated cross-organization test suite
  (`apps/api/tests/organizations.test.ts`) — see "Organization / tenant
  infrastructure (M5.4)" above.
- **M5.5 additions:** the new `PATCH /organizations/:id` and
  `PATCH .../memberships/:id` routes reuse the exact same
  `requireOrganizationAdmin` authorization as every other M5.4
  management route — no new authorization logic. An organization admin
  cannot promote anyone to platform admin: `OrganizationRole` (the only
  value a role-change `PATCH` accepts) has no platform-admin value, so
  this is a schema-level impossibility, not a runtime check that could be
  bypassed. The membership-add endpoint now takes an email instead of an
  internal user id (the one documented dependency fix to completed M5.4
  code — see "Organization admin experience (M5.5)" above) but keeps the
  same "target must already have an account" and 404/409 behavior.
  Verified by a dedicated spoofing-resistance test suite covering query
  parameters, custom headers, and request body fields, plus the full
  11-scenario cross-tenant checklist from the milestone brief
  (`apps/api/tests/organizations-admin.test.ts`).
- Not implemented yet, and out of scope for this milestone: audit logging,
  account lockout after repeated failures, password reset, email
  verification, multi-factor auth, account deletion, and consent tracking.
  See `docs/doseprepped/ARCHITECTURE.md` §8 for the full target security
  architecture and what's still required — technically, operationally, and
  legally — before this could handle real PHI. This project is **not**
  HIPAA compliant, and nothing here should be read as a claim otherwise.
