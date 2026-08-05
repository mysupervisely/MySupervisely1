# Noor — M2 (Patient Onboarding + Home) Implementation Notes

**Status: M2 complete, pending review. Not production-ready. Not HIPAA
compliant. No clinical decision-making logic exists anywhere in this
milestone.**

Builds on [M1](./M1-IMPLEMENTATION.md), which remains fully in force: every
M1 security requirement (server-side authorization, ownership scoping,
audit logging, synthetic-data-only environments, provider abstractions)
continues to apply unchanged. This document covers only what M2 added.

## 1. Scope recap

Landing → account creation → onboarding → patient profile → Noor Home.
Per the M2 approval, this milestone does **not** include the weekly
check-in, subscriptions, EHR integration, AI functionality, or any
clinical assessment/diagnosis — all of those remain future/empty states.

## 2. Brand sourcing note

The brief asked for noortherapygroup.com and "the provided screenshot" to
be used as the visual source of truth. **Neither was available to this
build**: `noortherapygroup.com` returned HTTP 403 on fetch and does not
appear to be a real, publicly reachable site (a web search turned up
unrelated organizations of similar name, not this one), and no screenshot
was actually attached to the conversation. Rather than fabricate having
referenced assets that weren't accessible, the design below implements the
brief's own written brand description directly (warm cream backgrounds,
dark charcoal-navy typography, warm brown/gold accent, elegant serif
display type, rounded cards/pills, generous whitespace) as an original
interpretation, including an original sun-mark SVG (see
`apps/patient/src/components/NoorSunMark.tsx`). **If real brand assets
(logo file, exact color hex values, approved typography, an actual
screenshot) become available, this is the one place a design pass should
reconcile against them** — nothing here should be read as a faithful
reproduction of an existing brand.

## 3. Files created/changed

**New:**
- `packages/types/src/onboarding.ts` (+ test) — shared onboarding
  constants/schemas (care type/format enums + labels, US states, zod
  validation) used by both the API and the patient app, so client and
  server validation can't silently drift.
- `packages/db/prisma/migrations/20260805165544_onboarding_fields/` — see
  §4.
- `packages/api/tests/onboarding.test.ts`, `packages/api/tests/cors.test.ts`
- `apps/patient/src/app/onboarding/page.tsx` (+ tests) — the 4-step wizard.
- `apps/patient/src/app/profile/page.tsx` (+ tests) — view/edit profile.
- `apps/patient/src/app/find-a-therapist/page.tsx`,
  `apps/patient/src/app/async-care/page.tsx` — honest "coming soon"
  placeholders.
- `apps/patient/src/components/NoorSunMark.tsx` (+ test),
  `apps/patient/src/components/NoorLogo.tsx` — the brand mark.
- `apps/patient/src/lib/profile.ts` — shared `PatientProfile` type +
  `timeOfDayGreeting()`.
- `apps/patient/src/app/home/__tests__/`,
  `apps/patient/src/app/onboarding/__tests__/`,
  `apps/patient/src/app/profile/__tests__/`.

**Changed:**
- `packages/db/prisma/schema.prisma` — `PatientProfile` gains
  `reasonForSeekingCare`, `careType`, `careFormatPreference`; two new
  enums (`CareType`, `CareFormatPreference`). See §4.
- `packages/db/prisma/seed.ts` — the seeded dev patient is now fully
  onboarded (so `pnpm db:seed` gives a developer an immediately-usable
  Home dashboard).
- `packages/api/src/routes/patients.ts` — `PATCH /patients/me` and
  `POST /patients/me/onboarding/complete` added (see §5).
- `packages/api/src/audit/actions.ts` — two new audit actions.
- `packages/api/src/plugins/security.ts` — **real bug fix**: the CORS
  plugin's own default `methods` list is `GET,HEAD,POST`, silently
  blocking `PATCH`/`DELETE` at the browser's preflight step. See §7.
- `apps/patient/src/app/{page,login,signup,home,layout}.tsx`,
  `globals.css` — full brand redesign; signup now redirects to
  `/onboarding` instead of `/home`.
- `apps/patient/src/lib/api.ts` (and the clinician/admin copies, kept
  consistent) — **real bug fix**: only set `Content-Type: application/json`
  when a body is actually present. See §7.
