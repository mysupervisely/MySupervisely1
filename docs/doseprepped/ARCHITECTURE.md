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

- **Queue.** A question enters the pharmacist-visible queue when its status
  becomes `PHARMACIST_REQUESTED` — either the patient tapped "Ask a
  Pharmacist," or the deterministic disposition (Phase 2) is
  `PHARMACIST_REVIEW`/`PROVIDER_EVALUATION` and the system auto-requests
  review. **Not built yet** — Phase 2 only assigns `disposition`; the
  status transition and actual queue are later-phase work (§19).
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

1. **Intake-time, automatic.** The deterministic disposition rule engine
   (implemented in Phase 2 — see "Deterministic Safety & Disposition Rule
   Engine" below) assigns `URGENT_EMERGENCY` or `PROVIDER_EVALUATION`
   before any AI or pharmacist involvement. The patient is shown clear,
   non-diagnostic guidance to seek appropriate care — DosePrepped does not
   attempt to triage or manage the situation itself, matching the original
   architecture's "Safety/Escalation" section. No professionally-reviewed
   triage protocol exists yet; this document does not invent one, and the
   rule set stays intentionally small and conservative until clinically
   reviewed rules are available. **Phase 2 stops at assigning the
   disposition and showing guidance copy** — it does not transition
   `status` to `ESCALATED`, notify anyone, or create any queue entry; that
   remains later-phase work.
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

Schema sketch. **`QuestionCategory`, `MedicationQuestion`'s core fields,
and (as of Phase 2) `QuestionDisposition`/`DispositionSource`/the
disposition audit fields are applied to `packages/db/prisma/
schema.prisma`.** Everything under "not yet implemented" below (AI,
pharmacist, escalation fields on the model) remains illustrative only.

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
  medicationSnapshot          Json                 -- {name, strength, directions, frequency, route} at creation time
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
executes Layer 1 (deterministic — implemented, includes disposition
assignment) and, once AI is wired up, Layer 2 in sequence within the same
request/response cycle for `GENERAL_EDUCATION`-disposition questions — no
polling or background job is required for M3's scope, since each AI call
is a single bounded operation, not a long-running task.

### 17. UI changes

- **Medication detail (M2, implemented):** "Ask about this medication" CTA
  — implemented in Phase 1.
- **Ask a Question flow (implemented, replacing the M0/M1 placeholder):**
  medication picker (skipped if pre-selected) → category selector →
  question text → review → submit → confirmation screen. As of Phase 2,
  confirmation shows disposition-appropriate routing copy (§ patient
  experience below) — **no AI clarifying question and no AI education
  response exist yet**; those remain Phase 3.
- **My Questions (implemented, parallel to "My Medications"):** list with
  status badges. As of Phase 1 every item shows `Received`; disposition
  itself isn't surfaced as a separate list-level badge yet (it's visible
  on the detail screen).
- **Question detail (implemented):** structured record — question,
  medication snapshot, category — plus, as of Phase 2, the
  disposition-appropriate routing message. AI education and pharmacist
  response sections remain future work.
- **Pharmacist home (M1 placeholder):** still a placeholder — becomes the
  entry to the queue in a later phase (§19), not part of M3 Phase 1 or 2.

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
3. **Not started — AI Service Layer integration.** `suggestCategory`,
   `generateClarifyingQuestion`, `generateEducation`, and the optional
   `refineDisposition` pass, all layered *on top of* the Phase 2
   deterministic disposition (which stands unchanged if AI is unavailable
   — see "AI-independent operation" below). Ships general education
   end-to-end, gated to `GENERAL_EDUCATION`-disposition questions only.
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
aiPharmacistSummary  Json?            -- {summaryText, isAiGenerated: true}; stored for a
                                       -- future pharmacist queue, not surfaced anywhere yet
```

The previously-reserved `aiEducationResponse`, `aiEducationGeneratedAt`,
`aiModelVersion`, `aiSuggestedCategory`, and `clarifyingExchange` fields
(present in the schema since Phase 1, always null until now) are populated
for the first time in Phase 3. `clarifyingExchange` stores
`{question, answer: null}` — `answer` stays structurally reserved for a
future two-way flow but is never written to in Phase 3 (§ "Why the
clarifying question doesn't block").

---

## Next Step

M0, M1, M2, M3 Phase 1 (question intake), M3 Phase 2 (deterministic safety
& disposition), and M3 Phase 3 (AI-assisted medication education) are
implemented, tested, and merged. Every `GENERAL_EDUCATION`/
`PHARMACIST_REVIEW`/`PROVIDER_EVALUATION` question now attempts a single,
typed, validated AI education call via `packages/ai-service` after the
Phase 2 deterministic disposition is assigned; `URGENT_EMERGENCY`
questions never invoke AI. No pharmacist queue, no provider messaging, no
multi-turn conversation exists anywhere in this codebase. Awaiting
direction on the next milestone (§19 step 4: pharmacist request + queue).
