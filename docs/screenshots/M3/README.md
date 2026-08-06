# M3 Screenshot Walkthrough — no simulator available, documented per the fallback procedure

**No PNG files exist in this directory.** Per the instruction not to fabricate screenshots when
no simulator is available, none were created — this file is the documented-limitation
deliverable in the exact structure/naming you asked for, so that once real screenshots exist
they can drop in at these same 10 paths without anything else changing.

## Why screenshots cannot be generated here

Re-verified fresh for this request (same result as `docs/demo/README.md`, checked again rather
than assumed): this session runs in a headless Linux container with no macOS/Xcode
(`xcrun`/`simctl` don't exist — Apple doesn't ship iOS Simulator for Linux at all), no Android
SDK (`ANDROID_HOME`/`ANDROID_SDK_ROOT` unset, no `emulator`/`adb` binaries), no `/dev/kvm` (so
even an installed Android emulator couldn't run at usable speed), no attached physical device,
and no display server. There is no screen anywhere in this environment for the app to render
onto, or to capture a screenshot of. This isn't a missing-tool problem installable via `apt`/`npm`
— it's the absence of Apple's toolchain and of virtualization hardware, neither of which can be
added inside this container.

## The app builds and launches — confirmed fresh for this request

- `npx expo export --platform ios` and `--platform android` — both succeed: Hermes bytecode
  bundles (~4.9MB iOS, ~4.8MB Android), zero bundler errors, real brand assets present (`--dump-assetmap`
  confirms `body_map_diagram.png`, `logo_mark.png`, `logo_full_lockup.png`).
- `npm run typecheck`, `npm run lint`, `npm test` — all clean (37/37 tests passing).
- In the prior turn, the real Metro dev server was started and its bundle fetched live over HTTP
  (200 OK, 8.18MB, verified to contain the real compiled app code) — the strongest confirmation
  obtainable in this environment that the app actually runs, short of a screen to look at it on.

**What this confirms**: the JS bundle is valid and loadable on a real device or simulator.
**What it cannot confirm**: what the screens visually look like when rendered — that requires an
environment with a simulator.

## Exact commands to capture these 10 screenshots locally

```bash
cd mobile
npm install
npx expo start
```

**iOS Simulator** (press "i" in the terminal, or `npx expo run:ios`): once the app is running,
`Cmd+S` in the Simulator window saves a screenshot to the Desktop, or use:
```bash
xcrun simctl io booted screenshot docs/screenshots/M3/03_home.png
```
(swap the filename per the shot list below; repeat for each screen).

**Android Emulator** (press "a" in the terminal, or `npx expo run:android`): use the camera icon
in the emulator's toolbar, or:
```bash
adb exec-out screencap -p > docs/screenshots/M3/10_android.png
```

**Tablet layout**: run the iOS Simulator with an iPad device selected (`xcrun simctl list
devices` to see available iPad runtimes, or pick one from Xcode's device menu) for a tablet
screenshot.

## The 10 shots, what each is meant to show, and what to check for once captured

Every "known issue to check for" below comes from `docs/M3_QA_REVIEW.md`'s 26-finding audit —
several computed directly from real data (contrast ratios, touch-target distances), not
guessed — mapped here to the specific screen where each would actually be visible.

| # | Filename | Intended caption | Known/predicted visual issues to verify once captured |
|---|---|---|---|
| 1 | `01_splash.png` | App launch splash: the PharmDPrepped mark centered on the brand's paper background (`#F2F4F3`), via the `expo-splash-screen` config plugin. | **Only visible in a dev client or standalone build** — Expo Go always shows its own splash regardless of `app.json`'s config (a known Expo Go limitation, documented in `docs/M1_IMPLEMENTATION_NOTES.md`). Use `npx expo run:ios`/`run:android`, not plain Expo Go, to actually see this screen. |
| 2 | `02_onboarding.png` | Name-entry screen: full logo lockup on dark ink background, tagline, name field, "Get started" CTA. | Check whether the keyboard covers the CTA button when the name field is focused (QA finding #17 — no `KeyboardAvoidingView`); confirm the "done" keyboard key doesn't submit (finding #18, `onSubmitEditing` isn't wired). |
| 3 | `03_home.png` | Home screen: greeting header with logo, "Body Map" section, top of "More Topics" grid. | Check greeting wrap behavior with a long typed name (finding #11); check whether the asymmetric section-header pattern (Body Map has a subtitle, More Topics doesn't) reads oddly side by side (finding #14). |
| 4 | `04_body_map.png` | Full Body Map: the real illustration stretched to its native 300:640 aspect ratio, all 8 pulsing amber hotspots visible. | **Priority check**: hotspot visibility against the artwork — computed contrast at all 8 real coordinates measured 1.62–2.40:1 against the actual sampled backdrop pixels, below the 3:1 WCAG minimum (finding #1). This is the one most worth a human eye confirming or refuting the computed math. |
| 5 | `05_hotspot_selected.png` | A hotspot mid-tap/highlighted. | **Cannot actually be captured as specified — flagging why rather than approximating it.** The current `Hotspot` component has no "selected/active" visual state at all (verified: no `selected`/`active` logic anywhere in `Hotspot.tsx` or `BodyMapView.tsx`) — a tap fires navigation immediately with no visual acknowledgment first. The web app has exactly this state (`.hotspot.selected`, using the brand's `flag` red) that was never ported. Recommend adding a brief selected/pressed visual (e.g. dot scale-up or the `flag` color) before this specific shot can mean anything — until then, the best available substitute is a screen recording capturing the tap gesture in motion (see `docs/demo/README.md`). |
| 6 | `06_system_screen.png` | System detail: title, description, lesson/question counts, NAPLEX domain-distribution bars, progress stats, Continue/Start Practice buttons. | Check domain-label column truncation at larger Dynamic Type sizes (finding #12, fixed 72pt width); check whether `ProgressStats`' centered numbers vs. the domain rows' right-aligned percentages read as inconsistent side by side (finding #6). |
| 7 | `07_more_topics.png` | The "More Topics" grid — 19 cards (18 real systems + the synthesized Drug Class Study Guide bucket). | Check the dangling single card in the last row (odd count, finding #4) and whether the 2-column grid looks appropriately dense vs. sparse at the capture device's width. |
| 8 | `08_navigation.png` | A navigation transition (e.g. Home → System, or the back transition to Home). | A single static frame can only show one moment of a transition — consider this one as a stand-in for a short clip; the full interaction is better captured in the video walkthrough (`docs/demo/README.md`). Check for "Start Practice" losing system context on arrival at the QBank tab (finding #20) and whether "Continue" always opening lesson 1 regardless of prior state reads as expected for this stage (finding #21, expected until M6/M7). |
| 9 | `09_iphone.png` | Home or Body Map on a standard iPhone simulator width (e.g. iPhone 15, 393pt). | **Priority check**: the GI/Endocrine hotspot touch-target overlap is computed to occur specifically at standard iPhone width (375–393pt: ~42pt center distance vs. the 44pt minimum, finding #7) — this is the shot most likely to visually confirm or refute that computed risk. |
| 10 | `10_android.png` | Home or Body Map on an Android emulator. | No platform-specific styling branches exist in the code today, so this should look nearly identical to the iPhone shot — worth confirming that's actually true (e.g. status bar, safe-area insets, font rendering) rather than assuming parity. |

## UI polish recommendations before M4

Pulled from `docs/M3_QA_REVIEW.md` and prioritized for what's most worth fixing before building
more screens on top of this foundation, rather than repeating the full 26-item list here:

1. **Hotspot marker contrast** (finding #1) — darken the marker color or add a stronger outline;
   currently measures below WCAG minimums at all 8 real positions.
2. **GI/Endocrine touch-target overlap** (finding #7) — the two closest hotspots' 44pt targets
   overlap at common phone widths; needs either adjusted coordinates or a resolved touch-priority
   rule.
3. **No hotspot "selected" state** (finding #5 above / new) — the web app has one, the RN port
   doesn't; worth adding before it's forgotten, since it also makes hotspot taps feel
   unacknowledged in the meantime a screen recording is watched.
4. **Onboarding `KeyboardAvoidingView` + `onSubmitEditing`** (findings #17, #18) — a real
   usability gap, cheap to fix.
5. **Inconsistent press feedback** (finding #22) — `TopicCard` fades on press, `Hotspot` and the
   `SystemScreen` buttons don't; worth picking one convention and applying it everywhere.

Everything else in the 26-finding list is real but lower-priority — see
`docs/M3_QA_REVIEW.md` for the full set.
