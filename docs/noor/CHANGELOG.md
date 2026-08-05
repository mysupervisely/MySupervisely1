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

## M2 — Patient Onboarding + Home

- Implemented the first complete patient-facing product surface: landing
  → signup → 4-step onboarding wizard → Noor Home → patient profile
  page, plus honest "coming soon" placeholders for Find a Therapist and
  Noor Async. Full details, brand sourcing note, and known limitations in
  `M2-IMPLEMENTATION.md`.
- Database: `PatientProfile` gains `reasonForSeekingCare`, `careType`
  (`CareType` enum), `careFormatPreference` (`CareFormatPreference` enum)
  — migration `20260805165544_onboarding_fields`. No clinical-content
  tables added; M1's deferral of those still holds.
- API: `PATCH /patients/me` (partial profile update) and
  `POST /patients/me/onboarding/complete` (validates all required fields
  present, sets `onboardingCompletedAt` once, 409 on a second attempt),
  both self-scoped to the authenticated patient, both audited (field
  names only, never values).
- Brand: an original interpretation of the brief's written brand
  description (warm cream/charcoal/gold, elegant serif display type,
  rounded cards/pills, an original sun-mark SVG) — `noortherapygroup.com`
  was not reachable and no screenshot was attached to the conversation,
  so no real brand assets were available to reference. Flagged for a
  design review pass if/when real assets exist.
- Manual/Playwright browser verification (not just `tsc`/unit tests)
  caught four real bugs the automated suite missed: `@fastify/cors`'s
  default `methods` list silently blocking `PATCH` at the browser's
  preflight step, `Content-Type: application/json` sent with an empty
  body breaking the onboarding-complete call, a floating-point hydration
  mismatch in the sun mark's SVG coordinates, and a header overflow on a
  390px mobile viewport. All four fixed, each with a regression test
  added.
- 51 new automated tests (134 total across the monorepo) — onboarding
  authorization, patient ownership, profile creation/update, validation,
  incomplete/completed onboarding, unauthorized access, home-dashboard
  access, and the four regression tests above.
- Explicitly not built in M2: the weekly check-in, subscriptions, EHR
  integration, AI functionality, clinical assessment/diagnosis, MFA
  enforcement, email verification enforcement, or password reset.

### M2 refinement (same milestone, before approval)

- **Product direction:** Noor's primary product is live therapy — a
  standalone "Noor Async" product is explicitly *not* being committed to
  yet ("Your care continues between sessions," not "Therapy without
  appointments"). Removed the "Noor Async" branded entry point from Home
  entirely; relabeled care-preference options to avoid presupposing an
  unbuilt product name (e.g. "Ongoing support," "Support between
  appointments" instead of "Asynchronous support"). No price, message
  quota, check-in count, clinician SLA, or clinician-compensation rule
  was ever hardcoded, in either pass.
- **Database:** replaced `PatientProfile.reasonForSeekingCare` (free
  text) with `whatBringsYouToNoor` (new `NoorInterest` enum, 5 fixed
  choices) — onboarding is now free-text-free end to end. Expanded
  `CareType` with `PSYCHIATRY`/`ASYNC_SUPPORT` and
  `CareFormatPreference` with `BOTH` — migration
  `20260805184330_onboarding_preferences_refinement`. Still no new model;
  the reasoning for keeping these on `PatientProfile` is documented in
  `M2-IMPLEMENTATION.md` §5.
- **Onboarding UX:** rebuilt as a 6-screen conversational flow (welcome →
  4 data screens → completion), matching the brief's exact example
  copy. Added real "resume" behavior: a returning patient with saved
  progress lands on their first incomplete screen, not the welcome
  screen and not step 1 — verified by both an API test and a live
  leave-and-return pass in manual verification.
- **Home redesign:** restructured into "Your care / Your Noor journey /
  Explore care / Resources," per the refined brief; added a `/resources`
  placeholder page; removed `/async-care`.
- **Accessibility:** added visible `:focus-visible` states across every
  interactive element, `fieldset`/`legend` grouping for radio choices,
  `role="alert"`/`role="status"` on error/confirmation messages, and
  explicit 44px touch targets.
- Updated/added tests throughout (140 total across the monorepo now);
  re-ran the full 12-step manual verification checklist end to end
  against a live instance, including the mobile viewport, with no
  hydration warnings or unhandled errors.
