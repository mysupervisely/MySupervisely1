# M3 Implementation Notes — Body Map experience

Companion to `docs/MOBILE_MIGRATION_AUDIT.md`, `docs/MOBILE_IMPLEMENTATION_PLAN.md`,
`docs/M1_IMPLEMENTATION_NOTES.md`, and `docs/M2_IMPLEMENTATION_NOTES.md`. Scope: Home screen
(greeting, real body map, real hotspots, More Topics), System screen (real detail view), and the
progress-placeholder seam. **The QBank engine was not built** — "Start Practice" navigates to
the existing M1 QBank stub, unchanged in content.

## Files created

```
mobile/src/
  components/
    bodyMap/
      BodyMapView.tsx      real image + measured-container hotspot layout
      Hotspot.tsx           single hotspot: pulsing ring + dot, native-driver animation
    TopicCard.tsx           "More Topics" card (title, lesson count, question count)
    ProgressStats.tsx       lessons/questions/accuracy row, reads SystemProgress
  constants/
    bodyMap.test.ts         hotspot-scaling tests (required by the task)
  hooks/
    useFirstName.ts         reads the persisted onboarding name
  services/
    progressRepository.ts       stub progress layer (real totals, honest zeros — see below)
    progressRepository.test.ts
  storage/
    onboardingStorage.ts    minimal, scoped-early AsyncStorage repository (see below)
  utils/
    greeting.ts              pure time-of-day greeting logic
    greeting.test.ts
```

Modified:
- `src/constants/bodyMap.ts` — corrected scaling model (see "Scaling approach" below).
- `src/screens/home/HomeScreen.tsx` — real implementation, replacing the M1 stub.
- `src/screens/home/SystemScreen.tsx` — real implementation, replacing the M1 stub.
- `src/screens/onboarding/OnboardingScreen.tsx` — now persists the name on "Get started."
- `src/services/contentRepository.ts` — added `getDomainDistribution(systemKey)`.
- `mobile/app.json` — `orientation` changed from `"portrait"` to `"default"` (see "Orientation"
  below).
- `mobile/package.json` — added `@react-native-async-storage/async-storage@2.2.0` (pinned
  against `expo/bundledNativeModules.json`, same `expo install`-is-network-blocked workaround as
  M1/M2).

`src/screens/home/LessonScreen.tsx` and `src/screens/qbank/QBankScreen.tsx` were **not**
touched — lesson-reader content is still blocked on the finding in
`docs/M2_IMPLEMENTATION_NOTES.md` (lesson body prose doesn't exist), and the QBank engine is
explicitly out of scope for M3.

## Navigation changes

No new routes. `SystemScreen`'s navigation prop is now typed as a `CompositeScreenProps`
combining `NativeStackScreenProps<HomeStackParamList, 'System'>` and
`BottomTabScreenProps<MainTabParamList>`, because "Start Practice" needs to navigate to a
sibling tab (`QBankTab`) from inside the nested `HomeStack` — React Navigation resolves an
unmatched route name by delegating up to the parent navigator at runtime, but that only
typechecks if the navigation prop's type says so. "View Lessons" navigates within `HomeStack` to
the existing `Lesson` route (`systemKey`, `lessonIndex: 0`) — real params, still an M1-era stub
screen on the receiving end. (Labeled "Continue" until this milestone's follow-up request asked
for "View Lessons" specifically — renamed for accuracy, no behavior change.)

## Hotspot implementation

`BodyMapView` measures its own container via `onLayout` (not the window/screen size — this
matters for split-screen/multi-window and for the tablet case where the body map doesn't span
the full screen width). `Hotspot` components are positioned absolutely at pre-scaled
coordinates, each a 44×44pt touchable area (see Accessibility) with a small pulsing amber ring
around a solid dot, matching the web app's `.hotspot.available` styling (amber pulse + dot,
`--flag`/teal-deep reserved for non-available states — not currently used since all 8 anatomical
systems have `available: true` today).

## Scaling approach — corrected from M1

