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

## M3 — Noor Check-In

- Implemented the first structured clinical-content workflow: a 7-question,
  data-driven patient check-in (all question wording/options live in a
  `CheckInQuestion` table, seeded at boot — no question content is
  hardcoded into any frontend component) with a full draft → submit →
  history lifecycle, plus the backend foundation for care-relationship-
  scoped clinician read access. Full details, safety-policy architecture,
  and known limitations in `M3-IMPLEMENTATION.md`.
- Database: new `CheckInQuestion`, `CheckIn`, `CheckInResponse` tables
  (`CheckInResponseType`, `CheckInStatus`, `CheckInSafetyStatus` enums) —
  migration `20260805192605_checkin_v1`, purely additive. `CheckIn`
  answers snapshot their question's key/prompt/type at save time so
  historical responses never silently change if a live question is later
  reworded. `CheckIn.cadenceKey` is a plain string (default `"weekly"`),
  deliberately not an enum, per the brief's "do not hardcode weekly into
  the schema" instruction.
- New package `packages/safety-policy`: a small, isolated, deterministic
  abstraction (mirrors the M0/M1 `EhrProvider`/`AIProvider`
  factory-selection pattern) whose input type structurally excludes free
  text and which ships exactly one placeholder rule (very-low overall
  wellbeing → a flag). Explicitly **not** AI, not a diagnosis, not a risk
  score — heavily commented `[NEEDS CLINICAL/LEGAL REVIEW]` throughout.
  Evaluated once at submission time; a flagged result never changes what
  the patient sees or is told.
- API: `GET /check-ins/questions`, `POST /check-ins` (idempotent
  get-or-create draft), `GET /check-ins/active-draft`, `PATCH
  /check-ins/:id/responses`, `POST /check-ins/:id/submit`, `POST
  /check-ins/:id/abandon`, `GET /check-ins` (history), `GET
  /check-ins/:id`; plus two clinician routes reusing the M1
  `assertClinicianHasActiveCareRelationship` authorization function
  (never reimplemented). Clinician access to check-ins is gated by
  `Permission.VIEW_CLINICAL_CONTENT`, granted only to `CLINICIAN` —
  admin still never receives it, tested explicitly.
