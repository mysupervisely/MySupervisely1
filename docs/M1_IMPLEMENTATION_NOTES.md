# M1 Implementation Notes — Project setup, navigation, theme

Companion to `docs/MOBILE_MIGRATION_AUDIT.md` and `docs/MOBILE_IMPLEMENTATION_PLAN.md`. Scope
was strictly M1 per the approval: Expo project setup, TypeScript configuration, typed
navigation, brand/theme system, screen stubs, folder structure, dev configuration. No QBank, no
question import, no exams, no payments, no AI, no backend changes — confirmed below.

## Where it lives

`mobile/` at the repo root, alongside the existing web app (untouched — see "Web app
verification" below). Built on branch `claude/pharmdprepped-react-native-vao3jr`.

## Files created

```
mobile/
  App.tsx                              root: font loading, splash-screen handoff, nav mount
  app.json                             Expo config — real branding, no placeholder assets
  eslint.config.js                     hand-written flat config (see "Dev config" below)
  index.ts                             (from create-expo-app, unmodified)
  tsconfig.json                        (from create-expo-app, unmodified — extends expo/tsconfig.base, strict: true)
  package.json                         renamed to pharmdprepped-mobile, +typecheck/+lint scripts
  AGENTS.md                            rewritten: mobile-specific project map for future sessions
  CLAUDE.md                            (from create-expo-app, unmodified — `@AGENTS.md`)
  assets/brand/
    logo_mark.png                      real asset, copied from mobile-source/content-export
    logo_full_lockup.png               real asset, copied from mobile-source/content-export
    body_map_diagram.png               real asset, copied from mobile-source/content-export
  src/
    theme/
      colors.ts                        brand color tokens
      typography.ts                    font family map + named type scale
      spacing.ts                       spacing/radius scale
      fonts.ts                         useFonts() input map
      index.ts                         barrel export
    navigation/
      types.ts                         RootStackParamList / MainTabParamList / HomeStackParamList
      RootNavigator.tsx                Onboarding -> Main
      MainTabNavigator.tsx             bottom tabs: Home / QBank / Exam / Progress / Pricing
      HomeStackNavigator.tsx           Home -> System -> Lesson
    components/
      ScreenContainer.tsx              shared safe-area + paper-background + padding shell
      ScreenTitle.tsx                  shared eyebrow + h1 header
      PlaceholderNotice.tsx            shared "coming in M#" banner used by every stub screen
    screens/
      onboarding/OnboardingScreen.tsx  real logo, name field (UI-only, not persisted)
      home/HomeScreen.tsx              real body-map image, static (no hotspots yet)
      home/SystemScreen.tsx            stub, typed systemKey param
      home/LessonScreen.tsx            stub, typed systemKey+lessonIndex params
      qbank/QBankScreen.tsx            stub
      exam/ExamScreen.tsx              stub
      progress/ProgressScreen.tsx      stub
      pricing/PricingScreen.tsx        stub
    constants/
      bodyMap.ts                       body-map coordinate system, documented, no data import
    api/README.md                      what M9/M10 will put here
    content/README.md                  what M2 will put here
    models/README.md                   what M2+ will put here
    storage/README.md                  what M6 will put here
    services/README.md                 what M2+ will put here
    utils/README.md                    empty, no premature helpers
    hooks/README.md                    empty, no premature hooks
```

Removed: the create-expo-app template's default `LICENSE` (Expo's own template license — not
applicable to this project) and its placeholder icon/splash/favicon PNGs under `assets/`
(superseded by the real brand assets, per the instruction not to use placeholder branding where
real assets exist).

## Dependencies added

Resolved against `node_modules/expo/bundledNativeModules.json` (Expo SDK 57's pinned native
module versions) rather than `npx expo install`, because that command calls `api.expo.dev` for
its compatibility check, which this environment's egress policy blocks (confirmed via
`$HTTPS_PROXY/__agentproxy/status` — `reactnative.directory` and `api.expo.dev` both 403;
`registry.npmjs.org` is allow-listed and unaffected). Versions below are the exact ones that
`expo install` would have selected for SDK 57 had it been reachable.

**Runtime:**
- `react-native-screens@~4.26.0`, `react-native-safe-area-context@~5.7.0` — required by React
  Navigation's native stack.
- `@react-navigation/native@^7`, `@react-navigation/native-stack@^7`, `@react-navigation/bottom-tabs@^7`
  — typed navigation (Phase 3 requirement).
