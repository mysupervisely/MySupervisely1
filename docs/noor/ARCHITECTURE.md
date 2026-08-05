# Noor — Patient Platform: M0 Architecture

**Status:** Planning only. No application code has been written. This
document is the complete M0 deliverable requested before any implementation
begins, per the Noor Master Product & Architecture Brief.

**Scope of this document:** recommended technology stack, system
architecture, database schema, authentication architecture, authorization
model, PHI/data classification, EHR abstraction, subscription architecture,
AI abstraction, security architecture, deployment architecture, repository
structure, and milestone roadmap.

**What this document is not:** a claim of HIPAA compliance, a finished
clinical protocol, a finished legal/compliance sign-off, or an invented set
of business numbers (pricing, SLAs, escalation criteria). Every place a real
clinical, legal, or business decision is required is called out explicitly
as **[NEEDS CLINICAL/LEGAL REVIEW]** or **[NEEDS PRODUCT DECISION]** rather
than invented.

---

## 0. Grounding: what Noor is and isn't (M0 framing)

- Noor is a **patient experience, engagement, discovery, scheduling, and
  subscription layer** — not a clinical system of record.
- A third-party **EHR remains the authoritative source** for clinical notes,
  diagnoses, treatment plans, formal medical records, and billing/claims.
  Noor is built so that EHR can be selected, changed, or added to later
  without a rewrite (see §G).
- The MVP is **non-clinical-by-default**: onboarding collects only what's
  needed for a non-clinical experience, the weekly check-in is deterministic
  (no AI-driven clinical questioning), and AI is either disabled or limited
  to clearly-labeled, non-final, assistive drafts reviewed by a licensed
  clinician before anything reaches a patient.
- Every component that touches money, AI, or clinical records is built
  behind a swappable interface (Payment Provider, AI Provider, EHR
  Providers) so none of those vendors is load-bearing for the architecture.

---

## A. Architecture Diagram

```
                                   ┌─────────────────────────────┐
                                   │           Patient            │
                                   └───────────────┬──────────────┘
                                                    │ HTTPS (TLS 1.2+)
                                                    ▼
                                   ┌─────────────────────────────┐
                                   │   Noor Web / Noor App        │
                                   │   (Next.js, responsive web    │
                                   │   first; React Native later)  │
                                   └───────────────┬──────────────┘
                                                    │ HTTPS + session cookie
                                                    ▼
                          ┌──────────────────────────────────────────────┐
                          │              Noor Backend (API)               │
                          │  AuthN/AuthZ · RBAC · rate limiting · input   │
                          │  validation · audit-log middleware            │
                          │                                                │
                          │  Domain services: Onboarding · Check-in ·     │
                          │  Care Relationships · Provider Directory ·    │
                          │  Scheduling · Notifications · Subscriptions   │
                          └───────┬───────────────┬───────────┬──────────┘
                                  │               │           │
                 ┌────────────────┘               │           └───────────────┐
                 ▼                                 ▼                          ▼
      ┌─────────────────────┐          ┌───────────────────────┐   ┌──────────────────────┐
      │     PostgreSQL        │          │  Payment Provider      │   │   AI Provider          │
      │  (system of record     │          │  abstraction           │   │  abstraction           │
      │  for Noor's own data:  │          │  (PaymentProvider       │   │  (AIProvider           │
      │  users, profiles,      │          │  interface)             │   │  interface)             │
      │  check-ins, care       │          │        │                │   │        │                │
      │  relationships,        │          │        ▼                │   │        ▼                │
      │  subscriptions, audit) │          │  ┌───────────────┐      │   │  ┌───────────────┐      │
      └─────────────────────┘          │  │ Stripe (MVP)   │      │   │  │ Mock (MVP) /   │      │
                                        │  └───────────────┘      │   │  │ Anthropic later │      │
                                        └───────────────────────┘   │  └───────────────┘      │
                                                                     └──────────────────────┘
                                  │
                                  ▼
                     ┌────────────────────────────────┐
                     │        EHR Abstraction           │
                     │  PatientRecordProvider            │
                     │  AppointmentProvider               │
                     │  ClinicalMessagingProvider          │
                     │  DocumentProvider                    │
                     │              │                        │
                     │              ▼                        │
                     │   ┌────────────────────┐             │
                     │   │  Mock Provider (MVP) │             │
                     │   └────────────────────┘             │
                     │              │  (swap later)          │
                     │              ▼                        │
                     │   ┌────────────────────┐             │
                     │   │  Future real EHR      │             │
                     │   │  (vendor TBD)          │             │
                     │   └────────────────────┘             │
                     └────────────────────────────────┘

     ┌───────────────────────────┐        ┌───────────────────────────┐
     │     Clinician Dashboard     │        │       Admin Dashboard        │
     │  (separate app/origin,       │        │  (separate app/origin,        │
     │   MFA required)               │        │   MFA required, RBAC-scoped)  │
     │                                │        │                                │
     │  Assigned patients · Check-in │        │  Patients · Providers ·        │
     │  review queue · Respond ·      │        │  Subscriptions · Check-ins ·    │
     │  Escalate · Care goals ·        │        │  Care relationships ·           │
     │  Audit trail                    │        │  Appointments · Reports ·        │
     └───────────────┬────────────────┘        │  System config · Audit logs       │
                      │                          └───────────────┬───────────────┘
                      └───────────────┬──────────────────────────┘
                                      ▼
                          same Noor Backend (API), role-gated
```

**Key decisions this diagram encodes:**

1. **One backend, three frontends, role-gated.** Patient app, clinician
   dashboard, and admin dashboard all call the same API with different
   roles/scopes. This avoids duplicating business rules (e.g., what counts
   as "requires review") across three codebases.
2. **Noor's own Postgres database is the system of record for Noor's own
   domain** (accounts, profiles, check-ins, care relationships,
   subscriptions, audit trail) — not for formal clinical records. Nothing in
   this document proposes Noor's database replace an EHR.
3. **Every external dependency that is expensive to change later
   (payments, AI, EHR) sits behind an interface Noor owns.** The concrete
   vendor is an implementation detail selected per environment via
   configuration, not something application code depends on directly.
4. **Clinician and admin surfaces are architecturally separate origins/apps**
   from the patient app, so session cookies, CSP, and MFA policy never leak
   between roles, even though they share a backend and design system.

---

## B. Recommended Technology Stack

### B.1 Stack table