- Frontend (`apps/patient`): Home's "Your Noor journey" section now links
  to a real `/check-in` wizard (progress indicator, per-step save,
  resume-in-progress-draft, review-before-submit, exact required
  confirmation copy) and a `/check-in/history` list + read-only detail
  view showing only descriptive 1–10 scores — no clinical interpretation
  language anywhere, by design. The one approved safety sentence ("This
  check-in is not monitored continuously and should not be used for
  emergencies.") appears on the intro, review, and confirmation screens;
  nothing beyond that sentence (a specific crisis line, phone number) was
  invented.
- No patient-clinician messaging, no clinician dashboard/UI, no AI, no
  real EHR/payment integration, no subscriptions/pricing/quotas/SLAs —
  all explicitly out of scope for M3, none invented.
- 66 new automated tests (206 total across the monorepo) — draft
  lifecycle including snapshot preservation and abandonment, submission
  including required-field validation/immutability/duplicate-prevention,
  end-to-end safety-policy integration, patient history and cross-patient
  ownership isolation, input validation, clinician authorization
  including draft-invisibility and denial auditing, admin non-access, and
  the full frontend wizard/history flow.
- Manual Playwright verification against live dev servers walked the full
  14-step checklist (unauthorized access → sign in → begin → answer →
  leave → resume → review → submit → attempt-to-edit-after-submit
  (starts a new draft, doesn't reopen the old one) → history → sign
  out/in → persistence), plus a 375px mobile viewport (44×44px touch
  targets confirmed) and keyboard-only navigation (Logo → scale radio
  group → Back → Continue) — no bugs found.

## M4 — Clinician Care Dashboard + Check-In Review

- Completed the first end-to-end Noor care-continuity workflow: patient
  submits a Check-In (M3) → authorized clinician sees it in a review
  queue → opens it → marks it reviewed → patient sees a plain "Reviewed
  by your Noor care team" status. Full details, the M0-vs-M3-foundation
  design decision, and known limitations in `M4-IMPLEMENTATION.md`.
- Database: **no new migration.** Reused `CheckIn.reviewedAt`/
  `reviewedByClinicianId` and the `CheckInStatus.REVIEWED` enum value,
  all of which already existed from M3's migration — explicitly chosen
  over the M0-sketched separate `ClinicianReview` table (which had
  additionally modeled a draft "response" field shaped for future
  messaging, out of scope here) and over adding any clinician free-text
  note field (deliberately not added — "if not necessary, don't add it
  yet").
- API: `GET /clinicians/me/dashboard` (authorization-scoped counts, no
  organization-wide numbers), `GET /clinicians/me/check-ins` (the
  cross-patient review queue, minimal fields only, no free text), `POST
  .../check-ins/:id/review` (marks reviewed; clinician identity always
  from the session, never the request body; the patient's submitted
  answers are never touched), and an extended `GET
  /clinicians/me/patients/:patientId` carrying care-relationship context.
  Every route reuses the M1 `assertClinicianHasActiveCareRelationship`
  function — an ended/paused relationship immediately removes queue,
  dashboard, and review access. Admin remains permanently denied
  `VIEW_CLINICAL_CONTENT`, tested explicitly on all three new routes.
- Frontend: a real clinician application for the first time — a
  persistent nav (Home/Patients/Check-Ins real; Schedule/Resources
  visibly "Soon," never fake links), a Home dashboard with honest
  operational cards and no fabricated appointments, the review queue
  (with a `Flagged` badge surfacing M3's *existing* deterministic safety
  state, never a new classification, and never shown on the patient
  side), a read-only check-in detail with a Mark Reviewed action, a
  patient list, and a patient care view — deliberately not a full
  medical chart (no diagnosis/medication/treatment-plan/billing field
  anywhere). The clinician app's design was brought onto the same Noor
  brand tokens as the patient app, denser to suit clinician workflows.
- No patient-clinician messaging, no scheduling, no AI, no real EHR/
  payment integration, no new escalation protocol — all explicitly out
  of scope, none invented.
- 39 new automated tests (245 total across the monorepo) — care-
  relationship enforcement (including ended-relationship access removal
  and cross-clinician denial), queue scoping and draft-invisibility,
  the review action's authorization/idempotency/no-client-controlled-
  identity/response-immutability behavior, admin non-access on every new
  route, dashboard count scoping across two separate clinicians, and the
  patient-facing reviewed-status display.
- Manual Playwright verification walked the complete patient-submits →
  clinician-reviews → patient-sees-status loop end to end against live
  dev servers, plus security checks (an unrelated clinician's queue stays
  empty and a direct URL attempt at the exact check-in id fails; an
  admin's direct API call to the clinician dashboard returns 403) and
  mobile/tablet viewport checks — no bugs found (one cosmetic nav-wrap
  fix applied at tablet width).
- Reviewed M1–M4's patient-facing API surface for future React
  Native/Expo compatibility (no RN work done): already client-agnostic
  (JSON-only, no PHI in URLs, CORS is Origin-header-based and doesn't
  block a typical native HTTP client); the one concrete adaptation a
  future native milestone will need is session auth, since httpOnly
  cookies aren't automatically persisted by a bare `fetch` the way a
  browser does — documented as an engineering decision for that
  milestone, not resolved here.

## M5 — Native Noor Patient App Foundation

- Added a genuine native patient app, `apps/mobile` (Expo + React Native
  + TypeScript) — not a WebView wrapper. Patient-only: signup/login/
  logout/session persistence, resumable onboarding (same backend/data
  model as web — a patient can start on one client and finish on the
  other), Noor Home, the M3 Check-In wizard + history + detail, and
  Profile. No clinician mobile functionality was built. Full details in
  `M5-IMPLEMENTATION.md`.
- **Native authentication design, written and reviewed before the
  backend code**, per the milestone brief: extended the *existing*
  cookie-session model with an optional bearer-token transport of the
  exact same `Session` row (`clientType: "web"|"native"` on
  signup/login controls only whether the JSON response echoes the raw
  token; web behavior is byte-for-byte unchanged) — deliberately not a
  new token format, not a second identity system, not a weakening of the
  browser session model. 14 new backend tests confirm bearer auth
  resolves to identical RBAC/ownership as cookie auth, cannot self-
  elevate role, and that native logout doesn't revoke a separate web
  session for the same user.
- Native-side, the token is the **only** thing persisted on-device
  (`expo-secure-store` — iOS Keychain / Android Keystore; never
  `AsyncStorage`, which isn't even a dependency and is mock-blocked in
  tests). No password, no profile data, and no check-in content —
  including free-text answers — is ever cached to on-device storage;
  everything else is re-fetched from the API and held only in memory.
- Moved `PatientProfileDTO` and `timeOfDayGreeting()` into `@noor/types`
  so both clients share one definition instead of two that could drift;
  `apps/patient`'s existing file becomes a thin re-export.
- A real `npx expo export --platform ios|android` bundle build (not just
  Jest, which mocks the native module layer) caught and led to fixing a
  genuine bug: the originally-chosen `react-native@0.87.0`/`react@19.2.8`
  versions are newer than what Expo SDK 57 actually bundles/supports and
  failed to bundle at all; pinned to the exact versions Expo's own
  `bundledNativeModules.json` specifies (`react-native@0.86.2`,
  `react@19.2.3`) and fixed an over-aggressive `metro.config.js` resolver
  override (`disableHierarchicalLookup: true`) that had also broken
  monorepo module resolution. Both platforms now export a working Hermes
  bundle. See `M5-IMPLEMENTATION.md` §5/§26 for the full account.
- **No iOS Simulator or Android emulator was available in the build
  environment this milestone was implemented in** — stated explicitly
  rather than pretending otherwise. Verification instead used
  `expo-doctor`, `tsc`, the automated test suite, and the real Metro
  export above; exact physical-device (Expo Go) instructions for both
  iPhone and Android are documented for whoever verifies this next.
- Biometrics (`expo-local-authentication`), screen-capture protection,
  and push notifications are explicitly **not built** in M5 — dependency/
  integration points only, each documented as a deliberate future-
  milestone gap rather than a partial or hidden implementation.
- App Store / Google Play preparation is documentation only (bundle id
  `com.noor.patient`, app name "Noor") — no submission, no fabricated
  privacy-disclosure answers, no real icon asset (the placeholder icon is
  explicitly not a recreation of the real Noor logo, per the brief).
- 52 new automated tests (14 backend native-auth + 38 mobile) — 297
  total across the monorepo, zero regressions in any pre-existing suite.
  `pnpm -w typecheck` clean across all 12 workspace projects.
