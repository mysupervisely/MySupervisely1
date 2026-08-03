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

## M3 — The Digital Medication-Support Layer (Architecture Update)

**Status: planning only. Nothing in this section has been implemented.**
M0 (foundation), M1 (auth/RBAC), and M2 (patient medication profiles) are
built, tested, and merged. This section is the architecture update
requested before M3 implementation begins, produced without touching the
codebase.

### Product direction update

DosePrepped is repositioning from "AI triage box that leads to a pharmacist
chat" to a **digital medication-support layer** that accompanies a
patient's medication over time:

```
Medication added
  → Medication education
  → Medication schedule/adherence
  → Patient check-ins
  → Medication questions
  → AI-assisted question organization / general education
  → Pharmacist support when appropriate
  → Escalation to the patient's healthcare provider when appropriate
```

Two things do **not** change: DosePrepped still does not replace the
dispensing pharmacy's own dispensing/counseling duties, and it still does
not replace a physician or prescriber. What changes is the framing — the
medication list built in M2 is not just a record, it's the anchor that
education, adherence, check-ins, and questions all attach to over the
medication's lifetime. M3 (and the milestones after it) build the pieces of
that support layer one at a time; this document only covers the pieces
needed for the *medication question* pathway, since that's what's
architecturally load-bearing for everything else (schedule/adherence and
check-ins are explicitly **not** designed in detail here and remain future
work — see "Required changes to M0–M2" for how the data model leaves room
for them without redesign).

**Standing design constraint — not a chatbot.** The workflow is a bounded,
structured intake, not an open-ended conversation:

```
PATIENT
  → SELECT MEDICATION
  → DESCRIBE QUESTION/CONCERN
  → DOSEPREPPED STRUCTURES THE INFORMATION
  → GENERAL MEDICATION EDUCATION WHERE APPROPRIATE
  → PHARMACIST REVIEW WHEN APPROPRIATE
  → PROVIDER ESCALATION WHEN APPROPRIATE
```

Concretely: a question always starts from a specific medication (never a
blank chat box), category selection is a first-class structuring step (not
an AI afterthought), and AI is allowed **at most one** clarifying question
before it must produce an education response or defer to a pharmacist —
there is no multi-turn free chat loop anywhere in this design. Every AI
touchpoint below is a discrete, typed operation with a defined input and
output, not a conversational agent.

### 1. Patient medication journey model

The medication itself (`PatientMedication`, built in M2) is the aggregate
root of the journey; everything else is a timeline of interactions that
reference it:

```
PatientMedication (M2 — exists today)
  ├─ MedicationQuestion[]        (M3 — this document)
  ├─ MedicationEducationView[]   (future — "viewed education" events)
  ├─ AdherenceCheckIn[]          (future — schedule/adherence milestone)
  └─ ScheduleReminder[]          (future — reminders milestone)
```

M3 does not introduce a single unifying "event" table (e.g. an
event-sourced `MedicationTimelineEvent`). That's deliberately deferred:
with only one interaction type (questions) in scope, a dedicated timeline
table is premature abstraction. A medication's timeline view (needed for
the medication detail screen — see "UI changes") can be assembled today by
querying `MedicationQuestion` filtered by `medicationId`, ordered by
`createdAt`. Revisit a unified timeline table only once a second and third
interaction type (education views, check-ins) actually exist and a
combined feed is genuinely needed — not preemptively.

### 2. Medication question data model

A new `MedicationQuestion` entity anchors the whole feature. Key design
decision: it stores a **point-in-time snapshot** of the medication's
relevant fields (name, strength, directions, frequency, route) at the
moment the question was asked, in addition to the `medicationId` foreign
key. If the patient later edits that medication's directions (M2's
`PATCH /medications/:id`), a historical question must still show what the
patient and pharmacist actually saw and discussed — not the current,
possibly-different values. This is the same "don't let a live record
silently rewrite history" principle M2 already applies by archiving
instead of deleting.

See "Database changes" below for the full field list.

### 3. Question categories

```
GENERAL_INFO       — general information about the medication
ADMINISTRATION     — how to take it
MISSED_DOSE        — missed-dose handling
SIDE_EFFECT        — side effect / adverse effect
DRUG_INTERACTION   — interaction with another medication/substance
STORAGE            — storage conditions
ADHERENCE          — trouble taking it consistently
COST_ACCESS        — affordability / access to the medication
OTHER              — anything else
```

