# Noor — M2 (Patient Onboarding + Noor Home) Implementation Notes

**Status: M2 complete, pending review. Not production-ready. Not HIPAA
compliant. No clinical decision-making logic exists anywhere in this
milestone.**

Builds on [M1](./M1-IMPLEMENTATION.md), which remains fully in force: every
M1 security requirement (server-side authorization, ownership scoping,
audit logging, synthetic-data-only environments, provider/payment/AI
abstractions) continues to apply unchanged. No M0/M1 architecture,
security, RBAC, database, or API pattern was redesigned — M2 extends
`PatientProfile` and adds patient-facing routes/pages within the existing
structure.

**Revision note:** M2 was implemented in two passes within this
milestone. The first pass used a free-text "reason for seeking care"
field and a 4-screen wizard with no welcome/completion screens. Before
declaring M2 done, the brief was refined twice more: (1) onboarding's
"what brings you to Noor" became a fixed multiple-choice field instead of
free text, care-type/format options expanded, and a welcome + completion
screen were added to match a 6-screen conversational example; (2) an
explicit product-direction note arrived stating Noor's primary product is
live therapy and that a standalone Async product is not being committed
to yet, which changed some option labels and removed a "Noor Async" brand
entry point from Home. This document describes the **final** state after
both refinements — see §4 for the schema migration this required.

---

## 1. Summary

Landing → signup → onboarding (welcome → 4 data screens → completion) →
Noor Home → patient profile. Every screen either shows real data from the
API or an honest, clearly-labeled future/empty state. Nothing in M2
implements the weekly check-in, subscriptions/billing, Async
messaging, EHR integration, AI functionality, or clinical
assessment/diagnosis — all remain explicitly out of scope and none of
their tables, pricing, quotas, or SLAs were invented.

## 2. Product direction: Async (read before touching related copy)

Noor's primary product is **live therapy supported by a digital care
layer** — "Your care continues between sessions," not "Therapy without
appointments." Whether structured between-session support ships later as
(a) a feature bundled with live therapy, (b) a separately priced product,
or (c) both, is an **open, undecided** product question. Consequently, M2
deliberately:

- Never brands anything as "Noor Async" or "Async Care" in the UI.
- Never states a price, message quota, check-in count, clinician response
  SLA, or clinician compensation rule anywhere (removed entirely; none
  existed as hardcoded values even in the first M2 pass, but the first
  pass's copy did name-brand an "Async" product entry point on Home,
  which this revision removed).
- Uses non-committal option labels — "Ongoing support" (care type) and
  "Support between appointments" (care format) — instead of "Asynchronous
  support," so the patient-facing UI doesn't presuppose an unbuilt product
  name. The underlying enum *values* (`ASYNC_SUPPORT`, `ASYNC`) are stable
  internal identifiers and can be relabeled again later without a schema
  change.
- Represents psychiatry as informational-only on Home ("Psychiatric care
  may be available as Noor expands," no button) rather than a functional
  entry point, since it isn't available yet either.

## 3. Brand sourcing note

The brief again named `noortherapygroup.com` and "the provided
screenshot" as the visual source of truth. **Neither was available to
this build**: `noortherapygroup.com` returns HTTP 403 on fetch and does
not appear to be a real, publicly reachable site (a web search surfaced
only unrelated organizations of similar name), and no screenshot was ever
attached to any message in this conversation. The design below remains an
original interpretation of the brief's own written description (warm
cream backgrounds, dark charcoal-navy typography, warm brown/gold accent,
elegant serif display type, rounded cards/pills, generous whitespace, a
restrained original sun-mark SVG) rather than a fabricated claim of having
referenced assets that weren't reachable. If real brand assets become
available, this is the place to reconcile against them.

## 4. Files created / modified

**New:**
- `packages/db/prisma/migrations/20260805184330_onboarding_preferences_refinement/`
- `apps/patient/src/app/resources/page.tsx` (new placeholder page)
- All M2-v1 new files remain (onboarding wizard, profile page,
  find-a-therapist placeholder, `NoorSunMark`/`NoorLogo`, shared
  `@noor/types` onboarding schemas, associated tests) — see file list
  below.

**Removed:**
- `apps/patient/src/app/async-care/` — deleted. Home no longer links to a
  distinct "Noor Async" destination (see §2); nothing else referenced this
  route.

**Changed (this refinement pass):**
- `packages/db/prisma/schema.prisma` — `PatientProfile.reasonForSeekingCare`
  (free text) replaced with `whatBringsYouToNoor` (new `NoorInterest`
  enum); `CareType` gained `PSYCHIATRY` and `ASYNC_SUPPORT`;
  `CareFormatPreference` gained `BOTH`.
