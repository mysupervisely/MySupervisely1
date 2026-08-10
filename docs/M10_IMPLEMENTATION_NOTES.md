# M10 Implementation Notes — Beta Polish & Launch Readiness

Companion to `docs/REAL_DEVICE_TEST_PLAN.md` (the real-device checklist this milestone produced)
and the M1–M9 implementation notes. Scope: product polish, reliability, accessibility, and
launch-readiness — **no new major features, no native IAP, no store submission** (all explicitly
out of scope per this milestone's instructions).

## Files changed

```
mobile/
  .env.development / .env.preview / .env.production / .env.example   (new) — see §1
  eas.json                                                            (new) — see §1
  src/config/appEnv.ts, appEnv.test.ts                                (new) — see §1
  src/api/apiConfig.ts                                                (modified) — env-sourced API_BASE_URL

  src/screens/onboarding/OnboardingScreen.tsx                         (modified) — see §2
  src/components/ScreenContainer.tsx                                  (modified) — see §3 (keyboard)
  src/components/question/QuestionEngineView.tsx                      (modified) — see §3 (bug fix)
  src/components/progress/ReadinessScoreCard.tsx                      (modified) — see §3 (zero-data)
  src/hooks/useProgressDashboard.ts                                   (modified) — feeds ReadinessScoreCard's fix
  src/screens/progress/ProgressScreen.tsx                             (modified) — passes the new prop through

  src/hooks/useReducedMotion.ts                                       (new) — see §4
  src/constants/bodyMap.ts, bodyMap.test.ts                           (modified) — see §7
  src/components/bodyMap/BodyMapView.tsx, Hotspot.tsx                 (modified) — see §7
```

No new dependencies. No screens were redesigned — every fix below works within the existing brand
system (colors, spacing, typography) already established since M1.

## 1. Environment configuration

Three named environments — **development**, **preview** (staging), **production** — all resolved
from `EXPO_PUBLIC_*` env vars, never a hardcoded URL in source:

- `src/config/appEnv.ts` — `resolveAppEnvironment(rawEnvVar, isDev)` (pure, tested) reads
  `EXPO_PUBLIC_APP_ENV`; an unset or unrecognized value falls back to `development`/`production`
  based on `__DEV__` rather than crashing.
- `src/api/apiConfig.ts` — `API_BASE_URL` reads `EXPO_PUBLIC_API_BASE_URL`, falling back to a
  per-environment, deliberately non-resolving placeholder if that var is ever missing from a
  build (same "don't guess a real domain" reasoning as M8/M9, now per-environment instead of
  once).

**How each environment actually loads**, using Expo's built-in `EXPO_PUBLIC_*` env var support
(Metro inlines `process.env.EXPO_PUBLIC_*` at bundle time — no new dependency, available since
Expo SDK 49) and its `NODE_ENV`-driven `.env.<NODE_ENV>` file selection:

| Environment | How it's selected | File loaded |
|---|---|---|
| development | `npx expo start` (NODE_ENV defaults to `development`) | `.env.development` |
| preview | EAS Build `preview` profile (`eas.json` sets `NODE_ENV=preview` explicitly) | `.env.preview` |
| production | `npx expo export` / EAS Build `production` profile (NODE_ENV defaults to `production`) | `.env.production` |

`eas.json` (new) defines all three build profiles, each setting `NODE_ENV` and
`EXPO_PUBLIC_APP_ENV` explicitly so `appEnv.ts` and Metro's file selection always agree. A
developer who needs a personal local override (e.g. pointing at their own tunnel) copies
`.env.example` to `.env.local` — already covered by the project's existing `.gitignore`
(`.env*.local`), so personal overrides never get committed.

All three named `.env.*` files, plus `.env.example`, are committed on purpose — `EXPO_PUBLIC_*`
values are inlined into the client bundle regardless of where they're stored, so there's no secret
to protect here, only a base URL (same non-secret status as `apiConfig.ts`'s constant before this
milestone).

## 2. Onboarding

- Added the exact required concept line: **"Master the NAPLEX one system at a time."** (as its own
  prominent line, `accessibilityRole="header"`), keeping the existing tagline as supporting copy
  underneath rather than replacing it.
- Wrapped the form in `KeyboardAvoidingView` (iOS `padding` behavior) + `ScrollView`
  (`keyboardShouldPersistTaps="handled"`) — previously the content was vertically centered with no
  keyboard-aware repositioning, so the "Get started" button could end up hidden behind the
  keyboard on a small device (`docs/M3_QA_REVIEW.md` #17, now fixed).
- The name field's `returnKeyType="done"` now actually submits (`onSubmitEditing`) instead of
  doing nothing (`docs/M3_QA_REVIEW.md` #18).
- Added explicit `accessibilityLabel`/`accessibilityHint` on the name field, and confirmed the
  empty-name path was already handled correctly end to end (`onboardingStorage.setFirstName`
  already no-ops on blank input; `buildGreeting` already falls back to a plain salutation) — no
  behavior change needed there, just confirmed and documented.
- "Get started" and the name field now both have explicit `minHeight: 44`, matching the touch-
  target convention used everywhere else in the app (this screen was the one place that didn't).
- Entry-after-onboarding and local persistence were already correct (M3) — reviewed, not changed.

## 3. App-wide UX polish

- **`ScreenContainer.tsx`** (used by nearly every screen): added a `KeyboardAvoidingView` wrapper
  and `keyboardShouldPersistTaps="handled"` on its `ScrollView`. Fixes two things at once, app-
  wide, from one file: a TextInput near the bottom of a screen no longer risks being covered by
  the keyboard, and a button placed right next to a focused TextInput (e.g. PricingScreen's
  "Verify" buttons) now registers on the first tap instead of the tap being swallowed by keyboard
  dismissal.
- **Bug found and fixed — `QuestionEngineView.tsx`**: the "Next" button's disabled-state label
  read `'End of QBank'` unconditionally. This component is explicitly the *shared, source-
  agnostic* renderer reused by QBank, M7.5's recommended study sessions, and M8's AI-generated
  question sessions — so a student finishing a Study Session or an AI-generated set saw a button
  claiming "End of QBank" when they were in neither. Fixed to a source-neutral `'Next Question'`
  label; the disabled/greyed-out styling already communicates the boundary on its own, so no
  replacement "End of X" text is needed. No new dependency or test infra was added for this —
  component render output isn't unit-tested anywhere in this codebase (a pattern established
  since M1: pure services/hooks get Jest coverage, JSX output doesn't), so this fix is covered by
  the real-device checklist (`docs/REAL_DEVICE_TEST_PLAN.md` §3.4/3.5) rather than a new
  automated test.
- **Zero-data messaging — `ReadinessScoreCard.tsx`**: a brand-new student with no attempts and no
  exams gets a readiness score of 0 from `readinessScoreService.ts` — computationally identical to
  what a genuinely poor real score would look like. Added a `hasActivity` flag (computed directly
  from raw attempt/exam counts in `useProgressDashboard.ts`, not guessed from the score itself,
  since the score alone can't reliably distinguish "no data" from "real 0%") that swaps the card to
  an explanatory "not enough data yet" message instead of a bare, potentially discouraging "0".
- Reviewed spacing/typography/card consistency, disabled-state styling, safe-area handling, and
  scrolling behavior across every screen. Found these already consistently applied since M4-M9
  (every `disabled` prop in the app already pairs with a corresponding greyed-out style; every
  loading state already uses the same `ActivityIndicator` + `accessibilityLabel` pattern; every
  screen already goes through `ScreenContainer`/`SafeAreaView`) — no further changes needed beyond
  the two fixes above. Dark/light appearance: the app has one brand palette, no dark-mode variant
  exists or was requested by any prior milestone — out of scope here too (a real design decision
  for a future milestone, not an oversight).

## 4. Accessibility

- **Reduced motion** (`src/hooks/useReducedMotion.ts`, new): reads `AccessibilityInfo.
  isReduceMotionEnabled()` and stays live via `reduceMotionChanged`. Applied to the one
  continuously-looping decorative animation in the app — the body-map hotspot pulse
  (`Hotspot.tsx`) — which now never starts when Reduce Motion is on, leaving the dot itself (and
  all tap behavior) unaffected. Written as a reusable hook, not inlined into `Hotspot.tsx`, so any
  future animation adopts the same check for free.
- **Hotspot contrast + press feedback** — see §7 (body map); both are accessibility fixes as much
  as visual ones (`docs/M3_QA_REVIEW.md` #1/#15 explicitly cross-references the contrast finding
  as a WCAG 1.4.11 issue, not just cosmetic).
- **Touch targets**: re-confirmed every interactive element already meets the 44pt minimum
  (`MIN_HOTSPOT_TOUCH_TARGET`/explicit `minHeight: 44` throughout); the one real touch-target
  defect found (GI/Endocrine overlap) is fixed in §7.
- **Labels/hints**: onboarding's name field gained an explicit hint (§2); spot-checked recently
  added M7-M9 screens (Progress, Pricing, AI practice) and confirmed every `Pressable` already
  carries `accessibilityRole="button"` and a real, specific `accessibilityLabel` — this discipline
  was already being followed consistently, not newly introduced here.
- **Dynamic Type**: confirmed no component sets `allowFontScaling={false}` anywhere in the app —
  system font-size scaling is never blocked. **Known limitation**: a few fixed-width text
  containers (e.g. `DomainPerformanceRow`'s 72pt domain-label column, `docs/M3_QA_REVIEW.md` #12)
  were not individually re-engineered to reflow at the largest accessibility text sizes — flagged
  as a known, pre-existing gap rather than silently left undocumented; low risk in practice since
  the labels involved ("Domain 1"–"Domain 5") are short, fixed-format strings.
- **Contrast**: the specific, computed body-map contrast failure (§7) is fixed. A full pixel-level
  WCAG contrast audit of every other text/background pairing in the app was not re-run in this
  milestone (no simulator/renderer available in this sandbox to sample real rendered pixels the
  way `docs/M3_QA_REVIEW.md` did for the body map image) — documented here as a known limitation,
  not silently skipped. The brand palette's text colors (`ink`/`inkSoft` on `paper`/`paperRaised`)
  were chosen from the real web app's own CSS custom properties (M1), which is some evidence of
  prior real-world use, but that's not the same as a verified computed check.
- **Focus order**: React Native/VoiceOver/TalkBack traverse the view tree in render order by
  default; no screen in this app uses absolute positioning or z-index tricks that would visually
  reorder content away from that traversal order except the body map, which already marks the
  underlying illustration `accessibilityElementsHidden`/`importantForAccessibility="no-hide-
  descendants"` so only the 8 real, individually-labeled hotspots are reachable — reviewed, no
  issue found.

## 5. Offline behavior

Reviewed every feature named in this milestone's instructions. The architecture already
established since M4-M9 means most of the app has **no network dependency at all**:

| Feature | Network dependency | Offline behavior |
|---|---|---|
| QBank | None — `contentRepository` is bundled static content, `attemptsStorage` is AsyncStorage | Fully functional offline, no change needed |
| Progress/analytics | None — reads `attemptsStorage`/`examResultsStorage` only | Fully functional offline |
| Exams | None — `examSessionStorage`/`examResultsStorage` only | Fully functional offline, including mid-exam |
| Cached AI questions | None to *review* cached ones (`aiQuestionCacheStorage`, AsyncStorage) | Reviewing/answering previously generated questions works offline; *generating a new one* requires network |
| Access state | Yes, to *verify/refresh* | Falls back to the cached, last-known-good state (bounded by `accessConfig.MAX_OFFLINE_TRUST_MS`, M9) rather than revoking access on a network blip — already built and tested in M9 |
| Recommendations | None — reads `attemptsStorage`/`examResultsStorage` only | Fully functional offline |

The two features that genuinely touch the network — AI question generation (M8) and access
verification (M9) — already had full typed error handling (network/timeout/backend/malformed)
with real retry affordances before this milestone; reviewed here and confirmed still correct, no
changes needed. **No screen in this app can show a blank/confusing state from a failed network
request** — every network-touching action either has an explicit error UI already (AI generation,
access verification) or has no network dependency in the first place.

## 6. Loading / error / success states

Audited every async operation in the app (every hook that loads from storage or calls the
network). Found the codebase already consistent: every loading state uses `ActivityIndicator` +
a descriptive `accessibilityLabel`; every network call already distinguishes success/failure with
a typed result (M8/M9's `{ok:true,...} | {ok:false, error}` pattern); every failure already has a
real, specific message and — where retrying makes sense — an explicit retry action, never a
silent failure. No fake/artificial loading delays exist anywhere (every `ActivityIndicator` is
gated on a real in-flight promise, not a `setTimeout`). No changes were needed beyond the
`ReadinessScoreCard` zero-data fix (§3), which is a *messaging* fix, not a missing-state fix — the
card always rendered *something*, it just didn't distinguish "empty" from "real zero."

## 7. Body map polish

All three items this milestone named, addressed without touching `systems.json` or
`scaleBodyMapPoint` (the coordinate system itself) — matching "do not change the underlying
coordinate system unless necessary":

- **Hotspot contrast** (`docs/M3_QA_REVIEW.md` #1): the dot's ring was `colors.paperRaised`
  (white) — invisible against the illustration's white/light-gray backdrop, and the amber fill
  alone measured 1.6-2.4:1 contrast (computed from the real image pixels), under WCAG 1.4.11's
  3:1 minimum. Changed the ring to `colors.ink` (a dark outline), giving the marker's boundary
  real contrast while keeping the brand's amber fill.
- **GI/Endocrine touch-target overlap** (`docs/M3_QA_REVIEW.md` #7): at real phone widths
  (320-375pt), these two hotspots' 44×44pt touch targets are close enough to genuinely overlap
  (35.8-41.9pt center distance, computed from the real `systems.json` coordinates). Added
  `separateOverlappingTouchTargets()` (`src/constants/bodyMap.ts`, pure, tested against the real
  coordinates) — a generic algorithm (not a hardcoded "gi vs endocrine" special case) that nudges
  any pair of already-scaled points closer than 44pt apart until they clear it, splitting the
  movement evenly between them. Engages only at the narrow width range where it's actually needed;
  a no-op everywhere else, including for every other hotspot pair.
- **Selected hotspot state**: there was no press/selected feedback at all
  (`docs/M3_QA_REVIEW.md` #22). `theme/colors.ts` already documented `colors.flag` as "the web
  app's real selected/incorrect state on the body map" — reused that exact color rather than
  inventing a new one: the dot now swaps to `colors.flag` while actively pressed. (The mobile app
  navigates to the System screen immediately on tap, unlike the web app's stay-on-page panel
  reveal, so a press-duration flash is the meaningful "selected" moment on mobile, not a persisted
  post-navigation state — documented in `Hotspot.tsx`'s own comment.)

## 8. QBank polish

Reviewed question rendering, answer selection, submit behavior, rationale display, Previous/Next,
resume, and progress persistence end to end. Found one real bug (the "End of QBank" mislabeling,
§3 — which specifically affected QBank's *reused* rendering path in other contexts, not QBank
itself, but is fixed at the shared source). Everything else — locking on submit, rationale
display, resume-to-exact-position via `buildResumeState`, attempt persistence — was already
correct and already covered by M4/M5's test suite. No dead-end states found: every screen state
(loading, empty, answered, locked, last-question) has a defined, reachable next action.

## 9. Exam polish

Reviewed timer, palette, flagging, resume, review, submission, and results. Confirmed exam
progress is durably auto-saved (`examSessionStorage`) on every state change, so the actual risk
this milestone's "cannot accidentally lose an exam session" is about — **data loss** — was already
structurally prevented since M6 (force-quitting or navigating away mid-exam does not lose
progress; resuming restores the exact question/answers/remaining time). `ExamReviewScreen` already
shows a confirm-before-submit dialog that explicitly calls out the unanswered-question count.
`ExamQuestionReviewScreen` (M7.3) already lets a student page through every question read-only
after submission, including ones left unanswered. No changes were needed here beyond confirming
this end to end — a deliberate scope decision, not an oversight, to not add hardware-back-button
interception or gesture-blocking on top of an already-lossless auto-save architecture.

## 10. Progress / analytics polish

Reviewed readiness score, weak areas, recommendations, system statistics, domain statistics, and
exam history. Fixed the one real zero-data gap (`ReadinessScoreCard`, §3). Everything else already
handled zero-data states correctly and was already covered by M7 tests: `SystemPerformanceRow`/
`DomainPerformanceRow` already show "—" (not `NaN%`/`null%`) with a real accessible "no attempts
yet" label when `accuracyPct` is null; `StudyRecommendationsScreen` already shows a real, specific
"not enough practice yet" message (naming the exact threshold from `analyticsConfig`) rather than
an empty list; `ExamHistoryScreen` already shows "No exams completed yet" rather than a blank
screen.

## 11. Testing

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx jest` — **343/343 tests passing**, 28 suites. New/updated test files this milestone:
  `src/config/appEnv.test.ts` (new — environment resolution), `src/constants/bodyMap.test.ts`
  (extended — `separateOverlappingTouchTargets`, including a test against the real GI/Endocrine
  coordinates proving the fix actually clears 44pt). No regressions in the other 26 suites.
- `npx expo export --platform ios` — succeeds.
- `npx expo export --platform android` — succeeds.

## 12. Known limitations

- No live simulator/emulator in this sandbox — every fix above is a code-level, reasoned change
  (several backed by real computed numbers: contrast ratios, touch-target distances), not something
  visually confirmed by this session. `docs/REAL_DEVICE_TEST_PLAN.md` is the actual verification
  step.
- Dynamic Type: a few fixed-width labels aren't individually reflow-tested at the largest
  accessibility text sizes (§4).
- Full WCAG contrast audit beyond the specific, computed body-map fix wasn't re-run pixel-by-pixel
  across the whole app (§4) — no rendering surface available to sample from.
- No dark-mode variant exists (out of scope — a design decision for a future milestone, not
  attempted here per "do not redesign the brand").
- AI question generation and access-code verification will show real, correct error states in
  real-device testing today, since no backend is deployed yet (`API_BASE_URL` is still a
  placeholder per environment, §1) — expected, not a defect, and explicitly called out in the test
  plan so it isn't mistaken for one.

## 13. Real-device testing steps

See `docs/REAL_DEVICE_TEST_PLAN.md` for the full walkthrough. Summary: `npm install`, `npx expo
start` in `mobile/`, scan the QR code with Expo Go (iPhone: Camera app; Android: Expo Go's
built-in scanner), same Wi-Fi network (or `--tunnel` if not). No development build is required —
every dependency in the app today is Expo Go-compatible.

## 14. Recommendations for M11

- Wire real IAP (`react-native-iap` or Expo's StoreKit/Billing config-plugin path) once App Store
  Connect/Play Console product configuration exists — `docs/MOBILE_PAYMENT_ARCHITECTURE.md` §8
  already documents exactly what's needed; `AccessService`/`PricingService` need no changes,
  only the paywall's "Continue" handler does.
- Once a real backend origin exists, set `EXPO_PUBLIC_API_BASE_URL` per environment (§1) — no
  code changes needed anywhere else.
- Real-device testing (`docs/REAL_DEVICE_TEST_PLAN.md`) should happen before any App/Play Store
  submission work begins, per this milestone's own sequencing.
- If product wants a stricter reading of "session" for the AI question cache (currently durable
  across app restarts, per M8's documented choice) or wants a preview-N-questions freemium model
  before full QBank paywall, both are small, already-flagged extension points (M7/M8/M9 docs).
- Consider a lightweight component-level test harness (e.g. `@testing-library/react-native`) if
  future milestones want automated coverage of JSX/label output — today's "components/screens are
  thin and reviewed manually + via the real-device checklist" approach found a real bug this
  milestone (`QuestionEngineView`'s mislabel) that a snapshot test would have caught immediately;
  worth weighing against the project's stated minimal-dependencies preference.
