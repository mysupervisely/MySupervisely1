# Mobile Payment & Access Architecture

Research deliverable for M9, written **before** any M9 code — "Do not assume the current web
Stripe Checkout flow is appropriate for iOS or Android." Builds on
`docs/MOBILE_MIGRATION_AUDIT.md` §G/H/P (that research is reused, not repeated blind — every
contract below was re-read directly from `mobile-source/web-reference/netlify/functions/*.mts`
and `mobile-source/web-reference/{index.html,success.html}` for this document, not assumed from
memory of the audit).

## 1. Existing web payment flow (as it actually works today)

1. The pricing section on `index.html` renders three plan cards (Course / QBank / Bundle) with a
   day-count input per plan and a live-computed price (§4). **Every plan CTA links to `#join`** —
   an email waitlist form, not a purchase. `create-checkout.mts` is **never called** from
   `index.html` today. There is no working "click to pay" button anywhere in the deployed site.
2. If a checkout session *were* initiated (e.g. directly against the API, or once the waitlist
   CTA is swapped for a real one), the flow is: `POST /api/create-checkout` → Stripe Checkout
   (hosted, redirect-based) → on success, Stripe redirects to
   `success.html?session_id={CHECKOUT_SESSION_ID}` → `success.html` calls
   `GET /api/verify-session?session_id=...` → on `{valid:true, token}`, stores the token in
   `localStorage['pharmd_access_token']` and redirects into the app.
3. Gated calls (`generate-question`, `progress`) send that token back as `x-access-token` (or
   `?token=`) on every request.

This is a **standard hosted-redirect web checkout** — no card entry inside the app itself, no
mobile-specific handling of any kind (it doesn't need any, `index.html` is the entire app).
**None of this redirect-based flow is legal for unlocking digital content inside a native iOS or
Android app** (§5/§6) — this is the central fact this document exists to establish before any
mobile purchase UI gets built.

## 2. Existing Netlify functions (verbatim contracts, re-verified for this document)

| Function | Path | Method | Auth | Behavior |
|---|---|---|---|---|
| `create-checkout.mts` | `/api/create-checkout` | POST | none | Creates a Stripe Checkout Session for **one fixed** `STRIPE_PRICE_ID`, quantity 1. No `plan`/`days` params accepted — cannot charge what the pricing calculator displays. Returns `{url}` (the hosted Stripe page to redirect to). |
| `verify-session.mts` | `/api/verify-session?session_id=` | GET | none (the session_id is the secret) | Confirms `payment_status === 'paid'` via Stripe, then mints (or reuses, keyed by `session:<id>`) a `crypto.randomUUID()` access token, stored in Netlify Blobs `access-tokens` store as `token:<uuid>` → `{email, sessionId, createdAt}`. Returns `{valid, token}`. |
| `check-access.mts` | `/api/check-access?token=` | GET | — | Returns `{valid: boolean}` by looking up `token:<token>` in Blobs. **No `plan`, no `expiresAt`, no anything else** — a token is either known or it isn't. |
| `progress.mts` | `/api/progress` | GET/POST | same token lookup | Generic per-token key/value store (private `user-progress`, or `shared-data` for cross-user caches). Not currently called by `index.html`. |
| `generate-question.mts` | `/api/generate-question` | POST | same token lookup | Covered in `docs/M8_IMPLEMENTATION_NOTES.md` — unrelated to purchases beyond reusing the same token gate. |

## 3. Existing access verification — the token model, and its real limits

The access-token record, as actually written by `verify-session.mts`:

```json
{ "email": "user@example.com", "sessionId": "cs_...", "createdAt": "2026-01-01T00:00:00.000Z" }
```

**There is no `plan`, `days`, or `expiresAt` field anywhere in this record, and `check-access.mts`
returns only `{valid: boolean}`** — a token that exists is valid forever, for everything, with no
way for a client to know which plan it corresponds to or when (if ever) it should stop working.
This is the single biggest gap standing between "the access-token *mechanism* is sound and
reusable" (it is — mint-on-payment, verify-by-lookup, `x-access-token` header is a completely
ordinary and reusable pattern) and "the access-token *model* supports what the pricing UI
promises" (it does not, today).

**What this means concretely for M9:** any mobile `AccessService` built against today's real
contracts can genuinely verify "is this token valid at all" (and does, for real — see §7), but
cannot enforce a 30-day access window client-side using data the backend provides, because the
backend doesn't provide it. `AccessService`'s data model carries `plan`/`expiresAt` as **optional
fields**, populated `undefined` against today's real backend, so the exact same client code starts
enforcing plan/expiry the moment the backend adds those fields — no reshaping needed later, see
§8.

## 4. Existing pricing formula (ported faithfully in `pricingService.ts`)

From `index.html` lines ~1759-1868, confirmed verbatim:

```
Price(days, plan) = PRICE_BASES[plan] * days ^ 0.425
PRICE_BASES = { course: 39, qbank: 25, bundle: 52 }
days clamped to [3, 365], default 30
```