Category is **patient-selected first**, not purely AI-inferred: the
question composer presents these eight categories (plus Other) as an
explicit step before the free-text question box. This does three things —
it's itself a structuring action (reinforcing "not a chatbot"), it gives a
deterministic classification that works even if AI is degraded or
unavailable, and it lets the AI's own suggested category
(`aiSuggestedCategory`, stored separately) be compared against the
patient's choice for QA/analytics rather than silently overriding it.

Only `DRUG_INTERACTION` and `SIDE_EFFECT` trigger capturing a minimal
snapshot of the patient's *other* active medications (name + strength
only) as context — every other category leaves that field null, per the
minimum-necessary-data principle (see "What NOT to store").

### 4. Initiating a question from a specific medication

Two converging entry points, both landing on the same composer:

1. **Home → "Ask a question"** (existing placeholder CTA from M0/M1): if no
   medication is pre-selected, first shows a medication picker drawn from
   the patient's own medication list (M2) — active medications by default,
   with inactive ones selectable too (a patient may reasonably ask about a
   medication they just stopped).
2. **Medication detail screen (M2) → new "Ask about this medication" CTA**:
   skips the picker, medication pre-selected from context.

Both converge on: category selection → free-text question → (at most one)
AI clarifying question → education response → optional "Ask a Pharmacist."
This directly reuses M2's medication list/detail infrastructure instead of
building a parallel medication-selection UI.

### 5. The question structuring pipeline

"Structuring" happens in two layers, and the first layer works with AI
completely disabled:

**Layer 1 — deterministic (no AI required).** On submission, the API
assembles a structured record from data it already has: the medication
snapshot (from the patient's own `PatientMedication` row — already
patient-resolved, no "medication identification" NLP problem to solve
here, unlike a from-scratch chatbot), the patient-selected category, the
verbatim question text, and (for interaction/side-effect categories) the
minimal other-active-medications snapshot. This alone is enough to create
a well-formed, pharmacist-reviewable question even with zero AI
involvement — which is the fallback behavior if AI is down, disabled, or
not yet built for a given deployment.

**Layer 2 — AI-assisted enrichment (optional, layered on top).** Given the
Layer 1 structured record, the AI Service Layer (see §7 of the original
architecture, "AI Architecture") runs, in order: a safety/urgency check, a
category-suggestion pass, at most one clarifying question if the free text
is ambiguous, then a general-education generation pass grounded in the
medication snapshot and (later) retrieved reference content. Every one of
these is a single bounded call with a typed output — never a freeform
chat completion appended to a growing transcript.

### 6. AI integration points

Extending the AI Service Layer already specified in the original
architecture doc (§7), now tied concretely to `MedicationQuestion`:

| Operation | Input | Output | Gate |
|---|---|---|---|
| `detectSafetyConcern` | question text | `QuestionDisposition` (ROUTINE / PHARMACIST_RECOMMENDED / URGENT_CARE_GUIDANCE) | Deterministic keyword/rule pass first; LLM-assisted second pass only if the rule pass doesn't already flag it. Runs **before** any other AI step and can short-circuit the rest. |
| `suggestCategory` | question text | `QuestionCategory` | Advisory only — never overrides the patient's own selection. |
| `generateClarifyingQuestion` | question text, category, medication snapshot | one question string, or none | Fires at most once per question. If the patient's answer is still ambiguous, proceed to education/pharmacist anyway rather than asking again. |
| `generateEducation` | question text, category, medication snapshot, clarifying Q&A, retrieved reference content | education text, `is_ai_generated: true` | Only runs if disposition is `ROUTINE`. Enforces the same MUST NOT list from the original AI Architecture section (no diagnosis, no dose changes, no telling a patient to stop a prescription, etc.), independently re-verified here since this is a new call site. |
| `summarizeForPharmacist` | full structured record | structured JSON (never prose) | Runs when the patient requests pharmacist review, or automatically when disposition is `PHARMACIST_RECOMMENDED`. |

AI never talks to the patient outside of these five typed operations. There
is no persistent chat session object and no endpoint that accepts arbitrary
freeform follow-up messages against a question.

### 7. Pharmacist workflow integration points

M1 already created the `PHARMACIST` role, a role-gated placeholder route
(`/pharmacist/ping`), and a placeholder pharmacist home page. M3's
architecture is designed to attach real functionality to exactly those
seams rather than requiring rework:

