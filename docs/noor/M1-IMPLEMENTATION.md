# Noor — M1 (Foundations) Implementation Notes

**Status: M1 complete, pending review. Not production-ready. Not HIPAA
compliant. No clinical decision-making logic exists anywhere in this
milestone.** This document records what M1 actually built, why, and what
is deliberately deferred — see §N for the full known-limitations list.

Builds on the approved M0 architecture: [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## 1. Scope recap

Per the M1 approval, this milestone covers **only**: monorepo/repository
foundation, application scaffolding, database foundation, migrations,
authentication, RBAC, ownership/care-relationship authorization, audit
logging foundation, environment separation, CI/testing, and basic
patient/clinician/admin shells. The weekly check-in, onboarding, provider
directory, scheduling, and subscriptions are **not** built — those are
M2–M8 (§M of `ARCHITECTURE.md`).

## 2. How each M1 requirement was implemented

1. **PHI/clinical data stays behind the authenticated API boundary.**
   Every frontend (`apps/patient`, `apps/clinician`, `apps/admin`) is a
   thin Next.js app that only ever talks to `@noor/api` over HTTP — none
   of them import `@noor/db` or hold a database connection. `@noor/api` is
   the only thing with a Prisma client.
2. **Never expose PHI directly from the database to frontend
   applications.** Every route handler in `packages/api/src/routes/*`
   hand-picks the fields it returns (see e.g. `patients.ts` returning
   `{ id, firstName, lastName, state, city, onboardingCompletedAt }`, never
   a raw Prisma row, never `passwordHash`).
3. **Authorization enforced server-side on every protected resource.**
   `packages/api/src/rbac/policy.ts` is the single policy module; every
   route calls `requireAuth` / `requireRole` / `requirePermission` /
   `requireSelfPatient` / `requireSelfClinician` before touching data. No
   route trusts anything the client asserts about its own role.
4. **Patient access is ownership-scoped.** `GET /patients/me` has no
   `:patientId` parameter at all — there is no code path that could be
   tricked into returning someone else's profile.
5. **Clinician access is limited to patients with an authorized care
   relationship.** `packages/api/src/rbac/care-relationship.ts`
   (`assertClinicianHasActiveCareRelationship`) is the only function
   allowed to grant a clinician access to a specific patient, and it
   requires an `ACTIVE` `CareRelationship` row — `REQUESTED`, `PAUSED`, and
   `ENDED` do not grant access.
6. **Admin access does NOT automatically grant clinical/PHI access.** The
   permission matrix (`packages/types/src/permissions.ts`) never grants
   `ADMIN` or `SUPER_ADMIN` the `VIEW_CLINICAL_CONTENT` permission — a
   fact directly asserted by a unit test
   (`packages/types/tests/permissions.test.ts`). No M1 route reads
   clinical content at all (none exists yet — see §3), so this is a
   structural boundary established ahead of the milestone that will need
   it (M4).
7. **Audit all access to sensitive clinical resources, not merely
   mutations.** `recordAuditEvent` (`packages/api/src/audit`) is called on
   every auth event, every clinician read of a patient (success **and**
   denial), and every admin action, including admin reads of the user
   list, care-relationship list, and the audit log itself.
8. **Never put PHI in URLs, analytics, browser storage, client logs, error
   messages, or notification previews.** No route uses a query string for
   anything beyond pagination/filtering by non-PHI fields; session tokens
   live only in an `httpOnly` cookie (never `localStorage`); the global
   Fastify error handler (`app.ts`) never forwards a raw error
   message/stack to the client; `recordAuditEvent`'s `metadata` argument is
   passed through `assertSafeMetadata`, which throws if a caller passes a
   key that looks like it could carry free-text content (`notes`,
   `responses`, `diagnosis`, etc.) — see
   `packages/api/tests/audit-metadata.test.ts`. There is no notification
   system in M1 (deferred — see schema comments) so there is nothing yet
   to check there.
9. **Development/staging use synthetic data only.** `packages/db/prisma/seed.ts`
   creates four obviously-fake accounts (`*.dev@example.test`) sharing a
   labeled dev-only password; the file's header comment states this
   explicitly. `packages/api/tests/helpers.ts`'s `resetDatabase()` refuses
   to run against any `DATABASE_URL` that doesn't contain the string
   `test`, as a guard against ever truncating a non-test database.
10. **No real EHR/payment/AI/patient data integrated.** `packages/ehr-adapter`,
    `packages/payments-adapter`, and `packages/ai-service` each ship
    **only** an in-memory `MockProvider` — no vendor SDK is a dependency of
    any of these packages, and none of the three is called by any M1 route.
11. **Provider abstraction interfaces preserved.** The `PatientRecordProvider`
    / `AppointmentProvider` / `ClinicalMessagingProvider` / `DocumentProvider`
    (EHR), `PaymentProvider`, and `AIProvider` interfaces are implemented
    verbatim from `ARCHITECTURE.md` §G/§H/§I, each with a factory function
    that selects the concrete implementation from an environment variable
    (`EHR_PROVIDER`, `PAYMENT_PROVIDER`, `AI_PROVIDER` — all default to,
    and in M1 only support, `"mock"`).
12. **No clinical decision-making logic.** There is no check-in, no
    adaptive question engine, no diagnosis/risk logic anywhere in M1. The
    AI service's `DraftSummary` type has no `diagnosis`/`riskLevel`/
    `recommendedAction` field, enforced by a regression test
    (`packages/ai-service/tests/mock-provider.test.ts`).

## 3. Database foundation & migrations

**Scope decision:** M1 creates only the tables its own features need —
identity, roles, sessions, the minimal patient/clinician records, care
relationships, and the audit trail. The remaining M0-approved tables
(`CheckIn*`, `ClinicianReview`, `CareGoal`, `ClinicianLicense`,
`Subscription*`, `ProviderAvailability`, `Appointment`, `Notification`,
`ConsentRecord`, `ExternalRecordMapping`) are **intentionally not created
yet** — each arrives as its own migration alongside the milestone that
implements the feature needing it (M2–M8; see the mapping documented at
the top of `packages/db/prisma/schema.prisma`). This is a deliberate
narrowing of what M0 called "database foundation," not an oversight, made
in the interest of milestone discipline (the product brief's "work in
milestones," "do not build everything at once").

**Tables created in the M1 migration** (`packages/db/prisma/schema.prisma`):

| Table | Purpose |
|---|---|
| `roles` | Seeded, closed set: PATIENT / CLINICIAN / ADMIN / SUPER_ADMIN |
| `users` | Account/identity — no PHI, no onboarding-collected PII |
| `user_roles` | User↔Role join table |
| `sessions` | Server-side session store; only a SHA-256 hash of the token is stored |
| `patients` | Thin link from `users` to the patient role |
| `patient_profiles` | Non-clinical, onboarding-collectible fields (empty at signup in M1 — onboarding is M2) |
| `clinicians` | Thin link from `users` to the clinician role |
| `clinician_profiles` | Public/directory-facing fields only, separated from `clinicians` (which will hold private fields like NPI) |
| `care_relationships` | The authorization anchor for clinician→patient access |
| `audit_events` | Append-only audit trail |

**New table not explicitly listed in the M0 schema:** `sessions`. M0 §D
described server-side sessions conceptually but the M0 schema list (§C)
did not include a concrete table for it. Adding it here is a transparent,
necessary consequence of implementing the already-approved session-based
auth design — flagged here per the project's "document schema changes"
rule, not introduced silently.

Migration file: `packages/db/prisma/migrations/<timestamp>_init/migration.sql`
(generated by `prisma migrate dev` — see run instructions below).

## 4. Security decisions

- **Password hashing:** bcrypt (via `bcryptjs`), cost factor 12, via
  `packages/auth/src/password.ts`. `ARCHITECTURE.md` §J recommends
  argon2id before real clinical/production use; bcrypt was chosen for M1
  because it has no native build toolchain requirement, which matters for
  a foundations milestone that needs to install and run cleanly across
  arbitrary dev machines/CI. **Revisit before production** — see §5.
- **Password policy:** minimum 10 characters, at least one letter and one
  digit, a small common-password blocklist, max 72 characters (bcrypt
  silently truncates beyond that — M1 rejects instead of truncating
  silently).
- **Sessions:** opaque 256-bit random token; only its SHA-256 hash is
  persisted (`packages/auth/src/session.ts`); the token itself lives only
  in an `httpOnly`, `Secure` (non-dev), `SameSite=Lax` cookie, additionally
  **signed** by Fastify (`@fastify/cookie`) so a tampered cookie value is
  rejected before any database lookup happens
  (`packages/api/src/plugins/session.ts`). 12-hour session TTL.
- **No user enumeration on login:** an unknown email and a wrong password
  return the identical 401 + message; a dummy bcrypt comparison runs even
  when the account doesn't exist, so the response doesn't leak account
  existence via timing (`packages/api/src/routes/auth.ts`).
- **No client-controlled role on signup:** the public `/auth/signup` route
  has no `role` field in its accepted schema — every self-signup is
  `PATIENT`. Clinician/admin accounts are provisioned via the dev seed
  script only in M1 (a real provisioning flow is a later milestone) —
  tested explicitly
  (`packages/api/tests/auth.test.ts` "never accepts a client-supplied
  role").
- **CORS:** exact-origin allowlist (`APP_ORIGINS`), `credentials: true` —
  never a wildcard, since credentialed cross-origin requests require it.
- **Rate limiting:** global default (100 req/min) plus a stricter
  per-route limit (10 req/min) on `/auth/signup` and `/auth/login`.
- **Error handling:** a single global error handler
  (`packages/api/src/app.ts`) ensures unexpected exceptions (e.g. a raw
  Prisma error) never reach the client with their original message or
  stack trace — only the app's own typed `HttpError` subclasses
  (`packages/api/src/lib/errors.ts`) control client-facing error text.
- **Audit trail integrity (documented, not yet enforced at the DB-role
  level):** `AuditEvent` rows are only ever created, never updated or
  deleted, by application code. `ARCHITECTURE.md` §J calls for the
  database role itself to be granted `INSERT`/`SELECT` only (no
  `UPDATE`/`DELETE`) on this table — that DB-user-level grant is
  infrastructure configuration outside this migration and is **not yet
  applied**; see known limitations.
- **Audit metadata PHI guard:** `assertSafeMetadata` (`packages/api/src/audit/audit-service.ts`)
  rejects metadata keys that look like they could carry free-text
  clinical content (`notes`, `responses`, `diagnosis`, etc.) before a
  write — defense in depth on top of callers choosing safe fields
  deliberately.
- **AI guardrails at the type level:** `DraftSummary`
  (`packages/ai-service/src/types.ts`) has no field a diagnosis, risk
  score, or recommended action could be written into — see M0 §I and the
  regression test enforcing it.

## 5. Known limitations (explicitly not done in M1)

These are scope decisions or deferred work, not hidden gaps — several
require a decision outside engineering (flagged `[NEEDS ... REVIEW]` per
`ARCHITECTURE.md` §N):

- **MFA is not implemented.** `User.mfaEnabled` exists in the schema, but
  there is no TOTP enrollment/verification flow. `ARCHITECTURE.md` §D
  calls for MFA to be **required** for CLINICIAN/ADMIN/SUPER_ADMIN before
  general availability — that enforcement does not exist yet. Building
  TOTP enrollment, verification, and recovery codes properly is real scope
  and is deferred to a dedicated future milestone rather than done
  partially here.
- **Email verification is not enforced.** Signup marks the account
  `ACTIVE` immediately; there is no verification-token/email-send flow, so
  nothing blocks dashboard access on a verified email. `emailVerifiedAt`
  exists in the schema for when this is built.
- **No password reset flow.** Not in M1's scope list.
- **No clinician/admin self-service provisioning.** Those accounts are
  created only via the dev seed script in M1; a real provisioning process
  is future work.
- **Frontends are client-rendered, not server-rendered with cookie
  forwarding.** Each Next.js app fetches its own data client-side via
  `fetch(..., { credentials: "include" })` directly against the API,
  rather than using React Server Components with manual cookie forwarding.
  This keeps the M1 frontend code simple and is not a security gap — the
  API enforces every authorization decision regardless of what any client
  renders — but it does mean a brief unauthenticated flash/loading state
  before a redirect, which a later milestone can improve.
- **Cross-origin cookie sharing relies on `localhost`/shared-parent-domain
  behavior.** The three frontends and the API run on different ports in
  local dev; the session cookie is scoped to `Domain=localhost` (dev) or a
  shared parent domain (staging/prod), which works because browsers treat
  same-host-different-port as same-site for `SameSite=Lax` purposes. This
  is standard but worth calling out explicitly, since it's easy to get
  wrong when translating to a real multi-subdomain production deployment
  — confirm the production domain layout before relying on it.
- **`AuditEvent` insert-only enforcement is at the application layer only.**
  The database role Fastify connects as has not been restricted to
  `INSERT`/`SELECT` on `audit_events` (that's infrastructure/DB-user
  configuration, not a Prisma migration) — **[NEEDS INFRA REVIEW]** before
  staging/production.
- **No ESLint wiring.** Typecheck and tests are the enforced CI gates for
  M1; ESLint configuration across all four package "flavors" (3 Next.js
  apps + Fastify API + plain TS libraries) is deferred to avoid scope/risk
  in a foundations milestone.
- **No rate limiting beyond the two auth routes' explicit override** — the
  100 req/min global default applies everywhere else.
- **Care-relationship creation has no request/accept workflow.** Admins
  create relationships directly in `ACTIVE` status; there's no
  patient-initiated request or clinician-side accept step yet (that's part
  of M4/M5).
- **Multi-role accounts** are schema-permitted (`UserRole` is a join
  table) but have no product policy or UI — `[NEEDS PRODUCT DECISION]` per
  `ARCHITECTURE.md` §N.
- **No infra-as-code, staging/production environments, or secret-manager
  integration yet** — M1 is local-dev/CI only. `ARCHITECTURE.md` §K's
  deployment architecture is a target, not yet built.

## 6. Environment variables

See `noor/.env.example`, `noor/packages/db/.env.example`, and
`noor/packages/api/.env.example` for the authoritative, commented list.
Summary:

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | `packages/db`, `packages/api` | Postgres connection string; must point at a synthetic-data-only database in dev/test |
| `NODE_ENV` | `packages/api` | `development` \| `test` \| `production` |
| `API_PORT`, `API_HOST` | `packages/api` | Default `4000` / `0.0.0.0` |
| `SESSION_SECRET` | `packages/api` | Signs the session cookie; must be ≥32 chars; generate a real random value per environment |
| `APP_ORIGINS` | `packages/api` | Comma-separated CORS allowlist — must exactly match the three frontend origins |
| `SESSION_COOKIE_DOMAIN` | `packages/api` | `localhost` in dev; shared parent domain in staging/prod |
| `COOKIE_SECURE` | `packages/api` | `false` in local http dev; `true` everywhere else |
| `EHR_PROVIDER`, `PAYMENT_PROVIDER`, `AI_PROVIDER` | `packages/api` | Only `"mock"` is implemented in M1 |
| `NEXT_PUBLIC_API_URL` | all three apps | Base URL the browser calls directly |

No secret is committed anywhere in the repository; `.env` is gitignored.

## 7. Tests written

- `packages/types/tests/permissions.test.ts` — the permission matrix never
  grants ADMIN/SUPER_ADMIN clinical content, PATIENT never gets
  admin/clinician permissions.
- `packages/auth/tests/password.test.ts` — password strength validation,
  hash/verify round-trip, hash never contains the plaintext password.
- `packages/ehr-adapter/tests/factory.test.ts`,
  `packages/payments-adapter/tests/factory.test.ts`,
  `packages/ai-service/tests/mock-provider.test.ts` — each provider
  factory returns a working mock and rejects unknown provider keys; the AI
  guardrail shape test asserts `diagnosis`/`riskLevel`/`recommendedAction`
  can never appear on a `DraftSummary`.
- `packages/api/tests/rbac-policy-unit.test.ts` — the policy module's
  functions (`requireAuth`/`requirePermission`/`requireRole`/
  `requireSelfPatient`/`requireSelfClinician`) against fake session
  objects, no database required.
- `packages/api/tests/audit-metadata.test.ts` — the audit metadata PHI
  guard.
- `packages/api/tests/health.test.ts`, `error-handling.test.ts` —
  unauthenticated health check; generic error responses for 404s,
  malformed JSON, and oversized bodies.
- `packages/api/tests/auth.test.ts` — signup (incl. the privilege-
  escalation guard and duplicate-email 409), login (incl. no-enumeration),
  `/auth/me`, logout invalidating the session, a tampered cookie being
  treated as unauthenticated.
- `packages/api/tests/rbac-ownership.test.ts` — the core integration
  suite for M1 requirements #3–#7: every protected route rejects
  unauthenticated access; patient self-access works and cross-role access
  to patient-only/clinician-only/admin-only routes is denied; a clinician
  sees only their assigned patients and is denied (with an audited denial)
  access to an unrelated patient; a `PAUSED` relationship does not grant
  access; a successful clinician read is also audited; an admin can list
  users/relationships but is denied the clinician-only patient-detail
  route; the full admin-assigns → clinician-can-read chain is exercised
  end to end.
- `packages/api/tests/admin-audit-log.test.ts` — permission-gated,
  BigInt-safe serialization, and that reading the audit log is itself
  audited.
- `apps/patient/src/lib/__tests__/api.test.ts` (mirrored in
  `apps/clinician`, `apps/admin`) — the shared fetch wrapper always sends
  `credentials: "include"` and surfaces the API's error message.

The `@noor/api` integration tests run against a **real** local Postgres
database, not a mock — see `packages/api/tests/helpers.ts`.

## 8. Exact instructions for running the application

See [`noor/README.md`](../../noor/README.md) "Quick start" — reproduced
here for convenience:

```bash
cd noor
docker compose up -d            # or point DATABASE_URL at your own Postgres
pnpm install
cp .env.example .env
cp packages/db/.env.example packages/db/.env
cp packages/api/.env.example packages/api/.env
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# in separate terminals:
pnpm dev:api          # http://localhost:4000
pnpm dev               # patient app  — http://localhost:3000
pnpm dev:clinician      # clinician app — http://localhost:3001
pnpm dev:admin           # admin app     — http://localhost:3002
```

Log in at http://localhost:3000/login,
http://localhost:3001/login, or http://localhost:3002/login with one of
the seeded accounts (see `README.md` "Seeded dev accounts").

Run tests: `pnpm test` (see `README.md` "Tests" for the test-database
setup).
