# Noor — M5 (Native Noor Patient App Foundation) Implementation Notes

**Status: M5 complete, pending product-owner review. Not production-
ready. Not HIPAA compliant. Not submitted to any app store. No new
clinical features, messaging, AI, or payment logic exists anywhere in
this milestone — every M1–M4 caveat still applies unchanged.**

Builds on [M1](./M1-IMPLEMENTATION.md)–[M4](./M4-IMPLEMENTATION.md), all
of which remain fully in force. M5 does not redesign the backend, does
not duplicate business rules in the mobile client, and does not create a
second identity class, a second database, or a second question/onboarding
data source. Server-side authorization remains authoritative.

---

## 1. Summary

Noor now has a real, native patient app (`apps/mobile`, Expo + React
Native + TypeScript) alongside the existing three Next.js web apps and
the Fastify API. It is not a WebView wrapper — it is a genuine RN app
that consumes the same backend, the same `PatientProfileDTO`/onboarding/
check-in data model, and the same RBAC/ownership authorization as the web
patient app. It covers auth (signup/login/logout/session persistence),
onboarding (resumable across web and mobile, since the backend is the
single source of truth), Noor Home, the M3 Check-In wizard + history, and
a Profile screen — patient-only, with no clinician functionality. The one
new piece of backend surface is a bearer-token transport for the existing
session model (§6), added because a bare native `fetch` has no
browser-equivalent cookie jar; it does not introduce a second identity
system, a second token format, or any weakening of the existing cookie
session.

## 2. Scope boundaries (reaffirmed, not relaxed)

Everything M1–M4 already declared out of scope remains out of scope; M5
adds no exceptions:

- No clinician or admin mobile app — clinician/admin remain web-only.
  `apps/mobile` has no clinician screens, no clinician API calls, and no
  role-branching UI that would even attempt to render one.
- No messaging, no AI, no clinical interpretation of check-in answers, no
  new safety-escalation logic — the native Check-In screen reuses M3's
  existing safety-policy placeholder behavior verbatim (§17).
- No subscriptions, payments, appointment scheduling, medication
  management, diagnoses, or EHR documentation.
- No push-notification *content* (clinical or otherwise) — only a clean
  integration point for a future milestone (§21).
- No production app-store submission (§28).

## 3. Mobile architecture overview

```
Native app (apps/mobile, Expo/RN)          Existing backend (unchanged data model)
─────────────────────────────────          ──────────────────────────────────────
LaunchScreen → RootNavigator          ──►   GET /auth/me            (session resolve)
  ├─ AuthStack (signed out)           ──►   POST /auth/signup|login (clientType: "native")
  ├─ OnboardingScreen (incomplete)    ──►   GET/PATCH /patients/me
  └─ MainTabs (signed in, complete)         GET /patients/me/onboarding/complete
      ├─ HomeTab                     ──►   GET /patients/me
      ├─ CheckInTab (stack)          ──►   GET /check-ins/questions, POST/PATCH /check-ins
      │   ├─ CheckIn (wizard)              GET /check-ins, GET /check-ins/:id
      │   ├─ CheckInHistory
      │   └─ CheckInDetail
      ├─ CareTab                            (no API calls yet — honest empty state)
      └─ ProfileTab                  ──►   PATCH /patients/me
```

Every arrow is an existing M1–M3 endpoint (or, for auth, the same
endpoint extended per §6) — no new business-logic route was added for
onboarding, Home, or Check-In. `apps/mobile` talks to the API exactly
where `apps/patient` does; the two clients are independent renderers of
the same server-authoritative state, not two sources of truth.

## 4. Package structure

```
apps/mobile/
  app.json            — Expo config: name "Noor", scheme "noor", bundle/package ids, icon/splash, plugins
  babel.config.js      — babel-preset-expo
  metro.config.js       — pnpm-workspace-aware Metro config (see §5 for a real bug this caught)
  jest.config.js / jest.setup.js — jest-expo preset + SecureStore/AsyncStorage mocks
  tsconfig.json         — extends expo/tsconfig.base, strict
  index.ts               — registerRootComponent(App)
  assets/icon-placeholder.png — placeholder only, see §24
  src/
    theme.ts                    — colors/spacing/fonts ported 1:1 from apps/patient's globals.css
    App.tsx                     — font loading, splash-screen hold, provider tree
    components/                 — NoorSunMark, ui.tsx (Screen/Card/Button/etc.), ScaleInput, OptionCard
    lib/
      config.ts                 — EXPO_PUBLIC_API_URL environment config (§11)
      api.ts                    — the one apiFetch() client (§10)
      secureSession.ts          — expo-secure-store read/write (§6.4, §19)
      AuthContext.tsx            — signIn/signUp/signOut/refreshMe + status
    navigation/                 — AuthStack, CheckInStack, MainTabs, RootNavigator (+ linking config, §12)
    screens/
      LaunchScreen.tsx
      auth/{WelcomeScreen,LoginScreen,SignupScreen}.tsx
      onboarding/OnboardingScreen.tsx
      home/HomeScreen.tsx
      checkin/{CheckInScreen,CheckInHistoryScreen,CheckInDetailScreen}.tsx
      profile/ProfileScreen.tsx
      care/CareScreen.tsx
    **/__tests__/*.test.tsx     — 9 suites, 38 tests (§25)
```

