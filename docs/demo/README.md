# M3 Demo — recording unavailable in this environment, here's why and how to get one

No `docs/demo/M3_demo.mp4` or `.gif` was created. Per the instruction not to fabricate a
recording when no simulator is available, here is exactly why, what was verified instead, and
the exact commands to produce the real thing.

## Why no simulator/recording is available here

This session runs in a **remote, sandboxed Linux container** (`uname -a` →
`Linux ... x86_64 GNU/Linux`), not a developer workstation. Checked directly, all negative:

| Requirement | Status here |
|---|---|
| iOS Simulator (`xcrun simctl`) | **Unavailable** — requires macOS + Xcode; this is Linux, and Apple doesn't ship an iOS Simulator for Linux at all |
| Android Emulator (`emulator`, `adb`) | **Not installed** — `ANDROID_HOME`/`ANDROID_SDK_ROOT` are unset, no Android SDK, no `emulator`/`adb` binaries on `PATH` |
| Hardware acceleration for Android (`/dev/kvm`) | **Absent** — even if the SDK were installed, there's no KVM device node, so the emulator couldn't run at usable speed |
| Physical device | None attached |
| Screen/display | No `DISPLAY`, no windowing system — this is a headless container |

None of these can be worked around by installing packages — the fundamental blocker is that
this container has no GPU-backed virtualization and no Apple toolchain, which iOS Simulator and
Android Emulator both require.

## What was verified instead (real, not fabricated)

1. **`npx expo export --platform ios` and `--platform android`** both complete successfully:
   Hermes bytecode bundles produced (~4.8–4.9MB, up from M1's ~1.9MB now that
   `contentRepository`'s real content is imported by the screens), zero bundler errors, all 916+
   modules resolved.
2. **`--dump-assetmap` confirms the real brand assets are bundled**: `assets/brand/body_map_diagram.png`,
   `logo_full_lockup.png`, `logo_mark.png` all present in the asset map — not the M1 scaffold
   placeholders (which were deleted in M1).
3. **A live Metro dev server was actually started and hit over HTTP** (not just the static
   `export` command): `npx expo start` → the manifest endpoint returned `HTTP 200` with a real
   Expo manifest and bundle URL; fetching that URL returned a complete **8.18MB JS bundle**
   containing our actual compiled app code (verified by grepping the bundle output for
   `HomeScreen`, `BodyMapView`, `contentRepository` — all present). This is the same bundle a
   real device or simulator would load and execute — the furthest this environment can confirm
   "the app runs" without an actual screen to render it on.
4. `npm run typecheck`, `npm run lint`, `npm test` (37/37) all clean — see
   `docs/M3_IMPLEMENTATION_NOTES.md` for the full list.

**Confirmed: the app builds and its JS bundle loads correctly. Not confirmed: what it actually
renders/looks like on a real screen** — that requires an environment with a simulator, which
this one isn't.

## Exact commands to record the real thing (run these on your own Mac / Android Studio setup)

### iOS Simulator (requires a Mac with Xcode installed)

```bash
cd mobile
npm install
npx expo start
# Press "i" in the terminal to open iOS Simulator (or: npx expo run:ios)

# Once the app is running in Simulator, start recording (records straight to mp4):
xcrun simctl io booted recordVideo docs/demo/M3_demo.mp4
# ... perform the walkthrough (see checklist below) ...
# Press Ctrl+C in that terminal to stop and finalize the file.
```

Rotation: **Device → Rotate Left/Right** in the Simulator menu (or Cmd+Left/Right).

### Android Emulator (requires Android Studio + an AVD)

```bash
cd mobile
npm install
npx expo start
# Press "a" in the terminal to open the Android Emulator (or: npx expo run:android)

# Start recording on-device (max 3 min by default; raise with --time-limit):
adb shell screenrecord --time-limit 90 /sdcard/M3_demo.mp4
# ... perform the walkthrough on the emulator window ...
# Ctrl+C to stop, then pull the file to this repo:
adb pull /sdcard/M3_demo.mp4 docs/demo/M3_demo.mp4
```

Rotation: Ctrl+Left/Right-Arrow in the emulator window, or the rotate buttons on its toolbar.

### Converting to GIF, if MP4 isn't wanted

```bash
ffmpeg -i docs/demo/M3_demo.mp4 -vf "fps=12,scale=480:-1:flags=lanczos" docs/demo/M3_demo.gif
```

### Suggested walkthrough (30–90s), matching the requested checklist

1. Launch the app (cold start, splash screen visible).
2. Onboarding: type a name, tap **Get started**.
3. Home screen: greeting with the typed name, logo, body map.
4. Tap **3+ different hotspots** in turn (e.g. Cardiovascular, Neuro & Psych, Renal) — each
   should open its System screen.
5. From a System screen, use the back button to return to Home.
6. Scroll to **More Topics**, tap a card (e.g. Toxicology) to confirm identical navigation.
7. Rotate the device/simulator — confirm the body map and hotspots re-lay-out without visual
   breakage (layout is `onLayout`-driven, not hardcoded — see `docs/M3_IMPLEMENTATION_NOTES.md`).
8. Note the hotspot pulse animation and any button press feedback while navigating.

### Screenshots

Same limitation applies — capture these from the same session with **Cmd+S** in iOS Simulator
or the Android Emulator's camera-icon toolbar button, and drop them under `docs/demo/`:
`splash.png`, `onboarding.png`, `home.png`, `body_map.png`, `system_screen.png`,
`more_topics.png`, `tablet_layout.png` (iPad simulator), `android_layout.png`.