Displayed price is `Math.round(Price(...))`; per-day price is `Math.round(Price(...) / days)`.
Bundle savings shown against buying Course + QBank separately at the same day count:
`savings = max(0, round((Price(days,course) + Price(days,qbank)) - Price(days,bundle)))`.

`includesQbank = plan === 'qbank' || plan === 'bundle'`; `includesExams = includesQbank` — **exams
ship with QBank access, not Course access**, confirmed against the real FAQ copy in `index.html`.
This is why mobile's exam-gating (§9) checks the same `'qbank'` plan, not a separate `'exam'` one
that doesn't exist in the pricing model.

The web page also computes a "study pace" calculator (lessons/day, questions/day, exam days,
daily hours) from real content counts (`TOTAL_LESSONS=101`, `TOTAL_QUESTIONS=2000`,
`TOTAL_EXAMS=3` — all three independently re-verified against this project's own imported content
in `src/content/generated/*.json` and confirmed to match exactly). **M9 does not port the pace
calculator** — it's marketing/pacing content, not pricing or access logic, and is a clean,
separable future addition (§10) rather than something that belongs in `pricingService.ts` or
`AccessService`.

## 5. Apple App Store requirements

- **Digital course/QBank access is a digital good consumed inside the app** → under App Store
  Review Guideline 3.1.1 ("In-App Purchase"), it must be sold via Apple's In-App Purchase system,
  not an external payment flow (Stripe Checkout, even in a WebView) initiated from inside the app.
- The "reader app" exception (3.1.3(a) — apps like Netflix/Kindle that let users consume content
  purchased elsewhere) **does not apply here**: that exception covers *accessing* previously
  purchased *external* content, not *initiating the purchase itself* inside the app. PharmDPrepped
  would be selling the entitlement itself, not just displaying content someone bought on a
  different, unrelated service.
- **What *is* allowed**: recognizing an entitlement the user already purchased through a
  *different storefront* (e.g. the web, via Stripe) — this is account-based entitlement
  recognition, not a new purchase, and is explicitly fine. A "Restore access" flow that checks an
  existing token/email against the backend is legitimate; a "Buy QBank access" button that opens a
  Stripe checkout page from inside the iOS app is not.
- Apple requires a working **"Restore Purchases"** flow for any IAP-based entitlement.
- If the app supports account creation (it doesn't yet — no auth system exists at all, mobile or
  web), Apple's current guidelines expect an in-app account-deletion path too; noted for when
  accounts are eventually built, not an M9 concern today.

## 6. Google Play requirements

- Same substance as Apple, via the **Play Billing** policy: digital content/services consumed
  within the app must transact through Google Play's billing system, not an external payment
  processor initiated from inside the app.
- Cross-platform/external-purchase entitlement recognition (a QBank purchase made on the web
  unlocking the Android app) is allowed for the same "this is recognition, not a new sale inside
  the app" reasoning as Apple.
- A working restore/recognize-existing-purchase path is expected practice here too, even where
  not as explicitly named a requirement as Apple's "Restore Purchases."

## 7. What M9 builds for real vs. as architecture

**Built and working end-to-end today, against the real, unmodified backend contracts:**

- `accessClient.ts` — typed calls to the real `GET /api/check-access` and
  `GET /api/verify-session`, same "typed client is API-communication-only, errors are typed, no
  silent auto-retry" pattern `aiQuestionService.ts` established in M8.
- `accessService.ts` — the dedicated `AccessService` (verify / cache / refresh / expose state —
  see `docs/M9_IMPLEMENTATION_NOTES.md` for the full design). Fully real: it calls the actual
  backend, caches the actual response, and its offline/expiry/staleness logic is fully
  implemented and tested even though `expiresAt`/`plan` are always `undefined` against today's
  backend (§3) — the code path is exercised and correct, just not yet fed real data.
- **"Restore access"** in the paywall UI: a student who already paid on the web can enter their
  access token (from their confirmation email/localStorage-era flow) *or* a Stripe
  `session_id`, and `AccessService` verifies it for real against `check-access`/`verify-session`.
  This is the one purchase-adjacent flow that's both fully real *and* fully compliant — it's
  entitlement recognition, not a new in-app sale (§5/§6).
- `pricingService.ts` — the real formula (§4), fully ported and unit-tested (including the
  bundle-always-cheaper invariant across the full 3-365 day range), driving the paywall's
  displayed prices. **No pricing number is hardcoded in any screen.**
- The paywall UI itself: three plan cards, feature explanations sourced from real content counts,
  a duration selector, live-computed pricing, and the entitlement/restore flow above.