| Layer | Recommendation | Alternative(s) considered |
|---|---|---|
| Patient web app | **Next.js 14+ (App Router) + TypeScript** | Remix, plain Vite+React SPA |
| Clinician dashboard | **Next.js, separate app in the same monorepo, separate origin** | Same app with route-level gating (rejected — weaker isolation) |
| Admin dashboard | **Next.js, separate app in the same monorepo, separate origin** | Folded into clinician app (rejected — different threat model/permissions) |
| Styling / design system | **Tailwind CSS + a small internal component library on CSS variables/tokens** | Full component-library dependency (MUI/Chakra) — heavier, harder to hit the "calm, warm, non-clinical" brand out of the box |
| Backend API | **Node.js + TypeScript, Fastify** | NestJS (more structure, more ceremony — reasonable alternative if the team wants stronger enforced architecture from day one); Django/Rails (rejected — fragments the stack away from TypeScript, weaker fit for a shared types-across-frontend-and-backend approach) |
| API contract | **REST, OpenAPI-documented, Zod schemas shared client/server** | GraphQL (rejected for MVP — adds a query-authorization surface that is harder to audit for a healthcare app; revisit if provider-directory search/filtering outgrows REST) |
| Database | **PostgreSQL** | MySQL (weaker JSON/constraint tooling), a document DB (rejected — this domain is inherently relational: users, roles, care relationships, subscriptions all have real foreign-key integrity requirements) |
| ORM / migrations | **Prisma** | Drizzle (lighter, type-safe, reasonable alternative); raw SQL migrations only (rejected — worse audit trail of schema history for a healthcare app) |
| Auth | **Auth.js (NextAuth) or a managed provider (Clerk / WorkOS) with a custom RBAC layer on top** | Hand-rolled auth (rejected for MVP — session/password security and MFA are exactly the kind of thing not to hand-roll in a healthcare app); AWS Cognito (reasonable if committing to AWS end-to-end) |
| Payments | **Stripe**, behind a `PaymentProvider` interface (see §H) | Braintree, Paddle — Stripe has the most mature subscription-lifecycle + webhook tooling and is the de facto default; interface makes this swappable regardless |
| AI provider | **Anthropic Claude**, behind an `AIProvider` interface (see §I), disabled or minimal at MVP | OpenAI — interface makes this swappable; recommendation is Claude for instruction-following on strict "MUST NOT" guardrails, revisit with a BAA-capable offering before any real PHI reaches it |
| EHR integration | **Abstraction layer with a mock implementation at MVP** (see §G); no vendor selected yet | N/A — vendor selection is an explicit future decision requiring clinical/ops input |
| File/object storage | **S3-compatible object storage (AWS S3), KMS-managed encryption, pre-signed URLs** | Cloudflare R2 — reasonable alternative, similar model |
| Mobile (later) | **React Native / Expo** | Native Swift/Kotlin (rejected for first mobile release — slower to validate the workflow; revisit once core web workflow is proven, per §20 of the brief) |
| Infrastructure | **AWS** (or a lighter-weight managed platform such as Render/Fly.io for the earliest pilot stage, with a documented path onto AWS) | GCP/Azure — comparable; AWS recommended for the maturity of its healthcare-relevant compliance tooling (KMS, CloudTrail, PrivateLink, BAA availability) |
| CI/CD | **GitHub Actions** | Matches how the org already operates; runs lint/typecheck/test/security-scan gates on every PR |
| Observability | **Sentry (errors) + structured JSON logs + a dedicated `AuditEvent` table** | Kept deliberately separate: error tracking is an engineering concern, the audit trail is a compliance record, and neither should leak PHI into the other |
| Monorepo tooling | **pnpm workspaces + Turborepo** | npm/yarn workspaces (weaker caching); polyrepo (rejected — this domain needs shared types/schemas across three frontends and one backend) |

### B.2 Why this architecture, evaluated against the required dimensions

**1) Recommended architecture.** A TypeScript monorepo: three Next.js
frontends (patient, clinician, admin) and one Fastify API, sharing
Postgres/Prisma, and a set of internal packages (`ehr-adapter`,
`payments-adapter`, `ai-service`, `auth`, `types`, `ui`) that encapsulate
every swappable/regulated dependency.

**2) Why each technology is appropriate.** TypeScript end-to-end lets one
type system flow from the database schema (Prisma) through the API contract
(Zod) to all three frontends, which matters a lot for a domain with this
many enums and state machines (subscription status, check-in status,
clinician review status, care-relationship status) — a mismatch anywhere in
that chain is a real bug in a healthcare app, not a cosmetic one. Next.js
gives fast, SEO-capable marketing/discovery pages (needed for the
"SEO-driven patient acquisition" goal) plus a first-class path to a good
mobile-web experience before any native app is built. Postgres gives
relational integrity for a domain (users ↔ roles ↔ care relationships ↔
subscriptions ↔ audit events) that is fundamentally about foreign keys, not
documents.

**3) Alternatives.** Captured per-row in §B.1 above; the general pattern is
"a heavier, more prescriptive alternative exists for nearly every choice
(NestJS, GraphQL, Cognito, native mobile) and is reasonable, but adds
structure/cost the MVP doesn't need yet." None of these alternatives are
ruled out for later milestones.

**4) Security implications.** Concentrating regulated dependencies (auth,
payments, AI, EHR) behind a small number of internal packages means the
security review surface for "does this touch PHI or money" is a handful of
files, not scattered across three frontends and every API route. Managed
auth (Auth.js/Clerk/WorkOS) avoids hand-rolling session and password
security, which is one of the highest-risk areas to get subtly wrong. See
§J for the full security architecture.

**5) HIPAA/PHI implications.** None of AWS, Stripe, or Anthropic's
consumer-tier offerings make Noor "HIPAA compliant" by themselves — a
Business Associate Agreement (BAA) is required from every vendor that
touches PHI before any real patient data reaches production, and that BAA
availability was a factor in every vendor choice above (AWS, and Postgres
hosting in particular, has a well-documented BAA path; Anthropic's BAA-
eligible offering must be confirmed and configured before any real PHI is
sent to it — until then, AI stays disabled or de-identified per §I). This
is flagged again in §J and must not be read as a compliance claim.

**6) Scalability.** Postgres with read replicas, a stateless Fastify API
horizontally scaled behind a load balancer, and Next.js on
CDN/edge-friendly hosting comfortably covers the MVP through multi-state
expansion; the domain doesn't need a distributed-systems architecture at
this stage, and adding one prematurely would violate rule 20 ("prioritize
maintainability over cleverness").

**7) Cost.** All choices are either open-source (Fastify, Prisma, Postgres,
Next.js) or usage-based managed services (Stripe, a managed Postgres host,
Sentry) with no large fixed licensing cost, appropriate for a pre-revenue
MVP validating a workflow before scaling spend.

**8) Ease of development.** One language (TypeScript) across the whole
stack, one schema source of truth (Prisma) generating types consumed by
Zod-validated API contracts, and a shared component/token library keep a
small team productive without needing separate frontend/backend/mobile
specialists this early.