Shared, non-platform-specific code moved into `@noor/types` rather than
being duplicated: `PatientProfileDTO` and `timeOfDayGreeting()`
(`packages/types/src/profile.ts`), plus the onboarding constants/labels
(`NOOR_INTERESTS`, `CARE_TYPES`, `US_STATES`, etc.) that already lived
there from M2 and are now consumed by both `apps/patient` and
`apps/mobile`. `apps/patient/src/lib/profile.ts` is now a thin
re-export so its six existing tested call sites didn't need touching.
Nothing platform-specific (navigation, secure storage, RN components) was
forced into a shared package — those stay native-only, per the brief's
"don't force code sharing where platform-specific is cleaner."

## 5. Dependency versions and a real bug they caused

`apps/mobile` pins `expo ^57.0.12`, `react-native 0.86.2` (exact),
`react 19.2.3` (exact), and the RN peer libraries (`react-native-screens`,
`react-native-safe-area-context`, `react-native-svg`) at the versions
listed in Expo SDK 57's own `bundledNativeModules.json` — **not** the
newest release of each package. This was not the original state of the
milestone: `react-native@0.87.0` and `react@19.2.8` were tried first
(the newest available releases at the time), and every automated Jest
test passed against them, because `jest-expo` mocks the native module
layer Metro actually has to resolve for a real bundle. Attempting a real
`npx expo export --platform ios|android` (§26) against that combination
failed outright — first with an unresolvable `expo-modules-core` import
(traced to `metro.config.js`'s `disableHierarchicalLookup: true`, which
is also what `npx expo-doctor` independently flags as a non-default
override), and after fixing that, with a hard failure inside
`@expo/metro-config` itself (`Cannot find module
'.../react-native/rn-get-polyfills'`) because RN 0.87 removed a file path
`@expo/metro-config@57.0.8` still expects. Downgrading to the exact
versions Expo SDK 57 bundles resolved both; `npx expo export` now
produces a real Hermes bytecode bundle for both platforms (§26). This is
recorded here deliberately: **the automated test suite alone would not
have caught this** — it is the reason §26 treats a real Metro export as
part of "device verification" rather than optional.

---

## 6. Native authentication design (written before implementation)

### 6.1 The problem

M0–M4's authentication is an httpOnly, signed session cookie
(`packages/auth/src/session.ts` + `packages/api/src/plugins/session.ts`):
`POST /auth/login` creates a `Session` row (a random 32-byte token, only
its SHA-256 hash persisted) and sets it as a `Set-Cookie`; every
subsequent request's `onRequest` hook reads and verifies that cookie,
resolving it to a `SessionUser`. This is correct and secure for a browser,
which automatically stores and resends cookies, and which the `httpOnly`
flag protects from JavaScript-based (XSS) theft.

A bare React Native `fetch` call has no browser-equivalent cookie jar by
default: it does not automatically persist a `Set-Cookie` response header
across requests or app restarts. M4's compatibility assessment
(`M4-IMPLEMENTATION.md` §14) already flagged this and deferred the actual
design to this milestone.

### 6.2 Design goals (from the brief, restated as constraints)

1. Do not weaken the existing browser session model.
2. Do not create a "mobile user" as a separate identity class — both
   clients must resolve to the same `User → Roles → Permissions →
   Patient → ownership authorization`.
3. Do not store passwords after authentication (never did — only a
   bcrypt hash is ever persisted, on either client).
4. Do not store authentication secrets in `AsyncStorage` (unencrypted).
5. Maintain server-side revocation, expiration, and least privilege.
6. Do not duplicate RBAC/session-resolution logic for a second code path.

### 6.3 Chosen design: bearer-token transport of the *same* session

**The mobile app uses the exact same `Session` table, the same
`createSession`/`getSessionUser`/`deleteSession` functions, and the same
opaque random token as the web cookie — only the *transport* differs.**
This is deliberately not a JWT, not a new access/refresh-token pair, and
not a parallel identity system. Concretely:

- `POST /auth/login` and `POST /auth/signup` accept an additional,
  optional field: `clientType: "web" | "native"` (default `"web"`,
  fully backward compatible — existing web calls that omit it are
  unaffected). This is orthogonal to the existing `app` field (which
  already tracks *which frontend* — `"patient"`/`"clinician"` — for
  audit purposes); `clientType` instead marks *which transport*.
- The server always creates exactly one `Session` row per login, exactly
  as today, via the unchanged `createSession()`.
- The server **still always sets the httpOnly cookie**, unconditionally
  — a native `fetch` call simply won't have anywhere to store it, which
  is harmless; this keeps `/auth/login`'s behavior for a web caller
  byte-for-byte unchanged.
- **Only when `clientType === "native"`**, the JSON response body
  additionally includes `{ session: { token, expiresAt } }` — the same
  raw token that would otherwise only ever exist in the httpOnly cookie
  jar. For `clientType === "web"` (or omitted), the raw token is **never**
  present in the response body, exactly as today — this is the load-
  bearing security property that keeps the web app's XSS posture
  unchanged: a compromised web page still cannot read the session token
  via `document.cookie` or via `fetch()`'s response body, because the
  web app's own login call never asks for `clientType: "native"`. (An
  attacker cannot retroactively add that field to a legitimate user's
  already-completed browser login; see §6.6 threat notes.)
- **Resolution** (`packages/api/src/plugins/session.ts`): the
  `onRequest` hook now checks, in order: (1) the signed cookie exactly as
  before; (2) if absent, an `Authorization: Bearer <token>` header. Both
  paths call the *same* `getSessionUser(rawToken)` — there is exactly one
  function that turns a raw token into a `SessionUser`, used by both
  transports. No route handler anywhere needs to know or care which
  transport authenticated the request.