- `apps/patient/package.json` — added `@testing-library/user-event`.
- `apps/{patient,clinician,admin}/tsconfig.json`,
  `apps/{patient,clinician,admin}/vitest.setup.ts` — fixed a Vitest/jest-dom
  type-augmentation gap (`toBeInTheDocument` wasn't visible to `tsc` — see
  §7).

## 4. Database changes

New migration: `packages/db/prisma/migrations/20260805165544_onboarding_fields/`.

```prisma
enum CareType {
  INDIVIDUAL_THERAPY
  COUPLES_THERAPY
  FAMILY_THERAPY
  NOT_SURE
}

enum CareFormatPreference {
  VIDEO
  ASYNC
  NOT_SURE
}

model PatientProfile {
  // ...existing M1 fields...
  reasonForSeekingCare  String?
  careType              CareType?
  careFormatPreference  CareFormatPreference?
}
```

All three new fields are nullable — onboarding fills them in
incrementally (see §5), and `onboardingCompletedAt` (from M1) is only set
once every field required by `REQUIRED_ONBOARDING_FIELDS`
(`packages/types/src/onboarding.ts`) is present. No other tables changed;
M1's documented decision to defer clinical-content tables (check-in,
clinician review, subscriptions, etc.) to their own milestones still
holds.

## 5. API endpoints