**9) EHR integration implications.** None of this stack couples Noor to a
specific EHR. The `ehr-adapter` package is the only place that will ever
know about a real EHR's API shape; everything else (routes, UI, business
logic) talks to the interfaces defined in §G. This is the single most
important architectural property requested in the brief and is treated as
a hard constraint, not a suggestion, throughout this document.

---

## C. Initial Database Schema

PostgreSQL, managed via Prisma migrations. All primary keys are UUIDs
(`uuid`, generated `gen_random_uuid()`) unless noted. All tables get
`created_at timestamptz not null default now()`; mutable tables also get
`updated_at timestamptz not null default now()` maintained by the
application/ORM. Soft-delete is used only where explicitly noted; most
tables use status enums instead of deletion, because deleting healthcare-
adjacent records destroys audit value.

### C.1 Identity & roles

```
User
  id                uuid PK
  email             citext UNIQUE NOT NULL
  phone             text NULL
  password_hash     text NULL            -- null if fully delegated to managed auth provider
  auth_provider     text NOT NULL        -- 'password' | 'clerk' | 'workos' | ...
  auth_provider_id  text NULL            -- external id if delegated
  status            enum('pending_verification','active','suspended','deactivated') NOT NULL DEFAULT 'pending_verification'
  mfa_enabled       boolean NOT NULL DEFAULT false
  email_verified_at timestamptz NULL
  last_login_at     timestamptz NULL
  created_at, updated_at
  INDEX (status)

Role
  id     smallint PK
  name   enum('PATIENT','CLINICIAN','ADMIN','SUPER_ADMIN') UNIQUE NOT NULL
  -- seeded, not user-editable via API

UserRole
  user_id  uuid FK -> User.id ON DELETE CASCADE
  role_id  smallint FK -> Role.id
  PRIMARY KEY (user_id, role_id)
  -- MVP policy: a given user is expected to hold exactly one role in
  -- production (multi-role accounts are a [NEEDS PRODUCT DECISION], see §M)
```

### C.2 Patients

```
Patient
  id        uuid PK
  user_id   uuid FK -> User.id UNIQUE NOT NULL ON DELETE RESTRICT
  created_at

PatientProfile
  id                                uuid PK
  patient_id                        uuid FK -> Patient.id UNIQUE NOT NULL ON DELETE CASCADE
  first_name                        text NOT NULL
  last_name                         text NOT NULL
  date_of_birth                     date NULL          -- collected only if actually required, per brief §6
  state                             char(2) NULL        -- US state code, drives telehealth eligibility
  city                              text NULL
  reason_for_care                   text NULL           -- free text, non-diagnostic
  preferred_provider_characteristics jsonb NULL         -- e.g. {"languages":["es"],"specialty":["anxiety"]}
  communication_preferences         jsonb NOT NULL DEFAULT '{}'  -- e.g. {"email":true,"sms":false}
  onboarding_completed_at           timestamptz NULL
  created_at, updated_at
  INDEX (state)
```

### C.3 Clinicians

```
Clinician
  id                     uuid PK
  user_id                uuid FK -> User.id UNIQUE NOT NULL ON DELETE RESTRICT
  npi                    text NULL UNIQUE          -- private, not directory-facing
  status                 enum('active','inactive','onboarding') NOT NULL DEFAULT 'onboarding'
  accepting_new_patients boolean NOT NULL DEFAULT false
  created_at, updated_at

ClinicianProfile           -- public/directory-facing fields only
  id                uuid PK
  clinician_id      uuid FK -> Clinician.id UNIQUE NOT NULL ON DELETE CASCADE
  display_name      text NOT NULL
  credentials        text NOT NULL              -- e.g. "LCSW", "LPC" -- display string
  bio               text NULL
  photo_url         text NULL
  specialties        text[] NOT NULL DEFAULT '{}'
  areas_of_focus     text[] NOT NULL DEFAULT '{}'
  languages          text[] NOT NULL DEFAULT '{}'
  telehealth_enabled boolean NOT NULL DEFAULT true
  appointment_types   text[] NOT NULL DEFAULT '{}'
  created_at, updated_at
  INDEX GIN (specialties), INDEX GIN (languages)

ClinicianLicense
  id               uuid PK
  clinician_id     uuid FK -> Clinician.id NOT NULL ON DELETE CASCADE
  state            char(2) NOT NULL
  license_number   text NOT NULL            -- private, never exposed via directory API
  status           enum('active','pending','expired','revoked') NOT NULL
  expires_on       date NULL
  created_at, updated_at
  UNIQUE (clinician_id, state)
  INDEX (state, status)          -- supports "which clinicians can see patients in state X"
```

### C.4 Care relationships, check-ins, reviews, goals

```
CareRelationship
  id                uuid PK
  patient_id        uuid FK -> Patient.id NOT NULL ON DELETE RESTRICT
  clinician_id      uuid FK -> Clinician.id NOT NULL ON DELETE RESTRICT
  relationship_type enum('async','therapy','psychiatry') NOT NULL DEFAULT 'async'
  status            enum('requested','active','paused','ended') NOT NULL DEFAULT 'requested'
  requested_at      timestamptz NOT NULL DEFAULT now()
  started_at        timestamptz NULL
  ended_at          timestamptz NULL
  created_at, updated_at
  INDEX (patient_id, status), INDEX (clinician_id, status)

CheckInQuestion              -- reusable template definitions, not per-check-in rows
  id              uuid PK
  key             text UNIQUE NOT NULL      -- 'wellbeing','mood','anxiety','sleep','biggest_challenge','help_type','additional_info', ...
  prompt_text     text NOT NULL
  response_type   enum('scale_1_10','free_text','single_select','multi_select') NOT NULL
  options         jsonb NULL                -- for select types
  display_order   int NOT NULL
  is_active       boolean NOT NULL DEFAULT true
  condition_rule  jsonb NULL                -- deterministic adaptive-display rule, e.g.
                                             -- {"depends_on":"sleep","operator":"<=","value":4}
                                             -- NULL = always shown. See §8 adaptive design note below.
  created_at, updated_at

CheckIn
  id                  uuid PK
  patient_id          uuid FK -> Patient.id NOT NULL ON DELETE RESTRICT
  care_relationship_id uuid FK -> CareRelationship.id NULL ON DELETE SET NULL
  status              enum('pending','in_progress','completed','skipped') NOT NULL DEFAULT 'pending'
  scheduled_for       date NOT NULL
  completed_at        timestamptz NULL
  template_version    int NOT NULL          -- which CheckInQuestion set/version was used
  created_at, updated_at
  INDEX (patient_id, scheduled_for), INDEX (status)

CheckInResponse
  id            uuid PK
  check_in_id   uuid FK -> CheckIn.id NOT NULL ON DELETE CASCADE
  question_id   uuid FK -> CheckInQuestion.id NOT NULL ON DELETE RESTRICT
  value_numeric smallint NULL         -- for scale_1_10, CHECK (value_numeric BETWEEN 1 AND 10)
  value_text    text NULL             -- for free_text
  value_json    jsonb NULL            -- for select types
  created_at
  UNIQUE (check_in_id, question_id)
  INDEX (check_in_id)

ClinicianReview
  id                uuid PK
  check_in_id       uuid FK -> CheckIn.id UNIQUE NOT NULL ON DELETE RESTRICT
  clinician_id      uuid FK -> Clinician.id NOT NULL ON DELETE RESTRICT
  status            enum('pending','in_review','reviewed','escalated') NOT NULL DEFAULT 'pending'
  response_text     text NULL
  response_is_draft boolean NOT NULL DEFAULT true
  reviewed_at       timestamptz NULL
  escalated_at      timestamptz NULL
  escalation_reason text NULL          -- structured reason code + free text; see §9 safety note
  created_at, updated_at
  INDEX (clinician_id, status), INDEX (status)

CareGoal
  id                     uuid PK
  patient_id             uuid FK -> Patient.id NOT NULL ON DELETE RESTRICT
  care_relationship_id   uuid FK -> CareRelationship.id NOT NULL ON DELETE RESTRICT
  created_by_clinician_id uuid FK -> Clinician.id NOT NULL ON DELETE RESTRICT
  title                  text NOT NULL
  description            text NULL
  status                 enum('active','completed','paused') NOT NULL DEFAULT 'active'
  created_at, updated_at
  INDEX (patient_id, status)
```