- **Revocation**: `POST /auth/logout` is extended to resolve the token
  from either the cookie or the `Authorization` header (same
  order-of-precedence as above) and calls the same `deleteSession()`.
  Logging out on mobile deletes exactly the one `Session` row the mobile
  app was using — it does not touch a patient's separate web session (a
  patient could, in principle, be signed in on both web and mobile
  simultaneously, each with its own independently-revocable `Session`
  row, which is the same behavior a patient already gets from signing in
  on two different browsers today). `deleteAllSessionsForUser()`
  (already used for full revocation) revokes native sessions identically,
  since they live in the same table.
- **Expiration**: unchanged 12-hour TTL (`SESSION_TTL_MS`), unchanged
  expiry check inside `getSessionUser`. No mobile-specific TTL was
  introduced for M5 — see §6.7 for why a shorter mobile-specific TTL plus
  silent refresh is flagged as a future hardening step, not built now.

### 6.4 Native-side storage

The mobile app stores the raw token using **`expo-secure-store`**
(iOS Keychain / Android Keystore-backed, encrypted at rest by the OS) —
never `AsyncStorage`, per the brief's explicit prohibition. `expo-secure-
store` is the standard Expo-blessed wrapper over each platform's native
secure credential storage; using it is not itself a security guarantee
("do not claim the mechanism is secure merely because a library
implements it" — brief §6), so `docs/noor/M5-IMPLEMENTATION.md` §19 below
documents exactly what is and is not stored on-device and why, rather
than asserting SecureStore makes the whole app compliant with anything.

No password is ever stored on-device at any point — the login screen
holds the password only in transient component state for the duration of
the request, then discards it; nothing persists it to storage, logs, or
crash reporting.

### 6.5 What the API distinguishes vs. what stays unified

| | Web | Native |
|---|---|---|
| Transport | httpOnly cookie | `Authorization: Bearer <token>` |
| Token storage | Browser cookie jar (JS-inaccessible) | `expo-secure-store` (OS Keychain/Keystore) |
| Session row | Same `Session` table | Same `Session` table |
| Identity resolution | `getSessionUser()` | `getSessionUser()` — identical function |
| Roles/Permissions/RBAC | `packages/types` `ROLE_PERMISSIONS`, `packages/api/src/rbac/*` | Identical — no mobile-specific RBAC code path exists |
| Ownership scoping | `requireSelfPatient`, `assertClinicianHasActiveCareRelationship`, etc. | Identical — these functions read `request.sessionUser`, which is populated the same way regardless of transport |
| Revocation | `deleteSession()` | `deleteSession()` — identical |

There is no "mobile user" table, no separate patient-mobile identity, and
no duplicated permission matrix. A patient who signs up on the native app
is the exact same `User`/`Patient` row a web signup would create — the
`patient.dev@example.test` seed account (or a real patient) can sign in
on web and mobile interchangeably, each getting its own independently-
revocable session against the same identity.

### 6.6 Threat/security considerations

- **Token-in-response-body vs. httpOnly-cookie**: the native token
  necessarily passes through JS-reachable memory at least transiently
  (it's in the RN app's own `fetch` response) — this is unavoidable for
  *any* non-cookie mobile transport and is why it is written immediately
  to `expo-secure-store` and not kept in ordinary component/store state
  longer than necessary to persist it. React Native has no
  browser-equivalent DOM/third-party-script injection surface the same
  way a web page does, which is the standard justification for mobile
  apps using this pattern (it's also, functionally, what OAuth mobile
  flows and most native app SDKs do) — but this is a real, documented
  trade-off, not a claim that it's equivalently safe to httpOnly in every
  respect.
- **A stolen/leaked native token is exactly as powerful as a stolen web
  cookie** — both resolve to the same `SessionUser` with the same
  permissions. This is intentional (§6.2 goal 2: no separate, possibly
  weaker, mobile identity) but means device compromise (a jailbroken/
  rooted device with SecureStore bypassed, or a backup-extraction attack)
  is the mobile-specific risk surface to take seriously in a future
  security review — noted in §19.
  Sensitive-screen recording protection is *not* implemented in M5;
  documented in §20.
- **Revocation reaches only that one device's session** unless
  `deleteAllSessionsForUser` is explicitly invoked (e.g. on a future
  "sign out of all devices" feature, or if the account is compromised) —
  this is the same limitation the web already has across multiple
  browsers, not a new one.
- **No refresh-token rotation** exists in M5 (§6.7) — a leaked native
  token remains valid for up to the same 12-hour window as a leaked web
  cookie, no shorter. This is flagged, not hidden.
- **`clientType` is client-asserted, not itself a security boundary** —
  it only controls whether the raw token is echoed in the response body;
  it grants no additional access, bypasses no authorization check, and
  cannot be used to escalate privilege (see §6.3's bullet on why a
  malicious *third party* cannot exploit this on a *legitimate* user's
  session).

### 6.7 What was deliberately NOT built in M5 (documented, not hidden)

- **No JWT / no access+refresh token pair.** The opaque session-token
  model was judged sufficient to prove the native client works against
  the real backend without introducing a second token format alongside
  the existing one. A future milestone may introduce a shorter-lived
  mobile access token with silent refresh (reducing the blast radius of a
  leaked token below the current 12-hour session TTL) — this is a
  concrete, named future hardening step, not implied to already exist.
- **No biometric gate is required or wired to unlock the stored token in
  M5** — see §8 below; the integration point is documented, not built,
  per the brief's explicit "do not pretend it is required."
- **No "sign out of all devices" UI** — the underlying capability
  (`deleteAllSessionsForUser`) already exists from M1 and is unchanged;
  no new UI surfaces it in M5.
- **No mobile-specific session TTL, device fingerprinting, or anomaly
  detection.**

This design does not claim to be a complete mobile security architecture
— it is the minimum addition that lets a real native client authenticate
against Noor's existing, unweakened identity system, with the specific
gaps above named for a future security-focused milestone.

---

## 7. Backend changes (summary — full design in §6 above)

- `packages/api/src/lib/session-token.ts` (new) — `readRawSessionToken()`,
  the single function that resolves a raw session token from either the
  signed cookie or an `Authorization: Bearer` header, in that order.
- `packages/api/src/plugins/session.ts` — `onRequest` hook now calls
  `readRawSessionToken()` instead of only reading the cookie; still
  exactly one call to `getSessionUser()` regardless of transport.
- `packages/api/src/routes/auth.ts` — `signupSchema`/`loginSchema` gain
  an optional `clientType: "web" | "native"` field (default `"web"`,
  fully backward compatible); the success response additionally includes
  `{ session: { token, expiresAt } }` only when `clientType === "native"`;
  `POST /auth/logout` resolves the token via `readRawSessionToken()` so it
  can revoke a bearer-authenticated session too.
- No schema/migration change — `Session` is the same table M1 created.
- No new permission, role, or RBAC code path — `clientType` only affects
  what the JSON response body contains, never what a route authorizes.

## 8. Native-side secure storage and PHI policy

`apps/mobile/src/lib/secureSession.ts` is the **only** module that writes
to on-device persistent storage in this app, and it persists exactly two
values, both under `expo-secure-store` (iOS Keychain / Android Keystore):

| Key | Value | Why |
|---|---|---|
| `noor.session.token` | the opaque session token | needed across app restarts so a signed-in patient isn't forced to log in every launch |
| `noor.session.expiresAt` | ISO timestamp | lets the client skip a doomed network call once obviously expired — the server is still the real authority (§6.3) |

**Nothing else is persisted on-device.** In particular:

- No password is ever stored, at any point, on any client.
- No profile data (`PatientProfileDTO`), onboarding progress, or check-in
  content is cached to disk — every screen re-fetches from the API on
  focus (`useFocusEffect`) and holds the result only in React component
  state (in-memory, cleared on unmount/app kill).
- Check-in **draft answers exist only as unsaved form state until each
  `PATCH` succeeds** — exactly like the web wizard — and the *saved*
  copy of record lives server-side (`CheckIn`/`CheckInResponse` rows),
  never duplicated into local storage. Free-text answers in particular
  are never written to `AsyncStorage`, a file, or a log line.
- `AsyncStorage` (`@react-native-async-storage/async-storage`) is not a
  dependency of this app at all; `jest.setup.js` additionally registers a
  `{ virtual: true }` mock of it that throws if anything ever imports it,
  as a regression guard against it being reintroduced.
- No analytics or crash-reporting SDK is integrated in M5 — there is
  nothing to accidentally leak PHI into via breadcrumbs or event
  properties, because nothing exists yet (see §29 for the review item
  this creates for the milestone that *does* add one).
- `apiFetch` (`lib/api.ts`) never logs a request/response body, and
  `NetworkUnavailableError`'s message is a fixed, generic string — the
  underlying `fetch` rejection (which can include request details) is
  caught and discarded, never logged.

## 9. Biometrics (architected for, not built)

`expo-local-authentication` is a dependency and `app.json` already
declares `NSFaceIDUsageDescription`, but **no biometric gate exists in
M5** — launching the app and having a valid stored session is sufficient
to reach `MainTabs`, same as before. This is deliberate: the brief marks
biometrics as future/optional, and a biometric unlock gate that's
correctly integrated with session validity, fallback-to-password, and
device-enrollment-changed handling is its own scope, not a two-line
addition. Building it now would either be a shallow, misleading gate
(bypassable by simply not enabling it, if implemented naively) or would
expand this milestone beyond what was asked. The dependency and iOS
usage-description string are the extent of the groundwork — a future
milestone can wire an actual `LocalAuthentication.authenticateAsync()`
gate in front of `RootNavigator`'s signed-in branch without any backend
change, since biometrics would only ever gate *local* access to an
already-issued token, never replace server-side authentication.

## 10. API client design

`apps/mobile/src/lib/api.ts` is the single `fetch()` call site in the
app (mirrors `apps/patient/src/lib/api.ts`'s role on web). It:

- Prefixes every request with `API_URL` (§11) and injects
  `Authorization: Bearer <token>` from an in-memory cache kept in sync by
  `AuthContext` — no screen reads from SecureStore directly.
- Distinguishes three failure modes with distinct types so screens can
  render the right state (§23) instead of one generic error: `ApiError`
  (any non-2xx, with the server's own message when present),
  `AuthExpiredError` (a 401 specifically — triggers the registered
  `authExpiredHandler`, which `AuthContext` uses to clear storage and
  route to Welcome), and `NetworkUnavailableError` (the request never
  reached the server at all).
- Never logs a request URL, header, or body, and never logs the raw
  underlying `fetch` rejection (§8).

## 11. Environments

`apps/mobile/src/lib/config.ts` reads `EXPO_PUBLIC_API_URL` (an Expo
env var, inlined into the JS bundle at build time) with a
`http://localhost:4000` fallback for local development only — no
staging or production URL is hard-coded anywhere in the app. Per-
environment values are meant to be supplied via `.env`/
`.env.development`/`.env.staging`/`.env.production` files (not committed,
same convention as the existing `packages/api/.env.example` pattern) or
via EAS Build environment configuration when a real build pipeline is
set up. Because `EXPO_PUBLIC_*` values are inlined into the shipped
binary, nothing secret may ever go in this file or any `EXPO_PUBLIC_*`
variable — an API base URL is not a secret, but this is called out
explicitly so a future engineer doesn't put one there by habit.

## 12. Navigation and deep-link foundation

`RootNavigator` branches on `AuthContext`'s `status`
(`loading`/`signedOut`/`signedIn`) between `LaunchScreen`, `AuthStack`
(Welcome/Login/Signup), and, once signed in, a `PostAuthGate` that checks
`onboardingCompletedAt` to route between `OnboardingScreen` and
`MainTabs` (Home/Check-In/Care/Profile tabs, `CheckInTab` itself a small
stack of CheckIn/CheckInHistory/CheckInDetail). The `linking` config
(`noor://` scheme) maps `home`, `check-in`, and `check-in/history` to
real screens, so a future notification or link can open the app
directly to one of them — deliberately **excluding** a direct
`check-in/:id` deep link, since that would place a specific record
identifier in an OS-level link that could end up in cross-app link
history outside Noor's control; opening one specific check-in stays an
in-app navigation action from the history list. Universal/associated
`https://` links are not configured — the brief cautions against
overbuilding this before it's needed, and the custom scheme is a
sufficient integration point for now.

## 13. Launch experience

`LaunchScreen` (sun mark, "Noor", tagline) shows only for as long as
`AuthContext` takes to read SecureStore and validate any stored token
against `GET /auth/me` — there is no artificial minimum-display timer.
`App.tsx` separately holds the native splash screen
(`SplashScreen.preventAutoHideAsync`) until the Noor brand fonts
(Cormorant Garamond, DM Sans) finish loading, then hides it — again gated
on an actual readiness condition, not a fixed delay, per the brief's
"avoid unnecessary splash delay."

## 14. Auth screens

`WelcomeScreen` (sun mark + Sign In / Create Account), `LoginScreen`, and
`SignupScreen` are full native recreations, not embedded web views. Both
forms show a loading state during the request, surface `AuthContext`'s
`signIn`/`signUp` errors via a single `ErrorText`, and — per M1's
existing no-enumeration behavior, unchanged here — a failed login always
shows the same "Invalid email or password." regardless of whether the
email exists. `AuthContext.signOut()` clears SecureStore, clears the
in-memory API token, and calls `POST /auth/logout` so the server-side
`Session` row is actually revoked, not just forgotten locally.

## 15. Native onboarding

`OnboardingScreen` drives the same four-step flow and the same
`GET/PATCH /patients/me` + `POST /patients/me/onboarding/complete`
endpoints as `apps/patient`'s onboarding wizard — there is no second
onboarding data model. On mount it fetches the current profile and
computes which step to resume at from `completionPercent`/which fields
are already filled, so a patient who started on web and opens the app
next sees the exact step they left off at, and vice versa, because the
backend (not either client) is the source of truth. Each step's Continue
action `PATCH`es only that step's fields; Finish calls the completion
endpoint and hands off to `MainTabs`.

## 16. Native Home

`HomeScreen` fetches `PatientProfileDTO` on every focus (so returning
from a submitted check-in reflects fresh state) and renders the same
three concepts as the web Home: a personalized `timeOfDayGreeting()`
(now shared via `@noor/types`, §4), a "Your care" card showing the
honest "No provider yet" state (never a fabricated appointment or
provider name), a "Your Noor journey" card with the Check-In entry point,
and an "Explore care" section with a Psychiatry card carrying the same
"Coming soon" badge the web app and `CareScreen` both show. Nothing on
this screen is invented — every state shown is a real, current condition
of the signed-in patient's data or an explicitly-labeled future state.

## 17. Native Check-In

`CheckInScreen` drives the same data-driven flow M3 built:
`GET /check-ins/questions` for the question set, `POST /check-ins`
(idempotent get-or-create/resume, identical semantics to web) to begin or
resume a draft, per-question `PATCH` to save each answer, a review step
before submission, and `POST /check-ins/:id/submit`. There is no
mobile-only question source, no client-side scoring, and no client-side
safety classification — the existing server-side, deterministic
safety-policy placeholder (`packages/safety-policy`) runs exactly as it
does for a web submission, and its result is never exposed back to the
patient's own device, on either client (§8's audit-metadata guard from
M3 applies unchanged). `CheckInHistoryScreen` lists only the signed-in
patient's own submitted check-ins with the same four summary scores the
web history shows (never a clinical interpretation); `CheckInDetailScreen`
shows one submitted check-in's answers plus its M4 reviewed-by-care-team
status, read-only.

## 18. Profile

`ProfileScreen` edits exactly the fields `PATCH /patients/me`'s existing
Zod schema (`packages/types/src/onboarding.ts`) accepts — first name,
last name, state, and the three care-preference fields — reusing the
same `NOOR_INTERESTS`/`CARE_TYPES`/`CARE_FORMATS`/`US_STATES` constants
and labels as onboarding. There is no field, on this screen or in the
request it builds, for role, ownership, system identifiers, care
relationships, or audit metadata — those aren't part of the schema this
screen submits to, so there's no code path that could send them even by
accident. Sign out is available from this screen and calls the same
`AuthContext.signOut()` described in §14.

## 19. Care (future home, honest empty state)

`CareScreen` shows Therapy ("No provider yet. Provider matching isn't
available on mobile yet."), Psychiatry ("Coming soon" badge, same as
Home), and Appointments ("No upcoming appointments yet.") — three plainly
labeled future states and zero fabricated clinicians, appointments,
availability windows, or service names, matching the web app's own
restraint on its equivalent "Explore care" section.

## 20. Screen capture / device security (documented, not built)

M5 does not add screen-capture prevention, screenshot blocking, or an
app-switcher content-hiding overlay on any screen, including Check-In,
which is the screen most likely to warrant one in a future milestone.
This is a deliberate, named gap, not an oversight: RN offers
platform-specific mechanisms for this (e.g. Android's
`FLAG_SECURE`, iOS's app-switcher-snapshot handling), but adding them
without a defined policy for *which* screens warrant it, and without
overreaching into restrictions that would hurt ordinary usability (the
brief's own caution), is exactly the kind of decision this milestone
should surface rather than pre-empt. This — like biometrics — is a
device-level UX control only; it would never, by itself, constitute
healthcare-grade compliance, and should not be described as such if
added later.

## 21. Push notification foundation (integration points only)

No push-notification library, permission prompt, token registration, or
notification content exists in M5. What exists is the same deep-link
`linking` config (§12) a future notification handler could reuse to
route a tap into Home/Check-In/Check-In History — nothing more. Wording,
consent flow, per-notification-type preferences, device-token storage
and rotation, and — most importantly — whether any notification content
may reference PHI (a reminder like "Your check-in is ready to review"
already requires care; anything more specific needs a dedicated privacy
review) are all explicitly deferred to a future, dedicated milestone, per
the brief.

## 22. Error handling and offline behavior

`apiFetch` (§10) gives every screen three distinguishable failure modes
to render: a network-unreachable state ("Unable to reach Noor. Check
your connection and try again."), an auth-expired state (routes to
Welcome via `AuthContext`, no confusing error screen), and a generic
`ApiError` message from the server when the request reached it but
failed (validation, 403, 500, etc. — the server's own message is shown
verbatim when present; there is no place any internal stack trace or
backend implementation detail could leak into a screen, since `ApiError`
only ever carries `response.status` and a string). No screen ever tells
a patient a check-in was submitted, or an edit saved, except after the
corresponding `apiFetch` call actually resolves successfully — there is
no optimistic "assume it worked" UI anywhere in the app. M5 does not
build an offline data-sync system: there is no local write queue, no
background retry, and no persisted "pending" check-in state (§8) — if a
request fails, the screen shows the appropriate error above and the
patient can retry once connectivity returns; nothing is silently queued
or falsely reported as saved.

## 23. Accessibility

Native screens reuse the same accessibility patterns the M3 web check-in
established, translated to RN's accessibility API: `accessibilityRole`
(`"radiogroup"`/`"radio"`/`"button"`/etc.), `accessibilityLabel` on every
interactive control (form fields, scale options, nav tabs), a 44pt
`minTouchTarget` constant applied to every tappable element (`theme.ts`),
and selection state that is never color-only — `ScaleInput`/`OptionCard`
mark a selected option with a border, bold text, and a checkmark glyph,
not color alone. Text uses RN's default Dynamic Type support (no fixed
`allowFontScaling={false}` anywhere); no custom focus-order logic was
required since screen order already matches visual order throughout.

## 24. App icon / brand asset status

`assets/icon-placeholder.png` is a **hand-generated placeholder** (a
flat cream background with a gold circle, produced directly from a small
PNG-encoding script — not a screenshot, trace, or approximation of any
real Noor logo asset) used only so `app.json`'s `icon`/`splash`/
`android.adaptiveIcon.foregroundImage` fields point at a real file and
the app builds. **The real production Noor sun-mark icon asset was not
available in this repository and was deliberately not recreated from
memory or approximation**, per the brief's explicit instruction not to
attempt an inaccurate recreation of the official logo. The in-app sun
mark rendered on Launch/Welcome (`NoorSunMark.tsx`, SVG, same 12 ray
coordinates as the web header logo) is not affected — that's an existing,
already-approved brand asset reused from `apps/patient`. Before any real
build or store submission, the placeholder PNG must be replaced with
production-exported icon/splash assets at Apple's and Google's required
sizes.

## 25. Automated tests

**Mobile (`apps/mobile`): 9 suites, 38 tests, all passing.**

| Suite | Covers |
|---|---|
| `sanity.test.tsx` | Documents RNTL v14's fully-async `render`/`fireEvent` API — regression guard (§26 note on why this mattered) |
| `lib/__tests__/secureSession.test.ts` | SecureStore save/load/clear, client-side expiry check (#secure-credential-handling) |
| `lib/__tests__/api.test.ts` | Auth-header injection, `AuthExpiredError`/`NetworkUnavailableError`/`ApiError` shaping, no logging (#AUTH, #SECURITY) |
| `lib/__tests__/AuthContext.test.tsx` | signIn/signUp/signOut/session persistence/expired-session handling (#AUTH) |
| `screens/auth/__tests__/LoginScreen.test.tsx` | Loading state, generic auth-failure message (#no email enumeration), navigation |
| `screens/onboarding/__tests__/OnboardingScreen.test.tsx` | New patient start, resume mid-flow from backend state, step PATCH, completion (#ONBOARDING) |
| `screens/home/__tests__/HomeScreen.test.tsx` | Authenticated rendering, honest empty/future states, Check-In entry point (#HOME) |
| `screens/checkin/__tests__/CheckInScreen.test.tsx` | Question flow, draft save, review, submit (#CHECK-IN) |
| `screens/checkin/__tests__/CheckInHistoryScreen.test.tsx` | Patient-owned history list + reviewed status (#CHECK-IN) |

**Backend (`packages/api`): 14 new native-auth tests** (`tests/native-
auth.test.ts`), covering §6's #AUTHORIZATION and #SECURITY categories:
`clientType: "native"` returns a token / web never does; bearer auth
resolves identically to cookie auth via `/auth/me` and `/patients/me`;
a bearer-authenticated patient still gets 403 on clinician-only routes
and cannot read another patient's data (RBAC unaffected by transport);
signup cannot self-elevate to ADMIN via the native path either; logout
with a bearer token revokes only that session, not a simultaneous web
session for the same user; an expired session is denied over bearer; a
malformed bearer token is a clean 401, not a server error; the
plain-cookie flow with no `clientType` at all still works byte-for-byte
as before.

**Full monorepo: zero regressions.** Every pre-existing suite across all
10 other workspace packages (`packages/{ai-service,auth,ehr-adapter,
payments-adapter,safety-policy,types}`, `apps/{admin,clinician,patient}`,
`packages/api`) still passes; the monorepo total is **297 tests**
(245 from M1–M4 + 14 new native-auth backend tests + 38 new mobile
tests). `pnpm -w typecheck` is clean across all 12 workspace projects,
including `apps/mobile`.

## 26. Device / environment verification

**This container has neither an iOS Simulator nor an Android
emulator available**, and that is stated plainly rather than implied
otherwise: it is a headless Linux container (no macOS, so no Xcode/
`simctl` — an iOS Simulator is categorically not possible here), and it
has no Android SDK installed (no `ANDROID_HOME`, no `adb`/`emulator`
binaries). No simulator or emulator run was pretended.

What **was** done, as the strongest verification actually available in
this environment:

1. `npx expo-doctor` — 16–17/20 checks pass; the failures are either
   genuine (the `.expo/` directory not being git-ignored — **fixed**,
   §29) or caused by this environment's outbound network policy
   blocking Expo's own remote schema/registry services (confirmed via a
   direct `curl` to `api.expo.dev` returning a proxy 403) — not app bugs.
2. `npx tsc --noEmit` — clean.
3. `npx jest` — 9/9 suites, 38/38 tests (§25).
4. **`npx expo export --platform ios` and `--platform android`** — a
   real Metro production bundle build, using the actual pnpm-workspace
   resolver and the actual native module graph (not Jest's mocked
   module layer). This is the one step that found a real, load-bearing
   bug: with the dependency versions originally chosen, the app **could
   not bundle at all** for either platform (§5). After pinning to the
   exact versions Expo SDK 57 bundles and fixing `metro.config.js`'s
   resolver override, both platforms now export a working Hermes
   bytecode bundle (`index-*.hbc`, ~2.7MB each) with all 44 font/image
   assets resolved correctly.

This confirms the JS bundle, the monorepo module resolution, font
loading, and every static asset reference are all sound for both target
platforms. It does **not** confirm on-device rendering, gesture
handling, native module initialization (SecureStore, fonts, safe-area
insets) at runtime, or actual UI behavior on a physical screen — those
require §27's physical-device workflow, which was not available to
perform in this session.

## 27. Physical-device verification instructions

**iOS (physical iPhone, no Mac required for this step):**

1. On the iPhone, install the free **Expo Go** app from the App Store.
2. On a machine with this repo cloned and the API running
   (`pnpm dev:api`, plus `pnpm dev` for the — unused by mobile — patient
   web app if you want both running), start the mobile dev server from
   `apps/mobile`: `EXPO_PUBLIC_API_URL=http://<your-machine-LAN-IP>:4000 npx expo start`.
   Use your machine's LAN IP, not `localhost` — on a physical device,
   `localhost` refers to the device itself (documented in `lib/config.ts`).
3. Ensure the iPhone and the dev machine are on the same Wi-Fi network.
4. Scan the QR code Expo prints with the iPhone's Camera app (or the
   Expo Go app's own scanner) — it opens directly in Expo Go.
5. Sign up or sign in with a synthetic dev account
   (`pnpm db:seed`'s `patient.dev@example.test` / `NoorDevSeed!2026`, or
   create a fresh one to walk through onboarding).

**Android (physical device):**

1. Install **Expo Go** from the Google Play Store.
2. Same dev-server step as iOS step 2 above.
3. Same network requirement as iOS step 3.
4. Open the Expo Go app and use its "Scan QR code" option (Android
   Camera app QR scanning doesn't reliably hand off to Expo Go the way
   iOS's does) to scan the printed QR code.
5. Same sign-in step as iOS step 5.

**Note for a future milestone:** once native modules beyond what Expo Go
bundles are needed (e.g. a push-notification SDK), this workflow moves
from Expo Go to an EAS **development build** (`eas build --profile
development`) installed directly on the device — not covered here since
nothing in M5 requires it yet.

## 28. App Store / Google Play preparation (documentation only — not submitted)

Per the brief, M5 does **not** submit to either store; this section
records what's decided and what remains open for a future
production-readiness milestone.

**Decided / already configured (`app.json`):**
- App name: **Noor**
- iOS bundle identifier: `com.noor.patient`
- Android package identifier: `com.noor.patient`
- iOS `NSFaceIDUsageDescription` set (required once Face ID is used —
  currently unused per §9, but harmless to declare now since the
  permission usage string only matters if the API is actually invoked)

**Explicitly unresolved — marked for production review, not fabricated:**
- **Real icon/splash assets.** §24's placeholder must be replaced with
  production-exported assets at each platform's required sizes (iOS: a
  1024×1024 App Store icon plus the standard icon set; Android: adaptive
  icon foreground/background layers) before any real build.
- **EAS project ID.** `app.json`'s `extra.eas.projectId` is the literal
  placeholder string `"NEEDS-PRODUCTION-EAS-PROJECT-ID"` — a real EAS
  project must be created and linked before `eas build`/`eas submit` can
  run.
- **Apple Developer Program / Google Play Console enrollment**, signing
  certificates/provisioning profiles, and a Play Console signing key —
  none of this exists yet; not something this milestone can create.
- **Store listing content** (screenshots, description, keywords,
  support URL, marketing assets) — not produced in M5; no placeholder
  copy is invented here to avoid it being mistaken for approved copy.
- **Privacy disclosures** (Apple's App Privacy "nutrition label",
  Google Play's Data Safety form) — **not answered here.** These require
  an accurate accounting of exactly what data the shipped app collects
  and why, which is a legal/compliance-reviewed determination, not
  something to guess at. §8 of this document is the accurate current
  factual basis for that future determination (SecureStore holds a
  session token and its expiry; nothing else persists on-device), but
  the actual privacy-label answers must be filled in by whoever owns
  that review, not fabricated here.
- **Age rating, export compliance (encryption) declarations, and any
  required legal/medical-app-specific store disclosures** — all
  unresolved, all explicitly out of this milestone's authority to answer.

## 29. Known limitations

- No biometric unlock gate (§9), no screen-capture protection (§20), no
  push notifications (§21), no offline data sync (§22) — all
  deliberately deferred, not partially built.
- No web-platform testing for `apps/mobile` (`expo start --web` exists
  as a script but was not exercised in this milestone — this app's target
  is native, and `react-native-web` is not a verified/tested dependency
  here).
- Care tab is a static empty-state screen with no real functionality
  behind it yet, by design (§19).
- No analytics or crash reporting is integrated (§8) — meaning there is
  currently no way to observe real-world native crashes or errors
  without a future, privacy-reviewed addition.
- The peer-dependency pin in §5 (`react 19.2.3`, `react-native 0.86.2`)
  will need to be revisited deliberately (checked against
  `bundledNativeModules.json`) whenever Expo SDK is upgraded — bumping
  either package independently of an SDK upgrade is what caused the
  bundling failure documented in §5/§26.
- `.expo/` was previously untracked-but-not-git-ignored in this
  worktree; fixed in this milestone (`.gitignore`), but worth noting
  since it means any earlier local Expo state was never meant to be
  committed.

## 30. Security / privacy items requiring review before production

These are flagged, not resolved, per the brief's explicit instruction not
to claim security merely because a mechanism exists:

- **Device-compromise risk for the native token** (§6.6) — a
  jailbroken/rooted device or a backup-extraction attack is the
  mobile-specific risk surface `expo-secure-store` does not fully
  mitigate; worth a dedicated mobile-security review before production.
- **No refresh-token rotation / no shorter mobile-specific session TTL**
  (§6.7) — a leaked native token is valid for the same window as a
  leaked web cookie (up to 12 hours), no shorter.
- **Screen-capture / app-switcher-snapshot exposure on Check-In** (§20)
  — not mitigated in M5.
- **Push-notification PHI-in-preview risk** (§21) — must be resolved
  before any notification content is written, not after.
- **App Store / Play Store privacy disclosures** (§28) — require a
  compliance-owned answer, not an engineering guess.
- **No analytics/crash-reporting SDK yet** (§29) — when one is added, it
  needs the same PHI-conservative review this milestone gave SecureStore
  usage, since crash breadcrumbs are a classic accidental-PHI-leak
  vector.

## 31. Recommended next milestone

Two reasonable directions exist from here, and this document does not
pick one — that decision belongs to the product owner:

1. **Mobile hardening**: address §30's items (refresh-token rotation or
   shorter mobile TTL, screen-capture protection for Check-In, a real
   analytics/crash-reporting integration with a PHI review) before any
   store submission.
2. **Continue the M4 roadmap**: per `M4-IMPLEMENTATION.md` §15,
   patient-clinician communication design was already the recommended
   next step before M5 branched off to build the native client — that
   recommendation still stands and is now informed by having two client
   platforms to design the eventual messaging UX for.

Nothing in M5 begins either. No M6 work has started.

## 32. Explicit non-claims

This milestone does **not** claim: production readiness; HIPAA
compliance; App Store or Google Play approval or submission; that
`expo-secure-store` alone makes the app's authentication "secure" in any
absolute sense (§6.4); that on-device Metro-bundle verification (§26) is
equivalent to real device/simulator UI verification, which was not
possible in this environment and is not represented as having occurred.