All under the existing `PATIENT`-role, self-only ownership model from M1
— no `:patientId` route parameter exists anywhere in this file, so there
is no path that needs a separate per-resource ownership check to get
wrong.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/patients/me` | Unchanged route, extended response: now also returns `reasonForSeekingCare`, `careType`, `careFormatPreference`, and a server-computed `completionPercent` (0–100, based on `REQUIRED_ONBOARDING_FIELDS`). |
| `PATCH` | `/patients/me` | **New.** Partial update — every field independently optional. Used both by the onboarding wizard (one call per step) and the standalone `/profile` edit page. Validated against `patientProfileUpdateSchema` (`@noor/types`). |
| `POST` | `/patients/me/onboarding/complete` | **New.** Sets `onboardingCompletedAt` once every required field is already present on the stored profile (rejects with 400 listing what's missing otherwise). Returns 409 if onboarding was already completed — edit afterwards via `PATCH`. |

Audit actions added: `patient_profile.self_update` (metadata: the
**names** of the fields that changed, never their values — enforced by
the existing `assertSafeMetadata` guard from M1, which would reject a raw
value under a key like `reason`/`notes` anyway) and
`patient_profile.onboarding_completed`.

## 6. UI routes (apps/patient)

| Route | Purpose |
|---|---|
| `/` | Redesigned landing page — brand hero, 3-step "how it works." |
| `/signup`, `/login` | Restyled; signup now routes to `/onboarding`, login routes to `/home` (which itself redirects to `/onboarding` if incomplete — one place owns that decision). |
| `/onboarding` | **New.** 4-step wizard (name → state → reason → care preferences), saved incrementally via `PATCH`, finished via the `complete` endpoint. Prefills from any partially-saved profile; redirects to `/home` if onboarding is already done (no re-onboarding). |
| `/home` | Redesigned dashboard: personalized time-of-day greeting, profile status card, subscription status, "Find a therapist" and "Noor Async" entry points (both honest "Coming soon," per the brief), upcoming-care/weekly-check-in/resources placeholders — no fabricated clinical or scheduling data anywhere. |
| `/profile` | **New.** View/edit the same fields onboarding collects, any time after onboarding. Redirects to `/onboarding` if it isn't done yet. |
| `/find-a-therapist`, `/async-care` | **New.** Honest future/empty-state placeholder pages, linked from Home. |

## 7. Real bugs found and fixed during verification

Manual/browser verification (Playwright against a running instance —
see §8) caught three issues no automated test had exercised, all now
fixed with a regression test added:

1. **CORS silently blocked `PATCH`.** `@fastify/cors`'s own default
   `methods` list is `GET,HEAD,POST` — it does not include `PATCH` or
   `DELETE` unless told to. The browser's preflight succeeded (204) but
   without `PATCH` in `Access-Control-Allow-Methods`, so the browser
   blocked the actual request client-side; nothing appeared in server
   logs, and Fastify's own `app.inject()`-based tests don't go through a
   real CORS preflight, so the whole M1+M2 automated suite missed it.
   Fixed in `packages/api/src/plugins/security.ts`; regression test in
   `packages/api/tests/cors.test.ts`.
2. **`Content-Type: application/json` sent with no body.** The onboarding
   "Finish" step calls `POST /patients/me/onboarding/complete` with no
   body, but the shared `apiFetch` helper always set
   `Content-Type: application/json`; Fastify's JSON body parser rejects a
   declared-but-empty JSON body outright (`FST_ERR_CTP_EMPTY_JSON_BODY`).
   Fixed by only setting `Content-Type` when a body is actually present
   (`apps/{patient,clinician,admin}/src/lib/api.ts`).
3. **A hydration mismatch in the sun mark.** `NoorSunMark` originally
   computed its 12 ray coordinates with `Math.cos`/`Math.sin` at render
   time; Node's SSR pass and the browser's hydration pass produced a
   one-ULP floating-point difference in the last digit of some
   coordinates, which React reports as "a tree hydrated but some
   attributes didn't match." Fixed by precomputing the 12 rays as fixed,
   rounded constants, guaranteeing byte-identical server/client markup;
   regression test in `apps/patient/src/components/__tests__/NoorSunMark.test.tsx`.

Additionally fixed, found by inspecting a real mobile screenshot rather
than a live bug report: the Home header (email + "Log out") overflowed on
a 390px-wide viewport. Fixed with a truncating, responsive header layout
in `globals.css`.

None of these were caught by the type-checker or the `app.inject()`-based
API test suite — all four were only visible by actually running the app
in a browser. This is the concrete reason §8 below is a real Playwright
run against a live server, not just "trust the code."

## 8. Local verification (screenshots)

Verified by running the real dev servers (`pnpm dev:api` + `pnpm dev`)
and driving a full signup → onboarding → Home → profile flow with a
headless Chromium instance (Playwright, driving the pre-installed
browser — not part of the committed dependency tree), at both a desktop
(1280×900) and mobile (390×844, iPhone-sized) viewport. Screenshots were
sent alongside this summary. To reproduce yourself:

```bash
cd noor
pnpm dev:api            # terminal 1
pnpm dev                # terminal 2 — patient app on :3000
# then open http://localhost:3000 and click through
# signup -> onboarding -> Home -> Edit your info (/profile)
```

Resize the browser (or open dev tools' device toolbar) to confirm the
mobile layout — no separate mobile build/flag is needed, it's the same
responsive CSS.

## 9. Tests

New/changed test files (all passing; monorepo total is now 134
automated tests):

- `packages/types/tests/onboarding.test.ts` (13) — onboarding/PATCH schema
  validation (valid submission, missing field, invalid state/enum values,
  reason length bounds, partial-update shape).
- `packages/api/tests/onboarding.test.ts` (16) — the full M2 requirement
  list against a real Postgres test database: onboarding authorization
  (auth required, wrong role rejected), patient ownership (two patients
  never see each other's data), profile creation/update (partial PATCH,
  audit records field names not values), validation (bad state/careType/
  empty reason), incomplete onboarding (400, `onboardingCompletedAt` stays
  null), completed onboarding (200, 100%, a second completion attempt is
  409, still editable afterwards via PATCH without losing the timestamp).
- `packages/api/tests/cors.test.ts` (4) — the CORS-methods regression
  test from §7.
- `apps/patient/src/app/home/__tests__/page.test.tsx` (4),
  `.../onboarding/__tests__/page.test.tsx` (5),
  `.../profile/__tests__/page.test.tsx` (3) — home-dashboard access
  (redirect to `/login` unauthenticated, to `/onboarding` if incomplete,
  otherwise render with no fabricated data), the wizard's per-step
  validation/save/advance behavior and its payload never containing
  anything outside the six allowed onboarding fields, and profile
  pre-fill/save.
- `apps/patient/src/components/__tests__/NoorSunMark.test.tsx` (3) — the
  hydration-mismatch regression test from §7.

**Mobile responsiveness testing:** genuine automated *visual* regression
testing (pixel-level layout assertions) isn't practical in jsdom (no real
layout/paint engine), so this milestone relies on the Playwright
screenshot pass in §8 — including the two real issues it actually caught
(§7) — rather than a jsdom-based test suite pretending to cover layout.
This is a deliberate scope/tooling decision, documented here rather than
silently skipped.

## 10. Commands to run locally

Same as M1 (`noor/README.md`), plus the new migration:

```bash
cd noor
pnpm install
pnpm db:generate
pnpm db:migrate        # applies 20260805165544_onboarding_fields
pnpm db:seed           # re-run any time; now onboards the seed patient too