M1's version of `src/constants/bodyMap.ts` guessed that the body image should be rendered with
`resizeMode="contain"` (letterboxed) and warned about a viewBox/image aspect-ratio mismatch.
**That guess was wrong**, caught before building on it: a direct check of the SVG markup in
`mobile-source/web-reference/index.html` shows

```html
<image x="0" y="0" width="300" height="640" preserveAspectRatio="none" .../>
```

`preserveAspectRatio="none"` means the web app does **not** letterbox the illustration — it
deliberately stretches the 808×1964 source image, non-uniformly, to exactly fill the 300×640
viewBox. The hotspot `x`/`y` coordinates in `systems.json` were authored against that stretched
rendering.

The correct (and simpler) match in React Native: render the `Image` with `resizeMode="stretch"`
inside a container whose `aspectRatio` style is locked to `300/640`
(`BODY_MAP_ASPECT_RATIO`), independent of screen width. Because the image fills that container
exactly — no letterboxing — the container's own measured width from `onLayout` is sufficient:
`scaleBodyMapPoint()` just multiplies by `containerWidth/300` and `containerHeight/640`. No
hardcoded pixel values anywhere; every hotspot recomputes from the real measured width, so it
scales correctly on any phone width and on tablets (see `bodyMap.test.ts`'s proportionality
test, which checks a 1x and a 3x container produce exactly proportional output, and a real-data
test that scales all 8 real coordinates against a plausible phone width and asserts they land
inside the container bounds).

## Home screen

- Greeting: `buildGreeting(now, firstName)` — time-of-day salutation (`Good morning` /
  `Good afternoon` / `Good evening`, pure function, unit tested) plus the stored first name when
  available, falling back to a plain salutation otherwise. Matches the task's worked example
  ("Good morning, Kirollos") for whoever actually types that name into onboarding, without
  hardcoding it.
- Logo: `logo_mark.png` (the compact icon mark, not the full lockup — appropriate at header
  size) next to the greeting.
- Body Map: `BodyMapView` fed `contentRepository.getAnatomicalSystems()` — the real 8: cardio,
  neuro, respiratory (Pulmonary), gi, endocrine, renal, uro (Urology), rheum (Rheumatology).
  **This is a correction against the task's own example list**, which named "Infectious Disease
  & Immunology" and "Hematology & Oncology" as anatomical hotspots — per the real coordinate
  data in `systems.json` (and re-verified here), those two systems do **not** carry `x`/`y` and
  render in More Topics instead; Urology and Rheumatology are the two the task's example list
  omitted. The task itself says "use the actual systems represented in the coordinate data" as
  the governing instruction, so that's what's implemented — flagging the discrepancy explicitly
  rather than silently reconciling it, per Phase 13's documentation rule.
- More Topics: `contentRepository.getNonAnatomicalSystems()` (18 real systems + the synthesized
  `drug-class-study-guide` bucket = 19 cards) rendered via `TopicCard`, each showing real
  lesson/question counts from the repository. Same `openSystem()` handler as hotspots — identical
  navigation contract, as required.

## System screen

Real `system.label`/`description`, real lesson count, real question count, a NAPLEX domain
distribution bar (`contentRepository.getDomainDistribution`, only rendered when the system has
any classified questions — true for all 27 today, but coded defensively per "if available"),
`ProgressStats` (see below), and View Lessons/Start Practice buttons — both real navigation, both
into still-stub destinations, per the instruction not to build the question engine or lesson
reader yet.

## UI decisions

- **Brand tokens only, no new colors introduced.** Every color used in M3 components
  (`Hotspot`, `TopicCard`, `ProgressStats`, the domain-distribution bar) comes from
  `src/theme/colors.ts` — no one-off hex values in a screen or component's `StyleSheet`.
- **Card styling is one shared pattern**, not per-component: `TopicCard` and `ProgressStats`
  both use `colors.paperRaised` background + `colors.line` hairline border + `radius.md` — the
  same "raised card" language used across the app, not two different conventions.
