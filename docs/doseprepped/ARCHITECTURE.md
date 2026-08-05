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
relevant fields (name, strength, dosage form, directions, frequency,
route — `dosageForm` added in M4 so the pharmacist review screen can show
it without a live lookup; every field before it was captured since Phase
1) at the moment the question was asked, in addition to the
`medicationId` foreign key. If the patient later edits that medication's
directions (M2's
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

**Layer 1 — deterministic (no AI required, no AI permitted to be
required).** On submission, the API assembles a structured record from
data it already has: the medication snapshot (from the patient's own
`PatientMedication` row — already patient-resolved, no "medication
identification" NLP problem to solve here, unlike a from-scratch chatbot),
the patient-selected category, the verbatim question text, and (for
interaction/side-effect categories) the minimal other-active-medications
snapshot. **As of Phase 2, this layer also assigns the question's
`disposition`** (`GENERAL_EDUCATION` / `PHARMACIST_REVIEW` /
`PROVIDER_EVALUATION` / `URGENT_EMERGENCY`) via a standalone,
non-AI rule engine — see "Deterministic Safety & Disposition Rule Engine"
below. Layer 1 alone is enough to create a well-formed, pharmacist- or
provider-routable question even with zero AI involvement — which is the
fallback behavior if AI is down, disabled, or not yet built for a given
deployment, and is in fact *all* that exists in the codebase today.

**Layer 2 — AI-assisted enrichment (future, optional, layered on top).**
Given the Layer 1 structured record — including its already-assigned
disposition — a future AI Service Layer (see §7 of the original
architecture, "AI Architecture") would run, in order: an optional
LLM-assisted *refinement* of the deterministic disposition (which may only
escalate it toward more caution, never downgrade it — see the "conservative
floor" principle below), a category-suggestion pass, at most one clarifying
question if the free text is ambiguous, then a general-education generation
pass grounded in the medication snapshot and (later) retrieved reference
content. Every one of these is a single bounded call with a typed output —
never a freeform chat completion appended to a growing transcript. None of
Layer 2 is implemented yet.

### 6. AI integration points

Extending the AI Service Layer already specified in the original
architecture doc (§7), now tied concretely to `MedicationQuestion`. **None
of the operations below are implemented yet** — disposition assignment,
implemented in Phase 2, is deliberately *not* one of these AI operations;
see "Deterministic Safety & Disposition Rule Engine" below for what
actually runs today.

| Operation | Input | Output | Gate |
|---|---|---|---|
| `refineDisposition` (optional, future) | question text, the deterministic disposition already assigned | `QuestionDisposition` | An LLM-assisted second opinion layered *on top of* the deterministic result from Phase 2 — never a replacement for it. May only move the disposition toward more caution (e.g. `PHARMACIST_REVIEW` → `PROVIDER_EVALUATION`), never downgrade it. If unavailable, the deterministic disposition stands unchanged — this is what "AI-independent operation" means in practice. |
| `suggestCategory` | question text | `QuestionCategory` | Advisory only — never overrides the patient's own selection. |
| `generateClarifyingQuestion` | question text, category, medication snapshot | one question string, or none | Fires at most once per question. If the patient's answer is still ambiguous, proceed to education/pharmacist anyway rather than asking again. |
| `generateEducation` | question text, category, medication snapshot, clarifying Q&A, retrieved reference content | education text, `is_ai_generated: true` | Only runs if disposition is `GENERAL_EDUCATION`. Enforces the same MUST NOT list from the original AI Architecture section (no diagnosis, no dose changes, no telling a patient to stop a prescription, etc.), independently re-verified here since this is a new call site. |
| `summarizeForPharmacist` | full structured record | structured JSON (never prose) | Runs when the patient requests pharmacist review, or automatically when disposition is `PHARMACIST_REVIEW` or `PROVIDER_EVALUATION`. |

AI never talks to the patient outside of these typed operations. There
is no persistent chat session object and no endpoint that accepts arbitrary
freeform follow-up messages against a question.

### 7. Pharmacist workflow integration points

M1 already created the `PHARMACIST` role, a role-gated placeholder route
(`/pharmacist/ping`), and a placeholder pharmacist home page. M3's
architecture is designed to attach real functionality to exactly those
seams rather than requiring rework:

- **Queue (implemented, M4).** A question enters the pharmacist-visible
  queue automatically, at creation time, when the deterministic disposition
  (Phase 2) is `PHARMACIST_REVIEW` or `PROVIDER_EVALUATION` — `status` is
  set directly to `PHARMACIST_REQUESTED` in the same `POST /questions`
  request/response cycle that assigns the disposition, with
  `pharmacistRequestedAt` stamped at the same moment. There is no separate
  patient-initiated "Ask a Pharmacist" request endpoint in M4 — see "Why
  queue entry is automatic, not patient-initiated" in the M4 section below.
  `GENERAL_EDUCATION` questions never enter the queue (AI already fully
  answered them); `URGENT_EMERGENCY` questions never enter the queue either
  (never handled by AI or pharmacist, per §9).
- **Claim (implemented, M4).** A pharmacist claims an unclaimed queued
  question (`pharmacistId` set, `pharmacistClaimedAt` stamped, status →
  `PHARMACIST_IN_PROGRESS`) via a single atomic conditional database update
  — see "Claim concurrency" in the M4 section below for exactly how
  simultaneous claim attempts are resolved. Claiming is exclusive — once
  claimed, the question drops out of other pharmacists' unclaimed queue
  view (enforced by the ownership-scoping query itself, §10).
- **Release (implemented, M4).** The claiming pharmacist may release a
  question they haven't yet resolved back to the shared queue
  (`pharmacistId`/`pharmacistClaimedAt` cleared, status →
  `PHARMACIST_REQUESTED`) — the "reassignment" mechanism this architecture
  anticipated: releasing simply makes the question claimable by anyone
  again, rather than targeting a specific other pharmacist.
- **Respond (implemented, M4).** The pharmacist sees the structured record
  — patient question, medication snapshot, category, AI education and AI
  pharmacist summary (clearly labeled AI-generated, never presented as the
  pharmacist's own judgment) — and writes a response, stored in the
  existing `pharmacistResponse` field, distinct from `aiEducationResponse`.
  Status → `PHARMACIST_RESOLVED`, `resolvedAt` stamped.
- **Escalate (implemented, M4).** Instead of responding, the pharmacist can
  escalate (see §8) with a required structured reason.
- **Request clarification.** Still out of scope — `WAITING_FOR_PATIENT`
  remains a reserved-but-unbuilt status; the two-way patient/pharmacist
  thread is still a future milestone, not M4.

The pharmacist dashboard UI (queue screen, claim/respond/escalate actions)
is built in M4 directly on top of the M1 placeholder pharmacist home page
and the M0/M1 `PHARMACIST` role/route-gating seam, per "Recommended
implementation sequence."

### 8. Provider escalation architecture

Two distinct triggers, both landing on the same `ESCALATED` status:

1. **Intake-time, automatic (`URGENT_EMERGENCY` only).** The deterministic
   disposition rule engine (Phase 2) assigns `URGENT_EMERGENCY` before any
   AI or pharmacist involvement, and the patient is shown clear,
   non-diagnostic guidance to seek appropriate care immediately —
   DosePrepped does not attempt to triage or manage the situation itself.
   This never transitions `status` to `ESCALATED` and never creates a
   pharmacist queue entry — `URGENT_EMERGENCY` questions are deliberately
   never handled by AI or pharmacist (§9), full stop, not escalated *from*
   pharmacist review. `PROVIDER_EVALUATION` is **not** an automatic
   `ESCALATED` transition — as of M4, it's a disposition that queues the
   question for pharmacist review like `PHARMACIST_REVIEW`, and it's the
   pharmacist, not the intake step, who decides whether the situation
   truly needs `ESCALATED` handling (trigger 2 below). No
   professionally-reviewed triage protocol exists yet; this document does
   not invent one, and the rule set stays intentionally small and
   conservative until clinically reviewed rules are available.
2. **Pharmacist-initiated (implemented, M4).** During review (from
   `PHARMACIST_IN_PROGRESS`, after claiming), a pharmacist determines the
   question is beyond general medication guidance (needs a dose change, a
   new/worsening symptom needs clinical evaluation, etc.) and escalates
   with a required structured reason — `escalationReasonCategory` (a
   closed enum, see "Database changes" in the M4 section below) plus the
   existing free-text `escalationReason` field for the pharmacist's own
   explanation. Status → `ESCALATED`, `escalatedAt` stamped. The escalating
   pharmacist is always the question's `pharmacistId` — escalation is only
   reachable from a question the pharmacist has already claimed, so there
   is no separate "who escalated" field to add.

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

A concrete four-way rule (expanded from three to four in Phase 2 — see
"Why four dispositions, not three" below), not just an architectural
nicety:

- **General education (`GENERAL_EDUCATION`, future AI, immediate):**
  factual, generic-to-the-medication information that doesn't require
  interpreting the patient's specific situation — "how does this
  medication generally work," "what does 'take with food' mean." Would
  always be labeled AI-generated once Layer 2 exists; **as of Phase 2, no
  education is actually generated for this disposition yet** — the patient
  sees only the routing message, not content.
- **Pharmacist review (`PHARMACIST_REVIEW`, human, asynchronous):**
  anything requiring judgment applied to *this patient's* specific
  situation within a pharmacist's scope — interaction concerns,
  side-effect management, adherence troubleshooting, cost/access
  alternatives. Triggered by patient request (future), by a
  `PHARMACIST_REVIEW` deterministic disposition (Phase 2, implemented), or
  by a future AI education step declining to answer generically (low
  confidence → defer to pharmacist rather than guess).
- **Provider/medical evaluation (`PROVIDER_EVALUATION`, human,
  off-platform, non-emergency):** concerning symptoms, possible adverse
  reactions, or medication errors that fall short of the explicit
  emergency signals below but still call for clinical evaluation rather
  than general education or pharmacist-only guidance. Implemented in
  Phase 2 as a deterministic disposition; no messaging/referral exists yet
  (§8).
- **Urgent/emergency (`URGENT_EMERGENCY`, immediate redirect):** signals
  consistent with a medical emergency (see the rule engine below).
  Implemented in Phase 2. Never handled by AI or pharmacist — the
  deterministic safety check routes here directly and the patient is shown
  emergency-care guidance immediately, bypassing everything else.

Both `PROVIDER_EVALUATION` and `URGENT_EMERGENCY` are always a redirect
*out* of DosePrepped to the patient's own care team (or emergency
services), never something the product attempts to resolve itself.

### Deterministic Safety & Disposition Rule Engine (implemented in Phase 2)

**Status: implemented.** This section documents `packages/safety-rules`,
the module that assigns every `MedicationQuestion`'s `disposition` today.
Everything in this section is deterministic — no LLM call is made or
required anywhere in this engine.

#### Why four dispositions, not three

Phase 1's schema sketch (§15, original) used a 3-value
`QuestionDisposition` (`ROUTINE` / `PHARMACIST_RECOMMENDED` /
`URGENT_CARE_GUIDANCE`) carried over from the pre-M3 architecture. Building
the actual rule engine surfaced a real gap: that set conflated "this needs
a pharmacist's judgment" with "this needs a provider's judgment," and had
no way to represent "concerning, needs clinical evaluation, but not an
emergency" separately from "this is an emergency, bypass everything."
Per this document's own §9 three-tier framing (education / pharmacist /
provider) plus the explicit urgent-care carve-out from the original
architecture's Safety/Escalation section, the correct model is four
values, not three:

```
GENERAL_EDUCATION   — factual, generic-to-the-medication (§9 tier 1)
PHARMACIST_REVIEW   — needs judgment on this patient's specific situation (§9 tier 2)
PROVIDER_EVALUATION — concerning; needs clinical evaluation; not an emergency (§9 tier 3, non-urgent)
URGENT_EMERGENCY    — immediate redirect to emergency/urgent care (§9 tier 3, urgent)
```

This is a schema change from the original Phase 1 sketch, made here per
"update the architecture before modifying the schema" — `disposition` was
never populated in Phase 1 (always `null`), so renaming/expanding the enum
carries no data-migration risk.

#### Design principle: deterministic first, AI never required

The engine is a plain TypeScript package (`packages/safety-rules`) with
**no dependency on `packages/db`, any HTTP framework, or any AI/LLM
client.** It's a pure function: `(questionText, category) →
{ disposition, matchedRuleIds, ruleSetVersion }`. This is what makes "the
system must continue to function if the AI service is unavailable" true by
construction, not by fallback logic — there is no AI in this code path to
fail. A future `refineDisposition` AI operation (§6) would call this
engine first, then optionally escalate its result — it structurally cannot
run instead of it.

#### The algorithm

Two layers, applied in order, taking the *most severe* result:

1. **Category baseline.** The patient's own category selection (§3) is
   itself a structured, unambiguous signal — not inferred, not guessed —
   and maps to a baseline disposition per this document's §9 tier
   definitions:

   | Category | Baseline | Why |
   |---|---|---|
   | `GENERAL_INFO` | `GENERAL_EDUCATION` | Generic factual information about the medication itself |
   | `ADMINISTRATION` | `GENERAL_EDUCATION` | Generic "how to take it" guidance |
   | `STORAGE` | `GENERAL_EDUCATION` | Generic storage conditions |
   | `MISSED_DOSE` | `PHARMACIST_REVIEW` | Correct missed-dose handling is medication-dependent and can be unsafe if generic advice is misapplied |
   | `SIDE_EFFECT` | `PHARMACIST_REVIEW` | Explicitly "pharmacist scope" per §9 |
   | `DRUG_INTERACTION` | `PHARMACIST_REVIEW` | Explicitly "pharmacist scope" per §9 |
   | `ADHERENCE` | `PHARMACIST_REVIEW` | Explicitly "pharmacist scope" per §9 |
   | `COST_ACCESS` | `PHARMACIST_REVIEW` | Explicitly "pharmacist scope" per §9 (alternatives, assistance programs) |
   | `OTHER` | `PHARMACIST_REVIEW` | Uncategorized → default toward human review, not toward answering |

   This is deliberately *not* a 50/50 split for the sake of it: three
   categories are generic-enough-to-educate-on, six are not, matching this
   document's own repeated principle that anything patient-specific
   defaults to a human.

2. **Escalation patterns.** A small, named set of pattern-based rules scans
   the question text for signals that override the category baseline
   *upward* (toward more caution) — never downward. Each rule has a stable
   `id`, a clinician-readable `description` of what it targets and why,
   and maps to exactly one of the two escalation dispositions:

   **→ `URGENT_EMERGENCY`:**
   - `anaphylaxis-or-severe-allergic-reaction` — swelling of the
     face/lips/tongue/throat, difficulty breathing, or the word
     "anaphylaxis" itself.
   - `possible-overdose-or-poisoning` — explicit mention of overdose or
     poisoning, or taking a clearly excessive quantity.
   - `loss-of-consciousness-or-unresponsiveness` — passed out, unconscious,
     unresponsive, not breathing.
   - `chest-pain-or-severe-cardiac-symptom` — chest pain or
     crushing chest sensation.
   - `suicidal-ideation-or-self-harm` — statements suggesting intent to
     harm oneself.

   **→ `PROVIDER_EVALUATION`:**
   - `severe-or-rapidly-worsening-symptom` — explicit "severe," "getting
     worse," "rapidly worsening," uncontrolled symptoms, or specific
     concerning combinations (e.g. blood in stool/vomit/urine, spreading
     rash/hives).
   - `medication-error-with-potential-harm` — reports of taking/giving the
     wrong medication, wrong dose, doubling a dose, or a similar error,
     without an explicit emergency signal already present.

   If **any** `URGENT_EMERGENCY` rule matches, that's the final result,
   full stop — no further evaluation. Else if any `PROVIDER_EVALUATION`
   rule matches, that's the result. Else, the category baseline stands.

   The exact regular expressions are the actual reviewable artifact and
   live in `packages/safety-rules/src/rules.ts` next to each rule's `id`
   and `description` — this document intentionally describes *what each
   rule targets and why*, not the regex itself, so this section stays
   accurate without needing to track pattern-syntax edits line-for-line. A
   clinical reviewer auditing the rule set should read that file directly.

#### Rule versioning

`packages/safety-rules` exports a single `SAFETY_RULE_SET_VERSION`
constant (date-stamped, e.g. `"2026-08-04.1"`). Every disposition a
question receives stores this exact version string
(`safetyRuleSetVersion`), plus which named rule(s) fired
(`dispositionRuleIds`, empty if only the category baseline applied) and
`dispositionSource: DETERMINISTIC`. This means:

- Any two questions with the same `safetyRuleSetVersion` were evaluated by
  byte-identical rules — directly comparable for audit or QA.
- Changing a rule (adding, removing, editing a pattern, changing a
  baseline mapping) requires bumping the version constant. Old questions
  keep their original disposition and version untouched — a rule change is
  never retroactively applied to already-created questions.
- A pharmacist/clinical reviewer can answer "which rule version was live
  when this patient's question came in, and exactly what did it match" for
  any historical question without guessing.

#### What happens when the system is uncertain

There is no "uncertain, give up" state — the algorithm is total (every
input produces exactly one of the four dispositions), but its *design*
resolves uncertainty conservatively at two points: (1) any category not
clearly generic-factual defaults to `PHARMACIST_REVIEW`, not
`GENERAL_EDUCATION` — six of nine categories, including the catch-all
`OTHER`, default to human review; (2) escalation rules only ever move the
result *up* in severity and a match on any tier-appropriate pattern is
sufficient — there is no "maybe" state or confidence threshold to tune,
because a pattern-match false positive costs a routing decision toward
more caution (acceptable), while a false negative would cost the opposite
(not acceptable). This is the literal implementation of "where
deterministic rules cannot confidently determine disposition, default
toward appropriate human review."

#### Current limitations — requires clinical review before production use

**This initial rule set is intentionally small and is not a substitute for
clinical judgment.** It is scoped to the specific situations named in this
phase's requirements (possible serious adverse reactions, severe allergic
reactions, severe/rapidly worsening symptoms, possible overdose/poisoning,
consequential medication errors) and does **not** attempt to enumerate
every possible medical emergency or concerning symptom. Known limitations:

- Pattern matching on English free text will miss non-English input,
  heavy misspellings, and phrasings not anticipated by the current
  patterns (e.g. regional/colloquial ways of describing the same
  symptom).
- The category-baseline table (six of nine categories → `PHARMACIST_REVIEW`
  by default) is a reasonable starting heuristic, not a clinically
  validated triage instrument.
- No rule considers medication-specific risk (e.g. a "missed dose"
  question about a narrow-therapeutic-index drug isn't treated any
  differently from any other missed-dose question) — that level of
  medication-aware reasoning is out of scope until a much later phase, if
  ever, and would itself require clinical input to design safely.
- **Before this rule set (or any expansion of it) is used with real
  patient data, it must be reviewed and signed off by a licensed
  pharmacist/clinical reviewer** — nothing in this codebase constitutes
  that review. This mirrors the original architecture's Safety/Escalation
  section: "do not invent medical triage protocols" — this rule set is a
  first, conservative, engineering-reviewable draft, not a clinical
  artifact.
- The architecture supports adding rules incrementally after clinical
  review (append a new `SafetyRule` entry, bump
  `SAFETY_RULE_SET_VERSION`) without touching any caller — this is the
  intended long-term path, not a one-time initial build.

### 10. Ownership and authorization

Extends the ownership pattern M2 already established
(`{ id, patientId: request.user.id }` scoped queries, 404-not-403 on
mismatch) with a second axis for the pharmacist role. **Implemented as
written, M4** — `apps/api/src/routes/pharmacist-questions.ts` enforces
every rule below directly in its Prisma `where` clauses, never in
application-level post-filtering:

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
  profile" action scoped to that request — not ambient access; M4 does not
  add one. A question outside a pharmacist's authorized scope returns
  `404`, identical to the patient-side pattern — a pharmacist can never
  distinguish "claimed by someone else" from "doesn't exist."
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

Schema sketch, kept for historical continuity. **As of M4, every field
shown below is implemented and populated by real code paths** —
`QuestionCategory`/`QuestionDisposition`/`DispositionSource` (Phase 2), the
AI education fields (Phase 3, see "Database changes (Phase 3 additions)"
below for the fields added after this sketch was written), and every
pharmacist/escalation field on the model (M4, see "Database changes (M4
additions)" further below for `EscalationReasonCategory` and
`escalationReasonCategory`, the only genuinely new field M4 added — every
other pharmacist/escalation field below was already reserved since Phase
1 and is populated for the first time in M4). `AnalyticsEvent` remains the
one model in this sketch that is still purely illustrative — not created.

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

// Renamed/expanded in Phase 2 from the original 3-value sketch
// (ROUTINE / PHARMACIST_RECOMMENDED / URGENT_CARE_GUIDANCE). The original
// set conflated "needs a pharmacist" with "needs a provider" and had no
// way to distinguish a non-emergency provider concern from a true
// emergency. See "Deterministic Safety & Disposition Rule Engine" below
// for the full rationale.
enum QuestionDisposition {
  GENERAL_EDUCATION
  PHARMACIST_REVIEW
  PROVIDER_EVALUATION
  URGENT_EMERGENCY
}

// New in Phase 2 — distinguishes a disposition the deterministic rule
// engine assigned from one a future AI refinement pass assigned/adjusted.
enum DispositionSource {
  DETERMINISTIC
  AI_ASSISTED
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
  medicationSnapshot          Json                 -- {name, strength, dosageForm, directions, frequency, route} at creation time (dosageForm added M4)
  otherMedicationsSnapshot    Json?                -- [{name, strength}], only for DRUG_INTERACTION / SIDE_EFFECT
  category                    QuestionCategory     -- patient-selected
  aiSuggestedCategory         QuestionCategory?
  questionText                String
  clarifyingExchange          Json?                -- {question, answer}, at most one
  disposition                 QuestionDisposition? -- implemented (Phase 2)
  dispositionSource           DispositionSource?   -- implemented (Phase 2) — always DETERMINISTIC today
  dispositionRuleIds          String[]             -- implemented (Phase 2) — which named rule(s) fired, [] if only the category baseline applied
  safetyRuleSetVersion        String?              -- implemented (Phase 2) — packages/safety-rules version that produced this disposition
  dispositionAssignedAt       DateTime?            -- implemented (Phase 2)
  aiEducationResponse         String?
  aiEducationGeneratedAt      DateTime?
  aiModelVersion              String?              -- audit: which model/prompt version produced the response
  status                      QuestionStatus       -- PHARMACIST_REQUESTED/_IN_PROGRESS/_RESOLVED/ESCALATED implemented (M4)
  pharmacist                  User?                -- implemented (M4) — the claiming/responding/escalating pharmacist
  pharmacistId                String?              -- implemented (M4)
  pharmacistRequestedAt       DateTime?            -- implemented (M4) — stamped when status becomes PHARMACIST_REQUESTED
  pharmacistClaimedAt         DateTime?            -- implemented (M4)
  pharmacistResponse          String?              -- implemented (M4) — pharmacist's own words; never AI-written
  pharmacistRespondedAt       DateTime?            -- implemented (M4)
  escalatedAt                 DateTime?            -- implemented (M4) — pharmacist-initiated only, see §8
  escalationReason            String?              -- implemented (M4) — pharmacist's free-text explanation
  escalationReasonCategory    EscalationReasonCategory? -- new in M4, see "Database changes (M4 additions)" below
  resolvedAt                  DateTime?            -- implemented (M4)
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

Follows the same ownership-scoping, Zod validation, and `requireRole`
patterns already established in `apps/api/src/routes/medications.ts`.

```
POST   /questions                     create (medicationId, category, questionText) — implemented
GET    /questions                     patient's own list — implemented
GET    /questions/:id                 detail (ownership-scoped, patient) — implemented

# Pharmacist-side (implemented, M4) — apps/api/src/routes/pharmacist-questions.ts
GET    /pharmacist/queue              unclaimed (shared) + own claimed/resolved/escalated, with counts
GET    /pharmacist/questions/:id      detail (ownership-scoped per §10, pharmacist)
POST   /pharmacist/questions/:id/claim      atomic conditional update — see M4 section
POST   /pharmacist/questions/:id/release    only the claiming pharmacist; only from PHARMACIST_IN_PROGRESS
POST   /pharmacist/questions/:id/respond    only the claiming pharmacist; only from PHARMACIST_IN_PROGRESS
POST   /pharmacist/questions/:id/escalate   only the claiming pharmacist; only from PHARMACIST_IN_PROGRESS; requires escalationReasonCategory + escalationReason
```

`POST /questions` is where the structuring pipeline (§5) runs: it always
executes Layer 1 (deterministic disposition assignment, Phase 2) and Layer
2 (AI education, Phase 3) in sequence within the same request/response
cycle — no polling or background job, since each AI call is a single
bounded operation. As of M4, this same request also sets `status` to
`PHARMACIST_REQUESTED` (with `pharmacistRequestedAt`) when the disposition
is `PHARMACIST_REVIEW` or `PROVIDER_EVALUATION` — see "Why queue entry is
automatic" in the M4 section below. There is no separate
`POST /questions/:id/clarify` or `POST /questions/:id/request-pharmacist`
endpoint — the illustrative sketch from earlier drafts of this document
was superseded by Phase 3's single-call design (clarifying question is a
non-blocking field of that one call, not a second request) and M4's
automatic-queueing design (no manual "request pharmacist" step needed).

### 17. UI changes

- **Medication detail (M2, implemented):** "Ask about this medication" CTA
  — implemented in Phase 1.
- **Ask a Question flow (implemented, replacing the M0/M1 placeholder):**
  medication picker (skipped if pre-selected) → category selector →
  question text → review → submit → confirmation screen. As of Phase 3,
  the confirmation screen shows the same structured AI/routing content as
  the question detail screen (below) — the AI call is synchronous within
  the same create request, so the confirmation response already carries it.
- **My Questions (implemented, parallel to "My Medications"):** list with
  status badges. As of M4, `PHARMACIST_REQUESTED`/`PHARMACIST_IN_PROGRESS`/
  `PHARMACIST_RESOLVED`/`ESCALATED` are all reachable statuses shown in
  that list, not just `RECEIVED`/`AI_ANSWERED`.
- **Question detail (implemented):** structured record — question,
  medication snapshot, category — plus the disposition-appropriate routing
  message (Phase 2), AI-generated general education or supplementary
  context with an explicit AI disclosure (Phase 3), and, as of M4, a
  clearly-separated pharmacist response section when one exists (never
  merged with or presented as AI content — see "Patient/pharmacist
  response separation" in the M4 section below).
- **Pharmacist home → dashboard (implemented, M4):** replaces the M1
  placeholder entirely. Shows New/In Review/Completed/Escalated counts (all
  scoped to the authenticated pharmacist per §10) followed by a
  prioritized queue list; selecting a queue item opens the pharmacist
  review screen (claim, respond, escalate) described in the M4 section
  below.

**Patient-facing disposition messaging (Phase 2, implemented).** Shown on
the confirmation screen after submitting and on the question detail
screen — never implying AI or human review has occurred, since neither
has:

| Disposition | Message shown to the patient |
|---|---|
| `GENERAL_EDUCATION` | "We can provide general information about this medication." |
| `PHARMACIST_REVIEW` | "This question is better reviewed by a pharmacist." |
| `PROVIDER_EVALUATION` | "This question may require evaluation by your healthcare provider." |
| `URGENT_EMERGENCY` | Direct, unambiguous guidance to seek emergency/urgent care now — not a routing suggestion. |

None of these messages diagnose, recommend treatment, or claim a
pharmacist/physician has reviewed anything — they describe the *routing*
DosePrepped has determined, which is the only thing Phase 2 actually
does.

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

1. **✅ Implemented — Question intake, no AI, no pharmacist.**
   `MedicationQuestion` schema + migration, `POST/GET /questions`, the
   composer UI through category + question text, "My Questions" list,
   question detail screen. Proves the structuring UX and data model on
   their own.
2. **✅ Implemented — Deterministic safety-check layer.** The rule-based
   (non-LLM) pass for `QuestionDisposition`, built and tested in isolation
   before any LLM involvement — this is the most conservative,
   highest-stakes piece and should not be entangled with AI integration
   work. See "Deterministic Safety & Disposition Rule Engine" below for
   the implementation. Explicitly does not touch `status`, the pharmacist
   queue, or provider messaging — only `disposition` and its audit fields.
3. **✅ Implemented — AI Service Layer integration (M3 Phase 3).**
   `packages/ai-service`'s single typed `generateEducation` call
   (structuring/`suggestedCategory`, at most one clarifying question,
   education/context text, pharmacist summary), layered on top of the
   Phase 2 deterministic disposition, which it can never change. Ships
   general education end-to-end for `GENERAL_EDUCATION`, plus brief
   context + a pharmacist summary for `PHARMACIST_REVIEW`/
   `PROVIDER_EVALUATION`; never invoked for `URGENT_EMERGENCY`. The
   optional `refineDisposition` pass (§6) remains not implemented.
4. **✅ Implemented — Pharmacist queue + claim/respond/escalate (M4).**
   Automatic queue entry at intake time (no separate "request pharmacist"
   endpoint — superseded, see §16), atomic claim, respond (stored
   separately from AI content), and pharmacist-initiated escalation with a
   required structured reason, replacing the M1 placeholder pharmacist
   home with a real dashboard. See the M4 section below for the full
   design.
5. **Not started — Analytics + AnalyticsEvent table.** Event emission
   (§11) has not been retrofitted into phases 1–4 yet; M4's pharmacist
   time metrics (claim/response/escalation latency) are computed on read
   from existing timestamp fields rather than persisted as discrete
   events — see "Pharmacist time metrics" in the M4 section below.

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

### Phase 3 — AI-Assisted Medication Education (implemented)

**Status: implemented.** Builds directly on §19 step 3 ("AI Service Layer
integration") and §6's operation table. This section documents what was
actually built — `packages/ai-service` — and the specific design choices
made to keep it a bounded, typed, non-chat system rather than the
open-ended `ai-service` sketched in §4/§7 of the original architecture.

#### Scope decision: one combined typed call, not four separate ones

§6 lists five discrete AI operations (`refineDisposition`,
`suggestCategory`, `generateClarifyingQuestion`, `generateEducation`,
`summarizeForPharmacist`). Phase 3 implements the last four — not
`refineDisposition`, which stays explicitly out of scope (the Phase 2
deterministic disposition is not refined or second-guessed by AI in this
phase; see "Disposition is read-only input" below).

Rather than four separate network calls per question (four times the
latency and cost, and four separate places output validation could
diverge), the four remaining operations are implemented as **one
structured provider call** —
`MedicationEducationProvider.generateEducation(input)` — whose typed
output carries all four operations' results as separate fields:
`responseText` (the education/context content), `suggestedCategory`
(structuring), `clarifyingQuestion` (at most one, optional), and
`pharmacistSummary` (populated only when the disposition calls for it).
This is an implementation consolidation, not a scope reduction — each
operation still has its own typed field, is independently validated, and
is independently nullable/omittable. It also makes "no multi-turn
conversation" true by construction: there is exactly one AI call per
question, ever, with no follow-up endpoint that accepts a second message
against the same question.

**Why the clarifying question doesn't block on a patient answer.** §5's
Layer 2 sketch described a clarify-then-generate sequence. Building it as
a real two-step, wait-for-the-patient flow would require either a second
endpoint plus a "waiting for clarification" status (edging toward a
mini-conversation) or a client-side delay before generation. Instead,
`clarifyingQuestion` is generated *alongside* the education response in
the same call, from the same model turn, and shown to the patient as a
"you could also tell us..." suggestion beneath the answer — not a gate.
This satisfies the requirement directly: "if the patient does not answer
the clarification, the system should still be able to proceed safely" is
trivially true because the system never waits for an answer in the first
place. There is no `POST /questions/:id/clarify` endpoint in this phase;
§16's sketch of that route remains illustrative/future.

#### Disposition is read-only input, never AI-writable output

The Phase 2 deterministic `disposition` is passed into
`MedicationEducationProvider.generateEducation` as **context only** — the
provider needs to know it (to decide how much to say and how directive to
be) — but `MedicationEducationOutput` has **no disposition field at all**.
There is no code path, schema field, or database column through which an
AI response could change `disposition`, `dispositionSource`,
`dispositionRuleIds`, or `safetyRuleSetVersion`; those are written exactly
once, by `packages/safety-rules`, before the AI provider is ever called.
Even a malicious or buggy provider that returns an extra `"disposition"`
key in its raw JSON has no effect: `validateEducationOutput` parses the
response through a Zod schema that only recognizes the four approved
output fields, so any extra key is silently dropped before it reaches
application code.

#### Disposition-gated behavior

| Disposition | Is the provider called? | What it may produce |
|---|---|---|
| `GENERAL_EDUCATION` | Yes | Full general educational `responseText`, optional `suggestedCategory`, optional `clarifyingQuestion`. `pharmacistSummary` is not requested (nothing to hand off yet). |
| `PHARMACIST_REVIEW` | Yes | A brief acknowledgment + limited general context only (never a full answer to the individualized question), plus a `pharmacistSummary` prepared for a future pharmacist queue. |
| `PROVIDER_EVALUATION` | Yes | Same shape as `PHARMACIST_REVIEW` — brief, non-diagnostic context if safe to give, plus a `pharmacistSummary` — with prompt instructions oriented toward "contact your healthcare provider" rather than "a pharmacist will review this." |
| `URGENT_EMERGENCY` | **No — never called.** | Nothing. The existing Phase 2 urgent routing message is returned as-is. Calling an LLM here would add latency in front of emergency guidance and risks generating exactly the kind of normal educational content the requirements prohibit for this tier. This is enforced in code before any provider call is constructed, not by prompting. |

For `PHARMACIST_REVIEW` and `PROVIDER_EVALUATION`, the AI-produced
`responseText` (when present) is rendered in the UI as supplementary
context beneath the Phase 2 routing message — never as the primary answer,
and never positioned in a way that could read as "your question has been
resolved."

#### AI provider abstraction

```
packages/ai-service/
  src/
    types.ts       — MedicationEducationInput/Output/Result,
                      MedicationEducationProvider interface
    validate.ts     — Zod schema + guardrail pattern checks
    prompt.ts        — PROMPT_VERSION + system/user prompt builder
    providers/
      mock.ts         — deterministic, dependency-free provider (default;
                        also the provider tests inject directly — see
                        "Testing" below)
      anthropic.ts     — real provider, minimal fetch-based Messages API
                        client (no SDK dependency), only constructed if
                        AI_PROVIDER=anthropic
    index.ts          — createMedicationEducationProvider(env) factory
```

```typescript
interface MedicationEducationInput {
  medicationSnapshot: { name, strength, directions, frequency, route };
  otherMedicationsSnapshot: { name, strength }[] | null; // only when the
                                                           // category already
                                                           // captured it (§3)
  category: QuestionCategory;         // patient-selected, read-only
  questionText: string;
  disposition: QuestionDisposition;   // Phase 2 result, read-only context
}

interface MedicationEducationOutput {
  responseText: string;               // education or brief context, per disposition
  suggestedCategory: QuestionCategory | null;  // structuring; advisory only
  clarifyingQuestion: string | null;  // at most one, never an array
  pharmacistSummary: string | null;   // only for PHARMACIST_REVIEW/PROVIDER_EVALUATION
}

interface MedicationEducationResult {
  output: MedicationEducationOutput;
  provider: string;      // "mock" | "anthropic"
  model: string;         // e.g. "mock-v1" | a real model identifier
  promptVersion: string; // PROMPT_VERSION at call time
  usage: { inputTokens: number; outputTokens: number };
}

interface MedicationEducationProvider {
  readonly providerName: string;
  generateEducation(input: MedicationEducationInput): Promise<MedicationEducationResult>;
}
```

`packages/ai-service` has exactly one internal dependency
(`packages/types`, for the shared category/disposition unions) and no
dependency on `packages/db`, Fastify, or any HTTP framework — the same
"pure, swappable" shape as `packages/safety-rules`. `apps/api` is the only
caller; it owns the timeout/fallback orchestration (see "Failure
behavior") and all database writes. The provider itself never touches the
database.

**Provider selection**: `AI_PROVIDER` env var — `mock` (default) or
`anthropic`. If set to `anthropic` without `ANTHROPIC_API_KEY` present,
the API fails fast at startup (same pattern as the existing
`SESSION_SECRET` check), rather than silently falling back. The **mock
provider is what this codebase actually runs with today** — there is no
`ANTHROPIC_API_KEY` configured anywhere in this environment, and none is
required for Phase 3's tests, build, or smoke test. It produces
deterministic, clearly-synthetic text derived from the input's category/
disposition/medication name, run through the exact same validation and
storage path a real provider's output would go through. This is called
out explicitly, and loudly, in the README: **the demo/dev "AI education"
text is not real AI-generated content**; wiring a real
`ANTHROPIC_API_KEY` and `AI_PROVIDER=anthropic` is required before this
could honestly be called "AI-generated" in a deployed environment.

#### Input minimization

`MedicationEducationInput` carries only: the medication snapshot already
captured for this question (not the patient's full medication list), the
`otherMedicationsSnapshot` *only if the category already triggered
capturing it in Phase 1* (`DRUG_INTERACTION`/`SIDE_EFFECT` — Phase 3 adds
no new data collection here, it just forwards what Phase 1 already
snapshots), the category, the question text, and the disposition. It never
receives: the patient's name/email/DOB, their full medication list, any
other question they've ever asked, or any account/session data. The
provider has no database access and could not fetch more even if a prompt
tried to induce it to.

#### Output validation ("FAIL SAFE")

`validateEducationOutput(raw)` in `packages/ai-service/src/validate.ts`
runs two passes before any AI content is trusted:

1. **Structural.** A Zod schema requiring `responseText` (non-empty,
   length-capped), and the three other fields as `null` or a
   length-capped string — nothing else survives parsing. Anything that
   doesn't match this shape (wrong types, missing `responseText`, extra
   unexpected top-level content masquerading as the response) fails
   validation immediately.
2. **Guardrail patterns.** A small, named, non-exhaustive set of
   regex checks (mirroring the style of `packages/safety-rules`, with
   stable `id`s for audit) scans `responseText`, `clarifyingQuestion`, and
   `pharmacistSummary` for directive clinical language the requirements
   explicitly prohibit — e.g. "you should start/stop/increase/decrease
   your dose/medication," "I diagnose," "stop taking this." A match fails
   validation. This is explicitly **defense-in-depth, not the primary
   safety mechanism** — the primary mechanism is the disposition gate
   (§ above) and the system prompt's MUST NOT list; this check exists in
   case either of those is insufficient for a given output, exactly per
   the original architecture's §7 three-layer guardrail design (prompt +
   schema + post-generation pattern check).

If either pass fails — or the provider call throws (network error) or
exceeds its timeout (`AI_TIMEOUT_MS`, default 8000ms) — the question is
marked `aiResponseStatus: FAILED` and **no AI content is stored or
shown**. The patient still sees the Phase 2 disposition routing message
(unchanged, unaffected) plus a short, honest fallback line noting general
information isn't available right now and pointing to the same
human-resource path the disposition already implies (pharmacist review
request for `GENERAL_EDUCATION`/`PHARMACIST_REVIEW`, provider contact for
`PROVIDER_EVALUATION`). Nothing fabricated is ever shown. `URGENT_EMERGENCY`
never reaches this path at all (§ above).

#### Audit metadata

New `MedicationQuestion` fields (see "Database changes" below):
`aiProvider`, `aiPromptVersion`, `aiResponseStatus`
(`SUCCESS`/`FAILED`/`SKIPPED`), `aiUsage` (`{inputTokens, outputTokens}`).
Combined with the existing `aiModelVersion` and `aiEducationGeneratedAt`
fields (reserved since Phase 1, populated for the first time here), every
question that goes through the AI path has a complete, queryable record of
which provider/model/prompt version ran, whether it succeeded, and its
token usage — without storing the prompt or the raw response anywhere.
None of this audit metadata is returned in the patient-facing API response
(`GET /questions`, `GET /questions/:id`) — it's operational/audit data, not
something the patient UI needs, per the minimum-necessary-exposure
principle already applied to `dispositionRuleIds`/`safetyRuleSetVersion`
in Phase 2.

#### Cost control

- The deterministic disposition (Phase 2) always runs first and is free
  (no network call); the AI provider is only ever invoked after it, never
  before or in place of it.
- `URGENT_EMERGENCY` never invokes the provider (table above) — the
  highest-frequency-risk tier for "this shouldn't cost anything or add
  latency" is structurally excluded.
- `aiUsage` is stored per question specifically so token cost can be
  aggregated later (e.g. `sum(aiUsage->>'inputTokens')` grouped by day/
  disposition/category) without a new table or a separate cost-tracking
  system — this is the "future B2B economics" hook the requirements ask
  for, built as a byproduct of the audit fields rather than a separate
  feature.
- Response caching (e.g. keyed on medication name + category + a
  normalized question) is explicitly **not implemented** in Phase 3 — it's
  named in the requirements as a future opportunity ("where clinically
  appropriate"), which itself needs a clinical/product decision about
  when two patients' phrasing of "the same" question can safely share a
  cached answer. Flagged as a limitation, not attempted here.

#### What this phase does NOT do

Restating the explicit exclusions: no pharmacist queue or pharmacist
messaging (the `pharmacistSummary` this phase generates is stored, ready
for that future queue, but nothing surfaces it to a pharmacist yet — there
is no pharmacist-facing UI or endpoint reading it), no provider messaging/
EHR integration, no payments, no medication reminders/adherence system, no
drug interaction database, no comprehensive clinical decision support, and
no `refineDisposition` AI-assisted disposition adjustment (§6's optional
future operation — Phase 3 leaves Phase 2's disposition untouched, full
stop, rather than adding an AI second-opinion pass on top of it).

#### Testing

All Phase 3 tests use the mock provider (`packages/ai-service`'s
`MockMedicationEducationProvider`, injected into `buildApp({ aiProvider,
aiTimeoutMs })`) — **no test makes a real network call to any AI vendor**,
matching the explicit requirement. The mock provider supports four modes
(`success`, `fail`, `invalid`, `slow`) so tests can exercise the success
path, a thrown-error failure, a schema-violating output, and a
timeout-triggering delay without any nondeterminism or real latency.

#### Limitations — requires clinical, legal, privacy, and security review before production use

- **Clinical:** the system prompt's MUST NOT list and the post-generation
  guardrail patterns are an engineering approximation of a clinical
  boundary, not a clinically validated one. A licensed pharmacist/
  clinician must review actual model outputs (not just the prompt) before
  this is used with real patients, the same standing caveat as Phase 2's
  rule set.
- **Model risk:** even with disposition gating, schema validation, and
  guardrail patterns, an LLM can produce subtly non-compliant phrasing the
  current pattern list doesn't catch — this is acknowledged, not solved,
  by the current guardrail set (same "non-exhaustive, defense-in-depth"
  caveat as Phase 2).
- **No caching, no rate limiting specific to AI cost** beyond the existing
  `POST /questions` rate limit — a determined abuser could still drive up
  AI spend within that per-IP/per-user cap; a dedicated AI-cost rate limit
  is a reasonable near-term follow-up, not built here.
- **Mock provider is the only provider actually exercised** in this
  environment (no `ANTHROPIC_API_KEY` configured); the `anthropic`
  provider is implemented and unit-testable in shape, but has not been
  run against the real API as part of this work.
- **Legal/privacy:** per §8/§13 of the original architecture, no BAA
  exists with any AI vendor in this environment; this remains
  synthetic-data-only, and real PHI must not reach any AI provider
  (including a real Anthropic account) until that review is complete.

### Database changes (Phase 3 additions)

```
enum AiResponseStatus {
  SUCCESS
  FAILED
  SKIPPED   -- disposition is URGENT_EMERGENCY; provider deliberately not called
}
```

New fields on `MedicationQuestion` (in addition to the Phase 1/2 fields
already listed in §15):

```
aiProvider           String?          -- "mock" | "anthropic"
aiPromptVersion      String?          -- packages/ai-service PROMPT_VERSION at call time
aiResponseStatus     AiResponseStatus?
aiUsage              Json?            -- {inputTokens, outputTokens}
aiPharmacistSummary  Json?            -- {summaryText, isAiGenerated: true}; stored in Phase 3,
                                       -- surfaced to the pharmacist review screen as of M4
```

The previously-reserved `aiEducationResponse`, `aiEducationGeneratedAt`,
`aiModelVersion`, `aiSuggestedCategory`, and `clarifyingExchange` fields
(present in the schema since Phase 1, always null until now) are populated
for the first time in Phase 3. `clarifyingExchange` stores
`{question, answer: null}` — `answer` stays structurally reserved for a
future two-way flow but is never written to in Phase 3 (§ "Why the
clarifying question doesn't block").

## M4 — Pharmacist Review & Concierge Workflow (implemented)

**Status: implemented.** This is the human layer §7/§8/§10 described but
deferred: a real pharmacist queue, atomic claim, a response stored
separately from AI content, and pharmacist-initiated escalation. Explicitly
**not** in M4: B2B organization management, payments, pharmacist
compensation, EHR integration, telemedicine integration, provider
messaging, or automated provider routing — those remain future milestones.

### Why queue entry is automatic, not patient-initiated

Earlier drafts of this document (§16) sketched a
`POST /questions/:id/request-pharmacist` endpoint alongside automatic
queueing. M4 implements only the automatic path: at question creation,
immediately after the Phase 2 disposition and Phase 3 AI call, `POST
/questions` sets `status = PHARMACIST_REQUESTED` and stamps
`pharmacistRequestedAt` whenever `disposition` is `PHARMACIST_REVIEW` or
`PROVIDER_EVALUATION` — in the same request/response cycle, no separate
patient action required. Reasoning:

- The deterministic disposition (Phase 2) already *is* the judgment that
  this question needs a pharmacist — routing it to the queue automatically
  is the direct, load-bearing consequence of that judgment, not a
  separate feature. Requiring the patient to additionally tap "request
  pharmacist review" would just be an extra step between "the system
  determined this needs review" and "a pharmacist can see it."
- `GENERAL_EDUCATION` questions are never queued — Phase 3's AI already
  fully answered them (`status = AI_ANSWERED`); a manual "ask a
  pharmacist anyway" path is explicitly out of M4's scope (the existing
  `/ask-a-pharmacist` page stays a placeholder for that future
  patient-initiated flow — see "Patient experience" below).
- `URGENT_EMERGENCY` questions are never queued, automatically or
  manually — per §9, that disposition is never handled by AI or
  pharmacist at all; the patient is shown emergency guidance and nothing
  else.

This does change one Phase 3 behavior: previously `PHARMACIST_REVIEW`/
`PROVIDER_EVALUATION` questions stayed at `status = RECEIVED` after AI ran
(Phase 3 explicitly deferred any status transition, since no queue existed
yet). As of M4 they immediately move to `PHARMACIST_REQUESTED` instead —
this is exactly the deferred piece Phase 3's own documentation named, not
a contradiction of it.

### Pharmacist queue architecture

`GET /pharmacist/queue` and `GET /pharmacist/questions/:id`
(`apps/api/src/routes/pharmacist-questions.ts`) implement §10's
ownership-scoping rule directly in the Prisma `where` clause — never as an
application-level filter after a broader fetch:

```
where: {
  OR: [
    { status: "PHARMACIST_REQUESTED", pharmacistId: null },   // shared, unclaimed
    { pharmacistId: request.user.id },                         // own, any status
  ],
}
```

The same query powers both the list endpoint and the dashboard's four
counts (New = unclaimed `PHARMACIST_REQUESTED`; In Review = own
`PHARMACIST_IN_PROGRESS`; Completed = own `PHARMACIST_RESOLVED`; Escalated
= own `ESCALATED`) — the counts are simply that query's results grouped by
status, so there is no risk of the dashboard and the queue list
disagreeing about what's visible. A pharmacist can never see another
pharmacist's claimed-but-not-yet-resolved question, and can never see any
question outside this set — `GET /pharmacist/questions/:id` applies the
identical `where` clause with `id` added, returning `404` (not `403`) for
anything outside it, matching the patient-side convention exactly.

**Prioritization (transparent, not automatic clinical triage).** The
queue is sorted, not filtered: `PROVIDER_EVALUATION` before
`PHARMACIST_REVIEW`, then oldest `createdAt` first within each group. This
is presentation-layer ordering only — it does not change which questions
are visible, does not assign risk scores, and does not introduce any new
clinical judgment beyond the disposition that already exists. The
dashboard UI labels this ordering explicitly (see "Pharmacist dashboard"
below) so it's never a hidden behavior.

### Claim concurrency

`POST /pharmacist/questions/:id/claim` is a single, atomic, conditional
database update — no read-then-write race window, no application-level
locking, and no explicit multi-statement transaction needed, because one
`UPDATE ... WHERE ...` statement *is* atomic at the database level:

```typescript
const result = await prisma.medicationQuestion.updateMany({
  where: { id, status: "PHARMACIST_REQUESTED", pharmacistId: null },
  data: { pharmacistId: request.user.id, pharmacistClaimedAt: new Date(), status: "PHARMACIST_IN_PROGRESS" },
});
if (result.count === 0) {
  return reply.code(409).send({ error: "This question is no longer available to claim." });
}
```

PostgreSQL evaluates the `WHERE` clause and applies the `SET` in one
row-locked operation; if two pharmacists' claim requests race, the
database serializes them, exactly one `UPDATE` matches a row (because the
first one to commit changes `pharmacistId` away from `null`, so the
second one's `WHERE pharmacistId: null` no longer matches), and
`result.count` tells the two requests apart — the winner gets `count: 1`
and a `200`, the loser gets `count: 0` and a `409 Conflict`. This is
verified directly by a test that fires two claim requests concurrently
(`Promise.all`) against the same question and asserts exactly one
succeeds (see "Testing" below) — not just reasoned about.

**Release.** `POST /pharmacist/questions/:id/release` is the same pattern
in reverse: `updateMany({ where: { id, pharmacistId: request.user.id,
status: "PHARMACIST_IN_PROGRESS" }, data: { pharmacistId: null,
pharmacistClaimedAt: null, status: "PHARMACIST_REQUESTED" } })` — only the
claiming pharmacist can release, and only before responding/escalating.

### Pharmacist question view

`GET /pharmacist/questions/:id` returns exactly: patient question text,
category (patient-selected) and `aiSuggestedCategory`, medication
snapshot (name/strength/dosage form/directions/frequency/route — the
point-in-time snapshot, not a live medication lookup), the
`otherMedicationsSnapshot` when the category captured one,
`disposition`/`safetyRuleSetVersion`/`dispositionRuleIds`, the AI-generated
`aiPharmacistSummary` (labeled AI-generated), submission/claim timestamps,
and current status. It deliberately does **not** return: the patient's
name, email, date of birth, other medications outside the captured
snapshot, or any other question the patient has asked — the pharmacist's
view is scoped to exactly the one question record, matching §10's
minimum-necessary-access principle. (The patient's identity is
intentionally never exposed to the pharmacist in M4 — there is no
patient-facing pharmacist-messaging feature yet, so there is no
legitimate need for the pharmacist to see who's asking.)

### Patient/pharmacist response separation

`pharmacistResponse` (written only by `POST
/pharmacist/questions/:id/respond`, only by the claiming pharmacist, only
from `PHARMACIST_IN_PROGRESS`) is a distinct database column from
`aiEducationResponse` (written only by the Phase 3 AI pipeline at question
creation) — there is no code path that copies one into the other, and no
endpoint that lets AI-generated content become `pharmacistResponse`.
`POST /pharmacist/questions/:id/respond` requires a non-empty
`responseText` from the authenticated pharmacist and writes it verbatim;
it has no AI/LLM call in its handler at all. The patient-facing UI (see
"Patient experience" below) renders the two under visually distinct
headings — "General information from DosePrepped" (AI, with its
disclosure) vs. "Response from your pharmacist" (human) — and never
merges or relabels one as the other.

### Escalation behavior

`POST /pharmacist/questions/:id/escalate` requires both
`escalationReasonCategory` (a closed enum — see "Database changes (M4
additions)" below) and a non-empty `escalationReason` (free text), only
from the claiming pharmacist, only from `PHARMACIST_IN_PROGRESS`. On
success: `status → ESCALATED`, `escalatedAt` stamped. The original
question, its AI content, and (if any partial notes existed) the
pharmacist's context are all preserved unchanged — escalating never
deletes or overwrites anything, it only adds the escalation record. Per
§8, this **does not** send any message to a provider or create any
provider-facing record — DosePrepped has no provider accounts or
messaging in M4; the patient is told to contact their own healthcare
provider (see "Patient experience" below), and the provider destination
remains an integration placeholder for a future telemedicine milestone,
exactly as this document has said since §8 was first written.

### Pharmacist authorization

Every rule the prompt requires is enforced server-side, in
`apps/api/src/routes/pharmacist-questions.ts`, never trusted from the
client:

- **Cannot view arbitrary patient records or another pharmacist's private
  (claimed) records:** the `where` clause in "Pharmacist queue
  architecture" above is the only way any pharmacist route reads a
  question — there is no route that accepts a bare `id` without that
  scoping.
- **Cannot modify patient medications:** no pharmacist route touches
  `PatientMedication` at all; `apps/api/src/routes/medications.ts` remains
  gated to `requireRole(Role.PATIENT)` with patient-ownership scoping,
  unchanged.
- **Cannot modify the deterministic disposition or AI safety
  classification:** no pharmacist route's Zod input schema or Prisma
  `data` object includes `disposition`, `dispositionSource`,
  `dispositionRuleIds`, or `safetyRuleSetVersion` — those columns are
  write-once, set only by `POST /questions` (patient-side), and no M4
  route can reach them even if a malicious client tried to smuggle those
  fields into a request body (Zod strips unknown keys).
- **Cannot impersonate another pharmacist:** every write uses
  `request.user.id` from the authenticated session, never a
  client-supplied pharmacist ID — there is no field in any pharmacist
  route's request body that names a pharmacist.
- **May only access questions within their authorized workflow:** the
  claim/release/respond/escalate mutations additionally require
  `pharmacistId === request.user.id` in their `WHERE` clause (not just
  `GET`), so even a pharmacist who somehow knew another question's ID
  cannot respond to or escalate a question they haven't claimed.

### AI's role in the pharmacist workflow

The Phase 3 `aiPharmacistSummary` (already generated and stored at
question-creation time for `PHARMACIST_REVIEW`/`PROVIDER_EVALUATION`
questions) is surfaced read-only on the pharmacist review screen as an
assistive starting point — never editable in place, never the response
itself. No new AI model or operation is introduced in M4. The
`POST /pharmacist/questions/:id/respond` handler has no AI/LLM call
anywhere in it — there is no mechanism, automatic or otherwise, by which
AI-generated text could become `pharmacistResponse`; only an authenticated
pharmacist's own request body can. The pharmacist remains professionally
responsible for whatever they submit as their response — the AI summary
is a tool, not a co-author of record.

### Pharmacist time metrics

Computed on read from existing timestamp fields, not persisted as
separate events (the `AnalyticsEvent` table remains not-yet-built, §19
step 5):

```
submission → claim:      pharmacistClaimedAt   - createdAt
claim → response:         pharmacistRespondedAt - pharmacistClaimedAt
submission → response:      pharmacistRespondedAt - createdAt
submission → escalation:      escalatedAt - createdAt
```

These are simple deltas of fields already written by the claim/respond/
escalate mutations — no new columns were needed for this. Nothing in M4
computes billing, compensation, or any per-pharmacist aggregate; the raw
timestamps are the deliverable, aggregation is future unit-economics work
the prompt explicitly says not to build yet.

### Patient experience

- **Awaiting pharmacist review** (`status = PHARMACIST_REQUESTED` or
  `PHARMACIST_IN_PROGRESS`): "Your question has been sent for pharmacist
  review." No response-time promise — there is no configured SLA in this
  system, so none is claimed.
- **Pharmacist responded** (`status = PHARMACIST_RESOLVED`): a
  "Pharmacist Response" section, visually and textually distinct from any
  AI content, showing `pharmacistResponse` and `pharmacistRespondedAt`.
  Per the privacy design in "Pharmacist question view" above (the
  pharmacist never sees the patient's identity), the reverse is also kept
  minimal: the patient sees that a licensed DosePrepped pharmacist
  responded, not an individually-identifying pharmacist profile — there
  is no pharmacist-facing public profile/bio feature in this codebase to
  link to.
- **Escalated** (`status = ESCALATED`): "Your question has been escalated
  to your healthcare provider." — phrased as a routing outcome, not a
  claim that a provider has reviewed anything, matching the same
  discipline as every other disposition message in this document.

### Pharmacist dashboard

Real dashboard (`apps/patient/src/app/pharmacist/`) replacing the M1
placeholder: four counts (New/In Review/Completed/Escalated, from the
query in "Pharmacist queue architecture") above a queue list sorted per
"Prioritization" above, each item linking to the claim/respond/escalate
review screen. Mobile-friendly, matching the same design system as the
patient app (shared `styles.css`/design tokens) rather than a separate
visual language.

### Concurrency testing

Required and implemented as a dedicated test: two simulated pharmacists
issue `POST /pharmacist/questions/:id/claim` for the same question via
`Promise.all` (genuinely concurrent from the test's perspective, both
requests in flight before either resolves); the test asserts exactly one
response is `200` (with that pharmacist's ID as `pharmacistId` on the
resulting record) and the other is `409`, and that a follow-up fetch of
the question shows only the winning pharmacist's ID, never both, never
neither, and never a corrupted mixed state. See "Testing" in the
completion report for the full list.

### Database changes (M4 additions)

Exactly one new enum and one new field — every other pharmacist/
escalation column M4 populates was already reserved on
`MedicationQuestion` since Phase 1 (see the updated §15 sketch above):

```
enum EscalationReasonCategory {
  WORSENING_OR_SEVERE_SYMPTOM
  POSSIBLE_ADVERSE_REACTION
  MEDICATION_ERROR
  BEYOND_PHARMACIST_SCOPE
  PATIENT_REQUESTED_PROVIDER
  OTHER
}
```

```
escalationReasonCategory  EscalationReasonCategory?   -- required by the API on escalate; nullable in
                                                        -- the schema only because it's null for every
                                                        -- question that hasn't been escalated
```

The existing `escalationReason` field (String, reserved since Phase 1)
continues to hold the pharmacist's free-text explanation; together the two
fields satisfy "a structured escalation reason" — a closed, auditable
category plus a human-readable explanation, rather than either alone.

### Limitations — requires clinical, legal, and operational review before production use

- **Synthetic pharmacist accounts only.** No real pharmacist licensure
  verification, no real pharmacist accounts, exactly as required.
- **No SLA enforcement.** "Awaiting pharmacist review" has no timer, no
  escalation-on-timeout, and no staffing/capacity model — if the queue
  grows faster than pharmacists can claim from it, nothing in this system
  currently surfaces that as an operational alert. That's a real gap for
  an actual pilot, flagged here rather than silently assumed away.
- **No secure two-way messaging.** If a pharmacist needs clarification
  from the patient before responding, there is no mechanism for that in
  M4 (`WAITING_FOR_PATIENT` remains reserved-but-unbuilt) — the
  pharmacist must either respond with what they have or escalate.
  Documented as a known workflow gap, not solved here.
- **No pharmacist licensure/state-scoping logic.** Any authenticated
  `PHARMACIST`-role account can claim any queued question regardless of
  the patient's state — the original architecture's §13 pharmacist
  licensure risk is unresolved, not addressed by M4.
- **Prioritization is presentation-only**, as stated above — it is not a
  clinical triage system and must not be represented as one to real
  pharmacists in a pilot.
- **No audit-log table.** Who-claimed/who-responded/who-escalated is
  fully reconstructable from `MedicationQuestion`'s own columns (single
  actor per question, per "Auditability" above), but there is no
  append-only audit log independent of the mutable row itself — a gap
  flagged by the original architecture's `audit_log` table (§5, §8) that
  M4 does not close.

## M5.1 — Pilot Readiness & Product Hardening (implemented)

**Status: implemented.** M0–M4 built the full patient→disposition→AI→
pharmacist pipeline. M5.1 does not add a new pipeline stage — it audits
and hardens what exists so it's presentable to a controlled pilot: honest
UI copy in every state, a safe error-handling boundary, a documented
authn/authz audit, and the minimum schema foundation for pharmacist
licensing/state-scoping that later milestones will build logic on top of.
Explicitly **not** in scope, per the milestone brief: medication
adherence, payments, B2B organizations, telemedicine/EHR integration,
real patient onboarding, pharmacist compensation, or any production
deployment change.

**DosePrepped's positioning, restated (unchanged by M5.1):** medication
support infrastructure connecting patients, medication education,
pharmacists, and appropriate provider escalation. It is not an AI doctor,
not an emergency service, not a replacement for the dispensing pharmacy,
not a diagnostic tool, and not a replacement for a prescriber.

### Audit method

Before writing any code, this milestone re-read `README.md`, this
document in full, every patient screen, the pharmacist dashboard and
review screen, `apps/api/src/lib/auth.ts` and every route file,
`packages/auth/src/session.ts` and `password.ts`,
`packages/db/prisma/schema.prisma`, and the full existing test suite
(124 tests: 86 API, 17 ai-service, 16 safety-rules, 5 patient). The
findings below are organized by the milestone brief's eight review areas;
each one states either a confirmed, fixed issue or an explicit "reviewed,
no change needed" conclusion — nothing was changed speculatively.

### 1. Patient UX hardening

Confirmed issues, fixed:

- **Two stale, factually-wrong "not implemented yet" notices.** The
  patient Home screen's placeholder notice said "AI-assisted general
  education and pharmacist review are not available yet" — both have been
  fully implemented since Phase 3 and M4. The `/ask-a-pharmacist` screen
  (linked from Home and the bottom nav) showed a permanently `disabled`
  "Request pharmacist review" button and a notice reserving the feature
  for "milestone M4," which is now the current milestone's own already-
  shipped predecessor. Left as-is, a pilot user tapping the primary
  "Ask a pharmacist" CTA would land on a dead end that actively
  contradicts what the product now does. Both screens are rewritten to
  describe the real, implemented model: pharmacist review is **automatic**
  — triggered by a question's deterministic disposition, not a manual
  request — so `/ask-a-pharmacist` now explains that, points to
  "Ask a question" as the actual entry point, and lists the patient's own
  questions currently in a pharmacist-routed status
  (`PHARMACIST_REQUESTED`/`_IN_PROGRESS`/`_RESOLVED`/`ESCALATED`, reusing
  the same `GET /questions` data and `QuestionCard` component already
  used elsewhere — no new endpoint), so the screen is useful instead of a
  dead end. Home's notice is removed (the states it described no longer
  need a disclaimer; they're real product behavior, not placeholders).
- **The top-of-app `DevBanner` still said "M0 — structural placeholders
  only. No real accounts, medication data, or patient information."**
  Also inaccurate: this build has real (synthetic) accounts, medication
  records, question/AI/pharmacist flows. Reworded to accurately describe
  pilot status — synthetic data only, not a production/compliance claim —
  without repeating the specific "M0" milestone tag, which will otherwise
  need updating forever.
- **No intentional Loading, Error, or Not-Found states.** Next.js's
  App Router convention files (`loading.tsx`, `error.tsx`,
  `not-found.tsx`) did not exist anywhere in `apps/patient`, so an
  in-flight navigation showed nothing, a thrown error showed Next's
  default unstyled dev/prod error screen, and an unmatched route showed
  the framework default 404 — none on-brand, none reassuring to a pilot
  user. Root-level versions are added, matching the existing design
  system (not a new one), with the error boundary explicitly not
  rendering any error detail (message/stack) to the user — see "Error
  handling" below for why.

States confirmed **already correct, left alone**: Empty (medications,
questions, pharmacist queue all had real empty-state copy already),
Success (question confirmation, pharmacist response, escalation
confirmation all already existed with correct content per Phase 2/3/M4),
Unauthorized (wrong-role access already redirects via
`apps/patient/src/lib/require-role.ts`; unauthenticated access to any
protected server component already redirects to `/login`), Question
pending pharmacist / completed / escalated (Phase 2/M4 disposition and
status messaging, see `AiEducationSection.tsx`), AI unavailable (Phase 3's
`AI_FALLBACK_MESSAGES`, unchanged). Rebuilding any of these would have
been redesign, not hardening, so none were touched.

### 2. Pharmacist UX hardening

Reviewed against every item in the milestone brief (what requires
attention, why routed to them, the deterministic disposition, what AI
generated, what they're responsible for, claim state, whether the
patient already has a response) against the M4 dashboard and review
screen. **No confirmed gaps** — the M4 build already surfaces: dashboard
counts and a disposition-sorted queue (what needs attention and why,
transparently labeled "Sorted: provider-evaluation questions first, then
oldest first"); `Disposition` and `Safety rule version` fields on the
review screen; the AI-generated summary in its own card, explicitly
labeled "AI-generated summary (assistive only)"; a `Your response` /
respond-composer that only appears once claimed, making claim ownership
and responsibility unambiguous by construction (an unclaimed question has
no compose box at all); and status badges (New/In Review/Completed/
Escalated) driven by the same `status` enum the patient sees. No new
clinical functionality was added, per the milestone brief.

### 3. Authentication / authorization review

Audited `apps/api/src/lib/auth.ts`, `routes/auth.ts`,
`packages/auth/src/session.ts`, and every route file's `preHandler`/
ownership-scoping. **No confirmed issues** — every item in the brief's
checklist was already true and is now covered by an explicit regression
test where one didn't already exist (see "Testing" below):

- Patient routes require `requireRole(Role.PATIENT)`; pharmacist routes
  require `requireRole(Role.PHARMACIST)` — verified by reading every
  route registration, not sampled.
- A patient hitting a pharmacist endpoint (or vice versa) gets `403`
  (`requireRole`), already covered by existing tests.
- A pharmacist can only reach a question via the shared-unclaimed-OR-own-
  claimed `where` clause (`pharmacist-questions.ts`), returning `404` —
  never `403` — for anything outside that scope, so existence of another
  pharmacist's claimed question is never confirmed or denied.
- No route accepts a client-supplied user/pharmacist ID for any write —
  every mutation uses `request.user.id` from the verified session,
  eliminating impersonation by construction, not by a runtime check that
  could be forgotten on a new route.
- Session invalidation: `deleteSession` removes the DB row by token hash
  on logout; `getSessionUser` checks `expiresAt` and the owning user's
  `deletedAt` on every request, so a deleted account's existing sessions
  stop resolving immediately, not just at next expiry.
- Logout (`POST /auth/logout`) requires an authenticated session, deletes
  it server-side, and clears the cookie — already tested
  (`logs out and invalidates the session`).
- Unauthenticated requests to every protected route fail with `401`
  before touching any handler logic (`authenticate` runs first in
  `requireRole`) — already tested across `auth.test.ts`,
  `medications.test.ts`, `questions.test.ts`, and
  `pharmacist-questions.test.ts`.

**One confirmed gap, fixed**, that is adjacent to authorization rather
than authorization itself: there was no global Fastify error handler, so
an *unexpected* thrown error (not one of the deliberate `reply.code(...)
.send(...)` calls above) would fall through to Fastify's default
handler, which includes `error.message` in the JSON response — for a raw
Prisma error this could leak schema/query detail to the client. See
"Error handling" below.

### 4. Pharmacist profile foundation

New `PharmacistProfile` model, one-to-one with `User` (nullable relation
— only ever created for `PHARMACIST`-role accounts), added to
`schema.prisma`:

```
enum PharmacistCredentialStatus {
  UNVERIFIED        -- default; no review has occurred
  PENDING_REVIEW     -- submitted, awaiting admin/compliance review
  VERIFIED             -- reviewed and confirmed (not implemented: no
                        -- verification workflow exists to set this)
  SUSPENDED             -- reviewed and found ineligible / paused
}

model PharmacistProfile {
  id                String                       @id @default(uuid())
  pharmacist        User                          @relation(fields: [pharmacistId], references: [id], onDelete: Cascade)
  pharmacistId      String                        @unique
  licenseState      String?                       -- free-text state/jurisdiction; no format validation yet
  licenseNumber     String?                       -- free-text; not checked against any registry
  credentialStatus  PharmacistCredentialStatus     @default(UNVERIFIED)
  createdAt         DateTime                       @default(now())
  updatedAt         DateTime                       @updatedAt
}
```

This is deliberately inert beyond storage and read access — **no
verification logic, no state-scoping enforcement on claim/respond/
escalate, no license-format validation, and no admin UI to edit it** are
built in M5.1, matching the brief's "do not implement clinical licensing
logic yet." `credentialStatus` defaulting to `UNVERIFIED` and every
demo/seed value being obviously synthetic is intentional so that entering
a license number is never mistaken for verifying one — the field
existing does not constitute a claim that anyone has checked it.

**Exposure:** `GET /auth/me` now includes `pharmacistProfile` (the four
fields above, or `null`) **only when the authenticated caller's own role
is `PHARMACIST`** — a pharmacist can see their own profile status; the
key is omitted entirely (not present, not `null`-for-everyone) from a
patient's or admin's own `/auth/me` response, and there is no route
anywhere that lets a pharmacist read another pharmacist's profile or a
patient read any pharmacist's profile. This is pilot/admin-facing
groundwork, not a patient-facing feature — nothing in the patient app
reads or displays it.

### 5. Auditability

Reviewed the full `MedicationQuestion` timestamp/ownership field set
against the brief's checklist (created, disposition-assigned, claimed +
by whom, responded + by whom, escalated + by whom). **Every field the
brief asks for already exists and is already populated** —
`createdAt`, `dispositionAssignedAt`, `pharmacistClaimedAt` +
`pharmacistId`, `pharmacistRespondedAt` (same `pharmacistId` — one actor
per question by construction), `escalatedAt` (same `pharmacistId`). Per
the explicit instruction ("if the current timestamps and ownership fields
are sufficient for M5.1, leave them alone"), **no schema change was made
here** — this section documents the conclusion, not a build.

### 6. PHI / logging review

Re-audited every `console.*`/logging call site in both apps.
**No confirmed violations** — `apps/api/src/config/env.ts` logs Zod
*validation error shape* (field names and messages) on a misconfigured
environment, never a secret or PHI value; nothing else in either app logs
directly. Fastify's request logging (already configured, unchanged since
M1) logs method/URL/status only — request and response bodies are never
included, so question text, AI output, and pharmacist responses were
already excluded before M5.1.

The one gap **was** the error-handler leak path described in §3/§7 —
without a global handler, an unexpected exception's `.message` (which,
for some error types, could include values from the failed operation)
would reach the client response. Fixed by the same change described next.
This document still makes **no HIPAA-compliance claim** — see
"Remaining pilot limitations" below and the original §8 for what's still
required before real PHI.

### 7. Error handling

Added `app.setErrorHandler(...)` in `apps/api/src/app.ts`: every
*deliberate* `reply.code(...).send({ error: "..." })` call already in the
codebase (400/401/403/404/409, all with hand-written, safe messages) is
unaffected — those never reach the error handler, since a handled
response is not a thrown error. The handler only intercepts what would
otherwise be an *unexpected* exception, and for those:

- Logs the full error server-side via `request.log.error` (so it's still
  debuggable) — logging is intentionally *not* changed to skip this; only
  the client-facing response is sanitized.
- Zod validation errors thrown by Fastify's own body/query parsing (as
  opposed to the routes' own `safeParse` calls, which already return a
  controlled 400) are still mapped to `400` with a generic message, not
  the raw Zod issue tree.
- Fastify's built-in rate-limit errors keep their existing `429` status
  and message (already safe, unchanged).
- Every other thrown error returns a flat `500` with
  `{ error: "Something went wrong. Please try again." }` — no
  `error.message`, no stack trace, no Prisma error detail, no internal
  IDs beyond what the request already carried. This closes the one
  confirmed leak path from §3/§6 above.

The frontend's new `error.tsx` (see "Patient UX hardening") applies the
same principle client-side: it never renders the caught error's message
or stack to the user, only a generic "Something went wrong" screen with a
retry action.

### 8. Testing

New: `apps/api/tests/error-handling.test.ts` (the sanitized-500 behavior
— asserts a deliberately-triggered unexpected error returns a generic
message with no leaked detail, and that existing deliberate 4xx responses
are unaffected) and a `pharmacistProfile` visibility assertion added to
`apps/api/tests/auth.test.ts` (present for a pharmacist's own
`/auth/me`, absent for a patient's). Everything else the brief's testing
checklist asks for (authentication boundaries, patient/pharmacist
authorization, logout/session invalidation, question lifecycle,
pharmacist claim/response/escalation, the safety rules, AI behavior,
ownership isolation) was already comprehensively covered by the 124
pre-existing tests audited in this milestone — see "Audit method" above
— so no duplicate tests were added for already-covered ground, per the
explicit "add or update tests only where needed" instruction.

### Remaining pilot limitations

Everything M4's own "Current limitations" already listed still applies
unchanged (synthetic pharmacist accounts, no SLA enforcement, no two-way
messaging, no pharmacist state/licensure *enforcement*, presentation-only
prioritization, no independent audit-log table). M5.1 adds:

- **`PharmacistProfile` is storage only.** No verification workflow, no
  license-format validation, no state-scoping enforcement anywhere a
  pharmacist claims/responds/escalates. Any pharmacist can still act on
  any queued question regardless of `licenseState`.
- **No admin UI** to view or edit pharmacist profiles — the only write
  path today is direct database/seed access, matching the "no clinical
  licensing logic yet" instruction.
- **No production deployment changes were made or evaluated** — this
  milestone is app-layer hardening only, per the explicit constraint.
- The full technical/operational/legal/vendor requirements list in the
  original architecture's §8 remains entirely unmet (penetration testing,
  MFA, Argon2, encryption-at-rest policy, BAAs, HIPAA risk assessment,
  etc.) — nothing in M5.1 changes that gate, and this document continues
  to make no HIPAA-compliance claim.

---

## M5.2 — Medication Journey & Adherence Foundation (implemented)

**Status: implemented.** M0–M5.1 built and hardened the pre-prescription
question/pharmacist pipeline. M5.2 adds the **post-prescription**
medication journey: `Prescription → Medication → Schedule → Adherence →
Check-ins → Questions → Pharmacist → Provider escalation`. This is a
**foundation**, not a clinical or engagement product — every capability
below is medication-agnostic (nothing GLP-1-specific, no weight-loss or
calorie/exercise tracking), and none of it computes, recommends, or
implies a dosing decision.

**Explicitly not in scope, per the milestone brief** (unchanged from
M5.1's constraints plus these): GLP-1-specific functionality, weight-loss
tracking, calorie/exercise tracking, dosing recommendations or
dose-adjustment logic, clinical recommendations of any kind, B2B
organization management, payments, telehealth/EHR integration, production
deployment changes.

**DosePrepped's positioning, restated (unchanged by M5.2):** medication
support infrastructure connecting patients, medication education,
pharmacists, and appropriate provider escalation. It is not an AI doctor,
not an emergency service, not a replacement for the dispensing pharmacy,
not a diagnostic tool, and not a replacement for a prescriber. Adherence
data in M5.2 is **informational and supportive only** — the system never
recommends a medication or dose change, never determines whether a
patient should continue a medication, never diagnoses an adverse event
from adherence or check-in data, and never replaces pharmacist or
provider judgment.

### Audit method

Before writing any code, this milestone re-read `README.md`, this
document in full (including the M4 and M5.1 sections above), the
`PatientMedication` model and every `apps/api/src/routes/medications.ts`
handler, the full question lifecycle
(`questions.ts`/`pharmacist-questions.ts`/`packages/safety-rules`/
`packages/ai-service`), the patient medication detail screen and the
pharmacist review screen, and the existing 129-test suite (91 API, 17
ai-service, 16 safety-rules, 5 patient) to understand exactly what
already exists before adding to it.

### 1. Medication schedule foundation

**`PatientMedication` is not extended.** Its existing fields — `name`,
`strength`, `dosageForm`, `directions`, `frequency`, `route`, `startDate`,
`endDate` — already represent a medication's schedule as free-text,
patient-reported information (e.g. `frequency: "Twice daily"`,
`directions: "Take one tablet by mouth with food"`). M5.2 deliberately
does **not** parse `frequency` into a structured cadence or auto-generate
a calendar of expected dose times — doing so would require deciding what
a "scheduled dose" is for a given frequency string, which is dosing logic
the milestone brief explicitly excludes ("the system should represent a
schedule, not decide what dose a patient should take"). Instead, the
schedule a patient sees is the same medication record they already
manage, and the *adherence* layer below is patient-initiated self-report,
not system-generated.

**New model — `MedicationAdherenceEvent`** (the "appropriate abstraction
for future adherence events" the brief asks for):

```prisma
enum AdherenceStatus {
  TAKEN
  MISSED
  SKIPPED
}

model MedicationAdherenceEvent {
  id           String           @id @default(uuid())
  patient      User             @relation(fields: [patientId], references: [id], onDelete: Cascade)
  patientId    String
  medication   PatientMedication @relation(fields: [medicationId], references: [id], onDelete: Cascade)
  medicationId String
  scheduledAt  DateTime
  recordedAt   DateTime         @default(now())
  status       AdherenceStatus
  createdAt    DateTime         @default(now())

  @@index([patientId])
  @@index([medicationId])
  @@map("medication_adherence_events")
}
```

- **`scheduledAt`** is the dose time the event is *about* — supplied by
  the patient (defaulting to "now" if they're logging a dose as they take
  it), not computed from `frequency`. **`recordedAt`** is server-stamped
  (`new Date()`, never client-supplied) — the moment the event was
  logged, which may differ from `scheduledAt` if a patient logs a missed
  dose after the fact. This mirrors the existing pattern of
  server-authoritative timestamps elsewhere in the schema (e.g.
  `pharmacistClaimedAt`).
- **No unnecessary fields.** No free-text notes on the event itself (a
  patient's qualitative "how am I doing" belongs to the separate
  check-in below, not to a single dose record); no computed/duplicated
  `adherencePercentage` column — percentage is always derived at read
  time (see §2) so it can never drift from the underlying events.
- **Immutable, append-only.** There is no `PATCH`/`DELETE` route for an
  adherence event — matching the existing "archive, don't mutate history"
  posture used for `PatientMedication` and the "no code path can rewrite
  a past disposition" posture used for `MedicationQuestion`. A correction
  is a new event, not an edit to an old one. This is a real limitation
  (no way to fix a fat-fingered entry) accepted for a pilot-scale
  foundation — see "Remaining limitations" below.
- **Archived-medication behavior**: recording a *new* adherence event
  requires the medication to be `ACTIVE` (a `409` if `INACTIVE` —
  logging "I took a dose" of an archived/discontinued medication isn't a
  meaningful action); reading history is unaffected by archive status,
  matching the existing "archive doesn't hide history" principle.

### 2. Adherence tracking

`POST /medications/:id/adherence-events` and
`GET /medications/:id/adherence-events` (`apps/api/src/routes/
medication-journey.ts`), both `requireRole(PATIENT)` and scoped by the
same `{ id, patientId: request.user.id }` ownership pattern as every
other medication/question route — a medication that exists but belongs
to another patient is `404`, identical to `GET /medications/:id`. There
is no route that lists or reads adherence events across medications or
patients.

**Adherence percentage — exact, documented formula**
(`apps/api/src/lib/adherence.ts`, `computeAdherenceSummary`):

```
takenCount / (takenCount + missedCount + skippedCount) × 100, rounded to
the nearest whole number. `adherencePercentage` is `null` when there are
zero recorded events (nothing to divide by) — never displayed as "0%" or
any other misleading default.
```

This is the *only* place adherence percentage is computed — the API
response and the pharmacist context (§5) both call this one function, so
the number can never disagree with itself across screens. It is a plain
ratio of patient-recorded events, nothing more: it does not weight doses
by recency, does not treat `SKIPPED` differently from `MISSED`, and does
not attempt any clinical interpretation. The API and UI display it as a
bare stat — **`Adherence: 91%`** — with no qualitative label ("good,"
"poor," "concerning") anywhere in the code, per the explicit instruction
not to editorialize the number.

### 3. Patient medication journey (timeline)

No new storage. `GET /medications/:id/timeline` (same ownership scoping)
calls `buildMedicationTimeline` (`apps/api/src/lib/timeline.ts`), a pure
function that reads the medication record, its adherence events, its
check-ins (§4), and its questions (with their pharmacist-response/
escalation fields) — all already-existing queries — and merges them into
one chronologically sorted list of typed entries:
`MEDICATION_STARTED`, `MEDICATION_ARCHIVED`, `DOSE_TAKEN`, `DOSE_MISSED`,
`DOSE_SKIPPED`, `CHECK_IN_COMPLETED`, `QUESTION_SUBMITTED`,
`PHARMACIST_RESPONDED`, `QUESTION_ESCALATED`. Each entry carries only a
patient-friendly `label` and `occurredAt`, plus the minimum linking data
the frontend needs (e.g. a question's `id` to link to it) — never a raw
database column name, an internal enum value the patient wouldn't
recognize, or another patient's data. Deriving instead of duplicating
means the timeline can never drift from the records it's built from, and
a future field added to any source table doesn't require a migration
here.

### 4. Medication check-ins

**New model — `MedicationCheckIn`**:

```prisma
enum CheckInResponse {
  DOING_WELL
  HAVING_SOME_ISSUES
  HAVING_SIGNIFICANT_ISSUES
  HAS_A_QUESTION
}

model MedicationCheckIn {
  id           String           @id @default(uuid())
  patient      User             @relation(fields: [patientId], references: [id], onDelete: Cascade)
  patientId    String
  medication   PatientMedication @relation(fields: [medicationId], references: [id], onDelete: Cascade)
  medicationId String
  response     CheckInResponse
  notes        String?
  createdAt    DateTime         @default(now())

  @@index([patientId])
  @@index([medicationId])
  @@map("medication_check_ins")
}
```

`POST` / `GET /medications/:id/check-ins`, same ownership pattern, same
file. A check-in is a **stored patient-reported data point, nothing
more** — there is no code path anywhere that reads `response` or `notes`
and generates a diagnosis, a treatment suggestion, or a dose-change
recommendation. When `response` is `HAVING_SIGNIFICANT_ISSUES` or
`HAS_A_QUESTION`, the patient UI (§6) shows a CTA straight to the
existing "Ask a question" flow (pre-filling the medication) — the
*existing* deterministic safety/disposition/pharmacist pipeline is the
only thing that ever acts on a patient's words; a check-in never
auto-creates a question, never auto-notifies a pharmacist, and never
bypasses that pipeline. This keeps check-ins strictly a structured mood/
status signal plus a pathway to the real intake flow, never a parallel
clinical channel.

### 5. Pharmacist context

`GET /pharmacist/questions/:id` gains one additional field,
`medicationContext`, computed only for the question the pharmacist
already has authorized access to (the existing `visibilityWhere` scoping
from M4 is unchanged — no new question becomes visible to any
pharmacist):

```
medicationContext: {
  startedAt: string | null,           // PatientMedication.startDate
  adherence: {                        // system-calculated, computeAdherenceSummary()
    takenCount, missedCount, skippedCount, totalCount,
    adherencePercentage: number | null,
  } | null,                            // null if the medication has 0 recorded events
  recentCheckIn: {                     // patient-reported, most recent only
    response, notes, occurredAt,
  } | null,
  recentQuestion: {                    // patient-reported, most recent OTHER question
    category, questionText, occurredAt, status,
  } | null,
}
```

- **Bounded, not a history dump.** Only the *most recent* check-in and
  *most recent other question* about this same medication are included —
  never a full list — directly per the instruction that "the pharmacist
  should NOT receive an overwhelming amount of irrelevant history."
- **Same patient, same medication only — a deliberate, bounded widening
  of pharmacist-visible data, documented explicitly here.** `recentCheckIn`
  and `recentQuestion` are queried by `{ patientId: question.patientId,
  medicationId: question.medicationId }` — both values already known
  server-side from the question the pharmacist is authorized to view, but
  neither `patientId` nor `medicationId` is added to the pharmacist-facing
  response (matching the existing "never expose the patient's identity"
  rule from M4). `recentQuestion` can surface text from a question the
  viewing pharmacist never claimed and may not be assigned to them — this
  is new in M5.2. It is scoped as tightly as possible (same patient, same
  medication, most recent one only, no `pharmacistResponse` from that
  other question included) and is presented read-only as context, exactly
  like the existing `aiPharmacistSummary` pattern. This boundary should be
  revisited if a future milestone introduces pharmacist state/licensure
  scoping, where "any pharmacist can see this" may need to narrow further.
- **Clear provenance labeling, everywhere this is displayed.** The
  pharmacist review screen renders `medicationContext` under a heading
  distinct from the patient's current question, the existing
  AI-generated summary card, and the pharmacist's own response card — see
  §6. `adherence` is system-calculated (derived from patient-recorded
  events, not a subjective judgment); `recentCheckIn`/`recentQuestion` are
  patient-reported (the patient's own words/selections, unedited);
  `aiPharmacistSummary` (unchanged, M4) remains labeled AI-generated;
  `pharmacistResponse` (unchanged, M4) remains labeled as the pharmacist's
  own words. No code path lets AI-generated or system-calculated content
  render under a "pharmacist" or "clinician" label, or vice versa.
- **The pharmacist queue *list*, unlike the single-question detail view,
  is unchanged** — no `medicationContext` on `GET /pharmacist/queue` —
  to avoid an N+1 context computation across every queued question and to
  keep the list itself scannable, per "do not add new clinical
  functionality" and "should not receive an overwhelming amount."

### 6. Patient UX

Reuses the existing medication detail screen and design system — no new
patterns, no redesign. Added, on `/medications/:id`:

- **Record a dose** — three buttons (Taken / Missed / Skipped), each a
  single POST with `scheduledAt = now`. Loading and error states match
  the existing `ArchiveMedicationButton` pattern. Disabled (with an
  explanatory line) when the medication is `INACTIVE`.
- **Adherence** — the bare `Adherence: NN%` stat plus the exact
  denominator ("based on N recorded doses") so the number is never
  presented without its basis; **"No adherence history yet"** when
  `adherencePercentage` is `null`.
- **Recent activity** — the last few adherence events, each labeled with
  its status and when it was recorded.
- **Check-in** — "How are you doing with this medication?" with the four
  structured responses as buttons plus an optional free-text note.
  Showing **"Check-in available"** vs **"Check-in completed"** (most
  recent response + date) as the state; submitting
  `HAVING_SIGNIFICANT_ISSUES` or `HAS_A_QUESTION` immediately surfaces an
  "Ask a question" CTA — never a clinical response generated by the app
  itself.
- **Timeline** — a dedicated `/medications/:id/timeline` page (linked
  from the detail screen, not inlined, to keep the main detail screen
  from growing unbounded) rendering `buildMedicationTimeline`'s output
  chronologically.
- **States covered, explicitly**: no schedule/events yet (medication just
  added, zero adherence events — "No adherence history yet" +
  "Record a dose" is the only action), upcoming dose (out of scope — no
  scheduling/reminder engine exists, so there is no "upcoming dose"
  concept to render; see limitations), dose taken/missed/skipped
  (rendered in Recent activity immediately after recording), check-in
  available/completed (above), no adherence history (above),
  error/loading (every new client component follows the existing
  `ArchiveMedicationButton`/`PharmacistQuestionActions` loading-flag +
  inline `role="alert"` error-message pattern already used throughout the
  app — no new error-handling pattern introduced).

### Safety constraints — how each is enforced, not just asserted

- **No medication/dose-change recommendations, no clinical
  appropriateness determination, no automatic decisions from adherence
  data**: there is no code path anywhere in M5.2 that reads an adherence
  percentage or a check-in response and writes to `disposition`, a
  medication field, or any AI/pharmacist-facing recommendation. The only
  consumers of adherence/check-in data are (a) a bare percentage/label
  display and (b) the bounded pharmacist context in §5 — both read-only,
  informational renderings.
- **No adverse-event diagnosis**: a `HAVING_SIGNIFICANT_ISSUES` check-in
  produces exactly one system action — showing a link to "Ask a
  question" — never an automated response, triage, or assessment.
- **Doesn't replace pharmacist/provider judgment**: the existing
  deterministic safety/disposition engine and pharmacist workflow (M3
  Phase 2, M4) are completely unmodified by M5.2; adherence/check-in data
  never skips, reorders, or overrides that pipeline.

### Data / privacy

- **Nothing new is logged.** Check-in free-text notes follow the exact
  same rule as question/AI/pharmacist-response text (never written to
  application logs); Fastify's request logging continues to record only
  method/URL/status, never bodies. No new field introduces a new logging
  surface.
- **Ownership isolation** for both new models mirrors
  `PatientMedication`/`MedicationQuestion` exactly: every read and write
  is scoped to `patientId: request.user.id` (and, for adherence/check-ins,
  additionally to a medication already confirmed to belong to that
  patient) — there is no route, anywhere, that accepts a `patientId` from
  the request body or resolves one record without the authenticated
  user's own ID in the `WHERE` clause.

### Remaining limitations (pilot-scale foundation, not a finished product)

- No structured dosing schedule / reminder engine — `frequency` remains
  free text, there is no "next dose due" concept, and no push/SMS/email
  reminder exists. This is explicitly deferred, not an oversight — the
  brief prohibits dosing logic.
- Adherence events are immutable and append-only — no edit/delete route,
  so a mis-tap can only be corrected by logging a new event, not fixing
  the old one.
- The pharmacist-context "recent other question" widening (§5) is a new,
  intentionally narrow authorization surface that should be reviewed
  again once pharmacist state/licensure scoping is implemented.
- No trend/streak visualization, no export, no caregiver/family sharing.
- Check-ins and adherence events are per-medication only — there is no
  cross-medication or whole-regimen adherence view yet.

---

## M5.3 — Pilot Analytics & ROI Instrumentation (implemented)

**Status: implemented.** M5.3 does not add a new patient- or
pharmacist-facing workflow — it instruments the ones that already exist
(M3 question intake/disposition/AI, M4 pharmacist workflow, M5.2
medication journey) so DosePrepped can answer, with real numbers, the
questions a prospective telehealth customer would ask before a pilot:
how many patients used it, how many questions got answered without ever
reaching a provider, how fast pharmacists responded, how big the queue
gets. It supersedes the illustrative `AnalyticsEvent` sketch from the
original architecture (§11/§15) with an implemented version.

**Explicitly not in scope, per the milestone brief:** Wasef-specific or
any other single-customer-specific functionality, another major
patient-facing feature, payments, advertising, billing, a full
multi-tenant/organization system, and any claim of clinical outcomes or
cost savings that haven't actually been measured. DosePrepped remains
medication-agnostic, organization-agnostic, and B2B-*capable* (not
B2B-*built*) after this milestone.

### Audit method

Before writing any code, this milestone re-read `README.md`, this
document in full (including the original §11 Analytics architecture
sketch and the M5.2 section above), and every route file that produces a
metric this milestone reports on: `medications.ts`, `medication-journey.ts`,
`questions.ts`, `pharmacist-questions.ts`, and the underlying
`packages/safety-rules` / `packages/ai-service` outputs. No analytics or
event-related code existed before this milestone — `AnalyticsEvent` was
purely illustrative, never created.

### 1. Analytics event architecture

**A centralized taxonomy, not scattered calls.** Every event is emitted
through one function, `emitAnalyticsEvent()`
(`apps/api/src/lib/analytics.ts`), called from inside the existing,
already-authenticated/ownership-checked route handlers — never from a
new public ingestion endpoint. (The original §11 sketch proposed `POST
/analytics/events`; this milestone deliberately does *not* build that —
an endpoint that accepts arbitrary event writes from the client is
unnecessary attack surface when every event this milestone needs is
already known server-side at the moment the underlying action succeeds.)

```prisma
enum AnalyticsEventType {
  PATIENT_MEDICATION_VIEWED
  MEDICATION_ADHERENCE_RECORDED
  MEDICATION_CHECKIN_COMPLETED
  QUESTION_SUBMITTED
  QUESTION_DISPOSITION_ASSIGNED
  AI_EDUCATION_GENERATED
  AI_EDUCATION_FAILED
  PHARMACIST_QUEUE_ENTERED
  PHARMACIST_CLAIMED
  PHARMACIST_RESPONDED
  PHARMACIST_ESCALATED
  PROVIDER_ESCALATION_CREATED
}

model AnalyticsEvent {
  id           String             @id @default(uuid())
  eventType    AnalyticsEventType
  patientId    String?
  pharmacistId String?
  questionId   String?
  medicationId String?
  metadata     Json?
  createdAt    DateTime           @default(now())

  @@index([eventType, createdAt])
  @@index([patientId])
  @@index([questionId])
  @@map("analytics_events")
}
```

- **Deterministic, versionable taxonomy.** `AnalyticsEventType` is a
  closed Prisma enum — emitting an unlisted event type is a compile-time
  error, not a typo a report can silently miss. Every event type listed
  in the milestone brief is implemented; **`QUESTION_STARTED` was
  deliberately not built** — there is no server-side "draft" or
  "started" state for a question today (intake is a single `POST
  /questions` call), so emitting that event would mean inventing a
  signal the workflow doesn't actually produce, which the brief
  explicitly prohibits ("do not create fake events"). If a multi-step
  intake draft is ever built, `QUESTION_STARTED` can be added the same
  way every other event was: from the route handler that actually
  performs that action.
- **No hard foreign keys.** `AnalyticsEvent` intentionally does *not*
  `@relation` to `User`/`MedicationQuestion`/`PatientMedication` — it's
  an independent, append-only log, not a first-class domain entity (unlike
  `MedicationAdherenceEvent`/`MedicationCheckIn` in M5.2, which *are*
  domain entities and do use real relations). This avoids coupling the
  event log's lifecycle to cascade-delete behavior on the tables it
  references, and keeps a future retention/archival policy (§6) simple to
  apply independently.
- **Fire-and-forget, never blocking, never failing the request.**
  `emitAnalyticsEvent()` wraps its `prisma.analyticsEvent.create()` call
  in a try/catch that only logs on failure — analytics can never turn a
  successful patient/pharmacist action into a failed HTTP response, and a
  transient analytics-write failure can never surface to the user. This
  is also *why* the reporting service (§4) computes headline funnel
  numbers from the source-of-truth tables (`MedicationQuestion`,
  `PatientMedication`, `MedicationAdherenceEvent`, `MedicationCheckIn`)
  rather than solely from the event log — an occasional dropped event
  must never silently undercount a metric a customer might see.
- **Where each event is emitted** (all in the existing route handler,
  immediately after the underlying write succeeds):

  | Event | Emitted from | Metadata (non-PHI only) |
  |---|---|---|
  | `PATIENT_MEDICATION_VIEWED` | `GET /medications/:id` | `{status}` |
  | `MEDICATION_ADHERENCE_RECORDED` | `POST /medications/:id/adherence-events` | `{status}` |
  | `MEDICATION_CHECKIN_COMPLETED` | `POST /medications/:id/check-ins` | `{response}` — never `notes` |
  | `QUESTION_SUBMITTED` | `POST /questions` | `{category}` |
  | `QUESTION_DISPOSITION_ASSIGNED` | `POST /questions` | `{disposition, dispositionSource}` |
  | `AI_EDUCATION_GENERATED` | `POST /questions`, when the AI outcome is `SUCCESS` | `{disposition, hasClarifyingQuestion, hasPharmacistSummary, inputTokens, outputTokens}` — never `aiEducationResponse`/`aiPharmacistSummary` text |
  | `AI_EDUCATION_FAILED` | `POST /questions`, when the AI outcome is `FAILED` | `{disposition}` |
  | `PHARMACIST_QUEUE_ENTERED` | `POST /questions`, when auto-queued | `{disposition}` |
  | `PHARMACIST_CLAIMED` | `POST /pharmacist/questions/:id/claim` | `{disposition, waitTimeMs}` |
  | `PHARMACIST_RESPONDED` | `POST /pharmacist/questions/:id/respond` | `{handlingTimeMs}` — never `responseText` |
  | `PHARMACIST_ESCALATED` | `POST /pharmacist/questions/:id/escalate` | `{escalationReasonCategory}` — never the free-text `escalationReason` |
  | `PROVIDER_ESCALATION_CREATED` | `POST /questions` (disposition `PROVIDER_EVALUATION`) *and* `POST /pharmacist/questions/:id/escalate` | `{source: "automatic_routing" \| "pharmacist_initiated", escalationReasonCategory?}` |

  `PROVIDER_ESCALATION_CREATED` can fire twice for the same question (an
  automatic-routing event at creation, then a pharmacist-initiated event
  if a pharmacist separately escalates it later) — this is intentional:
  it's an audit trail of *every* moment a question touched
  provider-level routing, not a deduplicated count. The reporting
  service (§4) computes the deduplicated, per-question escalation rate
  from `MedicationQuestion` directly, exactly for this reason.

### 2. What analytics must never store

Restating and enforcing the milestone brief's privacy list, one column at
a time:

- **No question text, pharmacist response text, check-in free-text
  notes, or AI response text** — `metadata` on every event above is a
  small, explicitly-enumerated object; nothing free-text ever goes into
  it. Verified by a dedicated test that creates a question with
  distinctive text and a check-in with distinctive notes, then asserts
  neither string appears anywhere in any event's serialized metadata.
- **No passwords, tokens, or session data** — nothing in `packages/auth`
  or `apps/api/src/lib/auth.ts` was touched by this milestone; no
  analytics event is emitted from any auth route.
- **Only the minimum metadata needed to measure the workflow** — e.g.
  `PHARMACIST_ESCALATED` stores the closed-taxonomy
  `escalationReasonCategory` (useful for "escalation reason breakdown")
  but never the pharmacist's free-text explanation.
- **`patientId`/`pharmacistId`/`questionId`/`medicationId` are opaque
  UUID identifiers, not content** — the same category of data already
  stored as foreign keys throughout the schema (e.g.
  `MedicationQuestion.patientId`). They're required to compute "active
  patients," "repeat usage," and per-pharmacist volume; excluding them
  would make those explicitly-requested metrics impossible to compute.

### 3. Provider escalation — the critical metric, defined precisely

Two questions the brief asks for a "clearly defined metric" for:

- **"Escalated to provider"** (the brief's suggested careful phrasing,
  used verbatim in the report/UI) — a question counts as escalated to
  provider if **either** its deterministic disposition was
  `PROVIDER_EVALUATION` at creation (automatic routing — the patient sees
  "This question may require evaluation by your healthcare provider,"
  see the M3 Phase 2 disposition messaging) **or** a pharmacist later set
  `status = ESCALATED` on it (pharmacist-initiated — reachable from a
  `PHARMACIST_REVIEW`-disposition question too, if the pharmacist decides
  mid-review that provider evaluation is warranted). A question matching
  either condition is counted **once** (`OR`, not summed) —
  `providerEscalation.totalEscalatedToProvider` in the report.
- **"Provider escalation rate"** = `totalEscalatedToProvider /
  totalQuestions` for the reporting window. A plain ratio, nothing more.
- **"Resolved without provider escalation"** = `totalQuestions -
  totalEscalatedToProvider` (and the corresponding rate). This label was
  chosen deliberately from the brief's suggested vocabulary over
  alternatives like "successfully handled" — it states only that the
  question's path never required routing toward provider-level care, not
  that the patient's underlying medical situation was resolved, improved,
  or that any clinical outcome occurred. DosePrepped has no way to
  observe clinical outcomes.
- **`URGENT_EMERGENCY` is tracked separately, never folded into
  "escalated to provider."** It's categorically different — the patient
  is told to call 911/Poison Control, not "contact your provider," and
  the question is never queued for AI or a pharmacist at all (see M3
  Phase 2 architecture). Mixing it into the provider-escalation rate
  would conflate two different severity signals into one number.
- **What this metric does *not* claim.** DosePrepped never messages an
  actual provider (no provider accounts/messaging integration exists —
  unchanged since M4) — "escalated to provider" means *the patient was
  routed/directed toward provider-level care*, not that a provider
  received, reviewed, or acted on anything. The report and any
  customer-facing copy must preserve this distinction. **No causal or
  outcome claim is made anywhere in this milestone** — the metric
  describes *routing*, not clinical benefit, cost savings, or "provider
  time saved." That last phrase is deliberately absent from this
  codebase; see §5 below.

### 4. Reporting service

`apps/api/src/lib/analytics-report.ts` exports `buildAnalyticsReport({
from, to })`, called by `GET /admin/analytics/report?from=&to=`
(`ADMIN`-only — see §5). Metrics are grouped exactly as the milestone
brief's six sections (patient engagement, question funnel, AI,
pharmacist, provider escalation, adherence/check-in), plus a labeled
`roiOperationalMetrics` section (§6). Two computation strategies are used
deliberately:

- **Range-bound activity metrics** (e.g. questions submitted, pharmacist
  responses, adherence events) are computed from the source-of-truth
  domain tables filtered by `createdAt`/the relevant timestamp within
  `[from, to)` — never solely from the event log, per §1's
  fire-and-forget rationale.
- **Snapshot metrics** are point-in-time state, not a flow, and split
  into two kinds depending on whether they're reconstructable
  historically: `totalPatients`/`totalMedicationRecords` are computed
  *as of `to`* (`createdAt <= to`, so a historical report reflects that
  moment); the unclaimed queue volume and queue aging are computed *as of
  now* regardless of `to` — there's no stored history of past
  claim/release cycles (`release` puts a question back in the shared
  queue with no record of when), so a historical queue snapshot isn't
  reconstructable from the current schema. Both are documented in the
  report's field names and this is called out explicitly as a limitation
  in "Remaining limitations" below.
- **`activePatients`** is the one metric that *does* need the event log:
  a patient who only viewed a medication (no question, no adherence
  event, no check-in) has no other trace in the domain tables.
  `activePatients` is the distinct union of `patientId` across
  `MedicationQuestion`, `MedicationAdherenceEvent`, `MedicationCheckIn`
  (all filtered to the range) and `PATIENT_MEDICATION_VIEWED` events in
  the same range.
- **Pharmacist response/handling time** use the same
  `pharmacistRespondedAt - pharmacistClaimedAt` delta already computed
  ad hoc elsewhere (M4's "time metrics computed on read" pattern) —
  averaged here across every response in range, not stored as a separate
  value.
- **Queue aging** is computed only over *currently* unclaimed questions
  (`status = PHARMACIST_REQUESTED`, `pharmacistId = null`, as of `to`):
  `now - pharmacistRequestedAt`, averaged. Like queue volume, this is a
  snapshot, not a range-bound flow.

### 5. Authorization

- `GET /admin/analytics/report` requires `Role.ADMIN` via the existing
  `requireRole` preHandler — the same enforcement mechanism used by every
  other role-gated route since M1. A patient or pharmacist request is
  `403`, identical to every other role-mismatch route in this codebase.
- **Pharmacists do not get an organization-wide analytics endpoint in
  this milestone.** The brief permits pharmacist analytics access only if
  "explicitly authorized" — no such authorization mechanism exists yet
  (there's no concept of "this pharmacist's own performance" scoping
  separate from admin-wide aggregates), so building it now would be
  exactly the kind of speculative, unrequested feature the brief's "do
  not build another major feature" constraint warns against. Left as a
  documented future extension (§7).
- **No patient-level analytics are exposed by this endpoint at all** —
  every metric in the report is an aggregate count/rate/average over the
  requested date range; there is no endpoint, in this milestone or any
  prior one, that returns one specific patient's activity to anyone but
  that patient themselves (via their own existing, patient-scoped
  routes). This satisfies "do not expose patient-level analytics to
  organizations" by construction — there is no organization-facing
  per-patient view to restrict, because no such view was built.
- **Existing patient ownership protections are completely unmodified.**
  No route this milestone touches (`medications.ts`,
  `medication-journey.ts`, `questions.ts`, `pharmacist-questions.ts`)
  changes its authorization or ownership-scoping logic — every edit is
  purely additive (an `emitAnalyticsEvent()` call after the existing
  success path), verified by the full existing regression suite passing
  unchanged.

### 6. Multi-tenant / organization compatibility (not built)

Per the milestone brief, no `Organization` table and no `organizationId`
column were added — building real multi-tenant infrastructure for one
milestone's reporting need would be scope creep the brief explicitly
warns against, and there is still no `User.organizationId` (or any other
tenant tag) anywhere in this schema for analytics to scope against. The
architecture stays compatible with adding one later without a rewrite:

- `emitAnalyticsEvent()` and `AnalyticsEvent` already carry `patientId`/
  `pharmacistId` — the same identifiers a future `organizationId` lookup
  (`User.organizationId`, once that column exists) would join against to
  scope events per tenant. No event schema change would be needed, only
  a join.
- `buildAnalyticsReport()` takes a single options object
  (`{ from, to }`) specifically so an `organizationId?: string` field can
  be added to that same object later, threaded into each source-table
  query's `where` clause (e.g. `patient: { organizationId }`), without
  changing the function's shape or any caller.
- **Until that column exists, every report produced by this milestone is
  global** — it reports on every patient/pharmacist/question in the
  system, not scoped to any one customer. This is a real limitation for
  a genuinely multi-customer pilot and is called out explicitly here
  rather than left implicit: **do not present this milestone's report to
  more than one prospective customer as if it were their own isolated
  data** until tenant scoping is built.

### 7. ROI-supporting operational metrics (not a savings claim)

`roiOperationalMetrics` in the report surfaces exactly the metrics the
brief lists — `questionsPerThousandPatients`,
`pharmacistCasesPerThousandPatients`,
`providerEscalationsPerThousandPatients`,
`percentResolvedWithoutProviderEscalation`,
`averagePharmacistResponseTimeMs` — each computed from real,
already-measured data (never invented), and the report includes a fixed
disclaimer string on every response: *these are operational volume/rate
metrics, not a financial estimate; combining them with a specific
customer's actual labor costs and baseline (pre-DosePrepped) workflow
volume is a future, pilot-specific exercise, not something this codebase
calculates.* No dollar figure, cost-savings estimate, or "time saved"
number is computed or claimed anywhere in this milestone.

### 8. Admin analytics view

The previously bare `/admin` placeholder (`apps/patient/src/app/admin/page.tsx`)
now renders the last-30-days report (`GET /admin/analytics/report`) as
labeled stat cards, reusing the existing `Card`/`Badge` components and
the same stat-card layout already used on the pharmacist dashboard — no
new visual pattern, no new component library. This is the one
patient-app UI change in this milestone, and it is **admin-facing, not
patient-facing** — it does not touch any patient- or pharmacist-facing
screen or workflow.

### Remaining limitations

- **Global only, no tenant isolation** — see §6. A future
  `organizationId` column is the documented extension path.
- **No pharmacist self-service analytics** — see §5.
- **No historical backfill** — events only exist from this milestone
  forward; questions/medications/adherence/check-ins created before M5.3
  shipped have no corresponding `AnalyticsEvent` rows (though they're
  still fully counted in range-bound report metrics computed from the
  source-of-truth tables, since those don't depend on the event log).
- **No event retention/archival policy** — `analytics_events` grows
  unbounded; a future milestone should define a retention window before
  this reaches meaningful pilot volume.
- **`activePatients`/engagement metrics only cover events emitted
  starting now** — a patient who only viewed a medication before this
  milestone shipped has no `PATIENT_MEDICATION_VIEWED` trace, unlike
  their questions/adherence/check-ins which remain fully visible via the
  source tables.
- **No real-time/streaming analytics** — the report is computed on
  request, synchronously, directly against the primary database; at
  meaningful pilot scale this may need a read replica or a
  pre-aggregated rollup table, neither of which exists yet.
- **Queue volume/aging are always live, not historical** — requesting a
  report for a past date range still returns the *current* unclaimed
  queue depth/aging, not a reconstruction of what the queue looked like
  at that past `to`. See §4.
- **ROI metrics require pilot-specific inputs DosePrepped doesn't have**
  — see §7; no cost/savings claim is made without them.

---

## M5.4 — Organization / Tenant Infrastructure (implemented)

**Status: implemented.** M5.4 is infrastructure, not a new patient-facing
feature: it establishes the minimum viable multi-tenant/B2B foundation so
DosePrepped can eventually be sold to more than one healthcare
organization, without building any single customer's product. Nothing
here is Wasef-specific, and nothing here is billing, branding, or a full
enterprise admin portal — those are explicitly future milestones.

**DosePrepped's positioning, restated (unchanged by M5.4):** medication
support infrastructure connecting patients, medication education,
pharmacists, and appropriate provider escalation. M5.4 adds *who owns
which slice of that infrastructure*, not any new clinical capability.

### Audit method

Before writing any code, this milestone re-read `README.md`, this
document in full, the complete `schema.prisma`, `apps/api/src/lib/auth.ts`
and `packages/auth/src/session.ts`, every ownership check in
`medications.ts`/`medication-journey.ts`/`questions.ts`, every
authorization check in `pharmacist-questions.ts` (including claim
concurrency), the M5.3 analytics architecture (`analytics.ts`,
`analytics-report.ts`), and the full existing test suite (163 tests).

**Places the existing system assumed a single global environment**,
identified during this review:

1. `pharmacist-questions.ts`'s `visibilityWhere()` — the shared unclaimed
   queue pool is every `PHARMACIST_REQUESTED` question in the entire
   database; any pharmacist can see and claim any of them. There was no
   concept of "this pharmacist's employer" at all.
2. The atomic claim `updateMany` in `POST
   /pharmacist/questions/:id/claim` — matches purely on `{id, status,
   pharmacistId: null}`, with no notion of whether the claiming
   pharmacist has any relationship to the patient.
3. `GET /admin/analytics/report` — aggregates across every patient,
   pharmacist, and question in the system; `AnalyticsReportOptions`
   already reserved an unused `organizationId?` field for this reason
   (see M5.3 §6), but nothing populated it.
4. `Role` (platform role: `PATIENT`/`PHARMACIST`/`ADMIN`) is the *only*
   authorization axis anywhere in the codebase — there was no way to
   express "this ADMIN administers one specific customer" as distinct
   from "this ADMIN administers the whole platform."
5. Seed data (`packages/db/prisma/seed.ts`) creates every account in one
   undifferentiated pool.

### 1. Organization model

```prisma
model Organization {
  id        String   @id @default(uuid())
  name      String
  /// URL/identifier-safe unique slug — e.g. future subdomain or API path
  /// segment. Not used for routing yet; reserved for that purpose.
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  memberships OrganizationMembership[]

  @@map("organizations")
}
```

Minimal by design: a name and a unique slug. No billing plan, no contract
metadata, no branding/white-label fields, no settings blob — those are
explicitly deferred (see "What is intentionally deferred" below). An
`Organization` represents one healthcare customer — a telehealth company,
a digital pharmacy, a health plan, or any future B2B customer — never a
specific one by name in code or seed comments beyond generic,
obviously-synthetic demo names.

### 2. Membership / role model

```prisma
enum OrganizationRole {
  ORG_ADMIN
  ORG_PHARMACIST
  ORG_PATIENT
}

model OrganizationMembership {
  id             String           @id @default(uuid())
  organization   Organization     @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String
  user           User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId         String
  role           OrganizationRole
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt

  @@unique([organizationId, userId])
  @@index([userId])
  @@index([organizationId])
  @@map("organization_memberships")
}
```

- **A proper join table, not a nullable `organizationId` on `User`.**
  This is the key design choice for "a user may eventually belong to one
  or more organizations": the schema already supports multi-org
  membership today, at zero extra cost, simply because it's a join
  table — `@@unique([organizationId, userId])` prevents a *duplicate*
  membership in the same org, not a second membership in a *different*
  org. M5.4 doesn't build any UI/API that exercises multi-org membership
  (every seed/test fixture has at most one membership), but the schema
  never forecloses it.
- **`OrganizationRole` is a deliberately separate enum from the platform
  `Role`** (`PATIENT`/`PHARMACIST`/`ADMIN`), prefixed `ORG_*` to keep the
  two axes visually and semantically distinct wherever they appear
  together (route code, tests, JSON payloads). This is the concrete
  mechanism behind "platform admin vs. organization admin" (§6): a
  platform `Role.ADMIN` and an org's `ORG_ADMIN` membership are stored in
  completely different tables and never conflated.
- **The two axes are intentionally decoupled at the database level.**
  Nothing constrains a `User`'s platform `role` to match any
  `OrganizationMembership.role` they hold. An org admin's account can
  have platform role `PATIENT` (the default for a non-clinical,
  non-platform-privileged business contact — see seed data below); a
  platform `ADMIN` is not automatically an `ORG_ADMIN` of any org (and
  vice versa). This is deliberate, not an oversight — it's exactly what
  "do not assume an organization admin is a DosePrepped super-admin"
  requires structurally, not just as a policy statement.

### 3. Tenant boundaries — patient-owned vs. organization-owned data

This is the most important design decision in M5.4, so it's stated
explicitly: **no `organizationId` column was added to
`PatientMedication`, `MedicationQuestion`, `MedicationAdherenceEvent`,
`MedicationCheckIn`, or `AnalyticsEvent`.** All five of those remain
exactly as patient-owned as they were before this milestone — scoped by
`patientId`, never by a duplicated tenant column.

**Reasoning.** A medication record, a question, an adherence event, and a
check-in belong to the *patient*, full stop — that ownership predates
organizations and doesn't change because a patient happens to be
affiliated with one. Organization affiliation is a property of the
*patient's account* (via `OrganizationMembership`), not a property that
should be stamped onto every row that patient ever creates:

- A stamped `organizationId` column on `MedicationQuestion` would need to
  be decided *once, at creation time* — but a patient's org affiliation
  can change over that patient's lifetime (join, leave, switch). A
  frozen, denormalized copy would silently go stale the moment that
  happens, and nothing would ever notice.
- It would blur exactly the line the milestone brief warns against:
  "patient ownership and organization ownership are different concepts
  and must not be conflated." A question is never *owned* by an
  organization — it's owned by the patient who asked it. What an
  organization gets is *visibility into* the questions of patients who
  are currently its members, derived live, not a claim of ownership over
  patient data.
- It would be "blindly adding `organizationId` to every existing table,"
  which the brief explicitly says not to do.

**Instead, organization scoping is derived at query time via the
membership graph.** Because `User.memberships` is now a real Prisma
relation, every tenant-scoped query for patient-owned data is a nested
relation filter through the *current* membership rows —
`patient: { memberships: { some: { organizationId, role: ORG_PATIENT } } } }`
— rather than a stored column. This always reflects the patient's
*current* affiliation, never a stale snapshot, and required zero schema
changes to any of those four patient-owned tables.

`AnalyticsEvent` is the one exception worth calling out: because it was
deliberately built with no `@relation` at all (M5.3 — an independent,
FK-free append-only log), it has no `patient`/`pharmacist` relation to
nest-filter through. Where the reporting service needs to scope
`AnalyticsEvent` rows to an organization, it pre-resolves a plain
`patientId`/`pharmacistId` array from `OrganizationMembership` first,
then filters by `{ in: [...] }` — a small, explicit exception, not a
schema change.

**What *is* organization-owned**: the `Organization` and
`OrganizationMembership` rows themselves. Nothing else.

### 4. Patient / organization relationship

A patient's relationship to an organization is expressed purely through
`OrganizationMembership` (`role: ORG_PATIENT`), never through any change
to `PatientMedication`/`MedicationQuestion`/etc. This supports all three
futures named in the milestone brief without further schema change:

1. **A patient belonging to a telehealth organization** — has one
   `OrganizationMembership` row with `role: ORG_PATIENT`.
2. **A patient using DosePrepped directly** — has zero
   `OrganizationMembership` rows. This is the "DosePrepped Direct" pool
   (§10) and is exactly how every M0–M5.3 patient account (including all
   existing seed/demo accounts) continues to work, completely unchanged.
3. **A patient belonging to more than one organization** — already
   representable (a second `OrganizationMembership` row, different
   `organizationId`, same `userId`) because of the join-table design in
   §2. **Not implemented or tested in M5.4** — no route creates a second
   membership for the same patient, and no UI/report reasons about a
   patient with multiple org memberships — but nothing in the schema
   prevents it, satisfying "do not create an architecture that makes
   this impossible later" without over-building "unless necessary for
   the milestone."

The patient-facing application (`apps/patient`) is completely unchanged
by M5.4 — no organization information is fetched, computed, or rendered
anywhere in the patient experience. A patient never sees their own
organization affiliation (if any) in the UI; there is no
organization-switcher, no org branding, no org-specific copy.

### 5. Pharmacist / organization relationship & tenant-isolated queue

A pharmacist's relationship to an organization is the same
`OrganizationMembership` mechanism (`role: ORG_PHARMACIST`). The gap
identified in the audit (finding #1/#2 above) — the shared pharmacist
queue and the atomic claim were both fully global — is closed with a
**minimal, additive, backward-compatible visibility rule**, applied in
exactly two places in `pharmacist-questions.ts`:

- `visibilityWhere()` (used by `GET /pharmacist/queue` and `GET
  /pharmacist/questions/:id`), and
- the atomic `updateMany` inside `POST
  /pharmacist/questions/:id/claim`.

**The rule**: first resolve the calling pharmacist's own `ORG_PHARMACIST`
organization memberships (usually zero or one).

- **If the pharmacist has no organization memberships** (every M0–M5.3
  seed/test pharmacist, unchanged), the shared unclaimed pool is exactly
  what it always was: every `PHARMACIST_REQUESTED`, unclaimed question
  whose *patient* **also** has no organization memberships. This is a
  no-op for every existing account — full backward compatibility,
  verified by the entire pre-existing M4/M5.2/M5.3 pharmacist test suite
  passing unchanged.
- **If the pharmacist belongs to one or more organizations**, the shared
  pool is narrowed to unclaimed questions whose patient has an
  `ORG_PATIENT` membership in one of *those same* organizations.

This is a **strict, symmetric split**, not a "direct pool + bonus org
access" model: an org-affiliated pharmacist does not also see the
DosePrepped Direct pool, and a Direct pharmacist does not see any
org-affiliated patient's question. Two separate tenant pools, cleanly
partitioned, with the existing "already claimed by me" branch of
`visibilityWhere` unaffected (a pharmacist always keeps visibility into
work they've already claimed, regardless of org, since a completed claim
already passed this same check once).

**Why the claim mutation needed the same fix, not just the list.** The
existing `GET /pharmacist/queue` list and the `POST .../claim` mutation
were independent code paths — the claim `updateMany` never consulted
`visibilityWhere` at all, it matched purely on `{id, status,
pharmacistId: null}`. Fixing only the list would have hidden
cross-organization questions from the queue view while leaving them
directly claimable by ID. Both were changed together so tenant isolation
is enforced at the actual mutation boundary, not just the read path —
this is the one place M5.4 touches previously-completed M4 code, and it
is exactly the "clearly documented dependency fix" the milestone brief
allows for: without it, "must never gain access to another
organization's queue merely because they have the pharmacist role" would
not actually hold.

**404, not 409, for a cross-organization claim attempt.** The existing
claim handler already distinguishes "never existed / never
queue-eligible" (404) from "existed, was eligible, but someone else
claimed it first" (409 — the genuine race case, see M4 "Claim
concurrency"). A question that exists, was queue-eligible, but belongs to
a *different organization* than the caller is now folded into the 404
branch, not 409 — 409 would confirm to the caller that a real,
in-scope-looking race happened, which is not true and would leak that
the question exists. This matches the brief's explicit instruction to
"use 404 where the existing architecture intentionally avoids revealing
the existence of unauthorized resources," and mirrors the exact pattern
already used for out-of-scope patient/medication records elsewhere in
this codebase.

**No dedicated `/organizations/:id/pharmacist/queue` list route was
added.** The existing `GET /pharmacist/queue` URL is now inherently
tenant-aware (per the rule above) — adding a second URL that returns the
same, already-correctly-scoped data would be surface area with no
additional correctness benefit, and the brief asks for the minimum
foundation, not additional enterprise routes. What *was* added is a thin,
explicitly-authorized alias, `GET
/organizations/:organizationId/pharmacist/queue`, gated by
`requireOrganizationPharmacist` — it calls the exact same now-tenant-aware
query logic (`buildPharmacistQueue()`, extracted into a shared function)
but requires the caller to explicitly hold `ORG_PHARMACIST` membership in
the *named* organization first (chained after the same `requireRole
(Role.PHARMACIST)` every other pharmacist route uses — an
`ORG_PHARMACIST` membership alone is not sufficient without the platform
`Role.PHARMACIST` too, preserving "all existing pharmacist authorization
rules"). This exists specifically to give `requireOrganizationPharmacist`
a real, directly-testable caller and to provide an explicit,
self-documenting URL a future org-facing UI could call, rather than
relying on implicit scoping alone. The shared query logic itself lives in
`buildPharmacistQueueResponse()`, extracted from the original inline `GET
/pharmacist/queue` handler so both routes call exactly one
implementation.

Respond, escalate, and release were **not modified** — each of those only
ever operates on a question already matched by `{id, pharmacistId}` (the
claiming pharmacist's own claim), and because claim itself is now
tenant-checked, any question a pharmacist successfully claims is already
guaranteed same-organization (or same "Direct" pool). Tenant correctness
at claim time propagates through the rest of the lifecycle for free — no
further routes needed changes.

### 6. Platform admin vs. organization admin

Two structurally distinct authorization concepts, per §2:

- **Platform administration** — `Role.ADMIN` on `User`, unchanged since
  M1. Grants access to platform-wide routes (`/admin/ping`, `GET
  /admin/analytics/report`) and, in M5.4, an override on every
  organization-scoped route (a platform admin can act as if they were a
  member/admin/pharmacist of *any* organization — see `requirePlatformAdmin`
  in §7). There is exactly one pool of platform admins, and it is not
  organization-scoped.
- **Organization administration** — an `OrganizationMembership` row with
  `role: ORG_ADMIN` for one specific organization. Grants management
  access (membership CRUD, that organization's own analytics report) for
  *that organization only*. An org admin's platform `Role` is not
  required to be, and by default in seed data is not, `ADMIN` — see §2.

An org admin is never a platform admin unless they *separately* also hold
`Role.ADMIN` on their `User` row (nothing in M5.4 grants that
automatically), and a platform admin does not need any
`OrganizationMembership` row to manage or view any organization's data —
the override in §7 covers that. No organization-admin UI was built in
M5.4 (see §11) — the authorization foundation exists and is fully tested,
but there is no dashboard page yet, exactly as the brief allows
("establish the authorization foundation and document the UI limitation
rather than building a large admin portal").

### 7. Authorization helpers

`apps/api/src/lib/organization-auth.ts` — centralized, testable
preHandlers, none of which trust a client-supplied organization id except
as a route *parameter* whose membership is then verified server-side
against the database on every call:

- **`requirePlatformAdmin`** — authenticates, then requires `Role.ADMIN`.
  A thin, explicitly-named wrapper around the same check `requireRole
  (Role.ADMIN)` already performs — introduced under this name
  specifically so "platform admin" reads as a distinct concept from "the
  ADMIN role" everywhere it's used in M5.4 route code, per §6.
- **`requireOrganizationMember`** — authenticates, reads `:organizationId`
  from the route params, and requires either `Role.ADMIN` (platform admin
  override) or an `OrganizationMembership` row for that exact
  `(organizationId, userId)` pair. A non-member (and a non-existent
  `organizationId`) both produce `404` — the API never reveals whether an
  organization exists to a non-member. On success, attaches
  `request.organizationId` and `request.organizationRole` (`null`, not a
  real `OrganizationRole`, for the platform-admin-override path — a
  platform admin may hold no membership row in the organization at all)
  for downstream handlers.
- **`requireOrganizationAdmin`** — runs `requireOrganizationMember` first,
  then additionally requires `request.organizationRole === "ORG_ADMIN"`
  (or the platform-admin override) — `403` otherwise.
- **`requireOrganizationPharmacist`** — same shape, requires
  `"ORG_PHARMACIST"` (or the platform-admin override).

**The organization id always comes from the URL path
(`request.params.organizationId`), resolved and membership-checked
server-side on every request — never from a request body field, a query
string, or anything else client-supplied that isn't independently
verified.** This is what "the server must derive or validate organization
context" means concretely: there is no route anywhere in M5.4 that reads
an `organizationId` out of a POST body and trusts it without this same
membership check.

### 8. Organization management API

Deliberately minimal — creation is platform-admin-only, and there is no
public organization creation, invitation, or email flow:

```
POST   /organizations                                  requirePlatformAdmin
GET    /organizations/:organizationId                  requireOrganizationMember
GET    /organizations/:organizationId/memberships       requireOrganizationAdmin
POST   /organizations/:organizationId/memberships       requireOrganizationAdmin
DELETE /organizations/:organizationId/memberships/:id   requireOrganizationAdmin
GET    /organizations/me                                authenticate only
GET    /organizations/:organizationId/pharmacist/queue   requireRole(PHARMACIST) + requireOrganizationPharmacist
GET    /organizations/:organizationId/analytics/report   requireOrganizationAdmin
```

- **`POST /organizations`** — platform-admin-only, per the brief
  ("avoid public organization creation"). Body: `{name, slug}`; `slug`
  must be unique.
- **Membership add/remove** — `requireOrganizationAdmin` lets an org's own
  admin manage their team (add a pharmacist, add another org admin, add a
  patient membership, remove someone) without needing a platform admin
  for every change — this is the one piece of genuine self-service in
  M5.4, deliberately small: no invitation email, no pending/accepted
  state, just an immediate membership row created by someone already
  authorized to manage that org. The target `userId` must already exist
  as a `User` (no account creation happens through this endpoint).
- **`GET /organizations/me`** — "determine current user's organization
  context." Returns the *caller's own* memberships (derived from
  `request.user.id`, never a parameter) — every authenticated user can
  call this; it can only ever return their own data.
- No `PATCH /organizations/:id` (rename/slug-change), no organization
  deletion/archival, no bulk membership import — all deferred (§12).

### 9. Analytics — tenant strategy

M5.3 built `buildAnalyticsReport({ from, to })` with an intentionally
unused, reserved `organizationId?` field (see M5.3 §6) specifically so
this milestone wouldn't need to rewrite it — M5.4 makes good on that:

- **`organizationId` is now load-bearing.** When provided, every
  patient-sourced query (questions, medications, adherence, check-ins,
  medication views) adds a nested `patient: { memberships: { some: {
  organizationId, role: ORG_PATIENT } } } }` filter; every pharmacist-time
  query (claimed/responded/escalated, and the live unclaimed-queue
  snapshot) adds the equivalent `pharmacist`/`patient` filter. `User`
  counts (`totalPatients`, `patientsActivated`) filter by the same nested
  relation on `User.memberships`. The one exception is `AnalyticsEvent`
  (no relations by design, M5.3) — its queries pre-resolve a plain
  `patientId`/`pharmacistId` array from `OrganizationMembership` first,
  then filter by `{ in: [...] }`.
- **When `organizationId` is omitted, behavior is byte-identical to
  M5.3** — every added filter is conditionally spread in (`{}` when no
  organization id), so the existing platform-wide `GET
  /admin/analytics/report` and its full M5.3 test suite are unaffected.
- **`GET /organizations/:organizationId/analytics/report`** —
  `requireOrganizationAdmin`-gated, calls `buildAnalyticsReport({ from,
  to, organizationId })`. An org admin can only ever request *their own*
  organization's id (enforced by the same authorization helper as every
  other org route — the URL path segment is membership-checked, not
  trusted); a platform admin can request any organization's scoped report
  via the same route (the override in §7).
- **The existing `GET /admin/analytics/report` is completely
  unchanged** — still `requirePlatformAdmin`-gated (in M5.4 this is
  literally the same check as the M5.3-era `requireRole(Role.ADMIN)`,
  just re-exported under the new name), still global, still the only way
  to see cross-organization aggregate numbers. Organization admins cannot
  reach it — `requireOrganizationAdmin` never grants access to the
  platform-wide route, and `requirePlatformAdmin` never accepts an
  `ORG_ADMIN` membership as a substitute for `Role.ADMIN`.
- **No analytics data ever mixes across organizations.** Every query
  behind the org-scoped route filters by exactly one `organizationId`;
  there is no code path that unions two organizations' data into one
  response.

### 10. Commercial future (architecture only — nothing implemented)

The schema and authorization model above are shaped so the following
remain buildable later without a rewrite — none of it exists yet:

```
DosePrepped Platform
  |
  +-- DosePrepped Direct  — patients with zero OrganizationMembership rows
  |                           (every M0–M5.3 account, unchanged)
  |
  +-- DosePrepped B2B
         |
         +-- Organization A (e.g. a telehealth company)
         |      +-- ORG_PATIENT members
         |      +-- ORG_PHARMACIST members
         |      +-- ORG_ADMIN members  -> that org's own analytics report
         |
         +-- Organization B (e.g. a digital pharmacy)
                +-- ... (fully isolated from Organization A, see §3/§5/§9)