- `packages/types/src/onboarding.ts` — new `NoorInterest` enum/labels;
  `CareType`/`CareFormatPreference` labels updated per §2; schemas
  reference `whatBringsYouToNoor` instead of the old free-text field.
- `packages/api/src/routes/patients.ts` — field rename only; validation,
  authorization, and audit logic unchanged.
- `packages/db/prisma/seed.ts` — seeded patient now sets
  `whatBringsYouToNoor` instead of the removed free-text field.
- `apps/patient/src/app/onboarding/page.tsx` — rewritten as a 6-screen
  flow (welcome → 4 data screens → completion), with resume-to-first-
  incomplete-step behavior (see §7).
- `apps/patient/src/app/home/page.tsx` — rewritten to match the brief's
  "Your care / Your Noor journey / Explore care / Resources" structure;
  no Async-branded entry point.
- `apps/patient/src/app/profile/page.tsx` — field rename; adds a
  `whatBringsYouToNoor` select.
- `apps/patient/src/app/find-a-therapist/page.tsx` — copy aligned to the
  brief's exact example ("Find a provider who fits your needs." /
  disabled "Explore Providers" button, since there's nowhere real to send
  a click yet).
- `apps/patient/src/app/globals.css` — added `:focus-visible` rules,
  `fieldset`/`legend` styles, explicit 44px touch-target sizing (§10).
- All affected test files (see §12).

## 5. Database changes