**Documented as architecture, not built as a working purchase button (per this milestone's own
instruction: "If platform rules require native in-app purchases instead, document how the
pricing model should be adapted rather than forcing Stripe into an unsupported flow"):**

- Each plan card's actual "Purchase" action is present in the UI but its handler is a clearly
  labeled, honest "in-app purchase isn't wired up yet" state — never a fake success, never a
  WebView opening the Stripe checkout URL (which would be both against store policy and simply
  not implementable without real product configuration in App Store Connect / Play Console, which
  this environment/session has no access to).
- No `react-native-iap` (or Expo's StoreKit/Billing config-plugin path) dependency was added —
  wiring real IAP requires App Store Connect and Play Console product setup (product IDs, pricing
  tiers, sandbox testers) that doesn't exist for this project yet, and installing the library
  without that backing configuration would be dead weight, not working functionality.

## 8. Recommended production architecture

**Purchases:** `react-native-iap` (or Expo's native IAP config-plugin path), one non-consumable
(or subscription, if product wants recurring instead of a fixed access window — the current
day-count pricing model reads as a one-time fixed-duration purchase, not a subscription) IAP
product **per plan × a small number of duration tiers** (App Store/Play Billing require
pre-registered products with fixed prices — they cannot charge an arbitrary `base * days^0.425`
computed at runtime the way the web calculator can). Concretely: register a fixed catalog (e.g.
30/90/180/365-day tiers × 3 plans = up to 12 products) with prices computed from the existing
formula at registration time, rather than trying to make IAP accept a continuous day-count slider.
The mobile pricing UI's day-count picker becomes tier selection instead of freeform 3-365 entry
once real IAP is wired — freeform stays as the *web* pricing calculator's UX, not mobile's.

**Entitlement issuance:** Apple/Google receipt validation happens **server-side** (a new Netlify
function per storefront, e.g. `verify-apple-receipt.mts` / `verify-google-purchase.mts`),
minting the *same kind* of access token `verify-session.mts` already mints — so
`check-access`/`generate-question`/`progress` don't need to know or care which storefront
originated the entitlement. This requires the token record to grow `plan`, `days`, and
`expiresAt` fields (§3) — a backend change needed regardless of which storefront a purchase comes
through, including the existing Stripe path (its access windows are exactly as unenforced today
as any new IAP path would be without this change).

**Cross-platform recognition:** unify on one token model across web (Stripe) + iOS (StoreKit) +
Android (Play Billing) — the same account/email-keyed entitlement record, regardless of purchase
origin, matching what §5/§6 confirm is legally fine.

**Required backend changes, before any of the above is real** (all pre-existing gaps this
document surfaces, not created by mobile's work):
1. `create-checkout.mts` needs `plan`/`days` parameters — it currently creates one fixed-price
   session regardless of what a customer selected.
2. Access token records need `plan`, `days`, `expiresAt` fields.
3. `check-access.mts` needs to return `{valid, plan, expiresAt}` (or equivalent), not just
   `{valid}`, so a client can show duration-aware UI ("expires in 12 days") without guessing.
4. New receipt-validation functions for Apple/Google, minting into the same token shape.

## 9. Access control applied in the mobile app (M9)

Per this milestone's "Students should be able to: browse, view limited previews... Premium
actions should invoke the AccessService":

- **QBank** (`QBankScreen`, including the M8 AI-practice entry point nested under it) — gated
  behind `'qbank'` plan. This is the single gate point for that whole stack (AI practice is only
  reachable *through* QBankScreen, so one check covers both — "do not scatter entitlement checks"
  taken literally: one `<PremiumGate>` wrapper, not a check copy-pasted into every descendant
  screen).
- **Exams** — `ExamListScreen` itself stays fully browsable (a student can see all 3 exams exist,
  their status, etc. — this *is* the "browse" allowance) but Start/Resume/Retake actions check
  `accessService.hasAccess('qbank')` before navigating into `ExamTaking` (exams ship with QBank
  access, not Course — §4).
- **Course/Lessons — deliberately NOT gated.** `Lesson` content in this app's real, imported data
  has no body/prose at all (confirmed absent since M2 — lessons carry only `title`/`note`, ~140
  characters). There is no substantive "Course" content to lock behind a paywall yet; gating a
  title+note would be gating nothing. `AccessService.hasAccess('course')` exists and works
  correctly for whenever real lesson content is added, but no screen calls it in M9 — an honest
  scope note, not an oversight.
- Every gate goes through the one `AccessService`, never a screen-local re-implementation of
  "is this user entitled."

## 10. Future extension points

- Backend changes in §8, in priority order: token `plan`/`expiresAt` fields first (unblocks
  everything else), then `create-checkout` plan/day params (web), then IAP receipt validation
  (mobile).
- A "preview" mode (e.g. first N QBank questions free before the gate) is a natural, low-effort
  addition once product wants it — a single named constant in a config file, not a new
  architecture.
- The web pricing calculator's "study pace" content (lessons/day, questions/day, daily hours) —
  clean to port into the mobile paywall later using the same real content counts already
  available via `contentRepository`, once there's a concrete product ask for it.
- Subscriptions vs. fixed-duration access: if product wants recurring billing instead of the
  current "pay once, access expires" day-count model, that's a pricing-model decision to make
  before registering IAP products, not an engineering one this document should presume.
