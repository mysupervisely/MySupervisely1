# Noor — M3 (Noor Check-In) Implementation Notes

**Status: M3 complete, reviewed and approved by product owner. Not
production-ready. Not HIPAA compliant. No clinical decision-making logic
exists anywhere in this milestone — the safety-policy layer is an explicit,
deterministic PLACEHOLDER pending qualified clinical/legal review (§9).**

Builds on [M1](./M1-IMPLEMENTATION.md) and [M2](./M2-IMPLEMENTATION.md),
which remain fully in force: every M1 security requirement and M2 product
direction continues to apply unchanged. No M0–M2 architecture, security,
RBAC, database, or API pattern was redesigned — M3 adds new tables/routes
within the existing structure.

---

## 1. Summary

The Noor Check-In is a short, structured, deterministic patient
self-report — 7 fixed questions, all data-driven from the database, not
hardcoded per-question frontend components. It extends continuity of care
between live therapy sessions; it is explicitly **not** a standalone
async/messaging product, not an emergency/crisis tool, and contains no AI.
This milestone delivers the full patient-facing loop — begin, answer,
save/resume a draft, review, submit, view history — plus the backend
foundation for clinician read access (ownership/care-relationship scoped),
and a deterministic, isolated safety-policy abstraction populated with a
single placeholder rule. No clinician *dashboard* was built (out of scope
per the brief — only the backend foundation was required); no
patient-clinician messaging exists anywhere in this milestone.

## 2. The 7 questions (fixed content, data-driven delivery)

Defined once in `packages/api/src/checkins/question-definitions.ts` and
seeded into the `check_in_questions` table at every API boot (idempotent,
alongside role seeding — see `lib/bootstrap.ts`
`ensureCheckInQuestionsSeeded`). `GET /check-ins/questions` is the *only*
place the frontend learns what to render — no question wording, option
list, or count is hardcoded in any React component.

| # | Key | Prompt | Type | Required |
|---|---|---|---|---|
| 1 | `overall_wellbeing` | How are you feeling overall? | `SCALE_1_10` | yes |
| 2 | `mood` | How has your mood been? | `SCALE_1_10` | yes |
| 3 | `stress` | How has your stress level been? | `SCALE_1_10` | yes |
| 4 | `sleep` | How has your sleep been? | `SCALE_1_10` | yes |
| 5 | `main_concern` | What has been most difficult recently? | `SINGLE_SELECT` (10 options) | yes |
| 6 | `desired_support` | What would you like support with? | `SINGLE_SELECT` (7 options) | yes |
| 7 | `additional_notes` | Is there anything else you'd like your clinician to know? | `FREE_TEXT` | **no** |

Adding an 8th question later means adding a row to
`CHECK_IN_QUESTION_SEEDS` and re-running the seed — no route handler or
frontend component needs to change.

## 3. Database changes

Migration: `20260805192605_checkin_v1` (purely additive — no destructive
changes, applied cleanly to both `noor_dev` and `noor_test` with no
data-loss warning).

```prisma
enum CheckInResponseType { SCALE_1_10  SINGLE_SELECT  FREE_TEXT }
enum CheckInStatus       { DRAFT  SUBMITTED  REVIEWED  ARCHIVED }
enum CheckInSafetyStatus { NONE  FLAGGED }

model CheckInQuestion {
  id            String   @id @default(cuid())
  key           String   @unique
  promptText    String
  responseType  CheckInResponseType
  options       Json?    // [{ key, label }, ...] for SINGLE_SELECT only
  isRequired    Boolean
  displayOrder  Int
  isActive      Boolean  @default(true)
  responses     CheckInResponse[]
}

model CheckIn {
  id                 String          @id @default(cuid())
  patientId          String
  patient            Patient         @relation(...)
  careRelationshipId String?
  careRelationship   CareRelationship? @relation(...)
  status             CheckInStatus   @default(DRAFT)
  cadenceKey         String          @default("weekly") // free string, NOT an enum — see below
  safetyStatus       CheckInSafetyStatus @default(NONE)
  submittedAt        DateTime?
  archivedAt         DateTime?
  createdAt          DateTime        @default(now())
  responses          CheckInResponse[]

  @@index([patientId, status])
  @@index([careRelationshipId, status])
  @@index([submittedAt])
}

model CheckInResponse {
  id                        String   @id @default(cuid())
  checkInId                 String
  checkIn                   CheckIn  @relation(...)
  questionId                String
  question                  CheckInQuestion @relation(...)
  // Snapshot fields — see §4.
  questionKeySnapshot        String
  questionPromptSnapshot     String
  responseTypeSnapshot       CheckInResponseType
  valueNumeric               Int?
  valueOptionKey              String?
  valueOptionLabelSnapshot    String?
  valueText                   String?

  @@unique([checkInId, questionId])
}
```