**Adaptive check-in design note (ties to brief §8):** `condition_rule` is
data, evaluated by a small deterministic rule engine in the backend, not
hardcoded per-question `if` statements in the UI. This is what lets Noor add
"if sleep ≤ 4, ask what's affecting your sleep" without a code deploy, while
keeping the MVP behavior fully deterministic and reviewable. No AI is
involved in question selection at MVP.

### C.5 Scheduling

```
ProviderAvailability
  id                uuid PK
  clinician_id      uuid FK -> Clinician.id NOT NULL ON DELETE CASCADE
  day_of_week       smallint NULL          -- 0-6, for recurring availability
  specific_date     date NULL              -- for one-off availability
  start_time        time NOT NULL
  end_time          time NOT NULL
  timezone          text NOT NULL          -- IANA tz name
  appointment_type  text NOT NULL
  is_recurring      boolean NOT NULL DEFAULT true
  created_at, updated_at
  CHECK (day_of_week IS NOT NULL OR specific_date IS NOT NULL)
  INDEX (clinician_id)

Appointment
  id                       uuid PK
  patient_id               uuid FK -> Patient.id NOT NULL ON DELETE RESTRICT
  clinician_id              uuid FK -> Clinician.id NOT NULL ON DELETE RESTRICT
  care_relationship_id       uuid FK -> CareRelationship.id NULL ON DELETE SET NULL
  appointment_type            text NOT NULL
  status                      enum('requested','confirmed','completed','canceled','no_show') NOT NULL DEFAULT 'requested'
  scheduled_start               timestamptz NOT NULL
  scheduled_end                  timestamptz NOT NULL
  external_ehr_appointment_id     text NULL     -- set once a real EHR AppointmentProvider is wired in
  created_at, updated_at
  INDEX (patient_id, scheduled_start), INDEX (clinician_id, scheduled_start)
```

### C.6 Subscriptions

```
SubscriptionPlan
  id            uuid PK
  key           text UNIQUE NOT NULL     -- e.g. 'noor_async_monthly'
  name          text NOT NULL
  price_cents   int NOT NULL
  currency      char(3) NOT NULL DEFAULT 'usd'
  billing_interval enum('month','year') NOT NULL
  entitlements  jsonb NOT NULL DEFAULT '{}'   -- e.g. {"checkins_per_month":4,"clinician_response_sla_hours":48}
                                                -- exact values are a [NEEDS PRODUCT DECISION], see §M
  is_active     boolean NOT NULL DEFAULT true
  created_at, updated_at

Subscription
  id                     uuid PK
  patient_id              uuid FK -> Patient.id NOT NULL ON DELETE RESTRICT
  plan_id                  uuid FK -> SubscriptionPlan.id NOT NULL ON DELETE RESTRICT
  payment_provider           text NOT NULL         -- 'stripe' (MVP); abstraction, see §H
  external_customer_id        text NOT NULL
  external_subscription_id     text NULL UNIQUE
  status                       enum('trialing','active','past_due','canceled','incomplete') NOT NULL
  current_period_start           timestamptz NULL
  current_period_end              timestamptz NULL
  cancel_at_period_end             boolean NOT NULL DEFAULT false
  trial_end                         timestamptz NULL
  created_at, updated_at
  INDEX (patient_id, status)

SubscriptionEvent               -- normalized, provider-agnostic ledger of billing lifecycle events
  id               uuid PK
  subscription_id   uuid FK -> Subscription.id NOT NULL ON DELETE CASCADE
  event_type         enum('created','trial_started','activated','renewed','payment_failed','canceled','refunded') NOT NULL
  payload            jsonb NOT NULL DEFAULT '{}'   -- normalized fields only, not the raw webhook body
  occurred_at         timestamptz NOT NULL
  created_at
  INDEX (subscription_id, occurred_at)
```

### C.7 Cross-cutting: audit, notifications, consent, EHR linkage

```
AuditEvent                     -- append-only; application role has INSERT only, no UPDATE/DELETE
  id              bigserial PK
  actor_user_id    uuid FK -> User.id NULL ON DELETE SET NULL
  actor_role        text NULL
  action             text NOT NULL          -- e.g. 'checkin.reviewed', 'subscription.canceled'
  entity_type          text NOT NULL
  entity_id             text NOT NULL
  metadata               jsonb NOT NULL DEFAULT '{}'   -- non-PHI-in-plaintext where avoidable; see §F
  ip_address              inet NULL
  user_agent               text NULL
  occurred_at               timestamptz NOT NULL DEFAULT now()
  INDEX (entity_type, entity_id), INDEX (actor_user_id, occurred_at), INDEX (occurred_at)

Notification
  id            uuid PK
  user_id        uuid FK -> User.id NOT NULL ON DELETE CASCADE
  channel         enum('email','sms','push','in_app') NOT NULL
  template_key     text NOT NULL
  payload           jsonb NOT NULL DEFAULT '{}'    -- non-PHI only, see §F
  status             enum('pending','sent','failed','read') NOT NULL DEFAULT 'pending'
  sent_at             timestamptz NULL
  read_at              timestamptz NULL
  created_at
  INDEX (user_id, status)

ConsentRecord
  id             uuid PK
  user_id         uuid FK -> User.id NOT NULL ON DELETE RESTRICT
  consent_type      enum('terms_of_service','privacy_policy','telehealth_consent','hipaa_notice','communication_consent') NOT NULL
  version           text NOT NULL
  granted_at         timestamptz NOT NULL
  revoked_at          timestamptz NULL
  ip_address           inet NULL
  created_at
  INDEX (user_id, consent_type)

ExternalRecordMapping           -- the anchor point for the EHR abstraction, see §G
  id             uuid PK
  entity_type      text NOT NULL         -- 'patient' | 'appointment' | 'document' | ...
  entity_id         uuid NOT NULL         -- Noor's own id for that entity
  ehr_provider_key    text NOT NULL         -- 'mock' | future real vendor key
  external_id           text NOT NULL
  synced_at              timestamptz NULL
  created_at
  UNIQUE (entity_type, entity_id, ehr_provider_key)
  INDEX (ehr_provider_key, external_id)
```

