# Noor — M4 (Clinician Care Dashboard + Check-In Review) Implementation Notes

**Status: M4 complete, reviewed and approved by product owner. Not
production-ready. Not HIPAA compliant. No clinical decision-making logic
exists anywhere in this milestone — every finding in this document
inherits M3's safety-policy caveats unchanged.**

Builds on [M1](./M1-IMPLEMENTATION.md), [M2](./M2-IMPLEMENTATION.md), and
[M3](./M3-IMPLEMENTATION.md), all of which remain fully in force. No
M0–M3 architecture, security, RBAC, database, or API pattern was
redesigned — M4 completes the first end-to-end care-continuity workflow
(**submit → review**, not submit → chat) on top of what M1–M3 already
built.

---

## 1. Summary

A patient submits a Noor Check-In (M3); their authorized clinician sees it
in a review queue, opens it, reads the patient-reported answers exactly as
submitted, and marks it reviewed; the patient then sees a plain "Reviewed
by your Noor care team" status on their own history. This milestone adds
the first meaningful clinician application (Home dashboard, patient list,
patient care view, check-in queue, check-in detail + review action) and
the backend routes/authorization behind it. It does **not** add messaging,
scheduling, a medical chart, AI, or any escalation protocol beyond M3's
existing deterministic placeholder.

## 2. Reusing the M3 foundation instead of the M0-sketched `ClinicianReview` table

The M0 architecture doc (`ARCHITECTURE.md` §C.4) originally sketched a
separate `ClinicianReview` table with `status`, `response_text`,
`response_is_draft`, `escalated_at`, and `escalation_reason` columns. M4
deliberately does **not** build that table as originally sketched, because:

- `response_text`/`response_is_draft` were shaped for a future
  clinician-authored reply *to the patient* — exactly the
  patient-clinician-messaging concept M4 §7 explicitly forbids ("Do NOT
  build patient-clinician messaging in M4... SUBMIT → REVIEW, not
  SUBMIT → CHAT"). Building those columns now would be scaffolding for a
  feature this milestone is instructed not to build.
- `escalated_at`/`escalation_reason` imply a clinical escalation protocol,
  which §13 explicitly forbids inventing ("Do not invent a clinical
  escalation protocol").
- M3 already added `CheckIn.reviewedAt` and `CheckIn.reviewedByClinicianId`
  directly on the `CheckIn` table (migration `20260805192605_checkin_v1`,
  documented at the time as "not yet set by any route in M3") — exactly
  what M4's "capture: checkInId, clinicianId, reviewedAt, appropriate
  structured status" requirement needs, with `checkInId` implicit (it's
  the row itself) and "structured status" satisfied by `CheckIn.status`
  transitioning `SUBMITTED → REVIEWED` (the enum value M3 already reserved
  for this).

Per §5's own instruction — "Implement ClinicianReview using the M0-approved
concept **or** the existing M3 foundation" — M4 uses the M3 foundation.
**No new migration was required for the review action itself**; those
columns and the `REVIEWED` enum value already existed in the database. No
clinician free-text note field was added at all, per §14's explicit
conservative default ("if a free-text field is not necessary for M4,
prefer not to add it yet") — there was no product requirement forcing one,
so none exists to mislabel or misuse later.

## 3. Database changes

**No new migration.** `CheckIn.reviewedAt`, `CheckIn.reviewedByClinicianId`
(nullable FK to `Clinician`, `onDelete: SetNull`), and
`CheckInStatus.REVIEWED` all already existed from M3's
`20260805192605_checkin_v1` migration and are now actively used for the
first time. No index was added — the review action itself is a
single-row lookup by primary key (already indexed), and the queue/
dashboard queries below reuse the `[careRelationshipId]`/`[status]`
indexes M3 already created; a dedicated index on `reviewedByClinicianId`
wasn't added because no query in this milestone filters by it (a
"my review history" view, if built later, would be the milestone that
adds it).

## 4. API endpoints

All new/changed routes live in `packages/api/src/routes/clinicians.ts`
and follow the exact chain M1 established:
`requireRole(request, "CLINICIAN")` → `requirePermission(request,
Permission.VIEW_CLINICAL_CONTENT)` → (for any per-patient route)
`assertClinicianHasActiveCareRelationship` — the single centralized M1
function, never reimplemented or duplicated. Every count/list is scoped by
baking the authorization filter directly into the Prisma query itself
(`careRelationship: { clinicianId, status: ACTIVE }`), not applied after
the fact.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/clinicians/me/dashboard` | Home summary: `displayName`, `checkInsToReviewCount`, `activePatientCount` — every number derived from this clinician's own ACTIVE care relationships, never an org-wide count. No appointment data — that section is a static frontend empty state. |
| `GET` | `/clinicians/me/check-ins` | The review queue: every `SUBMITTED` check-in across this clinician's ACTIVE-relationship patients, newest first. Returns queue-only fields (id, patientId, patient first/last name, submittedAt, status, `safetyFlagged`) — never a full patient object, never a free-text/select answer. |
| `POST` | `/clinicians/me/patients/:patientId/check-ins/:checkInId/review` | Marks a `SUBMITTED` check-in `REVIEWED`, setting `reviewedAt`/`reviewedByClinicianId` from the *session*, never the request body. 409 if already reviewed; 404 if the check-in doesn't exist, isn't this patient's, or is a draft (drafts stay invisible to clinicians, unchanged from M3). Never touches a `CheckInResponse` row. |
| `GET` | `/clinicians/me/patients/:patientId` (extended) | M1's identity fields, now also returning `careRelationship: { id, relationshipType, status, startedAt }` — the "patient care view" context (§9). Still not a medical chart: no diagnosis/medication/treatment-plan/billing field exists. |
| `GET` | `/clinicians/me/patients` | Unchanged from M1 (patient list, ACTIVE relationships only) — formalized as a shared `ClinicianPatientListItemDTO` type but no behavior change. |
| `GET` `/clinicians/me/patients/:patientId/check-ins`, `GET .../check-ins/:checkInId` | Unchanged from M3 — the patient care view's "Check-In history" and the queue's "Review" link both reuse these as-is. |

## 5. Clinician frontend (`apps/clinician`)

| Route | Purpose |
|---|---|
| `/dashboard` (Home) | Greeting + two real operational cards ("Check-Ins to Review" → `/check-ins`, "My Patients" → `/patients`) driven by `GET /clinicians/me/dashboard`, plus a static, honest "Today" empty state — no fabricated appointment ever renders. |
| `/check-ins` | The review queue: patient display name (first name + last initial, computed client-side from the full name the API already legitimately returns to an authorized clinician), submitted date, "Awaiting review," a `[Review]` link, and a `Flagged` badge when M3's *existing* deterministic `safetyFlagged` bit is set — nothing here computes a new classification. |
| `/check-ins/[patientId]/[checkInId]` | The full submitted check-in, every answer exactly as reported, plus `Mark Reviewed`. No answer is ever editable here — this page has no input/textarea/select anywhere, only text and one action button. |
| `/patients` | The clinician's patient list — ACTIVE care relationships only, no search-the-database affordance. |
| `/patients/[patientId]` | The "patient care view": identity, the care relationship itself, and check-in history with each entry's review status — deliberately not a full chart. |
| `/account` | A real (not placeholder) minimal profile view — name, credentials, email — reusing M1's `GET /clinicians/me`. |

A new **persistent nav** (`src/components/ClinicianNav.tsx`) renders on
every authenticated page: Home / Patients / Check-Ins are real links;
Schedule and Resources render as visibly disabled "Soon" items (never a
link to nothing); Account is real. The clinician app's `globals.css` was
rewritten onto the same Noor brand tokens as `apps/patient` (Cormorant
Garamond + DM Sans, cream/gold/charcoal palette — see
`M2-IMPLEMENTATION.md` "Brand" for the sourcing note, unchanged), but
visibly denser: smaller type scale, tighter spacing, row-list layouts
instead of the patient app's spacious cards (§23: "more information-dense
than the patient experience").

The old `apps/clinician/src/app/dashboard/patients/[patientId]/` route
from the M1 skeleton was removed; `/patients/[patientId]` replaces it with
the same ownership-enforcement guarantee (a client-side render never
happens before the server has already authorized the request — see §7).

## 6. Patient-facing change

`apps/patient/src/app/check-in/history/page.tsx` and
`.../history/[id]/page.tsx` now render a `"Reviewed by your Noor care
team"` badge when `CheckInSummaryDTO`/`CheckInDetailDTO.status ===
"REVIEWED"` — derived entirely from the server-authoritative `status`
field (§6: "The patient-facing status should be derived server-side from
authorized data"). Nothing else changed: no promised response time, no
clinician identity, no review note, no review timestamp is ever returned
to a patient-facing route at all — the patient-facing DTOs
(`CheckInSummaryDTO`/`CheckInDetailDTO`) were not extended with any new
field, so there was never a code path that could leak one.

## 7. Authorization behavior

Unchanged model from M1, exercised against clinical content for the first
time at this scale (queue + review, not just single-patient detail reads
as in M3):

- **Every clinical-content route requires all four checks in order**:
  authenticated session → `CLINICIAN` role → `VIEW_CLINICAL_CONTENT`
  permission → an ACTIVE `CareRelationship` with the specific patient.
  `VIEW_CLINICAL_CONTENT` is granted only to `CLINICIAN` in
  `packages/types/src/permissions.ts` (unchanged since M1) — **admin
  still never receives it**, verified by an explicit test hitting the
  dashboard, queue, and review routes as an admin (all 403).
- **The authorization filter is the query, not a post-hoc check.** The
  queue and dashboard-count queries both filter by
  `careRelationship: { clinicianId: user.clinicianId, status: ACTIVE }`
  directly in Prisma's `where` clause — there is no code path that
  fetches another clinician's patient's data and then decides whether to
  return it.
- **An ended/paused relationship removes access immediately** — tested
  explicitly: after transitioning a relationship to `ENDED`, the same
  clinician's queue empties, dashboard counts drop to zero, and the
  review action 403s, all without any change to the check-in itself.
- **No client-controlled clinician identity.** `reviewedByClinicianId` is
  always `request.sessionUser.clinicianId`; a request body attempting to
  supply a different `clinicianId` has no effect (tested explicitly).
- **Ownership violations return 403** (via `AuthorizationError` from
  `assertClinicianHasActiveCareRelationship`) for a patient that exists
  but isn't this clinician's, and 404 (via `NotFoundError`) for a
  check-in that doesn't exist or isn't visible in this clinician's
  allowed status set — same two-code pattern established in M1/M3.

## 8. Safety-policy integration

M3's safety-policy architecture is **unchanged** — no new rule, no new
signal type, no risk score, no AI, no diagnosis. The only new thing in M4
is that the clinician's review *queue* now surfaces the existing
deterministic `CheckInSafetyStatus` as a `Flagged` badge
(`safetyFlagged: boolean` in `ClinicianCheckInQueueItemDTO`), computed as
`checkIn.safetyStatus === CheckInSafetyStatus.FLAGGED` — a direct pass-
through of M3's placeholder classification, not a new computation. This
was deliberately **not** added to the check-in detail page or to any
shared `CheckInDetailDTO`/`serializeDetail` output, because that function
is also used by the *patient's own* `GET /check-ins/:id` — adding the flag
there would risk it leaking to the patient, which M3 and M4 §13 both
explicitly forbid ("Do not display internal safety classifications to
patients unless explicitly approved"). Keeping it queue-only, on a
clinician-only DTO, was the safer design.

## 9. Audit logging

New actions in `packages/api/src/audit/actions.ts`:
`CLINICIAN_DASHBOARD_READ`, `CLINICIAN_CHECK_IN_QUEUE_READ`,
`CLINICIAN_CHECK_IN_REVIEWED`. All follow M1's metadata-safety rule
(`assertSafeMetadata`) — the queue-read event's metadata is `{count:
N}` only; the review event carries no metadata beyond the entity id. A
denied review attempt (no active care relationship) is audited as
`CLINICIAN_CHECK_IN_DETAIL_DENIED` (reused from M3, `metadata:
{requested: "review"}`) before the `AuthorizationError` is rethrown —
consistent with the "audit denials, not just successes" rule from M1.
Verified: no test anywhere in this milestone's suite finds free-text
patient answers or clinician notes in any audit row's metadata (there is
no clinician note field to leak in the first place — see §2).

## 10. Testing

245 automated tests pass across the monorepo (up from 206 at the end of
M3 — 39 new tests this milestone), all against a real local Postgres test
database via Fastify's `app.inject()` — never mocked:

- `packages/api` — **126 tests** (20 new in
  `tests/clinician-review.test.ts`: unauthenticated/patient-denied on
  every new route, dashboard counts scoped correctly across two separate
  clinicians, a reviewed check-in dropping out of both the "to review"
  count and the queue, the queue excluding drafts/unrelated
  patients/other clinicians' patients, an ended relationship removing
  queue/dashboard/review access all at once, cross-clinician review
  denial, the review action's success/idempotency-conflict/
  draft-invisibility/no-client-controlled-identity/no-response-mutation
  behavior, admin denial on all three new routes, and the extended
  patient-care-view detail shape — plus the pre-existing 106 M1–M3 tests,
  unaffected).
- `apps/clinician` — **20 tests** (up from 3): Home dashboard (greeting,
  scoped counts, singular/plural phrasing, no fake appointment), the
  review queue (empty state, minimal patient-display fields, safety-flag
  badge, no full last name/free-text leakage), check-in detail (full
  answers with no interpretive language, the Mark Reviewed action and its
  error path), the patient list (active-relationship-only, no search
  affordance), and the patient care view (identity + relationship +
  history + review status, no chart-shaped content, empty-history state).
- `apps/patient` — **41 tests** (2 new: the reviewed-status badge shown
  correctly on history list/detail and absent on a merely-submitted one,
  with no promised-response or clinician-identity leakage).
- All other packages (`types`, `auth`, `safety-policy`, `admin`,
  `ai-service`, `ehr-adapter`, `payments-adapter`) — unaffected, unchanged
  test counts.

`pnpm -w typecheck` is clean across all 12 workspace projects.

## 11. Manual end-to-end verification (this session, against live running instances)

Ran the real API + patient + clinician + admin dev servers against
`noor_dev` (the existing synthetic `patient.dev@example.test` /
`clinician.dev@example.test` seed accounts, which already share an ACTIVE
care relationship, plus a newly-seeded `unrelated.clinician.dev@example.test`
with no relationship to anyone, for the security checks) with a headless
Chromium instance (Playwright driving the environment's pre-installed
browser) and drove the brief's full workflow:

**Patient**: signed in → completed a fresh 7-question check-in → submitted
→ confirmation screen shown with the required copy.

**Clinician**: signed in as the patient's assigned clinician → Home
dashboard showed the greeting and correct scoped counts → the new
check-in appeared in the review queue → opened it → every answer matched
exactly what the patient had submitted, with no automated interpretive
language present → clicked Mark Reviewed → the page updated in place →
returning to the queue, the check-in had dropped out of "to review".

**Patient (again)**: signed back in → the check-in's history detail now
showed "Reviewed by your Noor care team" → no clinician identity, note,
or internal metadata anywhere on the page.

**Security**: signed in as the unrelated clinician → their review queue
was empty (cannot see the patient's check-in at all) → a direct URL
attempt at the exact same check-in id the assigned clinician had just
reviewed also failed → signed in as Admin → a direct `GET
/clinicians/me/dashboard` API call returned **403**, confirming the
admin boundary holds even against the newest clinical-content routes.

**Viewports**: the clinician Home and review queue were also captured at
a 375×812 mobile viewport and an 820×1180 tablet viewport — no horizontal
overflow at either width; the three-card Home grid collapses to a single
column on mobile and stays a clean three-up row on tablet.

No browser console errors, hydration warnings, or unhandled exceptions
were observed. One purely cosmetic nit was found and fixed during this
pass: the nav's "Log out" link wrapped onto two lines at tablet width —
fixed with a `white-space: nowrap` rule, no functional impact. Screenshots
from this run were sent alongside the M4 completion report.

To reproduce:

```bash
cd noor
pnpm dev:api            # terminal 1
pnpm --filter @noor/patient dev     # terminal 2 — :3000
pnpm --filter @noor/clinician dev   # terminal 3 — :3001
pnpm --filter @noor/admin dev       # terminal 4 — :3002 (for the admin-denied check)
```

Sign in as `patient.dev@example.test` and `clinician.dev@example.test`
(both `NoorDevSeed!2026`, from `packages/db/prisma/seed.ts`) and walk the
same flow.

## 12. Known limitations

- **No clinician free-text review note** — deliberate, per §2/§14; if a
  future milestone needs one, it must be clearly labeled as internal
  Noor care-continuity data, never "Progress Note" or "Psychotherapy
  Note," per §14's explicit instruction.
- **The "to review" queue has no pagination** — a clinician with a very
  large number of simultaneously-submitted check-ins would get one long
  list. Not a concern at current/expected M4 scale; flagged for whenever
  real usage volume warrants it.
- **No automated accessibility audit** (e.g. axe-core) was run on the
  clinician app — manual review against the same WCAG-derived checklist
  used in M2/M3 (semantic HTML, native interactive elements, visible
  `:focus-visible`, labeled controls, `role="alert"` on errors, 40px+
  touch targets, the safety-flag badge using shape+text, not color alone)
  only.
- **No E2E automation wired into CI** — the Playwright verification in
  §11 was run manually for this milestone, same as M1–M3.
- **The queue's patient display name is computed client-side** from the
  full first/last name the API already legitimately returns to an
  authorized clinician (not truncated server-side) — a deliberate choice
  to avoid changing the existing, tested `/clinicians/me/patients` and
  `/clinicians/me/check-ins` response shapes; see §5.

## 13. Unresolved clinical / legal / product decisions

- Everything already flagged in `M3-IMPLEMENTATION.md` §16 (the
  safety-policy threshold/taxonomy, final crisis-resource language, scale
  anchor semantics, brand fidelity, Async product direction) remains
  unresolved and unchanged by M4.
- **What should happen when a `FLAGGED` check-in sits in a clinician's
  queue beyond a visual badge** — no elevated notification, escalation
  path, or SLA exists, and none was invented (§13's explicit
  instruction). `[NEEDS CLINICAL/PRODUCT REVIEW]`.
- **Whether a clinician review should ever carry a free-text note**, and
  if so, its legal/documentation status relative to a future EHR's formal
  clinical notes — explicitly deferred (§2/§14).
- **Queue ordering/prioritization** (currently newest-submitted-first) —
  whether a real clinical workflow would prefer oldest-first, or
  safety-flagged-first, is a product decision not made here.

## 14. Native-mobile API compatibility assessment (brief §29)

No React Native/Expo work was done in M4, per explicit instruction. This
is a review of what M1–M4's patient-facing API surface would need before
a native client could consume it:

- **Already client-agnostic:** every response is plain JSON, never an
  HTML fragment or a Next.js-specific payload shape; no PHI ever appears
  in a URL (check-in/patient ids are opaque UUIDs); CORS
  (`@fastify/cors`, `packages/api/src/plugins/security.ts`) is configured
  as an exact-origin allowlist keyed on the browser `Origin` header —
  CORS is fundamentally a *browser* enforcement mechanism, and a native
  HTTP client (React Native's `fetch`, `axios`, etc.) typically sends no
  `Origin` header at all, so it would not be rejected by this
  configuration as currently written. No route assumes a specific
  frontend framework's request/response conventions.
- **The one real adaptation needed: session authentication.** The current
  scheme is an httpOnly, signed session cookie (`@fastify/cookie` +
  `packages/api/src/plugins/session.ts`), set via `Set-Cookie` on login
  and read automatically by the browser on every subsequent request
  (`credentials: "include"`). A bare React Native `fetch` call does
  **not** automatically persist and resend cookies across requests or app
  restarts the way a browser does — this would need either (a) a native
  cookie-jar layer (e.g. a library that intercepts `Set-Cookie` and
  reattaches it, persisted to secure device storage across restarts), or
  (b) a second, parallel token-based auth mode (e.g. login also returning
  an opaque bearer token in the JSON body for a native client to store in
  secure storage and send via an `Authorization` header), added
  *alongside* the existing cookie mechanism, not replacing it. This is a
  concrete engineering decision for the eventual React Native milestone,
  not something this milestone should resolve — flagged here so that
  milestone doesn't discover it late.
- **Everything else patient-facing in M1–M4** (`/auth/*`, `/patients/me`,
  `/check-ins/*`) needs no other structural change to be consumed by a
  native client once auth is solved — the DTOs, validation, and error
  shapes are already framework-neutral.

## 15. Recommended next milestone

Per the roadmap in `ARCHITECTURE.md` §M and this milestone's own
boundaries (§7: no messaging yet; §21/§22: no EHR/payments), the natural
next step is **patient-clinician communication design** — deliberately
deferred until now specifically so its design could be informed by
observing the submit → review workflow in real use, per this milestone's
own instruction ("We will design communication separately after observing
the Check-In workflow"). Awaiting explicit approval before starting that
or any other M5 work — nothing in this milestone begins it.