- **Amber, not teal, for hotspots.** `colors.amber` was chosen for the pulsing marker to match
  the web app's `.hotspot.available` styling exactly (audit §J/§F) rather than reusing the
  primary teal accent, so hotspots read as a distinct "tap target" layer from primary actions
  (buttons, the domain bar fill) elsewhere on screen.
- **Time-of-day greeting over a static one.** `buildGreeting()` picks morning/afternoon/evening
  by the device clock rather than a fixed "Good morning" regardless of when the app is opened —
  a small, low-cost decision that reads as more considered/production-quality than a hardcoded
  string, and was easy to make fully unit-testable as a pure function.
- **`accuracyPct: null` renders as `—`, not `0%`.** A deliberate choice in `ProgressStats` to
  keep "no attempts yet" visually and semantically distinct from "attempted, and got everything
  wrong" — the two are different facts and collapsing them to the same `0%` would be misleading
  once real data exists.
- **Domain distribution as a bar, not a pie/donut.** A horizontal bar per domain was chosen over
  a single stacked/pie chart because the task calls the domains out as discrete, comparable
  quantities ("Domain 1: 56, Domain 2: 56, ..."), and 5 individually-labeled bars read faster at
  a glance than a 5-slice pie at this screen's size — no chart library was added for this
  (Phase 13), it's a plain `View` width percentage.

## Progress placeholders