All foreign keys default to `ON DELETE RESTRICT` unless a softer behavior is
explicitly noted above, so that accidental cascading deletes can't silently
remove audit-relevant history. Deactivation is modeled with status enums,
not row deletion, for `User`, `Clinician`, `CareRelationship`, and
`Subscription`.

---

## D. Authentication Architecture

- **Patient authentication:** email + password (managed via Auth.js or a
  managed IdP such as Clerk/WorkOS) with required email verification before
  the patient dashboard is reachable. Magic-link login is a reasonable
  fast-follow, not required for MVP.
- **Clinician authentication:** same underlying mechanism, deployed under a
  separate app/origin, with **MFA required at login**, not optional.
- **Admin authentication:** same mechanism, **MFA required**, with
  `SUPER_ADMIN` treated as a break-glass role — fewer accounts, tighter
  provisioning process, and every `SUPER_ADMIN` action logged to
  `AuditEvent` (see §J). IP allowlisting for the admin origin is a
  reasonable staging/production hardening step, not required to design the
  schema now.
- **Sessions:** server-side session (DB- or Redis-backed), referenced by an
  `httpOnly`, `Secure`, `SameSite=Lax` (or `Strict` for clinician/admin)
  cookie. No auth tokens in `localStorage`/`sessionStorage` — that surface
  is avoidable and shouldn't be accepted for a healthcare app. Sessions
  rotate on privilege-relevant events (login, password change, MFA
  enrollment) and support "revoke all other sessions."
- **Password recovery:** single-use, short-expiry (e.g., 15–30 minutes)
  tokens delivered by email; the email itself contains no PHI, just a reset
  link; recovery requests are rate-limited per account and per IP.
- **MFA strategy:** TOTP (authenticator app) as the primary factor; SMS OTP
  as a fallback, called out here as the weaker of the two and worth
  reconsidering for clinician/admin accounts before general clinical
  availability. MFA is **required at launch for CLINICIAN, ADMIN, and
  SUPER_ADMIN**; optional-but-encouraged for PATIENT at MVP, revisited
  before the platform carries real clinical volume — **[NEEDS PRODUCT
  DECISION]** on the exact patient-MFA policy and timeline.
- **Multi-role accounts:** the schema (`UserRole` as a join table) permits a
  user to hold more than one role, but the MVP will not build any UI for
  switching roles, and product policy for whether the same person may ever
  be both a patient and a clinician in this system is **[NEEDS PRODUCT
  DECISION]** — assume "no" until decided otherwise.

---

## E. Authorization Model

Roles: `PATIENT`, `CLINICIAN`, `ADMIN`, `SUPER_ADMIN`. Authorization is
**RBAC layered with ownership/attribute checks**, enforced centrally (a
single policy module the API calls before every data access), not scattered
`if (user.role === ...)` checks across route handlers — this is a
maintainability requirement, not just a security one, per development rule
20.