```

Per-active-patient/month billing, enterprise contracts,
pharmacist-support packages, and API/integration fees are all namable
*business models* this shape is compatible with — none are implemented,
priced, or referenced anywhere in code. No `Plan`/`Subscription`/
`Invoice` model exists.

### 11. Security/authorization tests

`apps/api/tests/organizations.test.ts` — see also the modified
pharmacist-queue/claim tests in `pharmacist-questions.test.ts`. Covers:
organization creation (platform-admin-only, `403` otherwise); membership
creation/listing/removal (org-admin and platform-admin allowed, `403` for
a non-admin member, `403`/`404` for a non-member); **tenant isolation** —
an Organization A pharmacist cannot see or claim an Organization B
patient's question (via both the modified global queue/claim and the new
org-scoped queue route), an Organization A org admin cannot read
Organization B's membership list or analytics report (`404`, not `403`,
for a non-member calling an org-scoped route — consistent with the
existence-hiding pattern used everywhere else); a client cannot spoof
organization context by passing an arbitrary `organizationId` in a
request body (every check re-derives it from the authenticated
membership row, never trusts the body); a platform admin retains full
cross-organization access; and full regression of every pre-existing
M0–M5.3 authentication/authorization/ownership/pharmacist/analytics test.

### Remaining limitations / what is intentionally deferred

- **No organization-admin UI.** The authorization foundation
  (`requireOrganizationAdmin`, the membership/analytics API) exists and
  is fully tested; there is no frontend screen for it. Per the brief,
  building one was explicitly out of scope for this milestone.
- **No multi-organization patient/pharmacist UI or reasoning**, even
  though the schema supports it (§2/§4) — no route or report considers
  what should happen if a user holds two memberships with conflicting
  implications; this is untested and undocumented behavior if it were to
  occur today (nothing prevents creating it via direct membership calls,
  but nothing exercises it either).
- **No invitation/email flow** — membership is added directly by an
  already-authorized org admin or platform admin; there is no
  pending-invite state, no email sending, no self-service signup into an
  organization.
- **No organization branding/white-labeling, no organization-specific
  patient UI, no subdomain routing** — `Organization.slug` is stored but
  not yet used for anything (reserved for a future routing/branding
  layer).
- **No billing, subscriptions, plans, or pricing** — not modeled, not
  referenced.
- **No state licensure/collaborative-practice enforcement** tied to
  organization or pharmacist — M5.1's `PharmacistProfile` foundation and
  M5.4's organization model remain independent; combining them (e.g.
  "this pharmacist may only serve patients in states where their license
  is valid, within this organization") is explicitly future work.
- **No organization deletion/archival, no rename/slug-change API.**
- **Existing patient-owned tables were not touched.** This is a design
  choice (§3), not a limitation — but it does mean there is currently no
  way to ask "show me every record ever created by a patient who has
  since left organization X" as a historical query; only *current*
  membership is ever considered.

---

## M5.5 — Organization Admin & Organization-Scoped Analytics (implemented)

**Status: implemented.** M5.5 turns the M5.4 authorization/API foundation
into a usable organization-admin experience: a real dashboard, a real
members screen, a real settings screen, and the M5.3/M5.4 analytics report
rendered for an organization administrator — nothing here is a new
capability at the authorization layer, it's the first UI built on top of
one that already existed and was already fully tested.

### Audit method

Before writing code, this milestone re-read `README.md`, this document's
M5.3 and M5.4 sections in full, `apps/api/src/lib/organization-auth.ts`,
`apps/api/src/routes/organizations.ts`, `apps/api/src/lib/analytics-report.ts`,
the existing admin analytics page (`apps/patient/src/app/admin/page.tsx`),
the existing pharmacist dashboard (`apps/patient/src/app/pharmacist/`),
the patient-facing server-data-fetching pattern (`apps/patient/src/lib/
analytics.ts`, `pharmacist.ts`, `session.ts`, `require-role.ts`,
`medications.ts`), the existing client-mutation pattern
(`ArchiveMedicationButton.tsx`, `CheckInForm.tsx` — `"use client"` +
direct `fetch` to the API with `credentials: "include"` + `router.refresh()`,
no Server Actions anywhere in this codebase), the full M5.4
`organizations.test.ts` suite, and the Meridian/Northstar seed fixtures.

**One concrete defect found in the M5.4 API surface**, not a design flaw
but a usability gap that blocks the very UI this milestone requires:
`POST /organizations/:organizationId/memberships` took a raw `userId`.
An organization admin using a real UI has no way to know another user's
internal DosePrepped database id — they know a colleague's *email
address*. Per the milestone's own allowance ("do not rewrite completed
architecture unless M5.5 exposes a concrete defect"), this one endpoint's
input contract was changed from `{userId, role}` to `{email, role}` —
the authorization model, the "target must already have an account" rule,
the 404-for-unknown-user behavior, and the 409-for-duplicate-membership
behavior are all otherwise unchanged. Every M5.4 test exercising this
endpoint was updated to match (still 37 tests, same assertions, only the
payload shape changed) — see `apps/api/tests/organizations.test.ts`.

No other completed M5.4 code was touched. No schema change was needed
anywhere in M5.5 — `Organization` and `OrganizationMembership` (M5.4) and
`buildAnalyticsReport()` (M5.3) already carried everything this milestone
needed.

### 1. API additions

Three small additions to `apps/api/src/routes/organizations.ts`, all
reusing the exact same `requireOrganizationAdmin` (or platform-admin
override) authorization helper as every other management route in that
file — no new authorization helper was needed:

```
PATCH  /organizations/:organizationId                       requireOrganizationAdmin
PATCH  /organizations/:organizationId/memberships/:id        requireOrganizationAdmin
POST   /organizations/:organizationId/memberships             requireOrganizationAdmin   (body shape changed: email, not userId — see above)
```

- **`PATCH /organizations/:organizationId`** — the organization settings
  screen's one mutation: rename. Body `{name}` only. `slug` is
  deliberately never writable through this or any other route — it stays
  exactly what M5.4 said it was, "reserved for a future routing/branding
  layer," and the settings screen renders it read-only.
- **`PATCH /organizations/:organizationId/memberships/:membershipId`** —
  changes an existing member's `role` in place (e.g. promote an
  `ORG_PATIENT` to `ORG_PHARMACIST`) without a remove-then-re-add round
  trip. Body `{role}` only — `role` is a Zod `z.enum(OrganizationRole)`,
  and `OrganizationRole` has exactly three values
  (`ORG_ADMIN`/`ORG_PHARMACIST`/`ORG_PATIENT`), none of which is a
  platform role. **This is why "an organization admin cannot promote a
  user to platform admin" is structurally true, not just enforced at
  runtime**: there is no value this endpoint's schema could even accept
  that would mean "platform admin." Verified by a dedicated test that
  posts an out-of-enum role string and asserts `400`, plus a positive
  test that a legitimate role change never touches the target user's
  platform `Role` column.
- No `GET /organizations/:organizationId/overview` (or similar
  aggregate-counts endpoint) was added. The Organization Overview screen
  (§3) computes its counts entirely by composing three already-existing
  responses — `GET /organizations/:organizationId` (name),
  `GET /organizations/:organizationId/memberships` (member/pharmacist/
  patient headcounts, counted client-side from the returned role field),
  and `GET /organizations/:organizationId/analytics/report` (question/
  pharmacist-review/provider-escalation counts) — per the brief's "use
  existing source-of-truth data where possible, do not invent metrics."
  Adding a fourth endpoint that recomputed the same numbers a different
  way would risk the dashboard and the analytics page disagreeing with
  each other; composing the same three calls the other two screens
  already make guarantees they can't.

### 2. Frontend architecture

**`apps/patient/src/lib/require-org-admin.ts`** — a new route guard,
deliberately separate from the existing `requireRole` (`lib/require-role.ts`),
because organization administration is not a platform `Role` at all (an
org admin's platform role is `PATIENT`, inert — see M5.4 §2). It:

1. Resolves the session user via the existing `getServerSessionUser()`
   (`lib/session.ts`) — redirects to `/login` if unauthenticated, exactly
   like `requireRole`.
2. Calls `GET /organizations/me` (M5.4, unchanged) and looks for a
   membership with `role === "ORG_ADMIN"`. If a user holds more than one
   such membership (schema-legal since M5.4 §2, not built/tested), the
   first one found is used — multi-org admin UI remains explicitly out of
   scope, documented as a limitation below, not silently mishandled.
3. If no `ORG_ADMIN` membership exists, redirects to that user's own
   platform-role home (`/home`/`/pharmacist`/`/admin`) via the same
   `ROLE_HOME` map `requireRole` uses — a patient, pharmacist, or platform
   admin visiting `/org-admin/*` without an `ORG_ADMIN` membership is
   redirected, never shown a 403 page or, worse, another organization's
   data.
4. Returns `{ user, organizationId, organizationName }` for the calling
   layout/page to render.

This is UX-only enforcement, identical in spirit to `requireRole`: the API
independently re-verifies organization-admin membership on every single
request via `requireOrganizationAdmin` (M5.4), which is what actually
protects the data. A user who somehow reached `/org-admin/*` without this
guard (e.g. a stale client bundle) would still get `404`s from every API
call the moment they tried to fetch or mutate anything.

**`apps/patient/src/lib/organizations.ts`** — server-only data-fetching
functions, following the exact `cookies()`-forwarding pattern already used
by `lib/analytics.ts`/`lib/pharmacist.ts`/`lib/medications.ts`
(`apiFetch(path)` forwards the incoming request's cookies, `cache:
"no-store"`, returns `null`/an empty array on a non-OK response rather
than throwing): `getMyOrgAdminMembership()`, `getOrganization(id)`,
`getOrganizationMemberships(id)`, `getOrganizationAnalyticsReport(id,
{from, to})` (reuses the exact same `AnalyticsReport` TypeScript interface
already defined in `lib/analytics.ts` — imported, not redefined, so the
two dashboards can never drift into different shapes for the same report
type).

**Mutations are client components**, matching the only mutation pattern
that exists anywhere in this codebase today (`ArchiveMedicationButton`,
`CheckInForm`) — `"use client"` + `fetch(...API_URL, {credentials:
"include"})` + `router.refresh()` on success. No Server Actions were
introduced; this milestone did not invent a second mutation paradigm
alongside the one the patient app already uses.

### 3. UI screens (`apps/patient/src/app/org-admin/`)

A new route group, parallel to the existing `/admin` and `/pharmacist`
route groups, guarded by `requireOrganizationAdmin()` in its `layout.tsx`:

- **`layout.tsx`** — header showing the organization's name prominently
  (e.g. "Meridian Telehealth") next to the DosePrepped logo, plus the
  signed-in user's name and a logout button (mirrors the existing
  `PharmacistLayout` structure) and a small nav (Overview / Analytics /
  Members / Settings). The organization name in the header is the one
  place tenant context is made "obvious," per the brief — no other
  organization's name is ever fetched or rendered anywhere in this
  screen tree, because every data call is scoped to the one
  `organizationId` the guard resolved.
- **`page.tsx` (Overview)** — organization name (repeated as a page
  heading) plus six source-of-truth counts: Patients (`memberships`
  filtered to `ORG_PATIENT`), Pharmacists (`memberships` filtered to
  `ORG_PHARMACIST`), Organization members (`memberships.length`,
  all roles), Medication questions
  (`report.questionFunnel.totalQuestions`), Pharmacist reviews
  (`report.pharmacist.claimed` — a claimed question is one a pharmacist
  has actually reviewed, as distinct from merely having entered the
  queue), and Provider escalations
  (`report.providerEscalation.totalEscalatedToProvider`). Every number is
  read directly off an existing response field — none is computed by new
  application logic beyond a `.filter(...).length` over the memberships
  list already fetched for the Members screen.
- **`analytics/page.tsx`** — the same report sections as the existing
  `/admin` page (Patient engagement, Question funnel, AI, Pharmacist
  workflow, Provider escalation, Adherence & check-ins, Operational
  metrics), built from the same `Stat`/`Section` presentational pattern,
  but fetching `GET /organizations/:id/analytics/report` instead of `GET
  /admin/analytics/report`. Date range is a plain GET form with three
  preset links (Last 7/30/90 days, computed as `now - Nd` in the server
  component and passed as `?from=&to=` query params — the exact query
  params `GET .../analytics/report` already accepted since M5.3/M5.4) and
  two native `<input type="date">` fields for a custom range — no client
  JS, no new date-picker dependency, reusing 100% of the already-existing
  API date-range capability.
- **`members/page.tsx`** — a table of every member (name, email, role,
  joined date) with, per row, a role `<select>` + "Save" (calls the new
  `PATCH .../memberships/:id`) and a "Remove" button (`DELETE`, existing
  M5.4 route) — both client components using the mutation pattern above.
  An "Add member" form takes an email address and a role `<select>`
  (`POST .../memberships`, new email-based body). No invitation/email is
  sent — exactly like M5.4, the target must already have a DosePrepped
  account, and the form surfaces the API's own 404 ("User not found")
  inline if they don't.
- **`settings/page.tsx`** — a single "Organization name" text field +
  Save button (`PATCH /organizations/:id`), and the slug shown as
  read-only plain text with a short caption explaining it's reserved for
  future use. No logo upload, no color pickers, no custom domain field —
  none of those exist in the schema, so none appear in the UI.

### 4. Member management design

- **Email, not invitation.** An org admin adds someone by typing an email
  address the target user already registered with (self-service patient
  sign-up, or a pharmacist/admin account created by seeding/platform-admin
  action). There is no email actually *sent* by DosePrepped — this
  remains true to M5.4's "no invitation/email flow" — the email field is
  purely a lookup key the org admin already knows, resolved server-side
  to the matching `User` row (or a `404` if none exists).
- **Role change, not membership re-creation.** `PATCH .../memberships/:id`
  lets an admin correct or promote a role without the delete-then-add
  round trip M5.4 would have required, while remaining exactly as
  scoped/authorized as every other membership route.
- **No self-lockout protection, and no "last admin" guard.** An org admin
  can demote or remove themselves, potentially leaving the organization
  with zero `ORG_ADMIN` members. This is a known, accepted limitation
  (see below) — the platform-admin override (M5.4 §6/§7) is always
  available as a recovery path (a platform admin can re-add an org admin
  membership via the same API), so this was judged not worth the extra
  validation logic for a first admin-UI milestone.
- **Cannot create platform admins — structurally, not just by
  convention.** Covered in §1 above: `OrganizationRole` has no
  platform-admin value.
- **Cannot manage another organization's members.** Unchanged from M5.4:
  `requireOrganizationAdmin` re-derives and re-validates `organizationId`
  from the URL path against the database on every request; an org admin
  hitting another organization's membership URL gets `404`, identical to
  M5.4's existing behavior — no new code path was needed here, it already
  worked, and is re-verified by this milestone's tests.

### 5. Analytics — what's reused vs. what's new

**Nothing new was added to `buildAnalyticsReport()` or the M5.3/M5.4
analytics architecture.** M5.5 is a consumer, not a design change: the
organization dashboard and analytics page call the exact same
`GET /organizations/:organizationId/analytics/report` route M5.4 already
built and tested, with the exact same `from`/`to` query parameters
`buildAnalyticsReport` has accepted since M5.3. The only M5.5-side work
was building a UI that renders that already-correct, already-isolated
response — and reusing the M5.3 `Stat`/`Section` presentational
components/labels verbatim (same "Operational metrics (not a savings
estimate)" heading, same provider-escalation disclaimer text) so the
organization-scoped page makes exactly the same careful claims the
platform-wide page already makes, word for word — no new copy was
written that could accidentally overstate what a metric means.

### 6. Authorization model (unchanged, re-verified)

Every organization-admin-facing route in this milestone establishes, in
this order, exactly as the M5.4 brief originally required and as M5.4's
`requireOrganizationAdmin` already enforces: (1) authenticated user, (2)
organization context derived from the URL path, (3)
`OrganizationMembership` role verified against the database, (4) — for
membership-id-scoped routes (`PATCH`/`DELETE .../memberships/:id`) —
resource ownership re-checked (`{id, organizationId}` together, never `id`
alone). M5.5 added zero new authorization logic; it added zero new routes
that don't already go through `requireOrganizationAdmin`. The one new
authorization-adjacent thing is the *frontend* guard
(`require-org-admin.ts`, §2), which is UX-only and changes nothing about
what the API will or won't return.

**The client never supplies organization context that is trusted.**
`organizationId` in every fetch from `lib/organizations.ts` comes from the
value `require-org-admin.ts` resolved server-side from the session's own
`GET /organizations/me` call — never from a URL parameter typed by the
user, a hidden form field, or anything else that originated in the
browser. Even if it did, the API-side `requireOrganizationAdmin` would
still independently re-derive and re-check it from the URL path against
the database, exactly as it did in M5.4 — this is defense in depth, not
the only thing standing between a user and another organization's data.

### 7. Privacy findings

The organization dashboard is aggregate-only, by construction — it is a
thin rendering layer over `buildAnalyticsReport()`, which has never
returned one patient's individual activity to anyone (M5.3 §2 — computed
via `count`/aggregate queries, not row-level projections of PHI fields).
No route added in M5.5 exposes `questionText`, `pharmacistResponse`,
`aiEducationResponse`, or `notes` (check-in free text) — the members
screen shows only `{name/email, role, membership metadata}` (identical
fields M5.4's `GET .../memberships` already returned), and the analytics
screen shows only the same aggregate `AnalyticsReport` shape the platform
admin page already renders. An organization admin gains no clinical/
patient-chart capability whatsoever — that access boundary (pharmacist
question review) is completely untouched by this milestone.

### 8. Pharmacist and patient experience (unchanged, re-verified)

Neither the pharmacist dashboard nor the patient app has a single line
changed in M5.5. The pharmacist queue tenant isolation from M5.4 (§5) is
re-verified by regression tests, not re-implemented. An organization
admin's new "Pharmacist reviews"/"Provider escalations" overview counts
are aggregate numbers derived from `buildAnalyticsReport()` — they never
grant the org admin any ability to open a specific question, see a
specific patient's medication list, or claim/respond/escalate anything;
that remains exclusively the pharmacist workflow's own authorization
boundary (`requireRole(Role.PHARMACIST)` + `requireOrganizationPharmacist`
for the org-scoped queue route), untouched.

### 9. Seed data

No new seed users were required — Meridian Telehealth and Northstar
Digital Pharmacy (M5.4) already have exactly one `ORG_ADMIN`, one
`ORG_PHARMACIST`, and one `ORG_PATIENT` each, with a queued question. To
give the M5.5 analytics screens something visibly non-zero to render
beyond the bare single-question minimum M5.4 seeded, `seed.ts` now also
records a couple of adherence events and a check-in for each
organization's patient (same pattern already used for the M5.2
`patientA`/`patientB` worked examples, just applied to `orga-patient`/
`orgb-patient`) — additive, idempotent (delete-then-recreate on every seed
run), and still entirely synthetic.

### Remaining limitations / what is intentionally deferred

- **No multi-organization admin UI.** If a user held `ORG_ADMIN`
  memberships in two organizations (schema-legal, not built anywhere),
  `require-org-admin.ts` picks the first one found and there is no
  organization switcher. Documented, not silently broken — this exact
  scenario isn't seeded or tested because M5.4 never built the tooling to
  create it in the first place.
- **No "last admin" / self-lockout protection** on role change or member
  removal (§4) — recoverable only via the platform-admin override.
- **No invitation/email system** — unchanged from M5.4; the target user
  must already have an account.
- **No organization branding/logo/custom domain/white-labeling** — the
  settings screen has exactly one editable field (name); `slug` remains
  reserved and read-only, per M5.4.
- **No billing/subscription/pricing UI** — nothing to show; none of that
  is modeled anywhere in the schema.
- **No organization deletion/archival UI** — the API doesn't have this
  route either (M5.4 §8, unchanged).
- **No pharmacist-facing organization UI** — a pharmacist still only ever
  sees the existing pharmacist dashboard/queue; this milestone did not add
  any organization-context UI to the pharmacist experience, per the
  brief's "do not redesign the pharmacist dashboard."
- **Analytics is still a live, synchronous query per request** — no
  caching, no pre-aggregation, unchanged from M5.3/M5.4.

---

## M6.0 — Demo Mode (implemented)

**Status: implemented.** M6.0 is a presentation/sales-demonstration
milestone, not a clinical feature — it exists so DosePrepped can be
demonstrated to Wasefhealth and other prospective telehealth customers
without a public deployment. It reuses the M0–M5.5 product end to end:
the same safety-rules engine, the same mock AI provider, the same
pharmacist workflow, the same organization/tenant model, the same
analytics reporting service. **Nothing in `apps/api`, the Prisma schema,
or any existing authorization helper was modified for this milestone.**

### Business framing

The demo's single sales message, repeated throughout: **"DosePrepped
extends your telehealth care model between visits — it does not replace
it."** The telehealth organization keeps the patient relationship, the
provider relationship, medical evaluation, prescribing, and clinical
care; DosePrepped provides the medication-support infrastructure around
that: patient education, structured medication questions, a pharmacist
workflow, adherence/check-in tools, provider escalation, and operational
analytics. The demo never claims DosePrepped diagnoses, prescribes,
independently changes a prescription, or replaces a physician.

### 1. Demo Mode authentication — the central design decision

An anonymous demo visitor has no DosePrepped account, so every
patient/pharmacist/org-admin screen they need to see is normally behind
`requireRole`/`requireOrganizationAdmin`, which forward the *visitor's
own* session cookie to the API. Three constraints had to be reconciled:
no new/parallel auth system, no impersonation mechanism, no weakened
authorization, and the visitor still needs to see real, working,
authenticated screens.

**The resolution**: three dedicated, isolated Demo Mode accounts
(`demo-mode-admin@demo.doseprepped.dev`, `demo-mode-pharmacist@…`,
`demo-mode-patient@…`, seeded by `packages/db/prisma/seed.ts`), member
of their own standalone **"DosePrepped Demo Mode"** organization —
**never** Meridian Telehealth, Northstar Digital Pharmacy, or any real
pilot account (`patient-a`, `patient-b`, `pharmacist@`, `orga-admin@`,
etc.). `apps/patient/src/lib/demo-auth.ts` authenticates as one of these
personas via the real, completely unmodified `POST /auth/login` — this
is not a new auth system, not an impersonation mechanism, and does not
bypass or weaken any authorization check; every subsequent Demo Mode API
call is independently re-authorized by the API exactly as any other
request. The resulting session cookie is used **only** for
server-to-server calls made by `apps/patient/src/lib/demo.ts`'s
functions (Next.js server → API) — it is **never** set on any visitor's
own browser response. An anonymous demo visitor never receives, sees, or
can reuse this credential; there is no code path in Demo Mode that
forwards it to the client. The login endpoint's rate limit (10/min/IP,
unchanged) is respected by caching each persona's session in a
process-local, in-memory map for up to an hour, so normal demo browsing
(and screenshot QA) doesn't approach that limit.

**Why this satisfies "isolated / minimum necessary permissions":**
- The three accounts hold no platform-level role beyond an ordinary
  patient/pharmacist (`demo-mode-admin`'s platform `Role` is `PATIENT`,
  inert — identical convention to every other org admin since M5.4;
  none of the three ever holds platform `Role.ADMIN`).
- They belong to exactly one organization — their own — so M5.4's
  existing tenant isolation *structurally* guarantees they can never
  read Meridian's, Northstar's, or any other organization's data,
  regardless of anything Demo Mode's frontend code does or doesn't do.
  This was verified, not assumed — see "Isolation" below.
- The shared demo password is the same one every other seed account
  already uses (documented in the README as non-secret,
  local-dev-only) — Demo Mode doesn't introduce a new secret to manage,
  but it is used here purely as a server-side implementation detail and
  is never surfaced through the Demo Mode UI or any API response.

### 2. What stays read-only vs. what's live

Two seeded **"canned" scenarios** are created already fully resolved and
are **never mutated by any Demo Mode page or action**:

1. **Nausea / Semaglutide** — `"I've been feeling nauseous since
   starting my medication. Is this normal?"` — `SIDE_EFFECT` category,
   no escalation-pattern text, so it lands on the `PHARMACIST_REVIEW`
   baseline per `packages/safety-rules`. Seeded already claimed and
   answered by `demo-mode-pharmacist`.
2. **Escalation** — `"The redness at my injection site seems to be
   getting worse over the last two days."` — matches the
   `severe-or-rapidly-worsening-symptom` rule (`/getting worse/i`), so
   it's automatically `PROVIDER_EVALUATION` at creation; seeded already
   claimed and escalated (`ESCALATED`, `WORSENING_OR_SEVERE_SYMPTOM`) by
   `demo-mode-pharmacist`. This wording is the exact phrase already
   proven throughout the existing test suite (`analytics.test.ts`,
   `questions-disposition.test.ts`) to trigger `PROVIDER_EVALUATION` —
   chosen specifically so the demo can't silently drift onto the wrong
   disposition if the safety rules ever change wording elsewhere.

Both are cleared and recreated on every `pnpm db:seed` run — 100%
reproducible, and re-running the seed is the reset mechanism if a demo
session leaves the environment in an unexpected state (see below).

**The one live, interactive piece**: the Patient Experience page embeds
a real "Try it yourself" form. Submitting it calls the real `POST
/questions` as `demo-mode-patient` (via a Next.js Server Action,
`apps/patient/src/app/demo/actions.ts`) — the medication is always
resolved server-side from the demo patient's own single seeded
Semaglutide record, never trusted from the submitted form. This always
creates a **brand-new, disposable** question row; it can never touch
either canned record. The Pharmacist Experience page can then claim/
respond to that same live question (also via Server Actions,
authenticated as `demo-mode-pharmacist`) — giving a genuine "watch the
whole loop work" moment without ever mutating the deterministic
narrative. Escalation is deliberately not wired as a live action here
(section 4 of the brief) — the canned escalation scenario already
demonstrates it fully; re-running `pnpm db:seed` clears any disposable
live questions and restores a clean baseline.

### 3. Isolation from production — verified, not assumed

- **Zero new backend routes, zero schema changes, zero authorization
  changes.** Every Demo Mode read/write goes through an existing,
  unmodified API route: `POST /auth/login`, `GET/POST /questions`, `GET
  /pharmacist/queue`, `GET /pharmacist/questions/:id`, `POST
  .../claim`, `POST .../respond`, `GET /organizations/me`, `GET
  /organizations/:id`, `GET /organizations/:id/memberships`, `GET
  /organizations/:id/analytics/report`.
- **Tenant isolation (M5.4) already does the isolating.** Because
  `demo-mode-pharmacist`/`demo-mode-admin` belong only to the
  "DosePrepped Demo Mode" organization, the exact same nested
  relation-filter mechanism that keeps Meridian and Northstar apart
  (§5/§9 of the M5.4 section above) keeps Demo Mode apart from both of
  them — no Demo-Mode-specific isolation code was written or needed.
- **Concurrent demo visitors can't collide.** Every live submission
  creates its own new row; nothing shared is mutated by a read.
- **The real production login/authentication system is completely
  unchanged** — Demo Mode is a new *caller* of it, not a modification
  to it.

### 4. Routes and components added

```
apps/patient/src/app/demo/
  layout.tsx        — public shell (no requireRole/requireOrganizationAdmin
                       guard — see §1 for why that's safe), nav, DemoBanner
  page.tsx           — landing: headline, 3 perspective cards, "Run Full Journey"
  patient/page.tsx    — canned nausea walkthrough + live "Try it yourself" form
  pharmacist/page.tsx — canned nausea + escalation detail, live claimable queue
  admin/page.tsx      — Demo Mode org's real analytics + ROI/value cards
  journey/page.tsx    — guided 9-step narrative (client stepper, read-only)
  actions.ts          — the only mutating code: submitDemoQuestion,
                        claimDemoQuestion, respondToDemoQuestion (Server Actions)

apps/patient/src/components/demo/
  DemoBanner.tsx, WorkflowTimeline.tsx, PerspectiveCard.tsx, ROICards.tsx,
  JourneyStepper.tsx, PharmacistQuestionDetail.tsx

apps/patient/src/lib/
  demo-auth.ts — session bootstrap (§1)
  demo.ts      — read-only data access, thin wrappers around the same API
                 routes lib/questions.ts / lib/pharmacist.ts /
                 lib/organizations.ts / lib/analytics.ts already call for
                 the real app, reusing their exported TypeScript types
```

The patient-facing `AiEducationSection` component (M3/M4, unchanged) is
reused directly on the Demo Mode patient page — the same AI-education-
vs-pharmacist-response visual separation the real app already has, not a
reimplementation.

### 5. Seed data

`packages/db/prisma/seed.ts` — additive, idempotent (verified by running
`pnpm db:seed` twice): one new `Organization` ("DosePrepped Demo Mode"),
three new `User` rows, one `PharmacistProfile`, a small adherence/
check-in history for the demo patient's Semaglutide (same shape as the
existing M5.2 worked examples), and the two canned `MedicationQuestion`
records described in §2. No existing seed data was modified.

### 6. Known limitations

- Demo Mode's session cache is process-local and in-memory — restarting
  the Next.js server clears it (harmless; it just re-authenticates on
  the next request).
- The "Try it yourself" live question always uses a fixed category
  (`SIDE_EFFECT`) and the demo patient's single medication — this is
  deliberate (a predictable, always-`PHARMACIST_REVIEW`-baseline
  disposition for a reliable sales-demo moment), not a general-purpose
  question composer.
- No automated cleanup job for disposable live questions — `pnpm
  db:seed` is the reset mechanism.
- No public URL — this milestone is local-only by explicit instruction
  (no tunnel, no ngrok/cloudflared, no deployment attempt).

---

## Next Step

M0, M1, M2, M3 Phase 1 (question intake), M3 Phase 2 (deterministic safety
& disposition), M3 Phase 3 (AI-assisted medication education), M4
(pharmacist review & concierge workflow), M5.1 (pilot readiness & product
hardening), M5.2 (medication journey & adherence foundation), M5.3 (pilot
analytics & ROI instrumentation), M5.4 (organization/tenant
infrastructure), M5.5 (organization admin & organization-scoped
analytics), and M6.0 (Demo Mode) are implemented, tested, and merged. A
question now flows
end-to-end through deterministic safety → (non-emergency,
non-fully-AI-answered) AI education → automatic pharmacist queueing →
atomic claim → a human pharmacist response or a structured escalation,
with no code path anywhere that lets AI-generated content become an
official pharmacist response or change a deterministic disposition.
Patients can also record per-dose adherence, complete a structured
medication check-in, and view a derived medication timeline; a pharmacist
reviewing a routed question sees bounded, clearly-labeled medication
context alongside it. Every meaningful patient/pharmacist action emits a
versioned, non-PHI analytics event, and an admin-only aggregate report
answers patient engagement, question funnel, AI, pharmacist,
provider-escalation, and adherence/check-in questions over a date range.
DosePrepped has a minimum viable multi-tenant/B2B foundation:
`Organization`/`OrganizationMembership` (patient-owned data stays
patient-owned — organization visibility is derived live through the
membership graph, never a stamped column), a tenant-isolated pharmacist
queue/claim (an organization's pharmacist can never see or claim another
organization's patient question), organization-scoped analytics
(`GET /organizations/:id/analytics/report`, isolated from both the global
platform report and every other organization), and a clear platform-admin
vs. organization-admin authorization split. **As of M5.5, that foundation
has a real organization-admin experience**: an org admin logs in, sees
their own organization's name/counts on a dashboard, manages their own
members (add by email, change role, remove), edits their organization's
name, and views the same M5.3/M5.4 analytics report rendered for their
organization only — never another organization's, verified by an
extensive cross-tenant test suite. The patient application and the
pharmacist dashboard are both completely unchanged. Still not built: B2B
billing/subscriptions/pricing, invitation/email flows, organization
branding/subdomain routing, pharmacist license verification/enforcement,
EHR/telehealth integration, a structured dosing/reminder engine,
multi-organization admin UI, and any real cost/ROI calculation. **As of
M6.0, all of the above can be shown to a prospective customer without a
live account**: a public `/demo` route walks a visitor through the
patient, pharmacist, and telehealth-admin perspectives — and a guided
Full Journey — using three dedicated, isolated Demo Mode accounts that
authenticate through the real, unmodified login flow (never a new auth
system, never real pilot credentials, never Meridian's or Northstar's
data) and a small amount of read-only seeded/synthetic activity. No
production route, schema, or authorization rule was touched to build it.
Awaiting direction on M6.1.