Back-relations added: `Patient.checkIns`, `Clinician.reviewedCheckIns`
(unused placeholder in M3 — see §10), `CareRelationship.checkIns`.

**`cadenceKey` is a plain string, not an enum**, per the brief's explicit
instruction not to hardcode "weekly" into the schema — the UI copy may say
"weekly," but the data model doesn't assume any particular cadence value
or enforce a cadence policy at all. No scheduler, reminder, or cadence
enforcement exists in M3.

**Indexes** are on `[patientId, status]` (the draft-lookup and
patient-ownership query shape), `[careRelationshipId, status]` (the
clinician-queue query shape), and `[submittedAt]` (history ordering) — the
three access patterns the routes below actually use. No index was added
speculatively.

**No new model beyond what's listed above** — no `ClinicianReview` model
was added in M3 (see §10, deferred to whatever milestone builds the
clinician dashboard).

## 4. Snapshot pattern (why answers don't live-join back to questions)

`CheckInResponse` stores its own copy of the question's key, prompt text,
response type, and (for `SINGLE_SELECT`) the chosen option's label at the
moment the answer was saved — not a foreign-key-only reference resolved
at read time. This means a later wording change to a live
`CheckInQuestion` (via a re-seed) never silently rewrites what a patient's
*already-submitted* history shows they were asked or answered. Verified
by a dedicated test that reworders a live question mid-suite and confirms
a prior response's snapshot text is unchanged.

## 5. Data model: lifecycle states

`DRAFT → SUBMITTED → (REVIEWED)`, or `DRAFT → ARCHIVED` (abandoned). No
other states exist — no "in review," "flagged," or "escalated" status was
added to `CheckInStatus` (safety flagging is tracked separately on
`CheckInSafetyStatus`, see §9, and is never patient-visible). `REVIEWED`
exists in the enum as the natural next lifecycle state for clinician
review but is not yet *set* by any route in M3 — no review-recording
endpoint was built, since M3 explicitly scoped clinician work to
read-only backend access (§10).

## 6. API endpoints

All routes require an authenticated session; all patient routes call
`requireRole(request, "PATIENT")` and operate only on
`request.sessionUser.patientId` — no route parameter for a patient id
exists anywhere in `checkins.ts`, so there is no code path that could read
or write a different patient's check-in via a client-supplied id.
Ownership violations return **404**, not 403 (never confirms another
patient's check-in exists — same pattern as M1's clinician routes).

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/check-ins/questions` | The live, active question set, ordered for display — the entire contract the wizard needs. |
| `POST` | `/check-ins` | Idempotent get-or-create of the patient's active `DRAFT` (one active draft per patient, preferred — see §14 limitation). |
| `GET` | `/check-ins/active-draft` | Reads the in-progress draft, if one exists (404 otherwise). Not audited — a draft is the patient's own scratch data, not a "read" of finished clinical content. |
| `PATCH` | `/check-ins/:id/responses` | Saves one or more answers to a `DRAFT` (409 once submitted). Every answer is validated against the *live* `CheckInQuestion` definition in a pre-pass before any write, so an invalid answer never partially saves the valid ones in the same request. |
| `POST` | `/check-ins/:id/submit` | Validates every required question is answered, evaluates the safety policy (§9), sets `status = SUBMITTED`, `submittedAt`, and `safetyStatus`. 409 if already submitted; 400 listing missing question keys if incomplete. |
| `POST` | `/check-ins/:id/abandon` | Transitions a `DRAFT` to `ARCHIVED`. 409 on a non-draft. |
| `GET` | `/check-ins` | Patient's own history — `SUBMITTED`/`REVIEWED` only, drafts never included — as lightweight summaries (date + the 4 scale scores). Audited. |
| `GET` | `/check-ins/:id` | Full detail of one of the patient's own check-ins (any status). Audited only when not a draft. |

Clinician routes (extended in `packages/api/src/routes/clinicians.ts`,
unchanged file otherwise):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/clinicians/me/patients/:patientId/check-ins` | The named patient's `SUBMITTED`/`REVIEWED` check-ins (never drafts), authorized per §10. |
| `GET` | `/clinicians/me/patients/:patientId/check-ins/:checkInId` | One check-in's full detail, same authorization. |

