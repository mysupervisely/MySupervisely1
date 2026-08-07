# M9 Implementation Notes — Access & Subscription Architecture

Companion to `docs/MOBILE_PAYMENT_ARCHITECTURE.md` (the research deliverable written before any
M9 code, per this milestone's own instruction) and the M1–M8 implementation notes. Scope: a
dedicated `AccessService`, a production paywall, real-formula pricing, and access control on the
premium actions that exist today — all built and reasoned about with the payment-architecture
research already done, not worked out ad hoc while coding.

**Read `docs/MOBILE_PAYMENT_ARCHITECTURE.md` first** — it documents the existing web flow, the
real Netlify function contracts, the pricing formula, Apple/Google IAP requirements, and exactly
what's real vs. architecture-only in M9. This file is the "what was built" companion to that
"what exists and what's required" research.

## Files created

```
mobile/src/
  models/
    access.ts                          AccessPlan, AccessRecord, AccessState — see "Data model"

  constants/
    accessConfig.ts                     REQUEST_TIMEOUT_MS / MAX_OFFLINE_TRUST_MS, named

  api/
    accessClient.ts                     typed client: GET check-access / GET verify-session
    accessClient.test.ts

  storage/
    accessStorage.ts                    the one cached AccessRecord (or none)
    accessStorage.test.ts

  services/
    accessService.ts                    the dedicated AccessService — verify/cache/refresh/expose
    accessService.test.ts
    pricingService.ts                   the real pricing formula, ported verbatim
    pricingService.test.ts

  hooks/
    useAccessState.ts                   the one hook screens use to read/act on entitlement

  components/
    SelectChip.tsx                      moved from components/ai/ — now shared (M8 AI picker + M9 duration picker)
    access/
      PremiumGate.tsx                    reusable "locked" presentation
      PlanCard.tsx                       one pricing-plan card

  screens/pricing/
    PricingScreen.tsx                    rewritten: real paywall (was an M1 stub)
```

## Files modified

- `src/screens/qbank/QBankScreen.tsx` — whole screen body (QBank session + the M8 AI-practice
  entry point) wrapped in one `PremiumGate` requiring `'qbank'`. Single check point for that whole
  stack (AI practice is only reachable by navigating through here first).
- `src/screens/exam/ExamListScreen.tsx` — the list itself stays fully browsable (unchanged); only
  `Start`/`Resume`/`Retake` now call `useAccessState().hasAccess('qbank')` first, showing an
  `Alert` with a "View Pricing" action if not entitled. `View Results` on an already-completed
  exam stays ungated (reviewing something already earned isn't new premium content).
- `src/screens/qbank/AIQuestionSetupScreen.tsx` — import path updated for the moved `SelectChip`
  (no behavior change; the AI generation flow's own gating is inherited transitively from
  `QBankScreen`'s gate, since it's the only way to reach this screen).

**No new dependencies added.** No IAP library, no slider/picker library — the paywall's duration
selector is `SelectChip` (already built in M8) plus a plain `TextInput`, same "reuse what exists,
no unnecessary dependency" discipline as every prior milestone.

## Data model — designed for a backend that doesn't exist yet, correctly, today

`AccessRecord` (`src/models/access.ts`) carries `plan?: AccessPlan` and `expiresAt?: string` as
**optional** fields, because the real `check-access.mts`/`verify-session.mts` never return either
today (`docs/MOBILE_PAYMENT_ARCHITECTURE.md` §3). Every piece of logic that reads these fields —
`isExpired()`, `grantsPlan()` — treats "undefined" as an explicit, documented case (never expires;
grants every plan), not an oversight. This means:

- Today, against the real backend, a valid token grants every plan and never expires client-side.
  That's an honest description of what the real backend currently supports, not a bug in the
  mobile client.
- The exact same code starts enforcing per-plan/per-expiry access the moment the backend adds
  those fields — no reshaping, no new migration. This was the explicit design goal, stated in the
  payment architecture doc's §3 and carried through here.

## AccessService — the four stated responsibilities

`src/services/accessService.ts`, composed from `accessClient.ts` (API communication only) +
`accessStorage.ts` (persistence only) + a set of pure decision functions (`isExpired`,
`isStaleForOffline`, `grantsPlan`, `computeStateForValidRecord`, `computeOfflineFallbackState`) —
same client/storage/service layering `aiQuestionService.ts`/`accessService` M8 established.

- **Verify entitlement** — `verifyToken(token)` calls the real `check-access.mts`;
  `redeemStripeSession(sessionId)` calls the real `verify-session.mts`. Both cache the result on
  success and return a typed `AccessState`.
- **Cache entitlement** — every successful verification is written to `accessStorage` (one
  AsyncStorage key, one record — matches the "a token today grants everything" reality; there's
  nothing to key multiple entitlements by yet).
- **Refresh entitlement** — `refresh()` re-calls `check-access` for the cached token. On success,
  updates `verifiedAt` and re-derives state (catching e.g. server-side revocation — an invalid
  token gets cleared from the cache, not left around as a false grant). On network/backend
  failure, falls back to the cache via `computeOfflineFallbackState` (see "Offline behavior"
  below) instead of punishing a briefly-offline student.
- **Expose access state to the UI** — `getState()` (cache-only, fast, no network) and the
  `useAccessState()` hook, which loads cached state immediately on mount then refreshes over the
  network on mount + on every screen focus (same pattern `useProgressDashboard`/
  `useStudyRecommendations`/etc. already use for their own data). `hasAccess(plan)` is the one
  function every gated screen actually calls.

**"Do not scatter entitlement checks throughout screens"**: every gate (`QBankScreen`,
`ExamListScreen`) calls `useAccessState().hasAccess(plan)` — the same hook, the same underlying
service. No screen re-implements "is this token valid" or duplicates expiry/staleness logic.

## Offline behavior — a deliberate, bounded tradeoff

A network/backend failure during `refresh()` does **not** immediately revoke access — it falls
back to the last cached, successfully-verified record, bounded by
`accessConfig.MAX_OFFLINE_TRUST_MS` (7 days):

- Cache still fresh (< 7 days since last successful verification) → `granted`, `source: 'cache'`.
  A paying student who loses signal for a few hours (or days) doesn't lose access to content
  they're entitled to.
- Cache older than 7 days AND the network is unreachable → `stale`, not `granted`. Indefinite
  offline trust would make a revoked/refunded token unrevokable as long as the device never
  reconnects; 7 days is a generous, named, reviewable number (not a magic constant) that bounds
  that risk.
- Expiry (`isExpired`) is checked **before** staleness in both the online and offline paths — an
  actually-expired record is never resurrected by the offline-trust window.

## Pricing — the real formula, no hardcoded numbers

`src/services/pricingService.ts` ports `Price(days, plan) = PRICE_BASES[plan] * days^0.425`
verbatim from `index.html` (confirmed in `docs/MOBILE_PAYMENT_ARCHITECTURE.md` §4), with the same
`PRICE_BASES = {course: 39, qbank: 25, bundle: 52}` and `[3, 365]` day clamp. Tested against the
exact formula and, per the original plan's own stated acceptance bar, the **bundle-is-always-
cheaper invariant across the full 3-365 day range** (not just a few sample points — every 7th day
plus both exact boundaries).

`PricingScreen` never hardcodes a dollar amount — every price, per-day price, and bundle-savings
figure displayed is computed live from the selected day count via `pricingService`. Feature bullet
counts (lessons/questions/exams per plan) come from `contentRepository`, not copy-pasted numbers,
so they can't drift from the real content the way a hardcoded "101 lessons" string could.

## Paywall UI

Three `PlanCard`s (Course Only / QBank Only / Course + QBank), each showing: computed price for
the selected duration, per-day price, bundle savings (bundle card only, when positive), and
feature bullets sourced from `pricingService.planFeatures()` + real content counts. A duration
selector (`SelectChip` presets: 3/7/14/30/60/90/180/365 days, plus a custom day-count `TextInput`
clamped via `pricingService.clampDays`) drives every card's numbers.

**"Continue" is honest, not fake.** Pressing it shows an `Alert` explaining that native in-app
purchase isn't wired up yet and pointing at "Restore Access" for an existing web purchase — never
a broken navigation, never a simulated success, never a WebView opening the Stripe checkout URL
(which would violate store policy per `docs/MOBILE_PAYMENT_ARCHITECTURE.md` §5/§6 even as a
demo). This is the concrete answer to this milestone's "document how the pricing model should be
adapted rather than forcing Stripe into an unsupported flow" instruction: the adaptation is
documented in the payment architecture doc, and the UI here reflects that state honestly instead
of routing around it.

**"Restore Access" is fully real.** Two small forms — an access code (→ `verifyToken`) and a
Stripe session ID (→ `redeemStripeSession`) — both call the actual backend, both update the same
cached `AccessState` the rest of the app reads, both show a real loading state and a real,
specific error message (network/timeout/backend/malformed, or "not recognized"/"not verified" for
a well-formed-but-invalid code/session). This is legitimate entitlement recognition of an existing
purchase, not a new in-app sale — see the payment architecture doc §5/§6 for why that distinction
is what makes this compliant to ship as a real, working flow today.

## Access control applied

- **QBank** (including AI practice) — gated behind `'qbank'` via `PremiumGate`, one check point
  for the whole stack.
- **Exams** — list stays browsable; Start/Resume/Retake gated behind `'qbank'` via an `Alert` with
  a path to Pricing. Viewing a past result stays ungated.
- **Course/Lessons — deliberately not gated**, same finding as the payment architecture doc §9:
  `Lesson` content has no body/prose in this app's real, imported data (confirmed absent since
  M2), so there's no substantive Course-tier content to lock yet. `accessService.hasAccess('course')`
  works correctly and is exercised in tests; no screen calls it in M9.
- Browsing (Home/Body Map, the System list, the QBank/Exam tabs themselves, Progress) is
  unaffected — this milestone only gates the specific actions identified above.

## Testing

- `accessService.test.ts` (33 tests) — every pure decision function in isolation, plus the
  composed service against a mocked client/storage covering: **entitlement checks** (valid/invalid
  token, valid/invalid session), **cached access** (`getState` with no network call),
  **expired access** (boundary-exact), **missing access** (nothing cached at all), **offline
  behavior** (network failure falls back to cache within the trust window; falls to `stale` once
  past it), and **backend failures** (a 500-class error handled identically to a network error —
  both are "the network path failed," not different code paths).
- `accessClient.test.ts` (10 tests) — the same network/timeout/backend/malformed matrix M8's
  `aiQuestionService.test.ts` established, against mocked `fetch`, for both `checkAccess` and
  `verifySession`.
- `accessStorage.test.ts` (4 tests) — round-trip, overwrite-not-append (only one entitlement is
  ever cached), clear.
- `pricingService.test.ts` (13 tests) — exact formula match, day clamping, per-day price, the
  bundle-cheaper invariant across the full day range, and `planFeatures` per plan (including the
  "exams ship with QBank, not Course" rule).

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx jest` — **331/331 tests passing**, 27 suites (7 new test files, 60 new tests).
- `npx expo export --platform ios` — succeeds.
- `npx expo export --platform android` — succeeds.

No simulator/emulator is available in this sandbox (re-verified, consistent with every prior
milestone) — no screenshots/recordings are included. To verify visually: `npx expo start` from
`mobile/`, open the Pricing tab to see the paywall, and the QBank/Exams tabs to see the
`PremiumGate`/`Alert` gating with no cached access token present.

## Future extension points

All backend-dependent work is enumerated in `docs/MOBILE_PAYMENT_ARCHITECTURE.md` §8/§10
(token `plan`/`expiresAt` fields, `create-checkout` plan/day params, Apple/Google receipt
validation functions) — not repeated here. Mobile-side, once that backend work lands:
`react-native-iap`/Expo's StoreKit-Billing config-plugin path becomes the real "Continue" handler
per plan card, replacing today's honest "not wired up yet" `Alert`, with no changes needed to
`accessService`, `pricingService`, or the gating already wired into QBank/Exams.
