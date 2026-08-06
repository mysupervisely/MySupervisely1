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
typechecks if the navigation prop's type says so. "Continue" navigates within `HomeStack` to the
existing `Lesson` route (`systemKey`, `lessonIndex: 0`) — real params, still an M1-era stub
screen on the receiving end.

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
`ProgressStats` (see below), and Continue/Start Practice buttons — both real navigation, both
into still-stub destinations, per the instruction not to build the question engine or lesson
reader yet.

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
constraint as M1). Recommend a real Expo Go / dev-client run on your end to visually confirm
hotspot alignment against the real illustration before M4.

## Things to improve during polish (M11)

- Add `@testing-library/react-native` (or similar) for real navigation/interaction integration
  tests — deferred per the dependency-minimalism note above.
- The pulsing hotspot animation duration/easing was chosen to visually match the web app's CSS
  animation by eye, not pixel-measured from it — worth a side-by-side comparison once there's a
  simulator available.
- `TopicCard`'s 2-column `width: '48%'` grid is a reasonable phone default but hasn't been tuned
  for tablet widths (Home screen doesn't currently render more columns on a wider `HomeStack`
  view) — likely worth a responsive column count once M12's device testing is underway.
- `SystemScreen`'s domain-distribution bar has no accessible text alternative to the visual bar
  fill percentage beyond the `{pct}%` label already shown as text (this is fine, just noting it
  as the thing to re-check once VoiceOver is tested on a real device rather than reasoned about).