- `expo-font@~57.0.1`, `expo-splash-screen@~57.0.5` — brand font loading + splash handoff.
- `@expo-google-fonts/space-grotesk`, `@expo-google-fonts/source-serif-4`,
  `@expo-google-fonts/ibm-plex-mono` — the exact three families the web app loads (audit §J),
  at the weights it uses (400/500/600/700 display, 400/500/600 body, 400/500/600 mono).

**Dev:**
- `eslint@^9`, `eslint-config-expo` — see "Dev config" below.

No icon library, no state-management library, no HTTP client, no AsyncStorage, no navigation
beyond what's needed to satisfy the 8 required routes — kept deliberately minimal per Phase 13
("no unnecessary dependencies").

## Navigation architecture

```
RootStack (native-stack, headers hidden)
  Onboarding                    initial route
  Main (bottom-tabs)
    HomeTab -> HomeStack (native-stack, headers shown, brand-styled)
      Home        (Body Map)
      System      (params: { systemKey: string })
      Lesson      (params: { systemKey: string; lessonIndex: number })
    QBankTab
    ExamTab
    ProgressTab
    PricingTab
```

Fully typed via `NavigatorScreenParams` composition in `src/navigation/types.ts`, plus the
standard React Navigation global `ReactNavigation.RootParamList` declaration merge so
`useNavigation()`/`navigation.navigate()` are typed everywhere without importing the param list
by hand at each call site.

**Decision — AI-generated practice has no dedicated tab.** Phase 6 lists it as something "the
app should also provide access to," alongside QBank/Exams/Progress/Pricing. The audit (§I) frames
it as an entry point reached from inside QBank/lesson practice (matching how the web app surfaces
it — per-topic "generate a question" buttons, not a standalone nav destination), not a top-level
section on its own. Five tabs (Home/QBank/Exam/Progress/Pricing) plus an AI entry point nested
inside QBank in M9 matches both the web app's actual structure and Phase 6's flow diagram
(Practice Questions -> Rationales sits inside the QBank path). Revisit in M9 if this reads wrong
once the real QBank screen exists.

**Decision — System/Lesson route params are typed now even though M1 doesn't consume them.**
`{ systemKey: string }` and `{ systemKey: string; lessonIndex: number }` are real, typed params
today (not `undefined`), so M2/M3/M4 can wire real data through the existing screens without
changing the navigation contract. `systemKey` is `string` rather than a real union of the 26
system keys because narrowing it requires the content layer (M2) — noted as a follow-up below.

## Theme architecture