Every DTO returned is hand-picked (`serializeQuestion`, `serializeDetail`,
`serializeSummary` in `packages/api/src/checkins/serialize.ts`) — no route
ever returns a raw Prisma row.

## 7. Frontend routes (`apps/patient`)

| Route | Purpose |
|---|---|
| `/home` | "Your Noor journey" section now shows the real entry point: "How are things going?" / "Take a few minutes to check in with how you've been doing." / **[Begin Check-In]**, plus a "View your check-in history →" link. Replaces the M2 placeholder text. |
| `/check-in` | The wizard: an intro screen (safety disclaimer, §9) → one screen per question (progress indicator "Question N of 7," Back/Continue, per-step `PATCH` save) → a review screen (every answer shown with an Edit link back to that question) → submit → a confirmation screen with the exact required copy. `POST /check-ins` on mount both starts a fresh check-in and resumes an in-progress one (same call, idempotent) — a returning patient with saved progress lands on their first unanswered required question, not the intro screen (mirrors M2 onboarding's resume behavior). |
| `/check-in/history` | List of the patient's own submitted/reviewed check-ins — date + the 4 scale scores only, no clinical interpretation. Empty state when there's no history yet. |
| `/check-in/history/[id]` | Read-only detail of one submitted check-in — every question's prompt (snapshot) and descriptive answer. No edit controls exist on this page at all (verified by a test asserting zero form controls render). |

Every question type renders generically from
`CheckInQuestionDTO.responseType` — `SCALE_1_10` → a 1–10 button group,
`SINGLE_SELECT` → the existing `.noor-radio-card` pattern from onboarding,
`FREE_TEXT` → a labeled textarea — no per-question-key branching anywhere
in the wizard.

## 8. Data-driven scale UI (accessibility note)

The 1–10 control (`.noor-scale-group` / `.noor-scale-option` in
`globals.css`) distinguishes the selected value with a thicker gold
border, bold weight, **and** a small checkmark badge — deliberately not
color alone (WCAG 1.4.1). No per-question "low/high" anchor labels (e.g.
"Poor"↔"Excellent") were added: because the questions are data-driven and
a generic scale control has no way to know which direction is "better"
for an arbitrary future question (stress and sleep don't share the same
directionality as overall wellbeing), inventing anchor labels would mean
guessing clinical framing not present in the data model. This is flagged
as `[NEEDS PRODUCT REVIEW]` in §15 below, not silently decided as final.

## 9. Safety-policy architecture (read before touching)

**This is explicitly not AI, not a diagnosis, not a risk score, and not a
clinical protocol.** `packages/safety-policy` is a small, isolated package
mirroring the `EhrProvider`/`PaymentProvider`/`AIProvider`
factory-selection pattern from M0/M1:

- `CheckInSafetyInput` is a narrow, structurally-typed interface —
  `{ overallWellbeing, mood, stress, sleep }`, all `number | null` — that
  **cannot hold free text**; `toSafetyInput()` in
  `packages/api/src/checkins/serialize.ts` is the only place that maps a
  check-in's responses into it, and it never touches `additional_notes`
  or any `valueText`/`valueOptionKey` field.
- `createDefaultSafetyPolicy()` ships exactly **one** placeholder rule:
  `overallWellbeing <= 2` → a single `SafetySignal`
  (`OVERALL_WELLBEING_VERY_LOW`). This threshold, and the entire
  concept of what should trigger a safety signal, is explicitly marked
  `[NEEDS CLINICAL/LEGAL REVIEW]` in the source comments — it is a
  structural placeholder proving the architecture works, not a considered
  clinical judgment.
- Selected via `SAFETY_POLICY_PROVIDER` env var (default
  `"default-placeholder"`), evaluated once at submission time in
  `POST /check-ins/:id/submit`. A flagged result sets
  `CheckIn.safetyStatus = FLAGGED` and records a separate
  `SAFETY_WORKFLOW_TRIGGERED` audit event (signal *ids* only, never the
  underlying scores) — **it does not change the patient's response in any
  way**: the confirmation copy, the HTTP status, and everything else about
  submission is identical whether or not the check-in was flagged. Tested
  explicitly (`never exposes the safety classification to the patient's
  own response`).
- No risk score, no suicidality inference, no AI call, no diagnosis, no
  level-of-care decision exists anywhere in this package or its caller.

**Safety language.** The one approved sentence — *"This check-in is not
monitored continuously and should not be used for emergencies."* —
appears verbatim on the intro screen, the review screen, and the
confirmation screen (`SAFETY_DISCLAIMER` constant in
`apps/patient/src/app/check-in/page.tsx`). Nothing beyond this sentence
(a specific crisis line, phone number, or other emergency resource) was
invented — that remains `[NEEDS CLINICAL/LEGAL REVIEW]`, called out
explicitly in a code comment at the constant's definition so it can't be
mistaken for a finished decision.

## 10. Clinician access (backend foundation only, as scoped)

Every clinician check-in route requires, in order: authenticated session
→ `requireRole(request, "CLINICIAN")` → `requirePermission(request,
Permission.VIEW_CLINICAL_CONTENT)` → `assertClinicianHasActiveCareRelationship`
(the single centralized M1 function; not reimplemented or duplicated).
A denied `assertClinicianHasActiveCareRelationship` call is caught,
audited as `CLINICIAN_CHECK_IN_DETAIL_DENIED`, then rethrown — access is
still denied, only the audit trail differs from a successful read.

`CLINICIAN_VISIBLE_CHECK_IN_STATUSES = [SUBMITTED, REVIEWED]` — a
`DRAFT` check-in is invisible to a clinician even with an active care
relationship (returns 404, both in the list query's `WHERE` clause and
independently re-checked on the detail route). No clinician dashboard,
review-recording endpoint, or UI was built — M3 explicitly scoped this to
"backend foundation only... no full dashboard required."

`VIEW_CLINICAL_CONTENT` is granted only to `CLINICIAN` in
`packages/types/src/permissions.ts` — unchanged from M1, now actively
exercised for the first time (see that file's updated comment). **Admin
never receives it**: no admin route reaches any check-in table, and this
milestone's test suite includes an explicit admin-denial test on the
clinician-shaped check-in route.

## 11. Security / PHI handling

- **The frontend is never the security boundary** — every check-in page's
  redirect/resume/validation behavior is a UX convenience; the API
  independently re-validates and re-authorizes every request.
- **No PHI in URLs** — check-in ids appear in path segments (e.g.
  `/check-in/history/:id`), which is an opaque `cuid`, not clinical
  content; no answer value, question text, or score ever appears in a
  query string.
- **No PHI in audit metadata** — `assertSafeMetadata` (M1) continues to
  reject metadata resembling free text; check-in audit events carry only
  ids, field *names* (`{"fields":["overall_wellbeing"]}`), counts, and
  safety-signal *ids*, never a score, an option label, or free text.
  Explicitly tested (`never stores free-text or option values in audit
  metadata`).
- **No PHI in console logs, analytics, or error messages** — validation
  errors report question *keys*, never values (e.g. `"overall_wellbeing"
  requires an integer response from 1 to 10.`).
- **Synthetic data only** — the dev seed script's patient/clinician
  accounts remain `*.dev@example.test`; all manual verification (§16)
  used only those existing synthetic accounts.

## 12. Audit logging

New actions in `packages/api/src/audit/actions.ts`: `CHECK_IN_CREATED`,
`CHECK_IN_RESPONSES_SAVED`, `CHECK_IN_SUBMITTED`, `CHECK_IN_ABANDONED`,
`CHECK_IN_SELF_READ`, `CHECK_IN_HISTORY_LIST_READ`,
`SAFETY_WORKFLOW_TRIGGERED`, `CLINICIAN_CHECK_IN_LIST_READ`,
`CLINICIAN_CHECK_IN_DETAIL_READ`, `CLINICIAN_CHECK_IN_DETAIL_DENIED`.
Reads of a patient's own in-progress draft are deliberately *not*
audited (own scratch data, polled on every wizard screen load — auditing
it would be pure noise); every read of `SUBMITTED`/`REVIEWED` content, by
either the patient or a clinician, is.

## 13. Testing

206 automated tests pass across the monorepo (up from 140 at the end of
M2 — 66 new tests this milestone), all against a real local Postgres test
database via Fastify's `app.inject()` — never mocked:

- `packages/api` — **106 tests** (35 new in `tests/checkins.test.ts`:
  authentication, the data-driven questions endpoint, full draft
  lifecycle including snapshot-preservation and abandonment, submission
  including required-field validation/immutability/duplicate-prevention/
  audit-metadata-safety, end-to-end safety-policy integration, patient
  history, cross-patient ownership isolation, input validation, clinician
  authorization including draft-invisibility and denial auditing, and
  admin non-access — plus the pre-existing 71 M1/M2 tests, unaffected).
- `packages/safety-policy` — **8 tests** (new package: flags/doesn't flag
  per the one placeholder rule, structural exclusion of free text,
  boundary values).
- `packages/types` — **27 tests** (8 new for the check-in wire-format
  schemas).
- `packages/auth` — 9 tests (unaffected).
- `apps/patient` — **39 tests** (15 new: the check-in wizard across every
  response type, required-field blocking, Back/resume behavior, review
  and submission with the exact confirmation copy, server-error handling,
  no-client-controlled-payload-keys; history list and detail views
  including the empty state, descriptive-only rendering, and a
  cross-patient 404 producing a generic not-found message; the Home page
  test updated for the new entry point).
- `apps/admin`, `apps/clinician` — 3 tests each (unaffected).
- `packages/ai-service`, `packages/ehr-adapter`, `packages/payments-adapter`
  — 4, 3, and 4 tests respectively (unaffected — no M3 route touches any
  of these provider abstractions, per §20 of the brief).

`pnpm -w typecheck` is clean across all 12 workspace projects.

## 14. Manual verification (this session, against live running instances)

Ran the real API + patient dev servers against `noor_dev` (seeded via the
existing synthetic `patient.dev@example.test` /
`clinician.dev@example.test` accounts, which already have an `ACTIVE`
care relationship from the seed script) with a headless Chromium instance
(Playwright driving the environment's pre-installed browser, not a
project dependency) and drove the brief's 14-step checklist end to end:

1. **Unauthorized access** — `GET /check-in` while signed out redirected
   to `/login`.
2. **Sign in** — landed on `/home`, entry-point copy present.
3. **Begin check-in** — intro screen shown with the exact safety
   disclaimer sentence.
4. **Answer** — Question 1 of 7 answered, `PATCH` confirmed, advanced to
   Question 2.
5. **Leave before submission** — navigated away to `/home` mid-flow.
6. **Return** — navigated back to `/check-in`.
7. **Resume draft** — landed exactly on Question 2 of 7, **not** the
   intro screen and **not** Question 1 again.
8. **Answer remaining questions** — scales (mood/stress/sleep),
   single-selects (main concern/desired support, options confirmed
   rendered live from the API, not hardcoded), optional free-text left
   blank.
9. **Review** — every answer shown correctly; the unanswered optional
   question displays "Not answered."
10. **Submit** — confirmation screen shows the exact required copy
    ("Your check-in has been submitted." / "Your care team can review
    your responses.") plus the safety disclaimer; no promised response
    time, no "will respond" language, no monitoring claim anywhere on the
    page.
11. **Attempt to edit the submitted check-in** — reloading `/check-in`
    starts a **new** draft rather than reopening the submitted one for
    editing (the submitted check-in remains immutable).
12. **View history** — the submitted check-in appears in
    `/check-in/history`; opening its detail page shows the full
    descriptive answer set with **zero** form controls or buttons that
    could modify it (asserted directly).
13. **Sign out / sign back in** — history persisted across the session
    boundary.
14. **Mobile viewport** (375×812) — intro and question screens render
    with no overflow; the scale control's touch target measured
    **44×44px**, meeting the WCAG 2.5.5 floor.

**Keyboard navigation** was verified separately: the intro screen's
primary action carries `autoFocus` and activates via Enter; tab order on
the question screen (after discounting a `next-dev`-only build-indicator
element that only exists in local dev mode, never in production) is
Logo → the scale radio group → Back → Continue, exactly as authored.

**Invalid input**: clicking Continue with a required question unanswered
shows a `role="alert"` validation message and makes **no** `PATCH` call.

No browser console errors, hydration warnings, or unhandled exceptions
were observed during any of the above. Screenshots from this run were
sent alongside the M3 completion report.

To reproduce:

```bash
cd noor
pnpm dev:api            # terminal 1
pnpm dev                # terminal 2 — patient app on :3000
```

Sign in as `patient.dev@example.test` / `NoorDevSeed!2026` (from
`packages/db/prisma/seed.ts`) and walk the same steps.

## 15. Known limitations

- **One-active-draft-per-patient is not enforced at the database level**
  — `POST /check-ins` is idempotent (returns the existing draft if one
  exists), which covers normal usage, but a true concurrent
  double-submission race (two simultaneous first-ever `POST /check-ins`
  calls) could theoretically create two drafts. A partial unique index
  (`WHERE status = 'DRAFT'`) isn't declaratively expressible in Prisma's
  schema language; adding it via a raw migration was judged
  disproportionate to the risk for this milestone, per the brief's "do
  not over-engineer" instruction. Documented, not silently ignored.
- **No numeric scale anchor labels** (§8) — `[NEEDS PRODUCT REVIEW]`
  whether a generic "1 = lowest, 10 = highest" hint (or per-question
  directionality) should be added; the current data model doesn't carry
  that information.
- **No clinician-facing UI** — only the authorized backend routes exist;
  a clinician cannot currently *see* a check-in through any interface,
  only through direct API calls (exercised by the test suite). This was
  explicitly the brief's scope for M3.
- **No `REVIEWED` transition exists yet** — the enum value is present for
  forward-compatibility, but nothing in M3 sets it; a future milestone's
  clinician-review feature will need its own endpoint and audit action.
- **No automated accessibility audit** (e.g. axe-core) was run — manual
  review against the WCAG-derived checklist (non-color-dependent scale,
  fieldset/legend, focus-visible, 44px targets, role="alert") only, same
  as M2.
- **No E2E automation wired into CI** — the Playwright verification in
  §14 was run manually for this milestone, same as M1/M2.
- **Cadence is unenforced** — `cadenceKey` exists as a data field, but no
  scheduler, reminder, or "next check-in due" logic was built; nothing
  currently reads or acts on it besides storing "weekly" as the default.

## 16. Unresolved clinical / legal / product decisions

- **The entire safety-policy threshold and signal taxonomy** (§9) is a
  structural placeholder, not a clinical decision — `[NEEDS
  CLINICAL/LEGAL REVIEW]` before any real threshold, signal type, or
  downstream workflow (notification? clinician alert? nothing?) is
  decided.
- **Final crisis/emergency resource language** — beyond the one approved
  disclaimer sentence, no specific crisis line, phone number, or
  emergency resource was written anywhere in the product. `[NEEDS
  CLINICAL/LEGAL REVIEW]`.
- **What happens operationally when a check-in is `FLAGGED`** — today
  this only sets a database column and writes an audit event; no
  clinician notification, no elevated visibility beyond the ordinary
  queue, no workflow exists. `[NEEDS CLINICAL/PRODUCT REVIEW]` for
  whatever milestone builds the clinician dashboard.
- **Scale anchor semantics** (§8, §15) — `[NEEDS PRODUCT REVIEW]`.
- Carried forward, unchanged, from M2: brand asset fidelity, whether
  Async-style support ships as a bundled feature vs. a separate product,
  and psychiatry's real availability timeline.

## 17. Recommended next milestone

Per the roadmap in `ARCHITECTURE.md` §M and this milestone's own explicit
scope boundary (§10, "no full dashboard required"), the natural next step
is a **clinician check-in review dashboard** — a UI over the
already-authorized `GET /clinicians/me/patients/:patientId/check-ins*`
routes built in M3, plus (pending explicit approval) a `REVIEWED`
transition endpoint. Awaiting explicit approval before starting that
work — nothing in this milestone begins it.