- **Queue.** A question enters the pharmacist-visible queue when its status
  becomes `PHARMACIST_REQUESTED` — either the patient tapped "Ask a
  Pharmacist," or the safety-check pass set disposition to
  `PHARMACIST_RECOMMENDED` and the system auto-requested review.
- **Claim.** A pharmacist claims an unclaimed queued question
  (`pharmacistId` set, status → `PHARMACIST_IN_PROGRESS`). Claiming is
  exclusive — once claimed, the question drops out of other pharmacists'
  unclaimed queue view.
- **Respond.** The pharmacist sees the structured record — patient
  question, medication snapshot, category, AI education (clearly labeled
  AI-generated, never presented as the pharmacist's own judgment) — and
  writes a response. Status → `PHARMACIST_RESOLVED`.
- **Escalate.** Instead of responding, the pharmacist can escalate (see
  §8) with a required reason.
- **Request clarification.** Out of scope for M3's data model as a full
  two-way thread (that's the "secure messaging" feature from the original
  architecture's M4 sketch); for now, `WAITING_FOR_PATIENT` is reserved as
  a status value but the actual back-and-forth UI is not designed here.

Building the pharmacist dashboard UI itself (queue screen, claim/respond
actions) is intentionally sequenced *after* the data model and patient-side
flow — see "Recommended implementation sequence."

### 8. Provider escalation architecture

Two distinct triggers, both landing on the same `ESCALATED` status:

1. **Intake-time, automatic.** The deterministic safety-check pass (§6)
   flags `URGENT_CARE_GUIDANCE` before any AI or pharmacist involvement.
   The patient is shown clear, non-diagnostic guidance to seek appropriate
   care — DosePrepped does not attempt to triage or manage the situation
   itself, matching the original architecture's "Safety/Escalation"
   section. No professionally-reviewed triage protocol exists yet; this
   document does not invent one, and the rule set stays intentionally
   conservative and small (a handful of clearly-urgent keyword patterns)
   until clinically reviewed rules are available.
2. **Pharmacist-initiated.** During review, a pharmacist determines the
   question is beyond general medication guidance (needs a dose change,
   a new/worsening symptom needs clinical evaluation, etc.) and escalates
   with a required `escalationReason`.

**What escalation is *not*, in this architecture:** an automated referral,
an EHR integration, or a message sent to a named provider on the patient's
behalf. DosePrepped has no provider accounts or EHR connectivity, and none
is being built now. Escalation means: the patient is clearly told to
contact their prescriber or usual care source, with the structured context
of what was discussed. The one forward-looking exception is B2B (§13/16
below): if the patient was enrolled through a telemedicine organization,
that organization *is* effectively "the provider," so an escalation event
is a natural future webhook/notification target for that organization —
architected for, not built now.

### 9. Distinguishing education, pharmacist review, and provider evaluation

A concrete three-tier rule, not just an architectural nicety:

- **General education (AI, immediate):** factual, generic-to-the-medication
  information that doesn't require interpreting the patient's specific
  situation — "how does this medication generally work," "what does
  'take with food' mean." Always labeled AI-generated. Only produced when
  disposition is `ROUTINE`.
- **Pharmacist review (human, asynchronous):** anything requiring judgment
  applied to *this patient's* specific situation within a
  pharmacist's scope — interaction concerns, side-effect management,
  adherence troubleshooting, cost/access alternatives. Triggered by
  patient request, by `PHARMACIST_RECOMMENDED` disposition, or by the AI
  education step itself declining to answer generically (low confidence →
  defer to pharmacist rather than guess).
- **Provider/medical evaluation (human, off-platform):** anything implying
  a treatment-plan change, a new or worsening symptom needing diagnosis, or
  genuine urgency. Never handled by AI or pharmacist alone — either the
  intake-time safety check routes here directly, or a pharmacist recognizes
  it during review and escalates. This tier is always a redirect *out* of
  DosePrepped to the patient's own care team, never something the product
  attempts to resolve itself.

### 10. Ownership and authorization

Extends the ownership pattern M2 already established
(`{ id, patientId: request.user.id }` scoped queries, 404-not-403 on
mismatch) with a second axis for the pharmacist role:

- **Patient access:** unchanged pattern — a question is only ever
  readable/writable by `patientId === request.user.id`.
- **Pharmacist access:** scoped, not global. A pharmacist may read a
  question only if it's unclaimed and in the shared queue
  (`status = PHARMACIST_REQUESTED`, `pharmacistId = null`) or if
  `pharmacistId === request.user.id` (their own claimed request). A
  pharmacist must **not** be able to browse a patient's full question
  history or medication list outside of a specific assigned request — this
  is a least-privilege / minimum-necessary-access requirement, not just a
  nice-to-have. If a pharmacist genuinely needs broader context on a
  specific request (e.g. the patient's full active medication list, not
  just the snapshot), that should be a deliberate, logged "view full
  profile" action scoped to that request — not ambient access.
- **Admin access:** no new admin capability is being designed here. Any
  future admin access to question content should be audit-logged the same
  way pharmacist access is.

### 11. Analytics architecture

Extends the minimal `analytics_events` concept from the original
architecture (§11) with question-specific events, still under the
"collect only what's needed, no unnecessary PII" rule:

```
question_submitted          {category, medicationId, hasClarifyingRound}
ai_education_generated      {questionId, disposition}
pharmacist_request_created   {questionId, autoRequested: bool}
pharmacist_request_claimed    {questionId, responseLatencyFromCreateMs}
pharmacist_response_sent       {questionId, responseTimeMs}
question_resolved               {questionId}
question_escalated               {questionId, reason}
```

Combined with `MedicationQuestion`'s own timestamps, this supports every
metric asked for without a separate reporting pipeline:

- **Questions per medication** — `count(*) group by medicationId`.
- **Question categories** — `count(*) group by category` (and
  `category` vs `aiSuggestedCategory` agreement rate, as a model-quality
  signal).
- **Pharmacist requests / response time** — `pharmacistRespondedAt -
  pharmacistRequestedAt`, aggregated.
- **Provider escalations** — `count(*) where status = 'ESCALATED' group by
  escalationReason`.
- **Patient engagement** — distinct patients with ≥1 question / total
  active patients; return-usage rate over time.
- **Repeat medication questions** — same `patientId` + `medicationId` +
  `category` recurring within a rolling window; a useful *signal to
  surface to the pharmacist* ("this patient has asked about missed doses
  for this medication 3 times this month"), not just a reporting metric.

### 12. What should NOT be stored

Restating and extending the original architecture's "collect only what's
needed" principle for this specific feature:

- No diagnosis, clinical assessment, vitals, or free-text "other health
  conditions" fields — the question flow only ever touches the medication
  the patient selected and (narrowly) their other active medications.
- No payment/insurance details for `COST_ACCESS` questions — that category
  is about affordability *concerns*, not a billing intake form.
- No third-party data pulled from anywhere else (no EHR scraping, no
  pharmacy-of-record integration) — everything comes from what the patient
  entered themselves in DosePrepped.
- No raw AI prompts/chain-of-thought persisted in the primary database —
  only the final structured output (education text, suggested category,
  disposition) is stored. If prompt/completion logging is ever needed for
  AI QA, that belongs in a separate, access-restricted, time-limited log
  store — not the patient-facing data model — and isn't being built now.
- No unnecessary intake friction — the patient should never be asked for
  demographic or clinical detail beyond what a specific category genuinely
  needs (interaction/side-effect context, as noted in §3).

### 13. B2B extensibility

Reaffirms the original architecture's B2B sketch (§ "B2B Design") without
building any of it now: a future nullable `organizationId` on `User` would
let a patient be tagged as enrolled through a specific telemedicine
partner; escalation events (§8) become a natural webhook/notification
trigger for that partner; organization-scoped, aggregate-only analytics
(§11) become possible once that tag exists. No `Organization` table or
`organizationId` column is being added in M3 — this is called out
specifically so it isn't accidentally scope-crept into M3's migration.

### 14. Medication-agnostic design guardrails

Nothing in this design is GLP-1-specific, and it needs to stay that way
deliberately:

- Categories (§3) are generic to any medication class.
- Medication resolution comes entirely from the patient's own
  `PatientMedication` entry (manually entered in M2) — there is no
  GLP-1-specific integration or shortcut anywhere in the intake path.
- Any future drug-class-specific education content (e.g. injection-site
  rotation guidance relevant to GLP-1s and other injectables) belongs in
  the swappable Medication Reference / retrieval layer (§ "Medication Data
  Abstraction Layer"), keyed by medication attributes, never hardcoded into
  application logic or copy.
- Seed/demo data should keep spanning multiple drug classes (already true:
  Lisinopril, Metformin, Semaglutide, Ondansetron) as new synthetic
  examples are added for M3 testing — don't let the demo set drift toward
  GLP-1-only.

### 15. Database changes

Illustrative schema sketch — **not applied to `packages/db/prisma/
schema.prisma` yet.**

```
enum QuestionCategory {
  GENERAL_INFO
  ADMINISTRATION
  MISSED_DOSE
  SIDE_EFFECT
  DRUG_INTERACTION
  STORAGE
  ADHERENCE
  COST_ACCESS
  OTHER
}

enum QuestionDisposition {
  ROUTINE
  PHARMACIST_RECOMMENDED
  URGENT_CARE_GUIDANCE
}

enum QuestionStatus {
  AI_PROCESSING
  AI_ANSWERED
  PHARMACIST_REQUESTED
  PHARMACIST_IN_PROGRESS
  WAITING_FOR_PATIENT      -- reserved; no two-way thread UI designed yet
  PHARMACIST_RESOLVED
  ESCALATED
  CLOSED
}

model MedicationQuestion {
  id                          String
  patient                     User                 -- owner
  patientId                   String
  medication                  PatientMedication
  medicationId                String
  medicationSnapshot          Json                 -- {name, strength, directions, frequency, route} at creation time
  otherMedicationsSnapshot    Json?                -- [{name, strength}], only for DRUG_INTERACTION / SIDE_EFFECT
  category                    QuestionCategory     -- patient-selected
  aiSuggestedCategory         QuestionCategory?
  questionText                String
  clarifyingExchange          Json?                -- {question, answer}, at most one
  disposition                 QuestionDisposition?
  aiEducationResponse         String?
  aiEducationGeneratedAt      DateTime?
  aiModelVersion              String?              -- audit: which model/prompt version produced the response
  status                      QuestionStatus
  pharmacist                  User?
  pharmacistId                String?
  pharmacistRequestedAt       DateTime?
  pharmacistClaimedAt         DateTime?
  pharmacistResponse          String?
  pharmacistRespondedAt       DateTime?
  escalatedAt                 DateTime?
  escalationReason            String?
  resolvedAt                  DateTime?
  createdAt                   DateTime
  updatedAt                   DateTime

  @@index([patientId])
  @@index([status])            -- pharmacist queue lookups
  @@index([medicationId])      -- "questions per medication" analytics
}

model AnalyticsEvent {                              -- minimal, per §11
  id          String
  eventType   String
  questionId  String?
  metadata    Json          -- narrow, no unnecessary PII
  createdAt   DateTime

  @@index([eventType, createdAt])
}
```

Notes on relations to existing M0–M2 models: `MedicationQuestion.patient`
FKs to the existing `User`; `MedicationQuestion.medication` FKs to the
existing `PatientMedication` (no changes needed to that model itself — see
§20); `MedicationQuestion.pharmacist` FKs to `User` where `role =
PHARMACIST`, enforced at the application layer the same way role checks
already are (Prisma doesn't natively constrain a relation by another
column's value).

### 16. API changes

Illustrative endpoint sketch — **no routes added yet.** Follows the same
ownership-scoping, Zod validation, and `requireRole` patterns already
established in `apps/api/src/routes/medications.ts`.

```
POST   /questions                     create (medicationId, category, questionText)
GET    /questions                     patient's own list
GET    /questions/:id                 detail (ownership-scoped, patient)
POST   /questions/:id/clarify         submit answer to the one AI clarifying question
POST   /questions/:id/request-pharmacist    → status PHARMACIST_REQUESTED

# Pharmacist-side (built in a later phase — see §19)
GET    /pharmacist/queue              unclaimed + own claimed requests
POST   /questions/:id/claim
POST   /questions/:id/respond
POST   /questions/:id/escalate
POST   /questions/:id/resolve
```

`POST /questions` is where the structuring pipeline (§5) runs: it always
executes Layer 1 (deterministic) and, once AI is wired up, Layer 2 in
sequence within the same request/response cycle for `ROUTINE`-disposition
questions — no polling or background job is required for M3's scope, since
each AI call is a single bounded operation, not a long-running task.

### 17. UI changes

Illustrative screen sketch — **no screens built yet.**

- **Medication detail (M2, existing):** add "Ask about this medication."
- **Ask a Question flow (replaces the M0/M1 placeholder):** medication
  picker (skipped if pre-selected) → category selector → question text →
  optional single AI clarifying question → AI education response
  (labeled) → "Ask a Pharmacist" CTA → confirmation screen.
- **My Questions (new, parallel to "My Medications"):** list with status
  badges (Answered / Pharmacist requested / Pharmacist responded /
  Escalated).
- **Question detail:** full structured record — question, medication
  snapshot, category, AI education (labeled), pharmacist response when
  present.
- **Pharmacist home (M1 placeholder → real entry point):** becomes the
  entry to the queue in a later phase (§19), not M3 itself.

### 18. Security considerations

- Ownership scoping and pharmacist queue scoping as in §10, enforced
  server-side exactly like M2's medication ownership checks — never
  frontend-only.
- Rate limiting on `POST /questions` (both abuse/spam prevention and AI
  cost control), following the same `@fastify/rate-limit` pattern already
  used for `/auth/login` and `/auth/signup`.
- AI output is never rendered to the patient without an explicit
  AI-generated label, and every education response is re-checked against
  the MUST NOT list (§6) at the point it's about to be shown — not trusted
  purely because the prompt asked nicely.
- Question text and AI/pharmacist responses are treated as sensitive:
  never written to application logs in plaintext, consistent with M2's
  existing "don't log medication content" precedent.
- No new PHI-adjacent surface is exposed in URLs — question IDs are opaque
  UUIDs, matching the medication-ID convention from M2.
- Still not HIPAA compliant, and nothing in this document should be read
  as a claim otherwise; the same technical/operational/legal/vendor gate
  from the original architecture (§8) applies before any real PHI.

### 19. Recommended implementation sequence

Phased so the highest-risk piece (AI/safety) is built and tested in
isolation before anything depends on it, and so each phase ships something
independently demonstrable:

1. **Question intake, no AI, no pharmacist.** `MedicationQuestion` schema
   + migration, `POST/GET /questions`, the composer UI through category +
   question text, "My Questions" list, question detail screen. Proves the
   structuring UX and data model on their own.
2. **Deterministic safety-check layer.** The rule-based (non-LLM) pass for
   `QuestionDisposition`, built and tested in isolation before any LLM
   involvement — this is the most conservative, highest-stakes piece and
   should not be entangled with AI integration work.
3. **AI Service Layer integration.** `suggestCategory`,
   `generateClarifyingQuestion`, `generateEducation`, behind the Phase 2
   safety gate. Ships general education end-to-end.
4. **Pharmacist request + queue.** `POST /questions/:id/request-pharmacist`,
   `summarizeForPharmacist`, the real pharmacist queue/claim/respond flow
   replacing the M1 placeholder pharmacist home.
5. **Provider escalation + analytics.** Pharmacist-initiated escalation,
   the `AnalyticsEvent` table and event emission from every phase above
   (retrofit event emission into phases 1–4 as they ship, rather than
   bolting it on at the end).

Explicitly **not** part of this sequence: two-way secure messaging threads
(`WAITING_FOR_PATIENT` stays a reserved-but-unbuilt status), adherence
check-ins, schedule/reminders, and B2B organization support. Each is a
separate future milestone building on this foundation, not M3 itself.

### 20. Required changes to M0–M2

Reviewed against the existing implementation; nothing here is breaking:

- **`PatientMedication` (M2): no schema change required.** Questions
  reference it by FK plus their own snapshot (§2) — the medication model
  itself doesn't need new fields for M3.
- **Inactive medications remain askable.** The medication picker (§4) must
  include `INACTIVE` medications, not just `ACTIVE` ones — a small but
  important product decision, not a code change to M2 itself.
- **Auth/session/RBAC (M1): no changes required.** The `PATIENT` and
  `PHARMACIST` roles already exist; M3 only adds new authorization *rules*
  (queue scoping, §10) evaluated with the same `requireRole`/ownership
  patterns already in place, not new role types.
- **Placeholder screens (M0/M1) are the intended attachment points**, not
  dead weight to be reworked: "Ask a Question," "Ask a Pharmacist," and the
  pharmacist home page were placeholders precisely so this milestone could
  replace their content without restructuring routes or layouts.
- **`packages/ai-service` is net-new** — the original architecture (§4)
  specified this package but it was never built in M0–M2 (M0–M2 correctly
  had no AI functionality in scope). It's created in Phase 3 of §19, not
  before.
- No changes needed to `packages/auth`, `packages/types`, or the CORS/
  cookie/rate-limit plugin setup in `apps/api`.

---

## Next Step

M0, M1, and M2 are implemented, tested, and merged. This M3 architecture
update is planning only — no code has been written or modified for it.
Awaiting direction on which phase of §19 to start with (the recommendation
is Phase 1: question intake with no AI and no pharmacist involvement yet).