pnpm dev:api
pnpm dev                # patient app
```

Log in as `patient.dev@example.test` / `NoorDevSeed!2026` to see a
pre-onboarded Home dashboard immediately, or sign up a fresh account to
walk through the onboarding wizard yourself.

Tests: `pnpm test` (see `noor/README.md` "Tests" for the test-database
setup — unchanged from M1).

## 11. Known limitations

- **Brand fidelity**: see §2 — this is an original interpretation of the
  brief's written brand description, not a verified match to real Noor
  Therapy Group assets, which were not accessible to this build.
- **"Coming soon" entry points have no real destination yet.** Find a
  Therapist and Noor Async link to static placeholder pages, per the
  brief's explicit instruction not to fake functionality that doesn't
  exist (M5/M7).
- **No visual/pixel regression test suite** — see §9. Manual/Playwright
  screenshot verification is the current substitute.
- **The Next.js dev-mode indicator** (the small circular badge visible in
  some `next dev` screenshots) is Next's own development-only overlay —
  it does not appear in a production build (`next build && next start`)
  and is not part of this application's UI.
- **MFA, email verification enforcement, and password reset** remain
  unimplemented, unchanged from M1's documented limitations.
- **No E2E test automation was added to CI** — the Playwright
  verification in §8 was run manually for this milestone, not wired into
  `.github/workflows/noor-ci.yml`. Adding a small Playwright smoke suite
  to CI is reasonable future work, not done here to keep M2's scope to
  what was asked.

## 12. Security considerations

All M1 security properties continue to hold (server-side authorization on
every route, ownership scoping, audit logging, no PHI in the DB layer
reaching the frontend unfiltered). Specific to M2:

- `reasonForSeekingCare` is free text but explicitly framed (in both the
  UI copy and the Prisma schema comment) as non-diagnostic — "what brings
  you to Noor," never a symptom/history intake — and is never sent to an
  AI provider (no AI is wired into M2 at all) or to any analytics/logging
  surface. It's still Tier 1-adjacent, sensitive PII, and is only ever
  returned by `GET /patients/me` under the same PATIENT-role,
  self-ownership guard as every other profile field.
- The audit-metadata PHI guard (`assertSafeMetadata`, from M1) is
  exercised for real here: `PATCH /patients/me`'s audit event logs only
  the **names** of changed fields (e.g. `{"fields":["reasonForSeekingCare"]}`),
  never their content — verified by
  `packages/api/tests/onboarding.test.ts` ("records an audit event
  listing which field NAMES changed, never values").
- No new PHI reaches a URL, browser storage, or client log anywhere in
  M2 — onboarding state lives in React component state and the
  PatientProfile row, never in a query string or `localStorage`.
- The CORS bug in §7 was a functionality bug, not a security hole — it
  made legitimate requests fail closed (blocked), not an authorization
  bypass.

## 13. Decisions requiring product/clinical/legal review

- **Exact onboarding copy** (e.g., "There's no wrong answer" framing for
  the reason field) is a product/UX choice made here for tone, not
  clinically reviewed language — worth a clinical-leadership/legal pass
  before any real patient sees it, consistent with M0's general flag on
  onboarding/consent copy.
- **Whether `reasonForSeekingCare` should have any length/content
  moderation** (e.g., a patient pasting something that reads as a safety
  concern into a "non-clinical" field) is unaddressed — M0's safety
  escalation workflow is still explicitly out of scope
  ([NEEDS CLINICAL LEADERSHIP + LEGAL/COMPLIANCE REVIEW], per
  `ARCHITECTURE.md` §9/§N), and this field is not screened by anything.
- **Brand assets**: if/when real Noor Therapy Group brand guidelines,
  logo files, or approved copy become available, someone with brand
  authority should review and, if needed, replace the interpretation
  described in §2.
