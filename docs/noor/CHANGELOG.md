# Noor — Changelog

All notable architectural and product decisions for the Noor patient
platform are recorded here, in addition to the standard git history.

## M0 — Architecture (unreleased, no code)

- Authored the complete M0 architecture deliverable
  (`docs/noor/ARCHITECTURE.md`): system diagram, recommended technology
  stack with rationale, initial normalized PostgreSQL schema, authentication
  architecture, RBAC authorization model, PHI/data classification, EHR
  abstraction (`PatientRecordProvider`, `AppointmentProvider`,
  `ClinicalMessagingProvider`, `DocumentProvider`), subscription
  architecture (`PaymentProvider` abstraction), AI abstraction (`AIProvider`
  interface with hard guardrails against diagnosis/risk-scoring), security
  architecture, deployment architecture (dev → staging → production),
  proposed monorepo structure, and an 11-step milestone roadmap (M0–M10).
- No application code written. Per the product brief, this milestone is
  planning-only and requires explicit approval before M1 begins.
- Recorded a consolidated list of decisions that require clinical
  leadership, legal/compliance, or product sign-off before they can be
  implemented (safety escalation protocol, EHR vendor selection, Noor
  Async pricing/SLA, patient MFA policy, multi-role account policy,
  elevated-admin clinical-data access, backup/retention policy) — see
  §N of `ARCHITECTURE.md`.

## M1 — Foundations

- Approved with one additional requirement (see the 12-point security/PHI
  checklist at the top of `M1-IMPLEMENTATION.md`), then implemented in
  `noor/`: a pnpm/Turborepo-style monorepo (3 Next.js frontends —
  patient/clinician/admin — + a Fastify API + shared packages), a
  narrowed M1 slice of the M0 database schema (identity, roles, sessions,
  minimal patient/clinician records, care relationships, audit trail —
  clinical-content tables deliberately deferred to the milestones that
  need them), cookie-session authentication (bcrypt password hashing,
  signed httpOnly session cookies, no user enumeration, no
  client-controlled signup role), a central RBAC + permission-matrix
  authorization module, care-relationship-scoped clinician access,
  an audit-logging foundation (with a PHI-content metadata guard) that
  records reads as well as writes, and mock-only implementations of the
  M0 EHR/payments/AI provider abstractions.
- New table not explicitly enumerated in the M0 schema list: `sessions`
  — a transparent, necessary consequence of implementing the
  already-approved session-based auth design (see
  `M1-IMPLEMENTATION.md` §3).
- 83 automated tests added across the monorepo (unit + integration,
  including an integration suite that runs against a real local
  Postgres database rather than a mock DB layer); full details, known
  limitations, environment variables, and run instructions in
  `M1-IMPLEMENTATION.md`.
- Explicitly not built in M1: MFA enforcement, email verification
  enforcement, password reset, onboarding, the weekly check-in, provider
  directory, scheduling, subscriptions, or any real EHR/payment/AI
  integration.