`src/services/progressRepository.ts` is an explicit stub: `lessonsTotal`/`questionsTotal` are
real numbers computed from the content repository (not placeholders), while
`lessonsCompleted`/`questionsAnswered`/`accuracyPct` are honestly `0`/`0`/`null` because no
attempt-tracking storage exists yet (that's M6/M8). The function signature is what M6 needs to
preserve — it should replace the body with real storage reads without any screen-side changes.
`ProgressStats` renders `accuracyPct: null` as `—` rather than `0%`, since "no attempts yet" and
"attempted and got 0% right" are different facts worth keeping distinct in the UI.

## Onboarding name persistence — scoped early, documented as a boundary exception

The task's Home screen greeting requirement ("use the stored first name when available") can't
be real without *some* persistence existing before M6. `src/storage/onboardingStorage.ts` is a
minimal, single-field AsyncStorage repository — not the M6 storage layer. It has no schema
version and no migration runner, on purpose: M6 should absorb this one field into its real
versioned schema rather than this file growing into a second, competing storage layer. Kept as a
dedicated file (not an inline `AsyncStorage.getItem` in `OnboardingScreen`/`HomeScreen`) so
Phase 9's "don't scatter AsyncStorage calls" rule still holds even for this one early field.

## Accessibility decisions

- Every hotspot and topic card: `accessibilityRole="button"` + a descriptive
  `accessibilityLabel` (e.g. `"Cardiovascular — open lessons and practice questions"`,
  `"Dermatology — 4 lessons, 47 questions"`) rather than relying on visible text alone (hotspots
  have none).
- **44×44pt minimum touch targets**: hotspots' visible dot is ~14px, but the `Pressable`'s
  touch area is a fixed 44×44 box centered on the coordinate (`hitSlop` fills the remainder for
  the dot's own bounds too) — this is a hard constant (`MIN_TOUCH_TARGET`), not tied to the
  dot's rendered size.
- Section headings (`Body Map`, `More Topics`, system title) use `accessibilityRole="header"`
  for correct screen-reader navigation/rotor support.
- The body map's illustration image itself is marked `accessibilityElementsHidden` +
  `importantForAccessibility="no-hide-descendants"` — it's decorative background art; the real
  accessible content is each hotspot's own label, not a description of the artwork.
- No `allowFontScaling={false}` anywhere, and no fixed-height text containers that would clip at
  larger Dynamic Type / font-scale settings — `ProgressStats`, `TopicCard`, and `SystemScreen`'s
  layout all use flexible (`minHeight`, `gap`) rather than fixed-height rows.
- `ProgressStats`' three stat cells are individually `accessible` with a combined
  `accessibilityLabel` (e.g. "3 of 5 lessons completed") rather than exposing the value and
  label as two separate, disconnected reads.

## Performance decisions

- `Hotspot` is `React.memo`'d; its pulse animation runs entirely on the native driver
  (`useNativeDriver: true`, opacity + transform only) so 8 concurrently-animating hotspots incur
  no JS-thread or React re-render cost once mounted.
- `BodyMapView`'s hotspot pixel positions are computed in a `useMemo` keyed on
  `[systems, containerWidth, containerHeight]` — recomputed only when the real inputs change
  (e.g. rotation/resize), not on every parent re-render (e.g. the greeting re-fetching the
  stored name after mount).
- `HomeScreen`'s `anatomicalSystems`/`nonAnatomicalSystems` arrays are memoized with an empty
  dependency array — `contentRepository`'s underlying data never changes at runtime, so these
  never need to recompute after first render.
- `TopicCard` is `React.memo`'d — with 19 cards in "More Topics," this avoids reconciling all of
  them when only the greeting/body-map section re-renders.
- No repeated content parsing: everything still goes through `contentRepository`'s
  module-load-time indices (M2) — confirmed no screen or component calls
  `JSON.parse`/`require()`s a content JSON file directly.

## Orientation / tablet support

`app.json`'s `orientation` was changed from the M1 default of `"portrait"` to `"default"` (i.e.
unlocked), since a hard portrait lock would make "orientation changes" and "tablet support"
untestable by construction. `BodyMapView`'s layout is driven entirely by `onLayout`'s measured
width (not a hardcoded phone width), so it re-derives hotspot positions correctly on rotation or
on a wider tablet viewport without any orientation-specific code path. `ios.supportsTablet: true`
was already set in M1.

## Testing performed

- **TypeScript**: `npm run typecheck` — clean.
- **ESLint**: `npm run lint` — clean.
- **Expo export**: `npx expo export --platform android` and `--platform ios` — both bundle
  successfully. Bundle size grew from ~1.9MB (M1/M2, content unused) to ~4.8MB, because
  `HomeScreen`/`SystemScreen` now actually import `contentRepository`, which pulls in the full
  2,000-question QBank + 3 exams — expected and correct for Phase 7's offline-first requirement
  (the QBank engine, when M5 builds it, needs this data already on-device). Confirmed via
  `--dump-assetmap` that the real brand assets (`body_map_diagram.png`, `logo_mark.png`,
  `logo_full_lockup.png`) are bundled.
- **Hotspot scaling**: `src/constants/bodyMap.test.ts` — proportionality across different
  container sizes, exact origin/corner mapping, and all 8 real coordinates landing within bounds
  at a real phone width.
- **Navigation**: verified statically via TypeScript's typed route params/composite navigation
  types (an invalid route name or missing param is a compile error, not a runtime crash) and by
  code review of every `navigate()` call. **Not** verified with an automated navigation
  integration test — that would need `@testing-library/react-native`, a new dependency not
  added here to stay within Phase 13's "no unnecessary dependencies" rule for a milestone this
  early; flagged below as a polish-phase candidate.
- **Orientation changes**: verified by construction (layout is `onLayout`-driven, no hardcoded
  dimensions) rather than on a physical device/simulator — this sandboxed environment has
  neither, same limitation noted in `docs/M1_IMPLEMENTATION_NOTES.md`.
- **Full suite**: `npm test` — 37/37 passing (5 suites: content stats, content validation,
  hotspot scaling, greeting logic, progress-repository stub).

## Screenshots

Not available — this environment has no iOS/Android simulator or device to render against (same
constraint as M1). Confirmed instead: `npx expo export` builds cleanly for both platforms
(real assets bundled, verified via `--dump-assetmap`), and the real Metro dev server was started
and its live bundle fetched over HTTP (200 OK, containing the real compiled app code) — the
project **builds and its bundle loads successfully**; only the visual render is unverified. Full
writeup, exact local capture commands, and a per-screen shot list live in
`docs/demo/README.md` and `docs/screenshots/M3/README.md`.

## Known limitations

- **No simulator/device in this environment** — see "Screenshots" above; nothing rendered here
  has been visually confirmed by a human or a screenshot, only by static analysis, unit tests,
  and a live bundle fetch.
- **Hotspot color contrast measures below WCAG minimums.** Directly sampling
  `body_map_diagram.png`'s real pixels at all 8 real hotspot coordinates and computing contrast
  against the amber (`colors.amber`) marker gives 1.62–2.40:1 at every single one — below the
  3:1 non-text/UI-component minimum. See `docs/M3_QA_REVIEW.md` finding #1 for the full
  per-system table.
- **Two hotspots' touch targets can overlap.** Computed from the real `systems.json`
  coordinates: GI and Endocrine's 44×44pt touch targets are only 35.8pt apart at iPhone SE width
  and 41.9pt apart at standard iPhone width — both under the 44pt minimum needed to stay
  non-overlapping. See `docs/M3_QA_REVIEW.md` finding #7.
- **Hotspots have no "selected/active" visual state.** A tap navigates away immediately with no
  visual acknowledgment first; the web app has one (`.hotspot.selected`, using `colors.flag`)
  that wasn't ported. Surfaced while mapping the screenshot walkthrough's "hotspot highlighted"
  shot to the actual code — see `docs/screenshots/M3/README.md`.
- **"Start Practice" drops system context.** It navigates to the generic `QBankTab` stub with no
  way to indicate which system the user came from, since that screen doesn't accept a filter
  parameter yet (M1 stub, unchanged in M3). See `docs/M3_QA_REVIEW.md` finding #20.
- **Lesson body content still doesn't exist.** Re-confirmed in M2, unchanged in M3 — `Lesson`
  has no `body` field, and `LessonScreen` remains the M1 stub. This blocks a real lesson reader
  until real long-form content is provided.
- **All tracked progress is `0`/`null`.** `progressRepository` is an intentional stub (see
  above) — no attempt/completion data exists until M6.
- **Onboarding lacks `KeyboardAvoidingView`**, so the keyboard can cover the "Get started" button
  on small devices while the name field is focused; the keyboard's "done" key also isn't wired
  to submit. See `docs/M3_QA_REVIEW.md` findings #17–18.
- 24 further, lower-priority findings (spacing/typography/alignment/animation) are catalogued in
  full in `docs/M3_QA_REVIEW.md` and not repeated here.

## Recommendations for M4

Per `docs/MOBILE_IMPLEMENTATION_PLAN.md`, M4 is the lesson reader. Before starting it:

1. **Get a product decision on lesson-body content** (again — this has now been flagged in M2
   and M3). `LessonScreen` can't become a real reader without real long-form lesson prose, which
   doesn't exist in any provided material. If it's not coming, M4 should be explicitly re-scoped
   to "real lesson list + completion tracking, linking into practice" rather than a reader, so
   the milestone isn't blocked indefinitely on content that may never arrive.
2. **Consider fixing the two computed, evidence-backed defects before adding more UI on top of
   the Body Map**: the hotspot contrast failure and the GI/Endocrine touch-target overlap (both
   above) are real usability defects on the app's signature screen, not stylistic nitpicks — cheap
   to fix now, more disruptive to fix later once more screens depend on the same `Hotspot`
   component and coordinate data.
3. **Add a hotspot "selected" state** before recording any real demo video/screenshots — it
   makes the body map's core interaction legible in a still image or slow walkthrough, not just
   in live use.
4. **Decide whether `QBankScreen` should accept a system-filter param now** (a small, additive
   navigation-types change) so "Start Practice" can stop silently dropping context ahead of M5's
   real QBank engine, rather than that gap surfacing again as a bigger rework once M5 is
   underway.
5. Everything else in `docs/M3_QA_REVIEW.md`'s 26-finding list remains valid and is reasonable
   to defer to M11 polish, per that document's own prioritization.