`src/theme/{colors,typography,spacing,fonts}.ts` + a barrel `index.ts`. Colors and font families
are the exact tokens found in `mobile-source/web-reference/index.html`'s `:root` CSS variables,
cross-checked against `docs/MOBILE_MIGRATION_AUDIT.md` §J — including `--flag: #AE3B45`, which
isn't in the original task brief's color list but is a real, used part of the brand system (the
web app's danger/incorrect/selected-state red). Documented inline in `colors.ts` so a future
reader isn't left wondering where it came from.

Type scale is named (`display`, `h1`, `h2`, `h3`, `body`, `bodyMedium`, `caption`, `mono`,
`monoLabel`) rather than components picking raw font sizes, so a later type-scale adjustment is
a one-file change.

Fonts load via `expo-font`'s `useFonts` in `App.tsx`, gating `NavigationContainer` mount and
holding the native splash screen (`expo-splash-screen`) until fonts resolve — the standard Expo
pattern, not a custom one.

## Other decisions made

- **`mobile/` is a sibling to the existing web app at the repo root**, not nested inside it and
  not replacing anything — `src/`, `netlify/`, `package.json`, etc. at the repo root are the web
  app's and were not touched (verified below). This was the only placement that didn't collide
  with the web app's existing root-level `package.json`/`tsconfig.json`/`src/`.
- **Body-map coordinate system is documented, not implemented.** `src/constants/bodyMap.ts`
  captures the 300x640 viewBox, the real 808x1964 image's natural size, the 8 anatomical system
  keys, and a `scaleBodyMapPoint()` stub with a written warning about the viewBox/image
  aspect-ratio mismatch (300/640 ≈ 0.469 vs 808/1964 ≈ 0.411) that M3 needs to handle correctly
  (naive independent x/y scaling only works if the image is rendered at its own aspect ratio,
  e.g. via `resizeMode: 'contain'`). No system data (labels, descriptions, lessons) is imported
  — that's content, reserved for M2.
- **HomeScreen renders the real body-map PNG statically**, full-bleed inside a card, with no
  touchable hotspots — satisfies "use the real asset, not a placeholder" without building the
  interactive map early.
- **Onboarding's name field does not persist.** Persistence is explicitly M6 scope; building it
  now would mean either a throwaway one-off storage call (contradicts "no scattered
  AsyncStorage calls," Phase 9) or building the storage layer early (out of M1 scope). The field
  exists so the screen isn't empty and the visual flow is real, but a restart of the app loses
  it today — expected, and called out again below for M2/M6 visibility.
- **No icon package added.** Bottom tabs are label-only for M1. `@expo/vector-icons` ships with
  Expo but wasn't already installed, and adding it purely for tab-bar polish felt like scope
  creep for a stub milestone — flagged as an easy addition whenever tab icons are actually
  designed.
- **App identity**: `app.json` name changed from the scaffold default `"mobile"` to
  `"PharmDPrepped"`, slug to `"pharmdprepped-mobile"`, icon/adaptive-icon/favicon all point at
  the real `logo_mark.png`, and an `expo-splash-screen` config plugin entry uses the same mark on
  the brand's paper (`#F2F4F3`) background. Note: Expo Go (if used for day-to-day dev) always
  shows Expo's own icon/splash regardless of this config — custom icon/splash only appears in a
  dev client or standalone build. Not a bug, just how Expo Go works; will look correct starting
  at M12 (device/build testing) or sooner if a custom dev client is built earlier.

## Dev configuration

- **ESLint**: `npx expo lint`'s auto-configure step also calls `api.expo.dev` and is blocked the
  same way `expo install` is (see above). Installed `eslint` + `eslint-config-expo` directly via
  npm and hand-wrote `eslint.config.js` importing `eslint-config-expo/flat` — functionally
  identical to what `expo lint` would have generated. `npm run lint` is clean (0 errors).
- **TypeScript**: unmodified `expo/tsconfig.base` + `strict: true` (the create-expo-app
  default). `npm run typecheck` is clean (0 errors).
- Added `typecheck` and `lint` npm scripts (the scaffold only had `start`/`android`/`ios`/`web`).

## Web app verification

`git status` confirms every changed/new path is under `mobile/`, `mobile-source/`, or `docs/` —
nothing at the repo root (`src/`, `netlify/`, `package.json`, `styles.css`, etc., all belonging
to the existing PharmDPrepped-unrelated MySupervisely web app) was touched.

## Verification performed

- `npm run typecheck` (`tsc --noEmit`) — 0 errors.
- `npm run lint` (`eslint .`) — 0 errors, 0 warnings.
- `npx expo config --json` — resolves cleanly, including the `expo-splash-screen` plugin config.
- `npx expo-doctor --verbose` — **18/20 checks pass.** The 2 failures
  (`Check Expo config schema` and `Validate packages against React Native Directory package
  metadata`) both require reaching hosts this environment's egress policy blocks
  (schema-validation service and `reactnative.directory`), confirmed via the same
  `$HTTPS_PROXY/__agentproxy/status` denial log used to diagnose the `expo install`/`expo lint`
  issue above — not indicative of a real project problem. Every check resolvable without network
  access passed, including "Check that packages match versions required by installed Expo SDK,"
  which validates the manually-pinned dependency versions above.
- `npx expo export --platform android` and `--platform ios` — both bundle successfully (916
  modules, Hermes bytecode output, all fonts/images/screens/navigators included) with no
  bundler errors. This is the strongest confirmation available in this sandboxed environment
  that the app actually builds and would launch; there's no simulator/device here to boot it on
  screen. **Recommend a real Expo Go / dev-client smoke test on your end before M2** to catch
  anything a static bundle check can't (e.g. runtime-only issues).

## Things to address in M2

1. **Narrow `systemKey` from `string` to a real union type** once the content layer exists
   (`src/navigation/types.ts` has a comment marking this).
2. **Resolve the `topicLabel` → system-key mapping table** during content import (audit §C) —
   the `Infectious Disease` / `id` mismatch and the orphan `Drug Class Study Guide` topic need
   handling before `SystemScreen`/`LessonScreen` can consume real data.
3. **Assign stable synthetic IDs** to QBank/exam questions on import (audit §L) — neither source
   JSON file has one.
4. Once `contentRepository` exists, `HomeScreen`'s body-map card and `SystemScreen` can start
   reading real system data, though the interactive hotspot rendering itself is M3, not M2.

## Not implemented (confirmed out of scope, per explicit instruction)

QBank content/engine, the 2,000 imported questions, exam engine/content, payments/IAP, AI
question integration, and any changes to `mobile-source/web-reference`'s Netlify functions —
none of these were touched. `mobile-source/` was only read from, never modified.