Migration: `20260805184330_onboarding_preferences_refinement` (on top of
M2's original `20260805165544_onboarding_fields`).

```prisma
enum NoorInterest {
  LOOKING_FOR_THERAPIST
  ONGOING_SUPPORT
  ASYNC_SUPPORT_INTEREST
  EXPLORING_OPTIONS
  NOT_SURE
}

enum CareType {
  INDIVIDUAL_THERAPY
  COUPLES_THERAPY
  FAMILY_THERAPY
  PSYCHIATRY       // added
  ASYNC_SUPPORT    // added
  NOT_SURE
}

enum CareFormatPreference {
  VIDEO
  ASYNC
  BOTH             // added
  NOT_SURE
}

model PatientProfile {
  // ...
  whatBringsYouToNoor  NoorInterest?   // replaces reasonForSeekingCare
  careType             CareType?
  careFormatPreference CareFormatPreference?
}
```

**Why no new model.** Section 13 of the brief asks explicitly: if a new
model is required, explain why; if not, extending `PatientProfile` should
be preferred. These three fields stay on `PatientProfile` rather than a
separate "preferences" table because they are a fixed, small, strictly
1:1 set of scalar self-report answers belonging to exactly one patient —
not a growing or multi-valued domain the way `CareGoal` or `Appointment`
are (a patient has many goals/appointments over time; a patient has
exactly one "what brings you to Noor" answer, updatable in place). Adding
a table for a handful of enum columns with no multiplicity would be
premature structure with no present benefit. No `CheckIn`, `Subscription`,
messaging, clinical-review, or `Appointment` tables were added — those
remain deferred to the milestones that need them, per M1's documented
policy.

**A note on the mid-milestone data-loss migration.** Because this
refinement happened before M2 shipped, the second migration drops the
`reasonForSeekingCare` column outright (visible in its generated SQL) —
acceptable only because the only data ever in it was synthetic
seed/manual-test data (dev rule: never real patient information in
development). This would be a materially different, much more careful
operation against a database holding real patient data.

## 6. API endpoints (unchanged from M2-v1 except the one field rename)

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/patients/me` | Self-scoped read (PATIENT role only). Returns `firstName`, `lastName`, `state`, `whatBringsYouToNoor`, `careType`, `careFormatPreference`, `onboardingCompletedAt`, and a server-computed `completionPercent` — this **is** the onboarding-status endpoint (brief §14: "onboarding status," "patient preferences") — no separate status endpoint was added since this one response answers it. |
| `PATCH` | `/patients/me` | Partial update, every field optional. Used both for incremental per-step onboarding saves and for post-onboarding profile edits — the same endpoint, no divergent logic. |
| `POST` | `/patients/me/onboarding/complete` | Validates every `REQUIRED_ONBOARDING_FIELDS` entry is already non-empty on the stored profile, sets `onboardingCompletedAt` once (409 on a second call), audited. |

All three: authenticated (M1 session), authorized (`requireRole(request,
"PATIENT")`, self-scoped — no `:patientId` parameter exists anywhere in
this router), validated against the shared `@noor/types` zod schemas,
return hand-picked typed JSON (never a raw Prisma row — `passwordHash`
and internal ids of *other* tables are never reachable through this
response), and produce a consistent `{ error: string }` shape on failure
via the shared `HttpError` hierarchy from M1.

## 7. Frontend routes

| Route | Purpose |
|---|---|
| `/` | Landing page — brand hero, 3-step "how it works." |
| `/signup`, `/login` | Sign up / sign in. Signup routes to `/onboarding`; login routes to `/home` (which redirects onward to `/onboarding` if incomplete — one place owns that decision, not duplicated logic). |
| `/onboarding` | The 6-screen conversational flow: **Welcome** (no data) → **Screen 2** "Let's get to know you" (first name, last name, state) → **Screen 3** "What brings you to Noor?" (5 fixed choices) → **Screen 4** "What kind of care are you looking for?" (6 fixed choices) → **Screen 5** "How would you like to receive care?" (4 fixed choices) → **Screen 6** "You're all set." (no data, `[Continue to Noor Home]`). Each data screen saves via `PATCH` before advancing; Back is always available on data screens; a returning patient with any saved progress is dropped at their **first incomplete data screen**, never sent back to Welcome or made to re-answer what they already saved (see `firstIncompleteDataStep` in the page source) — this is the concrete "resume" behavior, verified both by an API test and by an actual leave-and-return pass in the Playwright verification run (§16). |
| `/home` | Noor Home: greeting + tagline, a one-line profile-completion status with an edit link, **Your care** ("No provider yet" / `[Find a Therapist]` / upcoming-appointments empty state), **Your Noor journey** ("Your care continues between sessions," non-committal about what arrives here later), **Explore care** (a functional "Therapy" card linking to Find a Therapist, and a non-functional informational "Psychiatry" card), **Resources** (links to `/resources`). No subscription/billing card, no "Noor Async" card — see §2. |
| `/profile` | View/edit first name, last name, state, and the three care-preference fields, any time after onboarding. Redirects to `/onboarding` if onboarding isn't done yet. |
| `/find-a-therapist` | Honest placeholder: "Find a provider who fits your needs," a disabled `Explore Providers` button (there's genuinely nowhere to send that click yet), no fake providers/availability/appointments. |
| `/resources` | **New.** Honest placeholder for the future resource library, linked from Home. |

## 8. Components created

- `NoorSunMark` — the brand sun mark, precomputed fixed-coordinate SVG
  (see M2-v1's hydration-bug note, still true here).
- `NoorLogo` — sun mark + "Noor" wordmark, linked to `/`.

## 9. Authentication behavior

Unchanged from M1, exercised end-to-end by this milestone's pages:
- Sign up creates a `PATIENT`-role account only — the signup form has no
  role field at all, and the API's `/auth/signup` schema doesn't accept
  one (privilege-escalation guard, tested in M1).
- Sign in sets an httpOnly, signed session cookie; sign out clears it
  server-side (`DELETE FROM sessions ...` via `deleteSession`).
- Session persistence: verified manually — signing out and back in
  restores the same session-backed identity and the same persisted
  profile data (§16, steps 10–12).
- Protected routes: every M2 page's first effect calls `GET /auth/me`;
  a 401 redirects to `/login`. This is a UX convenience, not the security
  boundary — see §11.
- Appropriate redirects: unauthenticated → `/login`; authenticated with
  incomplete onboarding → `/onboarding`; authenticated with completed
  onboarding hitting `/onboarding` again → `/home` (no re-onboarding).

## 10. Authorization behavior

Unchanged from M1's central RBAC + ownership model. Specific to M2's new
routes: `PATCH /patients/me` and `POST /patients/me/onboarding/complete`
both call `requireRole(request, "PATIENT")` and operate only on
`request.sessionUser.patientId` — there is no route parameter for a
patient id anywhere in `patients.ts`, so there is no code path that could
be tricked into reading or writing a different patient's row. Verified by
the M1 ownership suite (unaffected) and the M2 onboarding suite's
CLINICIAN/ADMIN-denial tests.

## 11. Security considerations

All M1 guarantees hold. Specific to M2:

- **The frontend is never the security boundary.** Every onboarding/profile
  page's "resume at the right step," "redirect if incomplete," and
  "disable Explore Providers" behaviors are client-side conveniences; the
  API independently re-validates and re-authorizes every request
  regardless of what the client renders or sends.
- **No PHI in URLs.** Onboarding/profile data travels only in
  `PATCH`/`POST` request bodies; no query string or path segment ever
  carries a patient's name, state, or preference — confirmed by an
  explicit frontend test asserting `window.location.search` stays empty
  through the whole onboarding flow.
- **No free-text clinical content anywhere in onboarding**, by
  construction: every onboarding field is now a closed enum (this
  refinement's headline change), so there is no field a patient could
  type clinical history into even by accident — stronger than M2-v1's
  free-text field with content-agnostic length bounds.
- **Audit metadata never carries values**, only field names (e.g.
  `{"fields":["whatBringsYouToNoor"]}`), enforced by M1's
  `assertSafeMetadata` guard and re-verified by this milestone's tests.
- **No PHI in browser console logs, analytics, or error messages** —
  nothing in M2 adds a `console.log` of profile data, an analytics call,
  or an error message that echoes field values (errors are generic:
  "Invalid profile update.", "Onboarding is incomplete. Missing: ...\"
  lists field *names*, not values).
- **Synthetic development data only** — the seed script's patient account
  is still obviously synthetic (`patient.dev@example.test`), and the
  manual verification run in §16 used a fresh, disposable
  `full.flow.<timestamp>@example.test` account, never anything resembling
  a real person.

## 12. Audit logging

Unchanged action set from M2-v1: `patient_profile.self_read`,
`patient_profile.self_update` (metadata: field *names* only),
`patient_profile.onboarding_completed`. No new audit actions were needed
for this refinement — the field rename doesn't change what's audited or
how.

## 13. Accessibility

Implemented, not retrofitted:

- **Semantic HTML.** One `<h1>` per page, `<h2>` per Home section (each
  with `aria-labelledby` pointing at the section, so a screen-reader
  landmark list reads "Your care," "Your Noor journey," "Explore care,"
  "Resources" — not four generic `<div>`s). Onboarding's grouped choices
  use `<fieldset>`/`<legend>` (e.g. legend "What brings you to Noor?"),
  so assistive tech announces the group name once, not per radio option.
- **Keyboard navigation.** Every control (inputs, selects, radio buttons,
  buttons, links) is a native interactive element — no `<div onClick>`
  anywhere — so tab order and activation (Enter/Space) work without any
  custom key handling.
- **Visible focus states.** A global `:focus-visible` rule
  (`globals.css`) puts a 2px gold outline on every link, button, input,
  select, textarea, and radio card on keyboard focus — and only on
  keyboard focus (`:focus-visible`, not `:focus`), so a mouse click
  doesn't leave a distracting ring.
- **Accessible labels.** Every input/select has a real `<label
  htmlFor="...">` (verified indirectly — the tests use
  `screen.getByLabelText(...)`, which fails if the association is
  missing).
- **Errors associated with the action that caused them.** Every error
  message (`.noor-error`) carries `role="alert"`, so a screen reader
  announces it immediately when it appears, right where the user just
  acted — not silently added to the page.
- **Sufficient contrast.** Body text uses `--noor-ink` (`#23252b`) on
  `--noor-cream` (`#faf5ea`) — well above WCAG AA for normal text; muted
  text (`--noor-muted`, `#6f6a60`) was chosen to still clear AA at the
  sizes it's used at.
- **Touch targets.** Buttons and radio cards are explicitly floored at
  44px tall via `min-height` (WCAG 2.5.5 / platform HIG guidance), using
  padding rather than a fixed height so text can still wrap.
- **Screen-reader-friendly structure and status messages.** The profile
  page's "Saved" confirmation carries `role="status"` (polite
  announcement, doesn't interrupt); the onboarding progress bar is a real
  `role="progressbar"` with `aria-valuenow`/`aria-valuemin`/`aria-valuemax`.

Not independently audited by an accessibility specialist or automated
tool (e.g. axe) — see §17 known limitations.

## 14. Performance

No new dependencies were added for this refinement (the enum/label
changes and page rewrites use the same `@noor/types`, `next/font/google`,
and component set as M2-v1). Each onboarding screen makes exactly one
`PATCH` call on Continue — no polling, no redundant re-fetching. Loading
and error states are explicit on every page (`if (loading) return ...`),
so nothing renders a blank screen while data is in flight.

## 15. EHR / AI / payments abstractions

Untouched. No route added in this milestone imports `@noor/ehr-adapter`,
`@noor/ai-service`, or `@noor/payments-adapter` — onboarding preferences
are pure Noor-domain data (`PatientProfile`), not clinical records,
appointments, or billing.

## 16. Manual verification (this session, against a live running instance)

Ran the real dev servers (`pnpm dev:api` + `pnpm dev`) and drove the exact
12-step checklist from the brief with a headless Chromium instance
(Playwright, driving the environment's pre-installed browser — not a
project dependency), using a fresh disposable account:

1. **New patient** — fresh signup.
2. **Create account** — `POST /auth/signup` succeeds, redirects to
   `/onboarding`.
3. **Begin onboarding** — welcome screen shown, "Continue" advances to
   Step 1 of 4; Step 1 (name + state) saved via `PATCH`.
4. **Leave onboarding** — navigated away to `/` mid-flow (after step 1,
   before step 2), simulating closing the tab.
5. **Return** — navigated back to `/onboarding` directly.
6. **Resume onboarding** — landed exactly on Step 2 of 4 ("What brings
   you to Noor?"), **not** the welcome screen and **not** step 1 again.
7. **Complete onboarding** — answered steps 2–4, "Finish" completed
   onboarding server-side, landed on the "You're all set." screen.
8. **Enter Home** — "Continue to Noor Home" → `/home`, greeting shows the
   patient's real first name, all four sections render, no "Noor Async"
   text or `$` pricing anywhere on the page (asserted).
9. **Edit profile** — changed last name on `/profile`, saved, "Saved"
   confirmation shown.
10. **Sign out** — `/home` → Log out → redirected to `/login`.
11. **Sign back in** — same credentials → `/home`.
12. **Confirm profile persists** — greeting still shows the same first
    name; `/profile`'s last-name field still shows the edited value from
    step 9, round-tripped through logout/login.

All 12 steps passed (asserted programmatically, not just eyeballed —
each step has a corresponding `assert(...)` in the verification script).
Also captured at a 390×844 mobile viewport: Home and profile render
correctly, no horizontal overflow, no overlapping elements. Server logs
were checked for hydration warnings and unhandled errors — none
occurred (the M2-v1 hydration bug in the sun mark stayed fixed through
this rewrite).

Screenshots from this run were sent alongside this report. To reproduce:

```bash
cd noor
pnpm dev:api            # terminal 1
pnpm dev                # terminal 2 — patient app on :3000
```

Then sign up, and walk the same 12 steps — or resize the browser /
open dev tools' device toolbar for the mobile layout.

## 17. Known limitations

- **Brand fidelity** — see §3; an original interpretation, not a verified
  match to real Noor Therapy Group assets.
- **"Explore Providers," "Explore Resources"** have no real destination
  yet beyond their own placeholder pages — by design, per the brief's
  explicit "do not make unavailable features appear functional."
- **No automated accessibility audit** (e.g. axe-core) was run — manual
  review against the WCAG-derived checklist in §13 only.
- **No automated visual/pixel regression suite** — Playwright screenshot
  verification (§16) is the current substitute, as in M2-v1.
- **MFA, email verification enforcement, and password reset** remain
  unimplemented, unchanged from M1.
- **No E2E automation wired into CI** — the Playwright verification in
  §16 was run manually for this milestone, not added to
  `.github/workflows/noor-ci.yml`.
- **The onboarding "resume" behavior is state-derived, not step-tracked**
  — i.e., there is no explicit "last screen visited" field; resuming
  recomputes the first incomplete data screen from which fields are
  already filled in. This is simpler and self-healing (works correctly
  even if a patient edits data out of order via Back), but means a
  patient who already answered a later screen and then clears that
  answer via `/profile` before finishing onboarding would resume there
  again — an edge case, not exercised by real onboarding flows since
  `/profile` is only reachable after onboarding completes.

## 18. Product decisions still requiring review

- **Onboarding/completion copy tone** ("There's no wrong answer," "You're
  all set," etc.) is a product/UX choice, not clinically or legally
  reviewed language.
- **Whether/how Async-style between-session support ships** — bundled
  feature, separate product, or both — is explicitly undecided (§2); no
  pricing, quotas, or SLAs exist anywhere in the codebase to revisit.
- **Psychiatry's actual availability timeline** is unknown; Home's copy
  ("may be available as Noor expands") is deliberately non-committal and
  should be reviewed before any real launch communication references it.
- **Brand assets** — see §3 — should be reconciled against real
  guidelines if/when available.
- **Safety-relevant free text** is now moot for onboarding specifically
  (no free-text field exists there anymore), but remains an open question
  for any future field that does collect free text (M0's escalation
  workflow is still out of scope, per `ARCHITECTURE.md` §9/§N).

## 19. Recommended next milestone

Per the roadmap in `ARCHITECTURE.md` §M, the natural next step is **M3 —
Weekly Noor Check-In** (the deterministic, non-AI check-in flow), since
Home's "Your Noor journey" section is now explicitly designed to receive
it without further redesign. Awaiting explicit approval before starting
M3 — nothing in this milestone begins that work.