| Resource | PATIENT | CLINICIAN | ADMIN | SUPER_ADMIN |
|---|---|---|---|---|
| Own account/profile | Read/write | — | — | — |
| Own check-ins & responses | Create/read own | Read only for **assigned** patients (via `CareRelationship`) | No direct clinical read by default (see note) | No direct clinical read by default |
| Clinician review & response | — | Full, for **assigned** patients only | No | No |
| Care goals | Read own | Full, for **assigned** patients | No | No |
| Provider directory (public fields) | Read | Read (self) | Read/write | Read/write |
| Clinician private fields (NPI, license #) | — | Read/write own | Read/write (credentialing function) | Read/write |
| Own subscription/billing status | Read, initiate checkout/cancel | — | Read (support function) | Read/write |
| Appointments | Create/read/cancel own | Read/manage own schedule | Read/manage all | Read/manage all |
| Audit logs | — | — | Read, scoped to non-clinical-content fields by default | Full read |
| System configuration (plans, question templates, escalation rules) | — | — | Read; write requires elevated/explicit config permission | Full write |

**Important design note:** `ADMIN` does **not** get blanket access to
clinical content (check-in responses, clinician review notes, care goals)
just by virtue of the role. That access requires a distinct, explicitly
granted permission (e.g., a `can_view_phi` flag or a separate
`CLINICAL_ADMIN` capability) on top of `ADMIN`, consistent with brief §22
("Do not allow administrators to automatically access all clinical
information unless explicitly authorized"). The exact shape of that
elevated-admin capability is **[NEEDS PRODUCT/LEGAL DECISION]** before M9
(Admin Dashboard); the schema and policy module are designed to support it
without rework.

**Ownership scoping:** a `CLINICIAN` can only read/act on check-ins,
patients, and care goals reachable through their own active
`CareRelationship` rows — never a global patient list. This is enforced in
the policy module, not left to individual query authors to remember.

---

## F. PHI / Data Classification

| Tier | Examples | Handling rule |
|---|---|---|
| **Tier 1 — Sensitive clinical (PHI)** | Check-in responses (mood/anxiety/sleep/free text), clinician review notes and responses, care goals, escalation reasons, telehealth/HIPAA consent content tied to treatment, DOB *combined with* any health data | Never sent to marketing analytics (GA, ad pixels); never sent to an AI provider without an executed BAA and explicit configuration (§I); never written to application logs in plaintext; never placed in URLs/query strings; encrypted at rest and in transit; access is RBAC + ownership scoped (§E) |
| **Tier 2 — PII / confidential (not clinical, still protected)** | Name, email, phone, address/state, account credentials, payment metadata (last4, brand — never full PAN), subscription status | Encrypted at rest; access is RBAC scoped; minimized in logs (e.g., log user id, not email, where possible) |
| **Tier 3 — Non-sensitive / aggregate** | Aggregated, de-identified product metrics (signup counts, completion rates), marketing site content, public provider-directory listing (name, credentials, specialty, bio, photo — clinician-consented, patient-visible by design) | Free to use in ordinary product analytics tooling |

Rules that follow directly from the brief (§15, §17):

- No PHI in URLs, client-side logs, marketing/ad analytics, or AI providers
  without specific approval and configuration.
- The `AuditEvent.metadata` and `Notification.payload` columns are jsonb by
  design specifically so the application layer can enforce a field
  allowlist (schema-validated at write time) that keeps Tier 1 content out
  of those tables — audit *that a check-in was reviewed* without storing
  *what the check-in said* in the audit row itself. Full clinical content
  stays in `CheckInResponse`/`ClinicianReview`, which have their own tighter
  access policy.
- A future `AnalyticsEvent` table (for the non-PHI product metrics in brief
  §17: downloads, account creation, onboarding completion, provider views,
  care requests, subscription conversion/churn, check-in completion rate,
  retention, appointment requests) is intentionally schema-separated from
  clinical tables and reviewed for PHI leakage before any field is added to
  it. Not included in the M0 schema above because it's out of scope until
  the milestone that needs it (§M), but the separation principle is
  established now.

---

## G. EHR Abstraction

Noor must be able to change EHR vendors without rewriting the application.
This is implemented as a small set of TypeScript interfaces owned by Noor,
living in an internal package (`packages/ehr-adapter`) that is the **only**
code allowed to know a real EHR's API shape. Routes, UI, and business logic
depend only on these interfaces.

```ts
// packages/ehr-adapter/src/types.ts

interface PatientRecordProvider {
  getPatientRecord(patientId: string): Promise<ExternalPatientRecord | null>;
  createOrLinkPatientRecord(patient: PatientDemographics): Promise<ExternalPatientRecord>;
  updateDemographics(patientId: string, demographics: Partial<PatientDemographics>): Promise<void>;
  getConsentsOnFile(patientId: string): Promise<ExternalConsent[]>;
}

interface AppointmentProvider {
  listAvailability(clinicianId: string, range: DateRange): Promise<AvailabilitySlot[]>;
  createAppointment(request: AppointmentRequest): Promise<ExternalAppointment>;
  cancelAppointment(externalAppointmentId: string, reason?: string): Promise<void>;
  getAppointment(externalAppointmentId: string): Promise<ExternalAppointment | null>;
}

interface ClinicalMessagingProvider {
  // Reserved for FUTURE true clinical messaging that must live in the EHR
  // of record. Noor Async's check-in/review flow is Noor's own domain data
  // (CheckIn / ClinicianReview, §C.4) and does NOT route through this
  // interface at MVP. Whether/when check-in content syncs into an EHR at
  // all is a [NEEDS CLINICAL/LEGAL REVIEW] decision, not assumed here.
  sendCareTeamMessage(message: OutboundClinicalMessage): Promise<ExternalMessage>;
  getMessages(threadId: string): Promise<ExternalMessage[]>;
}

interface DocumentProvider {
  uploadDocument(patientId: string, doc: DocumentUpload): Promise<ExternalDocument>;
  getDocument(externalDocumentId: string): Promise<DocumentDownload>;
  listDocuments(patientId: string): Promise<ExternalDocument[]>;
}
```

**MVP implementation:** each interface gets a `MockProvider` implementation
(in-memory or DB-backed fakes) so the full patient/clinician workflow can be
built and tested end-to-end before a real EHR contract exists. The concrete
provider is selected via configuration (`EHR_PROVIDER=mock`) and constructed
by a factory/dependency-injection point at app startup — swapping to a real
vendor later is: implement the interface, add an adapter, change one
environment variable. No route handler, UI component, or business-logic
function is ever allowed to import a vendor SDK directly.

`ExternalRecordMapping` (§C.7) is the durable anchor: it maps a Noor entity
(`patient`, `appointment`, `document`, …) to `(ehr_provider_key,
external_id)`, so Noor's own IDs remain stable identifiers even as the
backing EHR changes.

**Explicit non-decision:** which real EHR Noor eventually integrates with,
and exactly which fields sync in which direction, is **[NEEDS CLINICAL/OPS
DECISION]** and out of scope for M0. This document only commits to the
interface shape and the principle that the choice is reversible.

---

## H. Subscription Architecture

A `PaymentProvider` interface (in `packages/payments-adapter`) is the only
code that knows Stripe's (or any future provider's) API shape:

```ts
interface PaymentProvider {
  createCustomer(patientId: string, email: string): Promise<{ externalCustomerId: string }>;
  createCheckoutSession(params: CheckoutParams): Promise<{ url: string }>;
  cancelSubscription(externalSubscriptionId: string, atPeriodEnd: boolean): Promise<void>;
  getSubscriptionStatus(externalSubscriptionId: string): Promise<NormalizedSubscriptionStatus>;
  handleWebhookEvent(rawEvent: unknown, signature: string): Promise<NormalizedSubscriptionEvent>;
}
```

- **MVP implementation:** Stripe, using Stripe Checkout (hosted payment
  page) and the Stripe Customer Portal for self-service management, plus a
  webhook endpoint that verifies signatures and calls
  `handleWebhookEvent`, which normalizes Stripe's event shape into a
  `SubscriptionEvent` row (§C.6). **Noor's backend never receives or stores
  raw card data** — only Stripe-issued customer/subscription/session IDs.
- **Provider-agnostic state.** `Subscription.status` uses Noor's own enum
  (`trialing | active | past_due | canceled | incomplete`), not Stripe's
  literal status strings, and `SubscriptionEvent.event_type` is similarly
  normalized. `payment_provider` and the `external_*_id` fields carry the
  vendor-specific identifiers for traceability. This is what lets a future
  provider swap touch the adapter and a mapping function, not every place
  that reads subscription state.
- **Entitlements, not hardcoded feature flags.** `SubscriptionPlan.entitlements`
  (jsonb) holds plan-level configuration such as check-ins-per-month or
  clinician-response-SLA-hours; feature access to Noor Async is computed
  from `Subscription.status` + the plan's entitlements at request time,
  rather than scattered boolean flags across the codebase. The actual
  numbers (price, SLA hours, usage boundaries) are **[NEEDS PRODUCT
  DECISION]** — the brief's "$129/month" and response-time expectations are
  explicitly flagged there as hypotheses, not committed values, and this
  schema stores them as configuration precisely so they can change without
  a migration.
- **States supported:** free/no subscription, trialing, active, past_due,
  canceled, refunded (as a `SubscriptionEvent`), consistent with brief §12.
- **No unlimited messaging.** Nothing in this architecture implies
  real-time chat; the async product is check-in → clinician review →
  clinician response, bounded by entitlements, matching brief §11's explicit
  "do not implement unlimited messaging."

---

## I. AI Abstraction

An `AIProvider` interface (in `packages/ai-service`) is the only code that
knows a real AI vendor's API shape, and the only code allowed to construct a
prompt that includes any patient-submitted content:

```ts
interface AIProvider {
  summarizeCheckInForClinician(input: CheckInSummaryInput): Promise<DraftSummary>;
  // Explicitly reserved, OFF by default at MVP:
  draftClinicianResponseSuggestion?(input: DraftResponseInput): Promise<DraftSuggestion>;
  classifyResourceQuery?(query: string): Promise<ResourceCategory[]>; // patient education navigation only
}

interface DraftSummary {
  text: string;
  aiGenerated: true;          // always true, not a vendor-controlled field
  reviewedByClinicianId: null; // set only after a clinician explicitly approves
  // Deliberately NO `diagnosis`, `riskLevel`, or `recommendedAction` field exists
  // on this type — the AI cannot populate what the schema doesn't allow it to hold.
}
```

- **MVP default:** AI is **disabled or limited to a `MockProvider`** that
  returns clearly-labeled placeholder output, per brief §9 and §16
  ("for MVP, keep AI functionality minimal or disabled"). If enabled at all
  before M-something later, the only allowed operation is drafting a
  clinician-facing *summary* of a patient's own check-in content — never a
  patient-facing response, never a diagnosis, never a risk score.
- **Defense in depth, not just prompting.** The prohibitions in brief §16
  (no diagnose, no prescribe, no determine level of care, no determine
  suicide risk, no final clinical decisions, no replacing a clinician) are
  enforced at the **type/interface level** (no field exists for the AI to
  populate with a diagnosis or risk level) in addition to prompt
  instructions, so a prompt-injection or model mistake can't smuggle a
  disallowed output through — there's nowhere for it to go.
- **PHI-to-AI boundary.** No content reaches `AIProvider` unless the
  configured provider is confirmed BAA-covered and the specific data fields
  passed in have been explicitly approved (brief §15/§16). Until that's
  true for a given environment, `AI_PROVIDER=mock`.
- **Swap mechanism.** Same factory/config pattern as EHR and payments
  (`AI_PROVIDER=mock|anthropic|...`), selected per environment.
- **Human in the loop, always.** Any AI output is stored with
  `aiGenerated: true` and is never shown to a patient, and never treated as
  "the clinician's response," until a licensed clinician has reviewed and
  explicitly approved it (mirrors `ClinicianReview.response_is_draft` in
  §C.4).

---

## J. Security Architecture

Organized by control area; every item here is a design commitment for M0,
not a claim that it's already implemented or independently audited.

- **Transport:** TLS 1.2+ everywhere, HSTS, no plaintext HTTP endpoints,
  even internally between services where practical.
- **Encryption at rest:** Postgres encryption at rest via the hosting
  provider, KMS-managed keys, encrypted object storage (S3 + KMS), encrypted
  backups.
- **Application-layer:**
  - Central RBAC + ownership policy module (§E), called before every data
    access — not per-route ad hoc checks.
  - Input validation at every API boundary via shared Zod schemas (also
    used to generate frontend types), rejecting anything outside the
    expected shape before it reaches business logic.
  - CSRF protection appropriate to cookie-based sessions (double-submit
    token or same-site cookie strategy).
  - Rate limiting on auth endpoints (login, password reset, MFA) and on
    write-heavy patient-facing endpoints (check-in submission) to blunt
    brute-force and abuse.
  - Passwords hashed with a modern algorithm (argon2id or bcrypt with an
    appropriate cost factor); never logged, never returned in any response.
  - Output handling that avoids reflecting user-supplied content unescaped
    (standard XSS hygiene), especially relevant for clinician-facing
    free-text review of patient-submitted free text.
- **Secrets management:** environment variables sourced from a secret
  manager per environment (never committed to the repo, never logged);
  distinct secrets per environment (dev/staging/prod never share
  credentials).
- **Audit logging:** `AuditEvent` (§C.7) is insert-only from the
  application's database role — no `UPDATE`/`DELETE` grant — so the audit
  trail can't be quietly edited by application-level bugs or a compromised
  app credential. Every clinically-relevant action (review, response,
  escalation, care-relationship change, subscription change, admin config
  change) writes an audit row, per brief §10/§25's auditability
  requirement.
- **Session management:** short idle timeout + longer absolute timeout,
  rotation on login/password-change/MFA-enrollment, "revoke all sessions"
  on password change, and separate cookie scoping per app/origin
  (patient/clinician/admin) so a compromised patient session cannot be
  replayed against the clinician or admin surface.
- **Dependency & pipeline security:** dependency scanning and
  lint/typecheck/test as required CI gates on every PR (§K); secret-scanning
  on the repo.
- **Backups:** encrypted, with a defined retention policy and *tested*
  restores — retention specifics are **[NEEDS COMPLIANCE INPUT]**, not
  invented here.
- **What this section is not:** a HIPAA compliance certification. Before
  any real clinical use in production, the following require a professional
  compliance/security review that this document does not substitute for:
  executed BAAs with every vendor that can touch PHI (hosting/DB provider,
  email/SMS provider, error tracking if it can capture PHI, AI provider,
  payment provider only insofar as it touches PHI-adjacent metadata), a
  formal risk assessment, a penetration test, and documented policies and
  procedures (access control policy, incident response plan, breach
  notification process, workforce training). **[NEEDS CLINICAL/LEGAL/
  COMPLIANCE REVIEW]** before production clinical use — flagged here
  exactly as brief §15/§28 require.

---

## K. Deployment Architecture

```
   Development                Staging                     Production
  ┌───────────────┐    merge  ┌───────────────┐   promote  ┌───────────────┐
  │ feature/* PRs  │ ───────▶ │ development     │ ─────────▶ │ main            │
  │ local + PR      │          │ branch environ.  │            │ branch environ.  │
  │ preview envs    │          │                   │            │                   │
  │ synthetic data   │          │ synthetic/seeded  │            │ real data,          │
  │ mock EHR/AI/pay  │          │ data only          │            │ real vendors once   │
  │ providers          │          │ mock or sandbox     │            │ BAAs executed         │
  └───────────────┘          │ vendor modes         │            └───────────────┘
                                └───────────────┘
```

- **CI/CD:** GitHub Actions. Every PR runs lint, typecheck, unit +
  integration tests, and a security/dependency scan as required checks
  before merge (per brief §24). Merges to `development` auto-deploy to the
  staging environment; promotion from `development`/`main` to production is
  a manual, approved step.
- **Environment isolation:** separate databases, separate secrets, and
  separate vendor accounts/API keys (or clearly separated sandbox vs. live
  modes) per environment. Development and staging never touch production
  data or production secrets (brief §26); production is never seeded with
  synthetic/test patient data.
- **Infra-as-code:** recommended (Terraform or equivalent) once
  infrastructure moves beyond a single managed-platform pilot deployment,
  so environment configuration is reviewable and reproducible rather than
  hand-configured.
- **Feature flags:** used to gate clinical-adjacent features (AI, live
  scheduling, subscriptions) per environment, so staging can exercise a
  feature in sandbox mode before it's enabled in production.

---

## L. Folder / Project Structure

```
noor/
  apps/
    patient/              # Next.js — marketing site + patient app (public + authenticated)
    clinician/             # Next.js — clinician dashboard (separate origin, MFA required)
    admin/                   # Next.js — admin dashboard (separate origin, MFA required)
  packages/
    api/                     # Fastify backend: routes, domain services, RBAC middleware
    db/                        # Prisma schema, migrations, seed scripts (synthetic data only)
    auth/                        # session/password/MFA helpers, shared by api + all frontends' server code
    ehr-adapter/                   # PatientRecordProvider / AppointmentProvider /
                                    # ClinicalMessagingProvider / DocumentProvider + MockProvider
    payments-adapter/                # PaymentProvider interface + Stripe implementation
    ai-service/                        # AIProvider interface + Mock/Anthropic implementation, guardrail types
    types/                                # shared TypeScript types generated/derived from Prisma + Zod schemas
    ui/                                     # design tokens (CSS variables), shared component library
  docs/
    noor/
      ARCHITECTURE.md                        # this document
      CHANGELOG.md                             # architectural decision history
  .github/workflows/                             # CI pipelines
  pnpm-workspace.yaml
  turbo.json
```

No application code is being created in this milestone — this structure is
the target for M1 onward.

---

## M. Milestone Roadmap

Each milestone below ships with unit tests, and integration/auth/authz
tests where the milestone touches access control, per brief §24. Milestones
are intentionally scoped so clinical functionality can be activated later
without re-architecture, per brief §4.

1. **M0 — Architecture** *(this document).* No code. Awaiting approval.
2. **M1 — Foundations.** Monorepo scaffold; `User`/`Role`/`UserRole`;
   patient signup/login/session (password + MFA plumbing, MFA optional for
   patients at this stage); base Prisma schema + migrations for the tables
   in §C; CI pipeline (lint/typecheck/test); empty role-gated shells for the
   three apps; `AuditEvent` write path wired to at least login/logout.
3. **M2 — Patient onboarding + Home.** `PatientProfile` onboarding flow
   (brief §6, non-clinical fields only); Home screen (brief §5) wired to
   real onboarding/care-status data, with graceful empty states before
   check-ins/appointments/subscriptions exist.
4. **M3 — Weekly check-in (deterministic).** `CheckInQuestion` /
   `CheckIn` / `CheckInResponse`; the seven MVP questions from brief §7;
   the deterministic `condition_rule` branching engine from brief §8 with
   the two example rules given (sleep ≤ 4, anxiety ≥ 8); patient-facing
   check-in flow end-to-end.
5. **M4 — Clinician dashboard v1.** Clinician auth with **required MFA**;
   `CareRelationship` (admin-assigned for MVP — no self-serve matching
   yet); check-in review queue (brief §10 example); review/respond/save
   draft/mark reviewed actions; every action audited; escalation action
   present in the UI and schema (`ClinicianReview.escalated_at` /
   `escalation_reason`) but the actual escalation *protocol* is **[NEEDS
   CLINICAL LEADERSHIP + LEGAL/COMPLIANCE REVIEW]** before this milestone
   is considered clinically usable, per brief §9.
6. **M5 — Provider directory (read-only).** `ClinicianProfile` public
   listing; browse/search/filter by specialty/language/state; "request
   care" creates a `CareRelationship` in `requested` status — no live
   booking yet.
7. **M6 — EHR & AI abstractions wired end-to-end (mock implementations).**
   `ehr-adapter` and `ai-service` packages built per §G/§I with
   `MockProvider`s connected to real flows (e.g., appointment placeholders
   through `AppointmentProvider`); AI summarization available behind a flag,
   **off by default**.
8. **M7 — Subscriptions (Stripe sandbox).** `SubscriptionPlan` /
   `Subscription` / `SubscriptionEvent`; Stripe Checkout + Customer Portal +
   webhooks in Stripe **test mode only**; entitlement-gated access to Noor
   Async features; exact price/entitlements remain **[NEEDS PRODUCT
   DECISION]** and are configured, not hardcoded.
9. **M8 — Scheduling v1.** `ProviderAvailability` + `Appointment` booking
   flow (against the mock `AppointmentProvider` unless a real EHR decision
   has landed by then); appointment-related notifications.
10. **M9 — Admin dashboard v1.** Role-scoped views into patients, providers,
    subscriptions, check-ins, care relationships, appointments, and audit
    logs; enforcement of the "admin does not automatically see clinical
    content" rule from §E; requires the elevated-admin-capability decision
    flagged there.
11. **M10 — Hardening & compliance readiness.** Security review pass
    against §J; BAA execution checklist tracked to completion for every
    vendor touching PHI; backup/restore test; staging→production promotion
    runbook; formal go/no-go for handling real clinical data, owned by
    clinical leadership and legal/compliance, not engineering.

---

## N. Open Items Requiring Non-Engineering Decisions

Consolidated from throughout this document, so nothing is silently assumed:

- **[CLINICAL/LEGAL]** Safety escalation protocol: what specific check-in
  answers or patterns trigger escalation, to whom, and on what timeline.
  This document only creates the schema/workflow *slots*
  (`ClinicianReview.escalated_at`/`escalation_reason`) — it does not invent
  clinical criteria.
- **[CLINICAL/LEGAL]** Crisis/emergency-care disclaimers and in-app
  language — must make clear Noor is not an emergency service.
- **[LEGAL/COMPLIANCE]** BAA execution with every vendor that can touch
  PHI before production clinical use; formal risk assessment; penetration
  test; incident response and breach notification procedures.
- **[PRODUCT]** Noor Async pricing ($129/month is a stated hypothesis, not
  a decision), response-time SLA, usage boundaries, and clinician
  availability expectations — stored as `SubscriptionPlan.entitlements`
  configuration once decided.
- **[PRODUCT]** Exact patient MFA policy and timeline (optional at MVP per
  §D — when does it become required).
- **[PRODUCT]** Multi-role account policy (can one person hold both
  `PATIENT` and `CLINICIAN` roles) — assume no until decided.
- **[PRODUCT/LEGAL]** Shape of the elevated-admin clinical-data-access
  capability referenced in §E.
- **[CLINICAL/OPS]** Target EHR vendor and the specific data-sync boundary
  between Noor and that EHR (what syncs, in which direction, on what
  trigger) — §G intentionally leaves this open.
- **[COMPLIANCE]** Backup retention period and formal data-retention/
  deletion policy.
- **[CLINICAL]** Any content beyond the two deterministic adaptive-question
  examples given in the brief (sleep ≤ 4, anxiety ≥ 8) — no additional
  clinical branching logic has been invented here.

---

**End of M0.** No implementation has begun. Awaiting approval before M1.
