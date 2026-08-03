# DosePrepped — Architecture & Implementation Plan (Step 1)

**Status:** Planning only. No application code has been written. This document
is the deliverable requested before any implementation begins.

**Tagline:** Medication questions. Pharmacist answers.

**Scope of this document:** technology stack, system architecture, frontend
architecture, backend architecture, database schema, API structure, AI
architecture, security architecture, repository structure, development
milestones, testing strategy, deployment strategy, and risks — for the MVP
described in the product spec (patient app + pharmacist dashboard, AI-assisted
question triage, pharmacist secure messaging). Nothing beyond the MVP is being
built now; every section below flags where later expansion (medication
scanning, OCR, org accounts, billing, SSO, etc.) plugs in without requiring a
rewrite.

---

## 1. Recommended Technology Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend (patient PWA) | Next.js 14 (App Router) + TypeScript + Tailwind | SSR/ISR for fast mobile loads, first-class PWA tooling, one React codebase for web + installable app, large ecosystem for forms/auth/accessibility |
| Frontend (pharmacist dashboard) | Same Next.js monorepo, separate app target | Shares design system, types, and API client with the patient app; deployed and access-controlled independently |
| Styling/UI | Tailwind CSS + a small internal component library | Fast to build a clean, non-clinical, trustworthy UI without a heavy design system dependency |
| Backend API | Node.js + TypeScript, Fastify (or NestJS if the team prefers stronger structure out of the box) | Typed, fast, good middleware ecosystem for auth/rate-limiting/validation; keeps the AI service layer as a first-class internal service rather than glued into route handlers |
| API contract | REST (OpenAPI-documented) + Zod schemas shared between client/server | REST is simplest to secure, audit, and reason about for a healthcare product; Zod gives compile-time + runtime validation from one schema |
| Database | PostgreSQL | Relational integrity for patients/medications/requests/audit trails; mature encryption, RBAC, and compliance tooling; `pgvector` extension covers retrieval needs without adding a separate vector DB in the MVP |
| ORM/migrations | Prisma | Type-safe queries, first-class migration history (important for an auditable healthcare schema) |
| Auth | Auth.js (NextAuth) or a managed provider (Clerk/WorkOS) with a custom RBAC layer on top | Avoid hand-rolling session/password security; MFA support for pharmacists is a requirement, not a nice-to-have |
| File storage | S3-compatible object storage (AWS S3 or Cloudflare R2) with KMS-managed encryption and pre-signed URLs | Prescription bottle photos need encryption at rest, access control, and never touch app servers directly |
| AI provider | Anthropic Claude (Messages API) via a dedicated internal `ai-service` package | Structured output support, strong instruction-following for the strict "MUST NOT" guardrails, prompt caching for cost control |
| Retrieval / RAG | `pgvector` over a curated medication knowledge base table, synthetic/test content clearly flagged in the MVP | Keeps infra minimal while proving the retrieval architecture; swappable for a dedicated vector store later without changing the AI service interface |
| Background jobs | None required for MVP (all flows are request/response); a lightweight queue (BullMQ + Redis) is the designated slot for later async work (OCR processing, reminders, batch analytics) | Avoid infra the MVP doesn't need |
| Hosting (prototype/pilot phase) | Vercel (frontend) + a managed Postgres provider with a documented BAA path (e.g., AWS RDS or Supabase's HIPAA-eligible tier) + Fly.io/Render for the API | Fast to stand up for a pilot; every vendor choice is required to support a BAA before any real PHI is processed (see §8 and §13) |
| Observability | Sentry (errors), structured JSON logs shipped to a log store, a dedicated `audit_log` table for compliance-relevant events | Error tracking and compliance auditing are different concerns and are kept separate |
| CI/CD | GitHub Actions | Already the team's platform; runs lint/typecheck/tests/security scans on every PR |

**Monorepo tooling:** pnpm workspaces + Turborepo. This lets the patient app,
pharmacist dashboard, API, and shared packages (types, AI service, UI
components) live in one repo with independent build/deploy pipelines.

---

## 2. System Architecture

```
                        ┌─────────────────────┐
                        │   Patient PWA        │  (Next.js, mobile-first)
                        └──────────┬───────────┘
                                   │ HTTPS (TLS 1.2+)
                        ┌──────────▼───────────┐
                        │   API Gateway / BFF   │  (auth, rate limit, RBAC)
                        └──────────┬───────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
┌───────▼────────┐        ┌────────▼────────┐        ┌────────▼────────┐
│  Core API       │        │  AI Service      │        │  Messaging /     │
│  (users, meds,  │        │  Layer           │        │  Pharmacist       │
│  questions,     │◄──────►│  (classification,│        │  Workflow API     │
│  requests)      │        │  education, RAG, │        │                   │
└───────┬────────┘        │  escalation,     │        └────────┬────────┘
        │                  │  summarization)  │                 │
        │                  └────────┬─────────┘                 │
        │                           │                            │
┌───────▼───────────────────────────▼────────────────────────────▼───────┐
│                          PostgreSQL (+ pgvector)                        │
│   users, medications, medication_reference, questions, ai_messages,     │
│   pharmacist_requests, messages, consents, audit_log, analytics_events  │
└───────────────────────────────────────────────────────────────────────┘
        │
┌───────▼────────┐
│  Object Storage │  (prescription photos, encrypted, pre-signed access)
└─────────────────┘

                        ┌─────────────────────┐
                        │ Pharmacist Dashboard  │ (Next.js, desktop-first,
                        │                       │  separate auth realm)
                        └──────────┬───────────┘
                                   │ HTTPS
                                   ▼
                          same API Gateway/BFF
```

Key architectural decisions:

- **Single API, two frontends, role-gated.** Patient and pharmacist apps hit
  the same backend but with different roles/scopes — this avoids duplicating
  business logic (e.g., the "what counts as an escalation" rule must be
  defined once).
- **AI Service Layer is a bounded internal service, not inline chatbot code.**
  It exposes typed operations (`classifyQuestion`, `resolveMedication`,
  `detectSafetyConcern`, `generateEducation`, `generateClarifyingQuestion`,
  `summarizeForPharmacist`) so the LLM is never called ad hoc from route
  handlers. This is what makes RAG, model swaps, and stricter guardrails
  possible later without touching UI or API code.
- **Medication Data Abstraction Layer.** All medication data (patient-entered
  and reference data) flows through one internal interface
  (`MedicationDataProvider`). The MVP implementation is backed by a
  clearly-labeled synthetic dataset; a future implementation swaps in
  RxNorm/DailyMed/FDA-sourced data behind the same interface. No UI or AI code
  talks to "the database" directly for medication facts — it talks to this
  provider.
- **Escalation rules are data, not hardcoded logic.** Safety/escalation
  detection reads from an `escalation_rules` table interpreted by a small rule
  engine, so clinically-reviewed rules can be added/edited later without a
  code deploy. The MVP ships with a minimal, conservative rule set (see §7).

---

## 3. Frontend Architecture

**Patient PWA (`apps/patient`)**
- Next.js App Router, mobile-first responsive layout, installable PWA
  (manifest + service worker for offline shell only — not offline data, since
  this is a data-sensitive app).
- Screens (MVP only): Sign up/Login → Home → Add Medication → Ask a Question
  (medication picker → question input → AI response → "Ask a Pharmacist" CTA)
  → Pharmacist request confirmation → Conversation history → Account/Consent/
  Delete account.
- State/data: server components for initial data, a thin client-side data
  layer (TanStack Query) for mutations (add medication, submit question,
  send message) and polling conversation status.
- Auth: httpOnly session cookie issued by the API; no tokens in
  localStorage.

**Pharmacist Dashboard (`apps/pharmacist`)**
- Separate Next.js app, desktop-first responsive, same design tokens as the
  patient app but a denser, "tool" layout (queue + detail pane).
- Screens (MVP only): Login (MFA-required) → Queue (New / In Progress /
  Waiting for Patient / Completed / Escalated) → Request detail (patient info,
  medication info, question, AI summary clearly labeled AI-generated,
  response composer, escalate/complete actions).
- Deployed as a separate origin/subdomain from the patient app so session
  cookies and CSP policy are never shared between the two roles.

**Shared package (`packages/ui`, `packages/types`)**
- Design tokens (from `styles.css`-equivalent CSS variables, not Tailwind
  utility sprawl, to keep the trustworthy/non-clinical brand consistent),
  shared TypeScript types generated from the Zod schemas used by the API.

---

## 4. Backend Architecture

- **API Gateway / BFF layer:** authentication, session validation, RBAC
  enforcement, rate limiting, request validation (Zod), audit-log middleware
  that records who accessed/changed what before the request reaches domain
  logic.
- **Domain services**, each independently testable and each owning its own
  data access:
  - `UserService` — patient/pharmacist accounts, consent records, account
    deletion.
  - `MedicationService` — manual medication entry, photo attachment, the
    `MedicationDataProvider` abstraction (synthetic in MVP).
  - `QuestionService` — question submission, orchestrates calls into the AI
    Service Layer, persists AI conversation turns.
  - `PharmacistRequestService` — creates structured pharmacist requests from
    a question + AI summary, manages queue state transitions (new → in
    progress → waiting for patient → completed/escalated).
  - `MessagingService` — secure threaded messages between patient and
    pharmacist tied to a request.
  - `AnalyticsService` — event ingestion (see §11), deliberately narrow
    schema to avoid over-collection.
  - `AuditService` — append-only log of access/mutation events on
    PHI-adjacent records.
- **AI Service Layer (`packages/ai-service`)**, called only by domain
  services, never directly by route handlers:
  - `classifyQuestion(text)` — intent/category classification.
  - `resolveMedication(text, patientMedications)` — matches free text to a
    medication in the patient's profile via the data abstraction layer, not
    LLM memory.
  - `detectSafetyConcern(text)` — deterministic rule pass first (keyword/
    symptom rules from `escalation_rules`), then an LLM-assisted second pass
    for phrasing the app doesn't have a rule for yet; a positive from either
    pass short-circuits to the emergency-guidance UI and skips general AI
    education.
  - `generateClarifyingQuestion(context)` — used when the question is
    ambiguous.
  - `generateEducation(context, retrievedDocs)` — general medication
    education, grounded in retrieved reference content when available,
    explicitly instructed never to diagnose/prescribe/adjust doses/tell a
    patient to stop a prescription.
  - `summarizeForPharmacist(context)` — structured JSON output (not prose)
    containing question, medication, relevant profile meds, patient-provided
    context, and an AI-generated summary clearly flagged as AI-generated.
  - All prompts, guardrail instructions, and output schemas live in this
    package so they're versioned and testable independently of the rest of
    the app (see §10, AI evaluation tests).

---

## 5. Database Schema (MVP)

Simplified entity list — exact column types will be finalized in the Prisma
schema during implementation, not in this document.

```
users
  id, role (patient | pharmacist | admin), email, password_hash (or external
  auth id), name, date_of_birth, created_at, deleted_at (soft delete),
  consent_accepted_at, consent_version

pharmacist_profiles
  user_id (FK users), license_number, license_state, verified_at

patient_medications
  id, user_id (FK users), medication_reference_id (nullable FK, see below),
  name, strength, dosage_form, directions, photo_url (nullable), source
  (manual | photo_unconfirmed | photo_confirmed), created_at

medication_reference        -- the "Medication Data Abstraction Layer" table
  id, name, generic_name, strength_options, dosage_forms, data_source
  (synthetic_demo | rxnorm | dailymed | ...), is_synthetic (bool, always
  true in MVP), external_ref_id (nullable, for future RxNorm/DailyMed linkage)

questions
  id, patient_id (FK users), patient_medication_id (FK, nullable),
  question_text, photo_url (nullable), status (ai_answered |
  pharmacist_requested | pharmacist_answered | escalated), created_at

ai_messages
  id, question_id (FK), role (patient | ai), content, message_type
  (clarifying_question | education | summary), created_at

pharmacist_requests
  id, question_id (FK), status (new | in_progress | waiting_for_patient |
  completed | escalated), assigned_pharmacist_id (nullable FK), ai_summary
  (jsonb, flagged is_ai_generated: true), created_at, completed_at

messages
  id, pharmacist_request_id (FK), sender_id (FK users), body, created_at

consents
  id, user_id (FK), consent_type, accepted_at, version

audit_log
  id, actor_id (FK users, nullable for system), action, entity_type,
  entity_id, metadata (jsonb), created_at

escalation_rules
  id, pattern_type (keyword | symptom_category), pattern, guidance_text,
  active, reviewed_by (nullable, for future clinical sign-off), created_at

analytics_events
  id, user_id (nullable, pseudonymous where possible), event_type,
  metadata (jsonb, minimal), created_at
```

Fields deliberately **not** in the MVP schema but reserved architecturally:
`organizations`, `organization_id` foreign keys, `billing_plan`, `sso_provider`
— these are additive, not structural changes, when B2B features arrive.

---

## 6. API Structure (REST, MVP surface only)

```
POST   /auth/signup
POST   /auth/login
POST   /auth/logout
DELETE /auth/account

GET    /me
PATCH  /me
POST   /me/consent

GET    /medications
POST   /medications
PATCH  /medications/:id
DELETE /medications/:id
POST   /medications/:id/photo         (pre-signed upload flow)

POST   /questions                      { medicationId, text, photoUrl? }
GET    /questions                      (patient's history)
GET    /questions/:id

POST   /questions/:id/ask-pharmacist   -> creates pharmacist_request

GET    /pharmacist/requests?status=    (pharmacist dashboard queue)
GET    /pharmacist/requests/:id
POST   /pharmacist/requests/:id/claim
POST   /pharmacist/requests/:id/message
POST   /pharmacist/requests/:id/complete
POST   /pharmacist/requests/:id/escalate

GET    /requests/:id/messages          (shared thread, role-scoped)
POST   /requests/:id/messages

POST   /analytics/events               (internal, narrow allow-list of event types)
```

All endpoints sit behind the RBAC + rate-limiting middleware described in §8.
Every state-changing endpoint writes an `audit_log` row.

---

## 7. AI Architecture

Pipeline for a single "Ask a Question" turn:

1. **Input validation & rate limiting** (per-user question rate cap).
2. **Deterministic safety pass** against `escalation_rules` — if matched,
   short-circuit directly to emergency-guidance UI copy (not AI-generated)
   and stop. No autonomous emergency handling.
3. **LLM-assisted safety pass** (only if step 2 didn't match) — a narrow
   classifier call asking "does this describe a potentially urgent symptom?"
   A positive result also short-circuits to guidance + offers "Ask a
   Pharmacist" immediately.
4. **Medication resolution** — match the question to a medication in the
   patient's profile via the data abstraction layer; ask a clarifying
   question if ambiguous or unmatched.
5. **Question classification** — category (general info, interaction,
   side effect, dosing/missed dose, other) used to pick the right education
   template and retrieval query.
6. **Retrieval (RAG)** — query `medication_reference` (and future authoritative
   sources) via `pgvector` similarity search; retrieved snippets are passed
   into the education prompt as grounding context, and the MVP UI clearly
   labels this as **synthetic/demo data**, not real medication information.
7. **Education generation** — system-prompt-enforced constraints matching the
   spec's MUST NOT list; output is structured (education text +
   "want a pharmacist to review this?" flag), never freeform-only.
8. **Pharmacist path** — if the patient taps "Ask a Pharmacist," 
   `summarizeForPharmacist` produces a structured JSON object (question,
   medication + strength + directions, other profile medications, AI summary
   explicitly flagged `is_ai_generated: true`) that becomes the
   `pharmacist_requests.ai_summary`.

Guardrails are enforced at three layers, not just prompt wording: (a) system
prompt instructions, (b) output schema validation (structured JSON, rejecting
free text that doesn't fit the expected shape), (c) a post-generation
keyword/pattern check that blocks responses containing diagnosis-like or
dose-change-like phrasing before they ever reach the patient — any block
routes to a safe fallback message plus an "Ask a Pharmacist" prompt.

This layer is provider-agnostic at the interface level (`ai-service` exposes
typed functions, not raw Claude API calls, to callers) so the underlying
model or retrieval backend can change without touching product code.

---

## 8. Security Architecture

- **Transport:** TLS 1.2+ everywhere, HSTS enabled.
- **At rest:** database encryption at rest (managed by the Postgres
  provider), object storage encrypted via KMS, no PHI in logs.
- **AuthN:** managed auth provider or Auth.js with Argon2/bcrypt-backed
  credentials; MFA required for all pharmacist and admin accounts; short-lived
  session cookies (httpOnly, secure, sameSite=strict) + refresh flow.
- **AuthZ:** role-based access control (patient, pharmacist, admin), enforced
  centrally in the gateway middleware, never trusted from the client;
  patients can only read their own records, pharmacists only see records
  routed to them/the shared queue, admins are a separate, tightly scoped role.
- **Least privilege:** the API's DB role is scoped to only the tables/ops it
  needs; no shared superuser credentials between environments.
- **Audit logging:** every read/write touching patient or pharmacist request
  data appends to `audit_log` with actor, action, entity, timestamp.
- **Secure messaging:** thread access is scoped to the two participants
  (patient + assigned pharmacist) plus admins for support/compliance review,
  enforced at the query layer, not just the UI.
- **Secrets management:** environment-injected secrets via the hosting
  platform's secret store; nothing committed to the repo (this document
  intentionally contains no credentials, matching the existing project's
  `.env.example` convention).
- **Input validation:** Zod schemas on every endpoint, rejecting unknown
  fields.
- **Rate limiting:** per-IP and per-user limits on auth, question submission,
  and file upload endpoints.
- **Secure file uploads:** pre-signed, size-and-type-restricted uploads
  directly to object storage; server-side re-validation of content type;
  virus/malware scanning hook reserved as a future addition before this goes
  to production with real PHI.
- **Data retention & deletion:** soft-delete with audit trail by default;
  account deletion triggers a defined purge process for PHI-bearing tables
  after the retention window required by policy/legal review — the exact
  window is a legal/operational decision, not an engineering one, and is
  called out as unresolved in §13.
- **Admin access:** separate, MFA-required, fully audit-logged; no
  standing admin access to production PHI without a logged reason.

**Explicit disclaimer (per spec):** none of the above constitutes a claim of
HIPAA compliance. Before any real PHI is processed:

- *Technical requirements still needed:* penetration testing, formal access
  review, encryption key rotation policy, backup/disaster-recovery testing,
  malware scanning on uploads, SOC 2-aligned logging/monitoring.
- *Operational requirements:* documented incident response plan, workforce
  security training, access review cadence, data retention policy signed off
  by compliance, breach notification procedure.
- *Legal/compliance requirements:* HIPAA risk assessment by qualified
  counsel/compliance, Business Associate Agreements (BAAs) with every vendor
  touching PHI (hosting, email, error tracking, AI provider), state-specific
  pharmacist licensure and telepharmacy regulatory review, terms of
  service/privacy policy drafted by counsel.
- *Vendor/BAA requirements:* confirm BAA availability *before* selecting
  final hosting/AI/analytics/error-tracking vendors — this is a gating
  decision, not a post-launch cleanup item.

The MVP/pilot phase should run on **synthetic data only**, which defers most
of the above from "blocking" to "required before the next phase."

---

## 9. Repository Structure

DosePrepped is a distinct product from the existing MySupervisely site in
this repository. Recommended structure if it lives in its own repo (or its
own top-level directory, if the org prefers keeping it alongside
MySupervisely for now):

```
doseprepped/
  apps/
    patient/            — Next.js patient PWA
    pharmacist/          — Next.js pharmacist dashboard
    api/                 — Fastify/NestJS backend
  packages/
    ai-service/          — AI orchestration, prompts, guardrails (§7)
    db/                   — Prisma schema, migrations, seed (synthetic data)
    types/                 — shared Zod schemas / TS types
    ui/                     — shared design tokens + components
  docs/
    architecture/           — this document and future ADRs
  .github/workflows/         — CI (lint, typecheck, test, security scan)
  turbo.json, pnpm-workspace.yaml
```

Recommendation: start this as its **own repository** rather than folding it
into MySupervisely1 — the two are unrelated products (marketing/forms site
vs. a healthcare application with materially different security and
compliance obligations), and mixing them would blur audit boundaries and
deployment pipelines. This plan document is placed in the current repo only
because that's where this planning task was initiated; the recommendation
above should be confirmed with the user before any code is written.

---

## 10. Development Milestones

Each milestone follows the required process (explain → identify files →
implement → test → lint/typecheck → security review → report completed work
→ report limitations → no production-readiness claims without evidence).

- **M0 — Scaffolding:** monorepo setup, CI pipeline, empty Next.js apps,
  Prisma connected to a local/staging Postgres, `.env.example`, synthetic
  seed data script with the two example patients from the spec.
- **M1 — Accounts:** patient signup/login/logout, consent acknowledgment,
  basic profile, account deletion; pharmacist login with MFA.
- **M2 — Medications:** manual medication entry (name/strength/form/
  directions), optional photo attachment (stored, not OCR'd — MVP requires no
  OCR reliance), medication list on home screen.
- **M3 — Ask a Question (AI, no pharmacist yet):** question submission flow,
  deterministic + LLM safety pass, medication resolution, clarifying
  questions, general education generation with synthetic RAG grounding,
  clear AI-generated labeling.
- **M4 — Ask a Pharmacist:** structured summary generation, pharmacist
  request creation, pharmacist dashboard queue + request detail view, secure
  response messaging, claim/complete/escalate actions.
- **M5 — Conversation history:** patient-facing history of AI and pharmacist
  conversations with status.
- **M6 — Escalation framework:** `escalation_rules` table + rule engine,
  emergency-guidance UI, architecture proven with a conservative starter rule
  set (explicitly not clinically validated yet — flagged as a limitation).
- **M7 — Analytics:** event emission for the metrics listed in the spec (§
  "MVP Success Metrics"), minimal-collection principle enforced.
- **M8 — Hardening pass:** accessibility check, PWA install flow, security
  review across all prior milestones, load/rate-limit testing.

No milestone beyond M8 (OCR, org accounts, billing, SSO) is in scope until
explicitly requested.

---

## 11. Testing Strategy

- **Unit tests** (Vitest) for domain services and the AI service layer's
  non-LLM logic (rule engine, output schema validation, medication
  resolution matching).
- **Integration tests** for API endpoints against a test database, covering
  RBAC boundaries explicitly (a patient cannot read another patient's data;
  a pharmacist cannot see unassigned queue items outside allowed states).
- **AI evaluation tests:** a golden set of representative patient questions
  (including deliberately adversarial ones — "should I double my dose,"
  "diagnose my rash," urgent-symptom phrasing) run against the AI service
  layer with automated assertions that guardrails hold (no diagnosis/dose-
  change language, safety pass triggers correctly, output matches schema).
  This suite gates any prompt or model change.
- **End-to-end tests** (Playwright) for the two golden paths: patient asks a
  question → gets education → requests pharmacist review; pharmacist opens
  request → responds → patient sees the response.
- **Security checks:** dependency vulnerability scanning in CI, basic SAST,
  and a manual security review checklist per milestone (per the required
  process).
- **Accessibility:** automated axe checks in CI plus manual keyboard/
  screen-reader pass on the patient app given its consumer-facing,
  non-technical audience.

---

## 12. Deployment Strategy

- **Environments:** local dev → staging (synthetic data only, mirrors prod
  config) → pilot/production (gated — see below).
- **CI/CD:** GitHub Actions runs lint, typecheck, unit/integration tests, and
  the AI evaluation suite on every PR; deploys to staging automatically on
  merge to main; production deploys are manual/approved.
- **Migrations:** Prisma Migrate, applied via CI with a manual approval step
  for production.
- **Production gate:** production deployment with real patient data is
  explicitly blocked until the legal/compliance/vendor BAA requirements in §8
  are satisfied and signed off — this is a hard gate, not a target date.
- **Rollback:** every deploy is tied to a migration-reversible release;
  feature flags reserved for risky changes (e.g., swapping the AI provider or
  retrieval backend) rather than relying on redeploys to roll back behavior.

---

## 13. Risks

- **Clinical/regulatory risk:** the line between "general education" and
  "practicing medicine/pharmacy" must be reviewed by licensed pharmacists and
  ideally counsel before pilot launch — this architecture enforces the
  *technical* boundary but cannot certify the *clinical* boundary.
- **Regulatory classification risk:** depending on how directive the AI
  guidance becomes, this could approach FDA Software-as-a-Medical-Device
  territory; the strict "general education only, pharmacist owns clinical
  judgment" boundary must be maintained deliberately, not just by prompt
  wording.
- **HIPAA/BAA risk:** no real PHI should enter the system until BAAs are in
  place with every vendor in the data path (hosting, AI provider, error
  tracking, email). This is the single biggest go/no-go gate before a real
  pilot.
- **AI safety/hallucination risk:** even with guardrails, LLM outputs can be
  wrong or subtly non-compliant with the MUST NOT list; the multi-layer
  guardrail design in §7 mitigates but does not eliminate this — ongoing
  human (pharmacist) review of AI summaries is required, not optional.
  
- **Pharmacist licensure risk:** multi-state licensure/telepharmacy rules
  affect which pharmacists can respond to which patients; this needs
  operational/legal design before the pilot scales beyond one state.
- **Data source risk:** RxNorm/DailyMed integration is free but requires a
  real ingestion/maintenance pipeline; underestimate this and the "authoritative
  medication data" promise becomes stale or wrong.
- **Cost/latency risk:** every AI-assisted question involves multiple LLM
  calls (safety pass, classification, generation, summarization); needs cost
  monitoring and prompt-caching from day one, not after the pilot.
- **Adoption/business risk:** the entire MVP exists to answer whether
  patients will use it and whether a telehealth partner will pay for it — over-
  building before that signal exists is itself a risk the spec explicitly
  calls out.
- **Scope creep risk:** the spec's own biggest risk — OCR, org accounts,
  billing, and SSO are architecturally reserved but must stay out of the
  build until the MVP question is answered.

---

## Next Step

This document completes Step 1. No application code has been written.
Awaiting confirmation to proceed with **M0 — Scaffolding**, and confirmation
on whether DosePrepped should live in its own repository (recommended, §9)
rather than inside MySupervisely1.
